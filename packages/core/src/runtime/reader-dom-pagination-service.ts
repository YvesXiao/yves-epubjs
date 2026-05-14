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
      if (measuredElements.length === 0) {
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
      const resolvedPage = input.locator
        ? findPageForLocator(pages, {
            ...input.locator,
            spineIndex: input.currentSectionIndex
          })
        : findCurrentPageForSection({
            pages,
            currentPageNumber: input.currentPageNumber,
            sectionId: input.section.id
          })

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
    return offsets
  }

  const offsets = [0]
  let currentOffset = 0
  while (currentOffset < maxOffset - 0.5) {
    const pageBottom = currentOffset + pageHeight
    const minimumAdvance = getMinimumDomPageAdvance(pageHeight)
    const mediaBreak = findMediaBreakBeforePageBottom({
      mediaBands,
      currentOffset,
      pageBottom,
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
      mediaBreak ??
      (nextLine && nextLine.top <= fallbackOffset + DOM_PAGE_EDGE_TOLERANCE
        ? nextLine.top
        : fallbackOffset)
    const nextOffset = Math.min(
      sectionHeight,
      candidateOffset - currentOffset < minimumAdvance
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

  return offsets
}

function findMediaBreakBeforePageBottom(input: {
  mediaBands: Array<{ top: number; bottom: number }>
  currentOffset: number
  pageBottom: number
  minimumAdvance: number
}): number | null {
  const breakableTopMin = input.currentOffset + input.minimumAdvance
  const breakableTopMax = input.pageBottom - DOM_PAGE_EDGE_TOLERANCE
  const crossingMedia = input.mediaBands.find(
    (band) =>
      band.top >= breakableTopMin &&
      band.top < breakableTopMax &&
      band.bottom > input.pageBottom + DOM_PAGE_EDGE_TOLERANCE
  )

  return crossingMedia?.top ?? null
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
): Array<{ top: number; bottom: number }> {
  const sectionRect = sectionElement.getBoundingClientRect()
  const bands = new Map<string, { top: number; bottom: number }>()

  for (const element of collectDomMediaElements(sectionElement)) {
    const rect = element.getBoundingClientRect()
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

  return [...bands.values()].sort((left, right) =>
    left.top === right.top ? left.bottom - right.bottom : left.top - right.top
  )
}

function addBands(
  target: Map<string, { top: number; bottom: number }>,
  bands: Array<{ top: number; bottom: number }>
): void {
  for (const band of bands) {
    const key = `${band.top.toFixed(2)}:${band.bottom.toFixed(2)}`
    if (!target.has(key)) {
      target.set(key, band)
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
      "img, svg, image, object, video, canvas, figure"
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
