import type { LayoutPretextBlock } from "../layout/layout-engine"
import type {
  Book,
  Locator,
  PageSpreadPlacement,
  ReadingSpreadContext,
  SectionDocument
} from "../model/types"
import { findBlockById } from "./reader-block-tree"
import type { ReaderPage } from "./paginated-render-plan"

export type PaginatedSpreadSlot = {
  position: PageSpreadPlacement
  page: ReaderPage | null
  section: SectionDocument | null
  isBlank: boolean
}

export type PaginatedSpread = {
  anchorPageNumber: number
  pageNumbers: number[]
  currentPageNumber: number
  slots: PaginatedSpreadSlot[]
}

export type ReadingSpreadContextResolver = (
  spineIndex: number
) => ReadingSpreadContext | null

export function findCurrentPageForSection(input: {
  pages: ReaderPage[]
  currentPageNumber: number
  sectionId: string
}): ReaderPage | null {
  return (
    input.pages.find(
      (entry) =>
        entry.pageNumber === input.currentPageNumber &&
        entry.sectionId === input.sectionId
    ) ??
    input.pages.find((entry) => entry.sectionId === input.sectionId) ??
    null
  )
}

export function findPageForLocator(
  pages: ReaderPage[],
  locator: Locator
): ReaderPage | null {
  const sectionPages = pages.filter(
    (page) => page.spineIndex === locator.spineIndex
  )
  if (sectionPages.length === 0) {
    return null
  }

  if (locator.blockId) {
    if (locator.inlineOffset !== undefined) {
      const inlinePage = sectionPages.find((page) =>
        pageContainsInlineOffset(page, locator.blockId!, locator.inlineOffset!)
      )
      if (inlinePage) {
        return inlinePage
      }
    }

    const blockPage = sectionPages.find((page) =>
      pageContainsBlockId(page, locator.blockId!)
    )
    if (blockPage) {
      return blockPage
    }
  }

  const sectionProgress = locator.progressInSection ?? 0
  const progress = Number.isFinite(sectionProgress)
    ? Math.max(0, Math.min(sectionProgress, 1))
    : 0
  const targetIndex = Math.min(
    sectionPages.length - 1,
    Math.round(progress * Math.max(sectionPages.length - 1, 0))
  )

  return sectionPages[targetIndex] ?? sectionPages[0] ?? null
}

export function resolveRenderedPage(input: {
  pages: ReaderPage[]
  sectionId: string
  currentPageNumber: number
  pendingModeSwitchLocator: Locator | null
  locator: Locator | null
}): ReaderPage | null {
  if (input.pendingModeSwitchLocator) {
    const pendingLocatorPage = findPageForLocator(
      input.pages,
      input.pendingModeSwitchLocator
    )
    if (pendingLocatorPage?.sectionId === input.sectionId) {
      return pendingLocatorPage
    }
  }

  if (input.locator) {
    const locatorPage = findPageForLocator(input.pages, input.locator)
    if (locatorPage?.sectionId === input.sectionId) {
      return locatorPage
    }
  }

  const currentPage = findCurrentPageForSection({
    pages: input.pages,
    currentPageNumber: input.currentPageNumber,
    sectionId: input.sectionId
  })
  if (currentPage) {
    return currentPage
  }

  return (
    input.pages.find((entry) => entry.sectionId === input.sectionId) ?? null
  )
}

export function findPageByNumber(
  pages: ReaderPage[],
  pageNumber: number
): ReaderPage | null {
  return pages[pageNumber - 1] ?? null
}

export function resolvePaginatedSpread(input: {
  page: ReaderPage | null
  book: Book | null
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): PaginatedSpread | null {
  const { page, book } = input
  if (!page || !book) {
    return null
  }

  const spreadContext = input.resolveReadingSpreadContextForSectionIndex(
    page.spineIndex
  )
  if (!spreadContext || !spreadContext.syntheticSpreadActive) {
    const section = book.sections[page.spineIndex] ?? null
    return createSinglePageSpread(page, section)
  }

  if (spreadContext.pageSpreadPlacement === "center") {
    const section = book.sections[page.spineIndex] ?? null
    return createSinglePageSpread(page, section)
  }

  if (spreadContext.pageSpreadPlacement === "left") {
    const pairedPage = resolvePairedSpreadPage({
      page,
      direction: "next",
      pages: input.pages,
      resolveReadingSpreadContextForSectionIndex:
        input.resolveReadingSpreadContextForSectionIndex
    })
    const currentSection = book.sections[page.spineIndex] ?? null
    const pairedSection = pairedPage
      ? (book.sections[pairedPage.spineIndex] ?? null)
      : null
    return {
      anchorPageNumber: page.pageNumber,
      pageNumbers: pairedPage
        ? [page.pageNumber, pairedPage.pageNumber]
        : [page.pageNumber],
      currentPageNumber: page.pageNumber,
      slots: [
        {
          position: "left",
          page,
          section: currentSection,
          isBlank: false
        },
        {
          position: "right",
          page: pairedPage,
          section: pairedSection,
          isBlank: !pairedPage
        }
      ]
    }
  }

  const pairedPage = resolvePairedSpreadPage({
    page,
    direction: "previous",
    pages: input.pages,
    resolveReadingSpreadContextForSectionIndex:
      input.resolveReadingSpreadContextForSectionIndex
  })
  const currentSection = book.sections[page.spineIndex] ?? null
  const pairedSection = pairedPage
    ? (book.sections[pairedPage.spineIndex] ?? null)
    : null
  return {
    anchorPageNumber: pairedPage?.pageNumber ?? page.pageNumber,
    pageNumbers: pairedPage
      ? [pairedPage.pageNumber, page.pageNumber]
      : [page.pageNumber],
    currentPageNumber: page.pageNumber,
    slots: [
      {
        position: "left",
        page: pairedPage,
        section: pairedSection,
        isBlank: !pairedPage
      },
      {
        position: "right",
        page,
        section: currentSection,
        isBlank: false
      }
    ]
  }
}

export function resolveCurrentPaginatedSpread(input: {
  mode: "scroll" | "paginated"
  currentPageNumber: number
  book: Book | null
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): PaginatedSpread | null {
  if (input.mode !== "paginated") {
    return null
  }

  const currentPage = findPageByNumber(input.pages, input.currentPageNumber)
  return resolvePaginatedSpread({
    page: currentPage,
    book: input.book,
    pages: input.pages,
    resolveReadingSpreadContextForSectionIndex:
      input.resolveReadingSpreadContextForSectionIndex
  })
}

export function getVisiblePaginatedSpreads(input: {
  mode: "scroll" | "paginated"
  book: Book | null
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): PaginatedSpread[] {
  if (input.mode !== "paginated" || input.pages.length === 0) {
    return []
  }

  const spreads: PaginatedSpread[] = []
  let nextLeafPageNumber = 1

  while (nextLeafPageNumber <= input.pages.length) {
    const page = findPageByNumber(input.pages, nextLeafPageNumber)
    if (!page) {
      nextLeafPageNumber += 1
      continue
    }

    const spread = resolvePaginatedSpread({
      page,
      book: input.book,
      pages: input.pages,
      resolveReadingSpreadContextForSectionIndex:
        input.resolveReadingSpreadContextForSectionIndex
    })
    if (!spread) {
      nextLeafPageNumber += 1
      continue
    }

    spreads.push(spread)
    const lastPageNumber =
      spread.pageNumbers[spread.pageNumbers.length - 1] ?? page.pageNumber
    nextLeafPageNumber = Math.max(lastPageNumber + 1, nextLeafPageNumber + 1)
  }

  return spreads
}

export function resolveDisplayPageNumberToLeafPage(input: {
  pageNumber: number
  mode: "scroll" | "paginated"
  book: Book | null
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): number | null {
  const spreads = getVisiblePaginatedSpreads(input)
  if (spreads.length === 0) {
    return null
  }

  const targetSpread =
    spreads[Math.max(0, Math.min(input.pageNumber - 1, spreads.length - 1))]
  return targetSpread?.anchorPageNumber ?? null
}

export function resolveSpreadNavigationTarget(input: {
  action: "previous" | "next"
  mode: "scroll" | "paginated"
  currentPageNumber: number
  book: Book | null
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): number | null {
  const spread = resolveCurrentPaginatedSpread(input)
  if (!spread) {
    return null
  }

  // Navigation advances by visible spread, not raw leaf page, so a synthetic
  // spread turns with one action instead of stepping into its paired page.
  const boundaryPageNumber =
    input.action === "next"
      ? (spread.pageNumbers[spread.pageNumbers.length - 1] ??
          spread.currentPageNumber) + 1
      : spread.anchorPageNumber - 1
  const targetPage = findPageByNumber(input.pages, boundaryPageNumber)
  if (!targetPage) {
    return null
  }

  const targetSpread = resolvePaginatedSpread({
    page: targetPage,
    book: input.book,
    pages: input.pages,
    resolveReadingSpreadContextForSectionIndex:
      input.resolveReadingSpreadContextForSectionIndex
  })
  return targetSpread?.anchorPageNumber ?? targetPage.pageNumber
}

export function resolveCurrentPageNumberFromSection(input: {
  mode: "scroll" | "paginated"
  currentSectionIndex: number
  locator: Locator | null
  pages: ReaderPage[]
}): number {
  if (input.mode === "scroll") {
    return input.currentSectionIndex + 1
  }

  const matchingPage = input.locator
    ? findPageForLocator(input.pages, {
        ...input.locator,
        spineIndex: input.currentSectionIndex
      })
    : null
  return matchingPage?.pageNumber ?? input.currentSectionIndex + 1
}

export function createLocatorForPage(page: ReaderPage): Locator {
  return {
    spineIndex: page.spineIndex,
    progressInSection:
      page.totalPagesInSection > 1
        ? (page.pageNumberInSection - 1) / (page.totalPagesInSection - 1)
        : 0
  }
}

export function resolveProgressForCurrentLocator(input: {
  locator: Locator | null
  mode: "scroll" | "paginated"
  currentSectionIndex: number
  pages: ReaderPage[]
}): number {
  if (!input.locator) {
    return 0
  }

  if (input.mode === "scroll") {
    return clampProgress(input.locator.progressInSection ?? 0)
  }

  const page = findPageForLocator(input.pages, {
    ...input.locator,
    spineIndex: input.currentSectionIndex
  })
  if (!page) {
    return input.locator.progressInSection ?? 0
  }

  return page.totalPagesInSection > 1
    ? (page.pageNumberInSection - 1) / (page.totalPagesInSection - 1)
    : 0
}

function createSinglePageSpread(
  page: ReaderPage,
  section: SectionDocument | null
): PaginatedSpread {
  return {
    anchorPageNumber: page.pageNumber,
    pageNumbers: [page.pageNumber],
    currentPageNumber: page.pageNumber,
    slots: [
      {
        position: "center",
        page,
        section,
        isBlank: false
      }
    ]
  }
}

function resolvePairedSpreadPage(input: {
  page: ReaderPage
  direction: "previous" | "next"
  pages: ReaderPage[]
  resolveReadingSpreadContextForSectionIndex: ReadingSpreadContextResolver
}): ReaderPage | null {
  const candidate = findPageByNumber(
    input.pages,
    input.direction === "previous"
      ? input.page.pageNumber - 1
      : input.page.pageNumber + 1
  )
  if (!candidate) {
    return null
  }

  const currentSpreadContext = input.resolveReadingSpreadContextForSectionIndex(
    input.page.spineIndex
  )
  const candidateSpreadContext =
    input.resolveReadingSpreadContextForSectionIndex(candidate.spineIndex)
  if (
    !currentSpreadContext?.syntheticSpreadActive ||
    !candidateSpreadContext?.syntheticSpreadActive
  ) {
    return null
  }

  if (input.direction === "previous") {
    return candidateSpreadContext.pageSpreadPlacement === "left"
      ? candidate
      : null
  }

  return candidateSpreadContext.pageSpreadPlacement === "right"
    ? candidate
    : null
}

function pageContainsBlockId(page: ReaderPage, blockId: string): boolean {
  return page.blocks.some((slice) =>
    slice.type === "pretext"
      ? slice.block.id === blockId
      : findBlockById([slice.block], blockId) !== null
  )
}

function pageContainsInlineOffset(
  page: ReaderPage,
  blockId: string,
  inlineOffset: number
): boolean {
  const normalizedInlineOffset = Math.max(0, Math.trunc(inlineOffset))
  return page.blocks.some((slice) => {
    if (slice.type !== "pretext" || slice.block.id !== blockId) {
      return false
    }

    const sliceRange = getPretextSliceInlineRange(slice.block)
    if (!sliceRange) {
      return false
    }

    return (
      normalizedInlineOffset >= sliceRange.start &&
      normalizedInlineOffset < sliceRange.end
    )
  })
}

function getPretextSliceInlineRange(
  block: LayoutPretextBlock
): { start: number; end: number } | null {
  const start = block.textOffsetBase ?? 0
  const end = start + sumPretextLineTextLength(block.lines)
  return end > start ? { start, end } : null
}

function sumPretextLineTextLength(
  lines: Array<{ fragments: Array<{ text: string }> }>,
  start = 0,
  end = lines.length
): number {
  let total = 0
  for (let index = start; index < end; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    total += line.fragments.reduce(
      (lineTotal, fragment) => lineTotal + Array.from(fragment.text).length,
      0
    )
  }
  return total
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(value, 1))
}
