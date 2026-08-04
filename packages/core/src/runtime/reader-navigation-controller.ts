import type {
  Book,
  Bookmark,
  Locator,
  LocatorRestoreDiagnostics,
  ReadingMode,
  ReadingProgressSnapshot,
  SerializedLocator
} from "../model/types"
import { restoreLocatorWithDiagnostics } from "./locator"
import { resolveBookHrefLocator } from "./navigation-target"
import type { ReaderPage } from "./paginated-render-plan"

type PaginationInfo = {
  currentPage: number
  totalPages: number
}

type ReaderNavigationControllerDependencies = {
  getBook: () => Book | null
  getMode: () => ReadingMode
  getCurrentSectionIndex: () => number
  setCurrentSectionIndex: (sectionIndex: number) => void
  getLocator: () => Locator | null
  updateLocator: (locator: Locator) => void
  ensurePages: () => void
  findPageForLocator: (locator: Locator) => ReaderPage | null
  resolveDisplayPageNumberToLeafPage: (pageNumber: number) => number | null
  findPageByNumber: (pageNumber: number) => ReaderPage | null
  createLocatorForPage: (page: ReaderPage) => Locator
  renderCurrentSection: () => void
  emitRelocated: () => void
  setCurrentPageNumber: (pageNumber: number) => void
  getCurrentPageNumber: () => number
  getPageCount: () => number
  getPaginationInfo: () => PaginationInfo
  getCurrentLocation: () => Locator | null
  getPublicationId: () => string | null
  setLastLocatorRestoreDiagnostics: (
    diagnostics: LocatorRestoreDiagnostics
  ) => void
  getProgressForCurrentLocator: () => number
  getSectionProgressWeights: () => number[]
  getPageHeight: () => number
}

export class ReaderNavigationController {
  constructor(
    private readonly dependencies: ReaderNavigationControllerDependencies
  ) {}

  async goToLocation(locator: Locator): Promise<void> {
    const book = this.dependencies.getBook()
    if (!book) {
      return
    }

    const nextIndex = Math.max(
      0,
      Math.min(locator.spineIndex, book.sections.length - 1)
    )

    this.dependencies.setCurrentSectionIndex(nextIndex)
    this.dependencies.updateLocator(locator)
    if (this.dependencies.getMode() === "paginated") {
      this.dependencies.ensurePages()
      const targetPage = this.dependencies.findPageForLocator({
        ...locator,
        spineIndex: nextIndex
      })
      if (targetPage) {
        this.dependencies.setCurrentPageNumber(targetPage.pageNumber)
      }
    }
    this.dependencies.renderCurrentSection()
    this.dependencies.emitRelocated()
  }

  async restoreLocation(
    locator: Locator | SerializedLocator
  ): Promise<boolean> {
    const book = this.dependencies.getBook()
    if (!book) {
      this.dependencies.setLastLocatorRestoreDiagnostics({
        requestedPrecision: "section",
        fallbackApplied: false,
        status: "failed",
        reason: "book-not-open"
      })
      return false
    }

    const restored = restoreLocatorWithDiagnostics({
      book,
      locator
    })
    this.dependencies.setLastLocatorRestoreDiagnostics(restored.diagnostics)
    if (!restored.locator) {
      return false
    }

    await this.goToLocation(restored.locator)
    return true
  }

  async restoreBookmark(bookmark: Bookmark): Promise<boolean> {
    const book = this.dependencies.getBook()
    if (!book) {
      this.dependencies.setLastLocatorRestoreDiagnostics({
        requestedPrecision: "section",
        fallbackApplied: false,
        status: "failed",
        reason: "book-not-open"
      })
      return false
    }

    const publicationId = this.dependencies.getPublicationId()
    if (!publicationId || bookmark.publicationId !== publicationId) {
      this.dependencies.setLastLocatorRestoreDiagnostics({
        requestedPrecision: "section",
        fallbackApplied: false,
        status: "failed",
        reason: "publication-mismatch"
      })
      return false
    }

    const restored = restoreLocatorWithDiagnostics({
      book,
      locator: bookmark.locator
    })
    this.dependencies.setLastLocatorRestoreDiagnostics(restored.diagnostics)
    if (!restored.locator) {
      return false
    }

    await this.goToLocation(restored.locator)
    return true
  }

  async goToTocItem(id: string): Promise<void> {
    const book = this.dependencies.getBook()
    if (!book) {
      return
    }

    const tocItem = this.findTocItem(book.toc, id)
    if (!tocItem) {
      return
    }

    const locator = this.resolveHrefLocator(tocItem.href)
    if (locator) {
      await this.goToLocation(locator)
    }
  }

  async goToPage(pageNumber: number): Promise<void> {
    const book = this.dependencies.getBook()
    if (!book) {
      return
    }

    if (this.dependencies.getMode() === "scroll") {
      await this.goToScrollSection(pageNumber)
      return
    }

    this.dependencies.ensurePages()
    if (this.dependencies.getPageCount() === 0) {
      return
    }

    if (this.dependencies.getMode() === "paginated") {
      const targetLeafPage =
        this.dependencies.resolveDisplayPageNumberToLeafPage(pageNumber)
      if (typeof targetLeafPage === "number") {
        await this.goToLeafPage(targetLeafPage)
        return
      }
    }

    await this.goToLeafPage(pageNumber)
  }

  async goToScrollSection(sectionNumber: number): Promise<void> {
    const book = this.dependencies.getBook()
    if (!book) {
      return
    }

    const nextSectionIndex = Math.max(
      0,
      Math.min(Math.trunc(sectionNumber) - 1, book.sections.length - 1)
    )
    this.dependencies.setCurrentSectionIndex(nextSectionIndex)
    this.dependencies.setCurrentPageNumber(nextSectionIndex + 1)
    this.dependencies.updateLocator({
      spineIndex: nextSectionIndex,
      progressInSection: 0
    })
    this.dependencies.renderCurrentSection()
    this.dependencies.emitRelocated()
  }

  async goToLeafPage(pageNumber: number): Promise<void> {
    const book = this.dependencies.getBook()
    if (!book) {
      return
    }

    this.dependencies.ensurePages()
    const pageCount = this.dependencies.getPageCount()
    if (pageCount === 0) {
      return
    }

    const nextPage = this.dependencies.findPageByNumber(
      Math.max(0, Math.min(pageNumber - 1, pageCount - 1)) + 1
    )
    if (!nextPage) {
      return
    }

    this.dependencies.setCurrentSectionIndex(nextPage.spineIndex)
    this.dependencies.setCurrentPageNumber(nextPage.pageNumber)
    this.dependencies.updateLocator(
      this.dependencies.createLocatorForPage(nextPage)
    )
    this.dependencies.renderCurrentSection()
    this.dependencies.emitRelocated()
  }

  getReadingProgress(): ReadingProgressSnapshot | null {
    const book = this.dependencies.getBook()
    if (!book) {
      return null
    }

    const currentLocator = this.dependencies.getLocator()
    const spineIndex = Math.max(
      0,
      Math.min(
        currentLocator?.spineIndex ??
          this.dependencies.getCurrentSectionIndex(),
        book.sections.length - 1
      )
    )
    const section = book.sections[spineIndex]
    if (!section) {
      return null
    }

    const sectionProgress = clampProgress(
      spineIndex === this.dependencies.getCurrentSectionIndex()
        ? this.dependencies.getProgressForCurrentLocator()
        : (currentLocator?.progressInSection ?? 0)
    )
    const overallProgress =
      this.dependencies.getMode() === "paginated"
        ? this.resolveOverallProgressForPaginated(spineIndex, sectionProgress)
        : this.resolveOverallProgressForScroll(spineIndex, sectionProgress)
    const pagination = this.dependencies.getPaginationInfo()

    return {
      overallProgress,
      sectionProgress,
      spineIndex,
      sectionId: section.id,
      sectionHref: section.href,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages
    }
  }

  async goToProgress(progress: number): Promise<Locator | null> {
    const locator = this.resolveLocatorForOverallProgress(progress)
    if (!locator) {
      return null
    }

    await this.goToLocation(locator)
    return this.dependencies.getCurrentLocation()
  }

  async goToHref(href: string): Promise<Locator | null> {
    if (!this.dependencies.getBook()) {
      return null
    }

    const locator = this.resolveHrefLocator(href)
    if (locator) {
      await this.goToLocation(locator)
    }
    return locator
  }

  resolveHrefLocator(href: string): Locator | null {
    const book = this.dependencies.getBook()
    if (!book) {
      return null
    }

    return resolveBookHrefLocator({
      book,
      currentSectionIndex: this.dependencies.getCurrentSectionIndex(),
      href
    })
  }

  private resolveOverallProgressForPaginated(
    sectionIndex: number,
    sectionProgress: number
  ): number {
    this.dependencies.ensurePages()
    const pageCount = this.dependencies.getPageCount()
    if (pageCount > 1) {
      const currentPage = Math.max(
        1,
        Math.min(this.dependencies.getCurrentPageNumber(), pageCount)
      )
      return clampProgress((currentPage - 1) / (pageCount - 1))
    }

    return this.resolveOverallProgressForScroll(sectionIndex, sectionProgress)
  }

  private resolveOverallProgressForScroll(
    sectionIndex: number,
    sectionProgress: number
  ): number {
    const book = this.dependencies.getBook()
    if (!book || book.sections.length === 0) {
      return 0
    }

    const heights = this.dependencies.getSectionProgressWeights()
    const totalHeight = heights.reduce((sum, value) => sum + value, 0)
    if (totalHeight <= 0) {
      return 0
    }

    const clampedSectionIndex = Math.max(
      0,
      Math.min(sectionIndex, heights.length - 1)
    )
    const beforeCurrent = heights
      .slice(0, clampedSectionIndex)
      .reduce((sum, value) => sum + value, 0)
    const currentHeight =
      heights[clampedSectionIndex] ?? this.dependencies.getPageHeight()

    return clampProgress(
      (beforeCurrent + currentHeight * clampProgress(sectionProgress)) /
        totalHeight
    )
  }

  private resolveLocatorForOverallProgress(progress: number): Locator | null {
    const book = this.dependencies.getBook()
    if (!book || book.sections.length === 0) {
      return null
    }

    const clamped = clampProgress(progress)
    if (this.dependencies.getMode() === "paginated") {
      this.dependencies.ensurePages()
      const pageCount = this.dependencies.getPageCount()
      if (pageCount > 1) {
        const targetPageNumber = Math.round(clamped * (pageCount - 1)) + 1
        const page = this.dependencies.findPageByNumber(targetPageNumber)
        if (page) {
          return this.dependencies.createLocatorForPage(page)
        }
      }
    }

    const heights = this.dependencies.getSectionProgressWeights()
    const totalHeight = heights.reduce((sum, value) => sum + value, 0)
    if (totalHeight <= 0) {
      return {
        spineIndex: 0,
        progressInSection: clamped
      }
    }
    if (clamped >= 1) {
      return {
        spineIndex: book.sections.length - 1,
        progressInSection: 1
      }
    }

    const targetOffset = totalHeight * clamped
    let consumedHeight = 0

    for (let index = 0; index < heights.length; index += 1) {
      const sectionHeight = heights[index] ?? this.dependencies.getPageHeight()
      const nextConsumedHeight = consumedHeight + sectionHeight
      if (targetOffset <= nextConsumedHeight || index === heights.length - 1) {
        return {
          spineIndex: index,
          progressInSection:
            sectionHeight > 0
              ? clampProgress((targetOffset - consumedHeight) / sectionHeight)
              : 0
        }
      }
      consumedHeight = nextConsumedHeight
    }

    return {
      spineIndex: book.sections.length - 1,
      progressInSection: 1
    }
  }

  private findTocItem(
    items: Book["toc"],
    id: string
  ): Book["toc"][number] | null {
    for (const item of items) {
      if (item.id === id) {
        return item
      }

      const nested = this.findTocItem(item.children, id)
      if (nested) {
        return nested
      }
    }

    return null
  }
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, value))
}
