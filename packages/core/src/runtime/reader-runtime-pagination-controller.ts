import { type LayoutResult } from "../layout/layout-engine";
import type { Locator } from "../model/types";
import { buildPaginatedPages, type ReaderPage } from "./paginated-render-plan";
import {
  createLocatorForPage as createPaginatedPageLocator,
  findCurrentPageForSection as findPaginatedCurrentPageForSection,
  findPageByNumber as findPaginatedPageByNumber,
  findPageForLocator as findPaginatedPageForLocator,
  getVisiblePaginatedSpreads as getReaderVisiblePaginatedSpreads,
  resolveCurrentPageNumberFromSection,
  resolveCurrentPaginatedSpread as resolveReaderCurrentPaginatedSpread,
  resolveDisplayPageNumberToLeafPage as resolveReaderDisplayPageNumberToLeafPage,
  resolvePaginatedSpread as resolveReaderPaginatedSpread,
  resolveProgressForCurrentLocator,
  resolveRenderedPage as resolveReaderRenderedPage,
  resolveSpreadNavigationTarget as resolveReaderSpreadNavigationTarget,
  type PaginatedSpread
} from "./reader-pagination";
import type { ReaderRuntimeHost } from "./reader-runtime-controller";
export class ReaderRuntimePaginationController {
  constructor(private readonly reader: ReaderRuntimeHost) {}

  ensurePages(sectionLayout?: LayoutResult): void {
    if (!this.reader.book || !this.reader.options.container) {
      this.reader.pages = [];
      return;
    }

    const { width: targetWidth, height: targetHeight } =
      this.reader.getPaginationMeasurement();
    if (
      this.reader.pages.length > 0 &&
      sectionLayout === undefined &&
      Math.abs(this.reader.lastMeasuredWidth - targetWidth) < 1 &&
      Math.abs(this.reader.lastMeasuredHeight - targetHeight) < 1
    ) {
      return;
    }

    const pageHeight = this.reader.getPageHeight();
    const plan = buildPaginatedPages({
      sections: this.reader.getSectionsForRender(),
      currentSectionIndex: this.reader.currentSectionIndex,
      sectionLayout,
      pageHeight,
      getSectionLayout: (section, index) =>
        this.reader.layoutEngine.layout(
          {
            section,
            spineIndex: index,
            viewportWidth: targetWidth,
            viewportHeight: targetHeight,
            typography: this.reader.typography,
            fontFamily: this.reader.getFontFamily(),
            resolveImageIntrinsicSize: (src) =>
              this.reader.resolveImageIntrinsicSizeForLayout(src)
          },
          "paginated"
        )
    });

    const measuredPlan = this.reader.applyMeasuredDomPagination(plan);
    this.reader.sectionEstimatedHeights = measuredPlan.sectionEstimatedHeights;
    this.reader.pages = measuredPlan.pages;
  }

  applyMeasuredDomPagination(plan: {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  }): {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  } {
    if (
      !this.reader.book ||
      this.reader.measuredDomPaginationBySectionId.size === 0 ||
      this.reader.mode !== "paginated"
    ) {
      return plan;
    }

    const { width, height } = this.reader.getPaginationMeasurement();
    const sections = this.reader.getSectionsForRender();
    const sectionEstimatedHeights = [...plan.sectionEstimatedHeights];
    const nextPages: ReaderPage[] = [];

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      if (!section) {
        continue;
      }

      const cached = this.reader.measuredDomPaginationBySectionId.get(
        section.id
      );
      const canUseCached =
        cached &&
        Math.abs(cached.width - width) < 1 &&
        Math.abs(cached.height - height) < 1;
      const sourcePages = canUseCached
        ? cached.pages
        : plan.pages.filter((page) => page.spineIndex === index);
      const totalPagesInSection = Math.max(1, sourcePages.length);

      if (canUseCached) {
        sectionEstimatedHeights[index] = cached.sectionEstimatedHeight;
      }

      for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
        const page = sourcePages[pageIndex]!;
        nextPages.push({
          ...page,
          pageNumber: nextPages.length + 1,
          pageNumberInSection: pageIndex + 1,
          totalPagesInSection,
          spineIndex: index,
          sectionId: section.id,
          sectionHref: section.href
        });
      }
    }

    return {
      pages: nextPages,
      sectionEstimatedHeights
    };
  }

  getPageHeight(): number {
    return this.reader.getContainerInnerDimensions().height;
  }

  findCurrentPageForSection(sectionId: string): ReaderPage | null {
    return findPaginatedCurrentPageForSection({
      pages: this.reader.pages,
      currentPageNumber: this.reader.currentPageNumber,
      sectionId
    });
  }

  findPageForLocator(locator: Locator): ReaderPage | null {
    return findPaginatedPageForLocator(this.reader.pages, locator);
  }

  resolveRenderedPage(sectionId: string): ReaderPage | null {
    return resolveReaderRenderedPage({
      pages: this.reader.pages,
      sectionId,
      currentPageNumber: this.reader.currentPageNumber,
      pendingModeSwitchLocator: this.reader.pendingModeSwitchLocator,
      locator: this.reader.locator
    });
  }

  findPageByNumber(pageNumber: number): ReaderPage | null {
    return findPaginatedPageByNumber(this.reader.pages, pageNumber);
  }

  resolvePaginatedSpread(page: ReaderPage | null): PaginatedSpread | null {
    return resolveReaderPaginatedSpread({
      page,
      book: this.reader.book,
      pages: this.reader.pages,
      resolveReadingSpreadContextForSectionIndex: (spineIndex) =>
        this.reader.resolveReadingSpreadContextForSectionIndex(spineIndex)
    });
  }

  resolveCurrentPaginatedSpread(): PaginatedSpread | null {
    return resolveReaderCurrentPaginatedSpread({
      mode: this.reader.mode,
      currentPageNumber: this.reader.currentPageNumber,
      book: this.reader.book,
      pages: this.reader.pages,
      resolveReadingSpreadContextForSectionIndex: (spineIndex) =>
        this.reader.resolveReadingSpreadContextForSectionIndex(spineIndex)
    });
  }

  getVisiblePaginatedSpreads(): PaginatedSpread[] {
    return getReaderVisiblePaginatedSpreads({
      mode: this.reader.mode,
      book: this.reader.book,
      pages: this.reader.pages,
      resolveReadingSpreadContextForSectionIndex: (spineIndex) =>
        this.reader.resolveReadingSpreadContextForSectionIndex(spineIndex)
    });
  }

  resolveDisplayPageNumberToLeafPage(pageNumber: number): number | null {
    return resolveReaderDisplayPageNumberToLeafPage({
      pageNumber,
      mode: this.reader.mode,
      book: this.reader.book,
      pages: this.reader.pages,
      resolveReadingSpreadContextForSectionIndex: (spineIndex) =>
        this.reader.resolveReadingSpreadContextForSectionIndex(spineIndex)
    });
  }

  resolveSpreadNavigationTarget(action: "previous" | "next"): number | null {
    return resolveReaderSpreadNavigationTarget({
      action,
      mode: this.reader.mode,
      currentPageNumber: this.reader.currentPageNumber,
      book: this.reader.book,
      pages: this.reader.pages,
      resolveReadingSpreadContextForSectionIndex: (spineIndex) =>
        this.reader.resolveReadingSpreadContextForSectionIndex(spineIndex)
    });
  }

  syncCurrentPageFromSection(): void {
    this.reader.currentPageNumber = resolveCurrentPageNumberFromSection({
      mode: this.reader.mode,
      currentSectionIndex: this.reader.currentSectionIndex,
      locator: this.reader.locator,
      pages: this.reader.pages
    });
  }

  createLocatorForPage(page: ReaderPage): Locator {
    return createPaginatedPageLocator(page);
  }

  getProgressForCurrentLocator(): number {
    return resolveProgressForCurrentLocator({
      locator: this.reader.locator,
      mode: this.reader.mode,
      currentSectionIndex: this.reader.currentSectionIndex,
      pages: this.reader.pages
    });
  }
}
