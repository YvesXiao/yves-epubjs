import type { Locator, SectionDocument } from "../model/types"
import { findBlockById } from "./reader-block-tree"
import type { PageBlockSlice, ReaderPage } from "./paginated-render-plan"
import {
  findCurrentPageForSection,
  findPageByNumber,
  findPageForLocator
} from "./reader-pagination"
import { isDomInlineImageElement } from "./image-render-classification"

const DOM_PAGE_EDGE_TOLERANCE = 0.5
const DOM_LARGE_MEDIA_PAGE_RATIO = 0.68

type DomMediaBand = {
  top: number
  bottom: number
  standalonePage: boolean
}

type DomMediaPageBreak = {
  offset: number
  force: boolean
}

export type DomPaginationSyncResult = {
  pages: ReaderPage[]
  sectionEstimatedHeight: number
  resolvedPage: ReaderPage | null
}

export class ReaderDomPaginationService {
  positionPaginatedDomSection(input: {
    sectionElement: HTMLElement
    page: ReaderPage
    pageHeight: number
    pages: ReaderPage[]
  }): void {
    const viewport = input.sectionElement.closest<HTMLElement>(
      "[data-page-viewport='true']"
    )
    if (!viewport) {
      return
    }

    const targetOffset =
      typeof input.page.offsetInSection === "number"
        ? Math.max(0, input.page.offsetInSection)
        : Math.max(0, input.page.pageNumberInSection - 1) * input.pageHeight
    const nextPage = findPageByNumber(input.pages, input.page.pageNumber + 1)
    const sectionHeight = Math.max(
      input.pageHeight,
      input.sectionElement.scrollHeight ||
        input.sectionElement.offsetHeight ||
        input.pageHeight
    )
    const rawVisibleHeight =
      nextPage?.sectionId === input.page.sectionId &&
      typeof nextPage.offsetInSection === "number"
        ? nextPage.offsetInSection - targetOffset
        : sectionHeight - targetOffset
    const visibleHeight =
      nextPage?.sectionId === input.page.sectionId &&
      rawVisibleHeight > 0 &&
      rawVisibleHeight < getMinimumDomPageAdvance(input.pageHeight)
        ? Math.max(
            1,
            Math.min(input.pageHeight, sectionHeight - targetOffset)
          )
        : Math.max(1, Math.min(input.pageHeight, rawVisibleHeight))
    viewport.style.height = `${visibleHeight}px`
    input.sectionElement.style.position = "relative"
    input.sectionElement.style.transform = `translateY(-${targetOffset}px)`
    input.sectionElement.style.transformOrigin = "top left"
    input.sectionElement.style.willChange = "transform"
  }

  syncMeasuredPaginatedDomPages(input: {
    container: HTMLElement
    section: SectionDocument
    currentSectionIndex: number
    currentPageNumber: number
    pages: ReaderPage[]
    pageHeight: number
    locator: Locator | null
  }): DomPaginationSyncResult | null {
    if (
      input.section.renditionLayout === "pre-paginated" ||
      input.section.presentationRole === "cover" ||
      input.section.presentationRole === "image-page"
    ) {
      return null
    }

    const selectorValue = escapeAttributeSelectorValue(input.section.id)
    const sectionElement = input.container.querySelector<HTMLElement>(
      `.epub-dom-section[data-section-id="${selectorValue}"]`
    )
    if (!sectionElement) {
      return null
    }

    const previousTransform = sectionElement.style.transform
    const previousTransformOrigin = sectionElement.style.transformOrigin
    const previousWillChange = sectionElement.style.willChange

    try {
      sectionElement.style.transform = "translateY(0px)"
      sectionElement.style.transformOrigin = "top left"
      sectionElement.style.willChange = "auto"

      const sectionHeight = Math.max(
        input.pageHeight,
        sectionElement.scrollHeight ||
          sectionElement.offsetHeight ||
          input.pageHeight
      )
      const pageOffsets = measurePaginatedDomPageOffsets(
        sectionElement,
        input.pageHeight
      )
      const mediaBands = collectPaginatedDomMediaBands(sectionElement)
      const pageCount = Math.max(1, pageOffsets.length)
      const seenBlockIdsByPage = Array.from(
        { length: pageCount },
        () => new Set<string>()
      )
      const pageBlocks = Array.from(
        { length: pageCount },
        () => [] as PageBlockSlice[]
      )
      const sectionRect = sectionElement.getBoundingClientRect()

      const measuredElements = Array.from(
        sectionElement.querySelectorAll<HTMLElement>("[data-reader-block-id]")
      )
      if (measuredElements.length === 0 && mediaBands.length === 0) {
        return null
      }

      for (const element of measuredElements) {
        const blockId = element.dataset.readerBlockId?.trim()
        if (!blockId) {
          continue
        }

        const block = findBlockById(input.section.blocks, blockId)
        if (!block) {
          continue
        }

        const relativeTop = Math.max(
          0,
          element.getBoundingClientRect().top - sectionRect.top
        )
        const pageIndex = resolvePaginatedDomPageIndex(
          relativeTop,
          pageOffsets
        )
        const seenBlockIds = seenBlockIdsByPage[pageIndex]
        const blocks = pageBlocks[pageIndex]
        if (!seenBlockIds || !blocks || seenBlockIds.has(block.id)) {
          continue
        }

        seenBlockIds.add(block.id)
        blocks.push({
          type: "native",
          block
        })
      }

      const nextPages: ReaderPage[] = []
      const pagesBeforeSection = input.pages.filter(
        (page) => page.spineIndex < input.currentSectionIndex
      )
      const pagesAfterSection = input.pages.filter(
        (page) => page.spineIndex > input.currentSectionIndex
      )
      for (let index = 0; index < pageCount; index += 1) {
        nextPages.push({
          pageNumber: 0,
          pageNumberInSection: index + 1,
          totalPagesInSection: pageCount,
          spineIndex: input.currentSectionIndex,
          sectionId: input.section.id,
          sectionHref: input.section.href,
          offsetInSection: pageOffsets[index] ?? index * input.pageHeight,
          blocks: pageBlocks[index] ?? []
        })
      }

      const pages = [
        ...pagesBeforeSection,
        ...nextPages,
        ...pagesAfterSection
      ].map((page, index) => ({
        ...page,
        pageNumber: index + 1
      }))
      const sectionEstimatedHeight = Math.max(
        sectionHeight,
        pageCount * input.pageHeight
      )
      const previousPage = findCurrentPageForSection({
        pages: input.pages,
        currentPageNumber: input.currentPageNumber,
        sectionId: input.section.id
      })
      const measuredStandalonePage = previousPage
        ? findMeasuredStandaloneMediaPage({
            pages,
            sectionId: input.section.id,
            previousOffset: previousPage.offsetInSection ?? 0,
            pageHeight: input.pageHeight,
            mediaBands
          })
        : null
      const currentPage = findCurrentPageForSection({
        pages,
        currentPageNumber: input.currentPageNumber,
        sectionId: input.section.id
      })
      const locatorPage = input.locator
        ? findPageForLocator(pages, {
            ...input.locator,
            spineIndex: input.currentSectionIndex
          })
        : null
      const resolvedPage = currentPage ?? measuredStandalonePage ?? locatorPage

      return {
        pages,
        sectionEstimatedHeight,
        resolvedPage
      }
    } finally {
      sectionElement.style.transform = previousTransform
      sectionElement.style.transformOrigin = previousTransformOrigin
      sectionElement.style.willChange = previousWillChange
    }
  }
}

export function measurePaginatedDomPageOffsets(
  sectionElement: HTMLElement,
  pageHeight: number
): number[] {
  const sectionHeight = Math.max(
    pageHeight,
    sectionElement.scrollHeight || sectionElement.offsetHeight || pageHeight
  )
  const maxOffset = Math.max(0, sectionHeight - pageHeight)
  const lineBands = collectPaginatedDomReadableLineBands(sectionElement)
  const mediaBands = collectPaginatedDomMediaBands(sectionElement)
  if (lineBands.length === 0) {
    const offsets = [0]
    for (let offset = pageHeight; offset < sectionHeight; offset += pageHeight) {
      if (shouldKeepPaginatedDomPageOffset(offset, sectionHeight, pageHeight, [])) {
        offsets.push(offset)
      }
    }
    return enforceStandaloneMediaPageOffsets({
      offsets,
      mediaBands,
      sectionHeight,
      pageHeight,
      lineBands: []
    })
  }

  const offsets = [0]
  let currentOffset = 0
  while (currentOffset < maxOffset - 0.5) {
    const pageBottom = currentOffset + pageHeight
    const minimumAdvance = getMinimumDomPageAdvance(pageHeight)
    const mediaBreak = findMediaPageBreak({
      mediaBands,
      lineBands,
      currentOffset,
      pageBottom,
      pageHeight,
      minimumAdvance
    })
    const lastFullyVisibleLine = [...lineBands]
      .reverse()
      .find(
        (band) =>
          band.top >= currentOffset - 0.5 && band.bottom <= pageBottom + 0.5
      )
    const nextLine = lastFullyVisibleLine
      ? lineBands.find((band) => band.top >= lastFullyVisibleLine.bottom - 0.5)
      : lineBands.find((band) => band.top > currentOffset + 0.5)
    const fallbackOffset = Math.min(sectionHeight, currentOffset + pageHeight)
    const candidateOffset =
      mediaBreak?.offset ??
      (nextLine && nextLine.top <= fallbackOffset + DOM_PAGE_EDGE_TOLERANCE
        ? nextLine.top
        : fallbackOffset)
    const nextOffset = Math.min(
      sectionHeight,
      !mediaBreak?.force && candidateOffset - currentOffset < minimumAdvance
        ? fallbackOffset
        : Math.max(currentOffset + 1, candidateOffset)
    )
    if (nextOffset <= currentOffset + 0.5) {
      break
    }
    if (
      !shouldKeepPaginatedDomPageOffset(
        nextOffset,
        sectionHeight,
        pageHeight,
        lineBands
      )
    ) {
      break
    }
    offsets.push(nextOffset)
    currentOffset = nextOffset
  }

  return enforceStandaloneMediaPageOffsets({
    offsets,
    mediaBands,
    sectionHeight,
    pageHeight,
    lineBands
  })
}

function findMeasuredStandaloneMediaPage(input: {
  pages: ReaderPage[]
  sectionId: string
  previousOffset: number
  pageHeight: number
  mediaBands: DomMediaBand[]
}): ReaderPage | null {
  const previousPageBottom = input.previousOffset + input.pageHeight
  const visibleStandaloneMedia = input.mediaBands
    .filter((band) => band.standalonePage)
    .map((band) => ({
      band,
      visibleHeight:
        Math.min(band.bottom, previousPageBottom) -
        Math.max(band.top, input.previousOffset)
    }))
    .filter((entry) => entry.visibleHeight > DOM_PAGE_EDGE_TOLERANCE)
    .sort((left, right) => {
      if (left.visibleHeight !== right.visibleHeight) {
        return right.visibleHeight - left.visibleHeight
      }
      return left.band.top - right.band.top
    })[0]?.band
  if (!visibleStandaloneMedia) {
    return null
  }

  const mediaOffset = normalizeDomPageOffset(visibleStandaloneMedia.top)
  return (
    input.pages.find(
      (page) =>
        page.sectionId === input.sectionId &&
        typeof page.offsetInSection === "number" &&
        Math.abs(page.offsetInSection - mediaOffset) <= DOM_PAGE_EDGE_TOLERANCE
    ) ?? null
  )
}

function enforceStandaloneMediaPageOffsets(input: {
  offsets: number[]
  mediaBands: DomMediaBand[]
  sectionHeight: number
  pageHeight: number
  lineBands: Array<{ top: number; bottom: number }>
}): number[] {
  const standaloneMediaBands = input.mediaBands.filter(
    (band) => band.standalonePage
  )
  if (standaloneMediaBands.length === 0) {
    return input.offsets
  }

  const nextOffsets = new Set<number>()
  for (const offset of input.offsets) {
    if (!isOffsetInsideStandaloneMedia(offset, standaloneMediaBands)) {
      nextOffsets.add(normalizeDomPageOffset(offset))
    }
  }

  for (const band of standaloneMediaBands) {
    const offset = normalizeDomPageOffset(band.top)
    if (
      offset <= DOM_PAGE_EDGE_TOLERANCE ||
      !shouldKeepPaginatedDomPageOffset(
        offset,
        input.sectionHeight,
        input.pageHeight,
        input.lineBands
      )
    ) {
      continue
    }
    nextOffsets.add(offset)
  }

  nextOffsets.add(0)

  return Array.from(nextOffsets).sort((left, right) => left - right)
}

function isOffsetInsideStandaloneMedia(
  offset: number,
  mediaBands: DomMediaBand[]
): boolean {
  return mediaBands.some(
    (band) =>
      offset > band.top + DOM_PAGE_EDGE_TOLERANCE &&
      offset < band.bottom - DOM_PAGE_EDGE_TOLERANCE
  )
}

function normalizeDomPageOffset(offset: number): number {
  return Math.max(0, Math.round(offset * 100) / 100)
}

function findMediaPageBreak(input: {
  mediaBands: DomMediaBand[]
  lineBands: Array<{ top: number; bottom: number }>
  currentOffset: number
  pageBottom: number
  pageHeight: number
  minimumAdvance: number
}): DomMediaPageBreak | null {
  const currentStandaloneMedia = input.mediaBands.find(
    (band) =>
      band.standalonePage &&
      band.top <= input.currentOffset + DOM_PAGE_EDGE_TOLERANCE &&
      band.bottom > input.currentOffset + input.minimumAdvance
  )
  const currentStandaloneNextBand = currentStandaloneMedia
    ? input.lineBands.find(
        (band) =>
          band.top >= currentStandaloneMedia.bottom - DOM_PAGE_EDGE_TOLERANCE
      )
    : null
  if (currentStandaloneNextBand) {
    return {
      offset: currentStandaloneNextBand.top,
      force: true
    }
  }

  const currentPageMedia = input.mediaBands.find(
    (band) =>
      !band.standalonePage &&
      band.top <= input.currentOffset + DOM_PAGE_EDGE_TOLERANCE &&
      band.bottom > input.currentOffset + input.minimumAdvance &&
      band.bottom < input.pageBottom - DOM_PAGE_EDGE_TOLERANCE &&
      isLargeDomMediaBand(band, input.pageHeight)
  )

  const currentPageBreak = currentPageMedia
    ? {
        offset: currentPageMedia.bottom,
        force: currentPageMedia.standalonePage
      }
    : null
  if (currentPageBreak) {
    return currentPageBreak
  }

  const breakableTopMin = input.currentOffset + DOM_PAGE_EDGE_TOLERANCE
  const breakableTopMax = input.pageBottom - DOM_PAGE_EDGE_TOLERANCE
  const crossingMedia = input.mediaBands.find((band) => {
    if (band.top < breakableTopMin || band.top >= breakableTopMax) {
      return false
    }

    return (
      band.standalonePage ||
      band.bottom > input.pageBottom + DOM_PAGE_EDGE_TOLERANCE ||
      isLargeDomMediaBand(band, input.pageHeight)
    )
  })

  return crossingMedia
    ? {
        offset: crossingMedia.top,
        force: crossingMedia.standalonePage
      }
    : null
}

function isLargeDomMediaBand(
  band: DomMediaBand,
  pageHeight: number
): boolean {
  return band.bottom - band.top >= pageHeight * DOM_LARGE_MEDIA_PAGE_RATIO
}

export function resolvePaginatedDomPageIndex(
  offsetTop: number,
  pageOffsets: number[]
): number {
  for (let index = pageOffsets.length - 1; index >= 0; index -= 1) {
    const candidate = pageOffsets[index]
    if (typeof candidate === "number" && offsetTop >= candidate - 0.5) {
      return index
    }
  }

  return 0
}

function shouldKeepPaginatedDomPageOffset(
  offset: number,
  sectionHeight: number,
  pageHeight: number,
  lineBands: Array<{ top: number; bottom: number }>
): boolean {
  const remainingHeight = sectionHeight - offset
  if (remainingHeight <= DOM_PAGE_EDGE_TOLERANCE) {
    return false
  }

  if (
    lineBands.length > 0 &&
    !lineBands.some((band) => band.bottom > offset + DOM_PAGE_EDGE_TOLERANCE)
  ) {
    return false
  }

  if (remainingHeight >= getMinimumDomPageAdvance(pageHeight)) {
    return true
  }

  return lineBands.some((band) => band.bottom > offset + DOM_PAGE_EDGE_TOLERANCE)
}

function getMinimumDomPageAdvance(pageHeight: number): number {
  return Math.max(24, Math.min(80, pageHeight * 0.2))
}

export function collectPaginatedDomReadableLineBands(
  sectionElement: HTMLElement
): Array<{ top: number; bottom: number }> {
  if (typeof document === "undefined") {
    return []
  }

  const sectionRect = sectionElement.getBoundingClientRect()
  const bands = new Map<string, { top: number; bottom: number }>()
  for (const element of collectDomReadableBlockElements(sectionElement)) {
    const hasText = collectTextNodes(element).some((textNode) =>
      (textNode.textContent ?? "").trim()
    )
    const rects = hasText
      ? measureDomRangeLineBands(element)
      : [element.getBoundingClientRect()]

    for (const rect of rects) {
      if (rect.height <= 0 || rect.width <= 0) {
        continue
      }
      const top = Math.max(0, rect.top - sectionRect.top)
      const bottom = Math.max(top, rect.bottom - sectionRect.top)
      const key = `${top.toFixed(2)}:${bottom.toFixed(2)}`
      if (!bands.has(key)) {
        bands.set(key, { top, bottom })
      }
    }
  }

  addBands(bands, collectPaginatedDomMediaBands(sectionElement))

  return [...bands.values()].sort((left, right) =>
    left.top === right.top ? left.bottom - right.bottom : left.top - right.top
  )
}

function collectPaginatedDomMediaBands(
  sectionElement: HTMLElement
): DomMediaBand[] {
  const sectionRect = sectionElement.getBoundingClientRect()
  const bands = new Map<string, DomMediaBand>()
  const measuredWrappers = new Set<HTMLElement>()

  for (const element of sectionElement.querySelectorAll<HTMLElement>(
    ".epub-dom-media-wrapper"
  )) {
    const rect = element.getBoundingClientRect()
    if (!hasVisibleDomRect(rect)) {
      continue
    }
    measuredWrappers.add(element)
    addDomMediaBand(bands, sectionRect, rect, true)
  }

  for (const element of collectDomMediaElements(sectionElement)) {
    if (isStandaloneDomMediaWrapper(element)) {
      continue
    }

    const closestWrapper = element.closest<HTMLElement>(
      ".epub-dom-media-wrapper"
    )
    if (closestWrapper && measuredWrappers.has(closestWrapper)) {
      continue
    }

    const rect = element.getBoundingClientRect()
    if (!hasVisibleDomRect(rect)) {
      continue
    }
    addDomMediaBand(
      bands,
      sectionRect,
      rect,
      Boolean(closestWrapper) || isStandaloneDomMediaElement(element)
    )
  }

  return [...bands.values()].sort((left, right) =>
    left.top === right.top ? right.bottom - left.bottom : left.top - right.top
  )
}

function addDomMediaBand(
  bands: Map<string, DomMediaBand>,
  sectionRect: DOMRect,
  rect: DOMRect,
  standalonePage: boolean
): void {
  const top = Math.max(0, rect.top - sectionRect.top)
  const bottom = Math.max(top, rect.bottom - sectionRect.top)
  const key = `${top.toFixed(2)}:${bottom.toFixed(2)}`
  const band = { top, bottom, standalonePage }
  if (!bands.has(key)) {
    bands.set(key, band)
    return
  }

  const existing = bands.get(key)
  if (existing && band.standalonePage && !existing.standalonePage) {
    bands.set(key, band)
  }
}

function hasVisibleDomRect(rect: DOMRect): boolean {
  return rect.height > 0 && rect.width > 0
}

function isStandaloneDomMediaWrapper(element: HTMLElement): boolean {
  return element.classList.contains("epub-dom-media-wrapper")
}

function isStandaloneDomMediaElement(element: HTMLElement): boolean {
  return (
    isStandaloneDomMediaWrapper(element) ||
    Boolean(element.closest(".epub-dom-media-wrapper"))
  )
}

function addBands(
  target: Map<string, { top: number; bottom: number }>,
  bands: Array<{ top: number; bottom: number }>
): void {
  for (const band of bands) {
    const key = `${band.top.toFixed(2)}:${band.bottom.toFixed(2)}`
    if (!target.has(key)) {
      target.set(key, { top: band.top, bottom: band.bottom })
    }
  }
}

function measureDomRangeLineBands(root: HTMLElement): DOMRect[] {
  if (typeof document === "undefined") {
    return []
  }

  const range = document.createRange()
  range.selectNodeContents(root)
  return typeof range.getClientRects === "function"
    ? Array.from(range.getClientRects())
    : []
}

function collectDomReadableBlockElements(
  sectionElement: HTMLElement
): HTMLElement[] {
  return Array.from(
    sectionElement.querySelectorAll<HTMLElement>(
      "p, li, pre, h1, h2, h3, h4, h5, h6, td, th, dt, dd, figcaption"
    )
  )
}

function collectDomMediaElements(sectionElement: HTMLElement): HTMLElement[] {
  return Array.from(
    sectionElement.querySelectorAll<HTMLElement>(
      "img, svg, image, object, video, canvas, figure, .epub-dom-media-wrapper"
    )
  ).filter((element) => !isDomInlineImageElement(element))
}

function collectTextNodes(root: Node): Text[] {
  if (typeof document === "undefined") {
    return []
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text) {
      textNodes.push(current)
    }
    current = walker.nextNode()
  }
  return textNodes
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
