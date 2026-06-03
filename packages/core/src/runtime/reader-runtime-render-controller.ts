import {
  serializeDomPageViewportAttributes,
  type DomChapterRenderInput
} from "../renderer/dom-chapter-renderer";
import {
  buildReadingStyleCssVariables,
  buildReadingStyleProfile
} from "../renderer/reading-style-profile";
import type {
  BlockNode,
  ChapterRenderDecision,
  InlineNode,
  ReadingLanguageContext,
  ReadingNavigationContext,
  ReadingSpreadContext,
  SectionDocument
} from "../model/types";
import type { SectionDisplayList } from "../renderer/draw-ops";
import {
  extractBlockText as collectBlockText,
  extractInlineText as collectInlineText
} from "../utils/block-text";
import {
  extractIntrinsicImageSize,
  type IntrinsicImageSize
} from "../utils/image-intrinsic-size";
import { buildChapterAnalysisInput } from "./chapter-analysis-input";
import { analyzeChapterRenderMode } from "./chapter-render-analyzer";
import { type ScrollAnchor } from "./reader-scroll-position-service";
import type { RenderBehavior } from "./render-flow-types";
import { type SharedChapterRenderInput } from "./chapter-render-input";
import { stripPublisherStylesFromSection } from "./publisher-styles";
import {
  resolveReadingLanguageContext,
  resolveReadingNavigationContext
} from "./reading-language";
import {
  resolveReadingSpreadContext,
  resolveSyntheticSpreadViewportPartition
} from "./reading-spread";
import { applyDomDecorations } from "./dom-decoration";
import { resolveEmbeddedResourceUrl } from "./external-boundary";
import { buildPageDisplayList, type ReaderPage } from "./paginated-render-plan";
import { buildScrollRenderPlan } from "./scroll-render-plan";
import {
  createDomChapterRenderInput,
  resolveFixedLayoutFrame
} from "./dom-render-input-factory";
import { type RenderableResourceConsumer } from "./renderable-resource-manager";
import * as readerRuntimeHelpers from "./reader-runtime-helpers";
import type { ReaderRuntimeHost } from "./reader-runtime-controller";
const READER_SCROLL_SLICE_OVERSCAN_MULTIPLIER = 0.75;

export class ReaderRuntimeRenderController {
  constructor(private readonly reader: ReaderRuntimeHost) {}

  renderCurrentSection(renderBehavior: RenderBehavior = "relocate"): void {
    this.reader.renderOrchestrator.renderCurrentSection(renderBehavior);
  }

  renderDomSection(section: SectionDocument, renderVersion: number): void {
    if (
      !this.reader.options.container ||
      !this.reader.renderSession.isCurrentRenderVersion(renderVersion)
    ) {
      return;
    }

    const input =
      this.reader.chapterRenderInputs[this.reader.currentSectionIndex];
    if (!input) {
      return;
    }

    const domRenderInput = this.reader.createDomRenderInput(section, input);
    this.reader.syncFixedLayoutContainerState(domRenderInput);
    this.reader.domChapterRenderer.render(
      this.reader.options.container,
      domRenderInput
    );
    const domSection =
      this.reader.options.container.querySelector<HTMLElement>(
        ".epub-dom-section"
      );
    if (domSection) {
      readerRuntimeHelpers.annotateDomSectionWithBlockIds(section, domSection);
      applyDomDecorations({
        container: this.reader.options.container,
        sectionElement: domSection,
        mode: this.reader.mode,
        decorations: this.reader.decorationManager.getForSpineIndex(
          this.reader.currentSectionIndex
        )
      });
    }
    this.reader.lastInteractionRegions = [];
    this.reader.lastVisibleBounds = [];
    this.reader.lastRenderedSectionIds = [section.id];
    this.reader.lastRenderMetrics = {
      backend: "dom",
      visibleSectionCount: 1,
      visibleDrawOpCount: 0,
      highlightedDrawOpCount: 0,
      totalCanvasHeight: this.reader.options.container.scrollHeight
    };
  }

  renderPaginatedDomSpread(page: ReaderPage, renderVersion: number): void {
    if (
      !this.reader.options.container ||
      !this.reader.book ||
      !this.reader.renderSession.isCurrentRenderVersion(renderVersion)
    ) {
      return;
    }

    const spread = this.reader.resolvePaginatedSpread(page);
    if (!spread || spread.slots.length === 0) {
      const section = this.reader.book.sections[page.spineIndex];
      if (section) {
        this.reader.renderDomSection(section, renderVersion);
      }
      return;
    }

    const renderedSections: Array<{
      sectionId: string;
      input: DomChapterRenderInput;
      page: ReaderPage;
      usesViewportSlice: boolean;
    }> = [];
    const pageHeight = this.reader.getPageHeight();
    const markup = spread.slots
      .map((slot) => {
        if (!slot.section || !slot.page) {
          return `<div class="epub-dom-spread-slot epub-dom-spread-slot-${slot.position} epub-dom-spread-slot-blank" data-spread-slot="${slot.position}" aria-hidden="true"></div>`;
        }

        const input = this.reader.chapterRenderInputs[slot.page.spineIndex];
        if (!input) {
          return `<div class="epub-dom-spread-slot epub-dom-spread-slot-${slot.position} epub-dom-spread-slot-blank" data-spread-slot="${slot.position}" aria-hidden="true"></div>`;
        }

        const domRenderInput = this.reader.createDomRenderInput(
          slot.section,
          input
        );
        const usesViewportSlice =
          domRenderInput.renditionLayout !== "pre-paginated";
        renderedSections.push({
          sectionId: slot.section.id,
          input: domRenderInput,
          page: slot.page,
          usesViewportSlice
        });
        const sectionMarkup = this.reader.domChapterRenderer.createMarkup(
          domRenderInput,
          usesViewportSlice
            ? { rootBackgroundTarget: "page-viewport" }
            : undefined
        );
        const slotMarkup = usesViewportSlice
          ? `<div${serializeDomPageViewportAttributes(domRenderInput, {
              pageHeight,
              pageNumberInSection: slot.page.pageNumberInSection
            })}>${sectionMarkup}</div>`
          : sectionMarkup;
        return `<div class="epub-dom-spread-slot epub-dom-spread-slot-${slot.position}" data-spread-slot="${slot.position}" data-page-number="${slot.page.pageNumber}">${slotMarkup}</div>`;
      })
      .join("");

    this.reader.syncFixedLayoutContainerState(
      renderedSections[0]?.input ?? null
    );
    this.reader.options.container.innerHTML = `<div class="epub-dom-spread" data-spread-page-start="${spread.anchorPageNumber}" data-spread-page-end="${spread.pageNumbers[spread.pageNumbers.length - 1] ?? spread.anchorPageNumber}" data-spread-size="${spread.pageNumbers.length}">${markup}</div>`;

    for (const renderedSection of renderedSections) {
      const domSection =
        this.reader.options.container.querySelector<HTMLElement>(
          `.epub-dom-section[data-section-id="${renderedSection.sectionId}"]`
        );
      const sectionIndex = this.reader.book.sections.findIndex(
        (section) => section.id === renderedSection.sectionId
      );
      if (domSection && sectionIndex >= 0) {
        const renderedPage = renderedSections.find(
          (entry) => entry.sectionId === renderedSection.sectionId
        );
        if (renderedPage?.usesViewportSlice) {
          this.reader.positionPaginatedDomSection(
            domSection,
            renderedPage.page
          );
        }
        readerRuntimeHelpers.annotateDomSectionWithBlockIds(
          this.reader.book.sections[sectionIndex]!,
          domSection
        );
        applyDomDecorations({
          container: this.reader.options.container,
          sectionElement: domSection,
          mode: this.reader.mode,
          decorations:
            this.reader.decorationManager.getForSpineIndex(sectionIndex)
        });
      }
    }

    this.reader.lastInteractionRegions = [];
    this.reader.lastVisibleBounds = [];
    this.reader.lastRenderedSectionIds = renderedSections.map(
      (entry) => entry.sectionId
    );
    this.reader.lastRenderMetrics = {
      backend: "dom",
      visibleSectionCount: renderedSections.length,
      visibleDrawOpCount: 0,
      highlightedDrawOpCount: 0,
      totalCanvasHeight: this.reader.options.container.scrollHeight
    };
  }

  syncFixedLayoutContainerState(input: DomChapterRenderInput | null): void {
    if (!this.reader.options.container) {
      return;
    }

    if (
      input?.renditionLayout !== "pre-paginated" ||
      !input.fixedLayoutViewport
    ) {
      delete this.reader.options.container.dataset.fixedLayoutScale;
      delete this.reader.options.container.dataset.fixedLayoutWidth;
      delete this.reader.options.container.dataset.fixedLayoutHeight;
      this.reader.lastFixedLayoutRenderSignature = null;
      return;
    }

    if (typeof input.fixedLayoutScale === "number") {
      this.reader.options.container.dataset.fixedLayoutScale =
        input.fixedLayoutScale.toFixed(4);
    } else {
      delete this.reader.options.container.dataset.fixedLayoutScale;
    }

    if (typeof input.fixedLayoutRenderWidth === "number") {
      this.reader.options.container.dataset.fixedLayoutWidth = String(
        input.fixedLayoutRenderWidth
      );
    } else {
      delete this.reader.options.container.dataset.fixedLayoutWidth;
    }

    if (typeof input.fixedLayoutRenderHeight === "number") {
      this.reader.options.container.dataset.fixedLayoutHeight = String(
        input.fixedLayoutRenderHeight
      );
    } else {
      delete this.reader.options.container.dataset.fixedLayoutHeight;
    }

    this.reader.lastFixedLayoutRenderSignature = `${
      input.fixedLayoutRenderWidth ?? input.fixedLayoutViewport.width
    }x${input.fixedLayoutRenderHeight ?? input.fixedLayoutViewport.height}@${
      typeof input.fixedLayoutScale === "number"
        ? input.fixedLayoutScale.toFixed(4)
        : "1.0000"
    }`;
  }

  syncDomSectionStateAfterRender(
    renderBehavior: RenderBehavior,
    preservedScrollAnchor: ScrollAnchor | null,
    paginatedPage: ReaderPage | null = null
  ): void {
    if (!this.reader.options.container) {
      return;
    }

    if (
      renderBehavior === "preserve" &&
      preservedScrollAnchor &&
      this.reader.mode === "scroll"
    ) {
      this.reader.setProgrammaticScrollTop(
        preservedScrollAnchor.fallbackScrollTop
      );
    } else if (this.reader.mode === "paginated") {
      const targetPage =
        paginatedPage ??
        (this.reader.locator
          ? this.reader.findPageForLocator({
              ...this.reader.locator,
              spineIndex: this.reader.currentSectionIndex
            })
          : null) ??
        this.reader.findCurrentPageForSection(
          this.reader.book?.sections[this.reader.currentSectionIndex]?.id ?? ""
        );
      const progressInSection =
        targetPage && targetPage.totalPagesInSection > 1
          ? (targetPage.pageNumberInSection - 1) /
            (targetPage.totalPagesInSection - 1)
          : 0;

      this.reader.scrollDomSectionToPaginatedPage(targetPage);
      this.reader.updateLocator({
        ...this.reader.locator,
        spineIndex: this.reader.currentSectionIndex,
        progressInSection
      });
      return;
    } else if (this.reader.scrollToLocatorAnchor()) {
      this.reader.syncCurrentPageFromSection();
      this.reader.updateLocator({
        ...this.reader.locator,
        spineIndex: this.reader.currentSectionIndex,
        progressInSection: this.reader.getProgressForCurrentLocator()
      });
      return;
    } else {
      this.reader.scrollDomSectionToProgress(
        this.reader.locator?.progressInSection ?? 0
      );
    }

    this.reader.updateLocator({
      ...this.reader.locator,
      spineIndex: this.reader.currentSectionIndex,
      progressInSection: this.reader.locator?.progressInSection ?? 0
    });
  }

  scrollDomSectionToProgress(progressInSection: number): void {
    if (!this.reader.options.container) {
      return;
    }

    const section =
      this.reader.options.container.querySelector(".epub-dom-section");
    const sectionHeight =
      (section instanceof HTMLElement
        ? section.scrollHeight || section.offsetHeight
        : 0) || this.reader.options.container.scrollHeight;
    const clamped = Number.isFinite(progressInSection)
      ? Math.max(0, Math.min(progressInSection, 1))
      : 0;
    const availableScroll = Math.max(
      0,
      sectionHeight - this.reader.options.container.clientHeight
    );
    this.reader.setProgrammaticScrollTop(availableScroll * clamped);
  }

  scrollDomSectionToPaginatedPage(page: ReaderPage | null): void {
    if (!this.reader.options.container) {
      return;
    }

    const section =
      this.reader.options.container.querySelector<HTMLElement>(
        ".epub-dom-section"
      );
    if (section && page) {
      this.reader.positionPaginatedDomSection(section, page);
    }
    this.reader.setProgrammaticScrollTop(0);
  }

  positionPaginatedDomSection(section: HTMLElement, page: ReaderPage): void {
    this.reader.domPaginationService.positionPaginatedDomSection({
      sectionElement: section,
      page,
      pageHeight: this.reader.getPageHeight(),
      pages: this.reader.pages
    });
  }

  syncMeasuredPaginatedDomPages(section: SectionDocument): ReaderPage | null {
    if (!this.reader.options.container) {
      return null;
    }

    const result =
      this.reader.domPaginationService.syncMeasuredPaginatedDomPages({
        container: this.reader.options.container,
        section,
        currentSectionIndex: this.reader.currentSectionIndex,
        currentPageNumber: this.reader.currentPageNumber,
        pages: this.reader.pages,
        pageHeight: this.reader.getPageHeight(),
        locator: this.reader.locator,
        preferLocatorWhenResolvingPage:
          this.reader.preferLocatorOnNextDomPaginationSync
      });
    this.reader.preferLocatorOnNextDomPaginationSync = false;
    if (!result) {
      return null;
    }

    const measurement = this.reader.getPaginationMeasurement();
    const measuredSectionPages = result.pages.filter(
      (page) => page.sectionId === section.id
    );
    if (measuredSectionPages.length > 0) {
      this.reader.measuredDomPaginationBySectionId.set(section.id, {
        pages: measuredSectionPages.map((page) => ({ ...page })),
        sectionEstimatedHeight: result.sectionEstimatedHeight,
        width: measurement.width,
        height: measurement.height
      });
    }
    this.reader.pages = result.pages;
    this.reader.sectionEstimatedHeights[this.reader.currentSectionIndex] =
      result.sectionEstimatedHeight;
    return result.resolvedPage;
  }

  resolveChapterRenderDecision(sectionIndex: number): ChapterRenderDecision {
    const section = this.reader.book?.sections[sectionIndex];
    if (section?.renditionLayout === "pre-paginated") {
      return {
        mode: "dom",
        score: 0,
        reasons: ["fixed-layout-section"]
      };
    }

    if (
      section?.presentationRole === "cover" ||
      section?.presentationRole === "image-page"
    ) {
      return {
        mode: "dom",
        score: 0,
        reasons: [
          section.presentationRole === "cover"
            ? "cover-section"
            : "image-page-section"
        ]
      };
    }

    const input = this.reader.chapterRenderInputs[sectionIndex];
    if (!input) {
      return {
        mode: "canvas",
        score: 0,
        reasons: []
      };
    }

    // Cache by chapter source so repeated renders, searches, and mode switches do
    // not keep re-running the analyzer for the same section content.
    return this.reader.chapterRenderDecisionCache.resolve(
      {
        href: input.href,
        content: input.content
      },
      () =>
        analyzeChapterRenderMode(
          buildChapterAnalysisInput({
            href: input.href,
            chapter: input.preprocessed,
            stylesheets: input.linkedStyleSheets.map(
              (stylesheet) => stylesheet.ast
            )
          })
        )
    );
  }

  applyContainerTheme(): void {
    if (!this.reader.options.container) {
      return;
    }

    const profile = buildReadingStyleProfile({
      theme: this.reader.theme,
      typography: this.reader.typography
    });
    const languageContext = this.reader.getReadingLanguageContext();
    const navigationContext = this.reader.getReadingNavigationContext();
    const spreadContext = this.reader.getReadingSpreadContext();
    const variables = buildReadingStyleCssVariables(profile);
    this.reader.options.container.style.background =
      this.reader.theme.background;
    this.reader.options.container.style.color = this.reader.theme.color;
    this.reader.options.container.style.fontSize = `${this.reader.typography.fontSize}px`;
    this.reader.options.container.style.fontFamily =
      this.reader.typography.fontFamily ?? "";
    this.reader.options.container.style.lineHeight = String(
      this.reader.typography.lineHeight
    );
    this.reader.options.container.style.letterSpacing = `${this.reader.typography.letterSpacing ?? 0}px`;
    this.reader.options.container.style.wordSpacing = `${this.reader.typography.wordSpacing ?? 0}px`;
    this.reader.options.container.dataset.baselineProfile = profile.name;
    this.reader.options.container.dataset.experimentalRtl = this.reader
      .experimentalRtl
      ? "enabled"
      : "disabled";
    this.reader.options.container.dataset.contentDirection =
      languageContext?.contentDirection ?? "ltr";
    this.reader.options.container.dataset.pageProgression =
      navigationContext?.pageProgression ?? "ltr";
    this.reader.options.container.dataset.previousPageKey =
      navigationContext?.previousPageKey ?? "ArrowLeft";
    this.reader.options.container.dataset.nextPageKey =
      navigationContext?.nextPageKey ?? "ArrowRight";
    this.reader.options.container.dataset.spreadMode =
      spreadContext?.spreadMode ?? this.reader.spreadMode;
    this.reader.options.container.dataset.renditionSpread =
      spreadContext?.renditionSpread ??
      this.reader.book?.metadata.renditionSpread ??
      "auto";
    this.reader.options.container.dataset.syntheticSpread =
      spreadContext?.syntheticSpreadActive ? "enabled" : "disabled";
    this.reader.options.container.dataset.pageSpreadPlacement =
      spreadContext?.pageSpreadPlacement ?? "center";
    this.reader.options.container.dataset.viewportSlotCount = String(
      spreadContext?.viewportSlotCount ?? 1
    );
    if (languageContext?.resolvedLanguage) {
      this.reader.options.container.dataset.contentLanguage =
        languageContext.resolvedLanguage;
      this.reader.options.container.lang = languageContext.resolvedLanguage;
    } else {
      delete this.reader.options.container.dataset.contentLanguage;
      this.reader.options.container.removeAttribute("lang");
    }
    if (languageContext?.rtlActive) {
      this.reader.options.container.dir = "rtl";
    } else {
      this.reader.options.container.removeAttribute("dir");
    }
    for (const [name, value] of Object.entries(variables)) {
      this.reader.options.container.style.setProperty(name, value);
    }
  }

  renderPaginatedCanvas(
    section: SectionDocument,
    page: ReaderPage | null,
    renderVersion: number
  ): void {
    if (
      !this.reader.options.container ||
      !page ||
      !this.reader.renderSession.isCurrentRenderVersion(renderVersion)
    ) {
      return;
    }

    const displayList = this.reader.buildDisplayListForPage(section, page);
    const result = this.reader.canvasRenderer.renderPaginated(
      this.reader.options.container,
      displayList,
      this.reader.getPageHeight(),
      this.reader.options.canvas
    );
    this.reader.lastInteractionRegions = result.sections.flatMap(
      (entry) => entry.interactions
    );
    this.reader.lastVisibleBounds = result.bounds;
    this.reader.lastRenderedSectionIds = [section.id];
    const highlightedDrawOpCount = displayList.ops.filter(
      (op) =>
        op.kind === "text" &&
        (Boolean(op.highlightColor) || Boolean(op.highlightSegments?.length))
    ).length;
    this.reader.lastRenderMetrics = {
      backend: "canvas",
      visibleSectionCount: result.sections.length,
      visibleDrawOpCount: result.drawOpCount,
      highlightedDrawOpCount,
      totalCanvasHeight: result.totalCanvasHeight
    };
  }

  renderScrollableCanvas(renderVersion: number): void {
    if (
      !this.reader.book ||
      !this.reader.options.container ||
      !this.reader.renderSession.isCurrentRenderVersion(renderVersion)
    ) {
      return;
    }

    const plan = buildScrollRenderPlan({
      sections: this.reader.getSectionsForRender(),
      scrollWindowStart: this.reader.scrollWindowStart,
      scrollWindowEnd: this.reader.scrollWindowEnd,
      sectionEstimatedHeights: this.reader.sectionEstimatedHeights,
      viewportTop: this.reader.options.container.scrollTop,
      viewportHeight: this.reader.options.container.clientHeight,
      pageHeight: this.reader.getPageHeight(),
      overscanMultiplier: READER_SCROLL_SLICE_OVERSCAN_MULTIPLIER,
      lastMeasuredWidth: this.reader.lastMeasuredWidth,
      getSectionHeight: (sectionId) => this.reader.getSectionHeight(sectionId),
      resolveChapterRenderDecision: (index) =>
        this.reader.resolveChapterRenderDecision(index),
      buildDomMarkup: (section, index) => {
        const input = this.reader.chapterRenderInputs[index];
        return input
          ? this.reader.domChapterRenderer.createMarkup(
              this.reader.createDomRenderInput(section, input)
            )
          : undefined;
      },
      buildCanvasSection: (section, index) => {
        const layout = this.reader.layoutEngine.layout(
          {
            section,
            spineIndex: index,
            viewportWidth: this.reader.getContentWidth(),
            viewportHeight: this.reader.options.container!.clientHeight,
            typography: this.reader.typography,
            fontFamily: this.reader.getFontFamily(),
            resolveImageIntrinsicSize: (src) =>
              this.reader.resolveImageIntrinsicSizeForLayout(src)
          },
          "scroll"
        );
        const displayList = this.reader.displayListBuilder.buildSection({
          section,
          width: layout.width,
          viewportHeight: this.reader.options.container!.clientHeight,
          blocks: layout.blocks,
          theme: this.reader.theme,
          typography: this.reader.typography,
          publisherColorOverride: this.reader.publisherColorOverride,
          locatorMap: layout.locatorMap,
          resolveImageLoaded: (src) => this.reader.isImageResourceReady(src),
          resolveImageUrl: (src) => this.reader.resolveCanvasResourceUrl(src),
          resolveImageIntrinsicSize: (src) =>
            this.reader.resolveImageIntrinsicSizeForLayout(src),
          highlightedBlockIds:
            this.reader.getHighlightedCanvasBlockIdsForSection(index),
          highlightRangesByBlock:
            this.reader.getHighlightedCanvasTextRangesForSection(index),
          underlinedBlockIds:
            this.reader.getUnderlinedCanvasBlockIdsForSection(index),
          underlineColorsByBlock:
            this.reader.getUnderlinedCanvasBlockColorsForSection(index),
          underlineRangesByBlock:
            this.reader.getUnderlinedCanvasTextRangesForSection(index),
          activeBlockId: this.reader.getActiveCanvasBlockIdForSection(index)
        });

        return {
          width: layout.width,
          displayList,
          measuredHeight: displayList.height,
          estimatedHeight: Math.max(
            this.reader.getPageHeight(),
            displayList.height
          )
        };
      }
    });
    const sectionsToRender = plan.sectionsToRender;
    this.reader.sectionEstimatedHeights = plan.sectionEstimatedHeights;
    this.reader.lastMeasuredWidth = plan.lastMeasuredWidth;
    this.reader.lastScrollRenderWindows.clear();
    for (const [
      sectionId,
      renderWindows
    ] of plan.scrollRenderWindows.entries()) {
      this.reader.lastScrollRenderWindows.set(sectionId, renderWindows);
    }

    const result = this.reader.canvasRenderer.renderScrollable(
      this.reader.options.container,
      sectionsToRender,
      this.reader.options.canvas
    );
    for (let index = 0; index < this.reader.book.sections.length; index += 1) {
      const section = this.reader.book.sections[index];
      if (!section) {
        continue;
      }
      this.reader.sectionEstimatedHeights[index] = this.reader.getSectionHeight(
        section.id
      );
    }
    this.reader.lastInteractionRegions =
      this.reader.offsetInteractionRegionsForScroll(result.sections);
    for (const entry of sectionsToRender) {
      if (!entry.domHtml) {
        continue;
      }

      const sectionWrapper = this.reader.getSectionElement(entry.sectionId);
      const domSection = sectionWrapper?.matches(".epub-dom-section")
        ? sectionWrapper
        : sectionWrapper?.querySelector<HTMLElement>(".epub-dom-section");
      const sectionIndex = this.reader.getSectionIndexById(entry.sectionId);
      if (domSection && sectionIndex >= 0) {
        readerRuntimeHelpers.annotateDomSectionWithBlockIds(
          this.reader.book.sections[sectionIndex]!,
          domSection
        );
        applyDomDecorations({
          container: this.reader.options.container,
          sectionElement: domSection,
          mode: this.reader.mode,
          decorations:
            this.reader.decorationManager.getForSpineIndex(sectionIndex)
        });
      }
    }
    this.reader.lastVisibleBounds =
      this.reader.collectVisibleBoundsForScroll(sectionsToRender);
    this.reader.lastRenderedSectionIds = sectionsToRender.map(
      (entry) => entry.sectionId
    );
    const highlightedDrawOpCount = sectionsToRender
      .flatMap((entry) => entry.displayList?.ops ?? [])
      .filter(
        (op) =>
          op.kind === "text" &&
          (Boolean(op.highlightColor) || Boolean(op.highlightSegments?.length))
      ).length;
    const currentDecision = this.reader.resolveChapterRenderDecision(
      this.reader.currentSectionIndex
    );
    this.reader.lastRenderMetrics = {
      backend: currentDecision.mode,
      visibleSectionCount: result.sections.length,
      visibleDrawOpCount: result.drawOpCount,
      highlightedDrawOpCount,
      totalCanvasHeight: result.totalCanvasHeight
    };
  }

  buildDisplayListForPage(
    section: SectionDocument,
    page: ReaderPage
  ): SectionDisplayList {
    return buildPageDisplayList({
      page,
      section,
      width: this.reader.getContentWidth(),
      viewportHeight: this.reader.options.container?.clientHeight ?? 720,
      theme: this.reader.theme,
      typography: this.reader.typography,
      publisherColorOverride: this.reader.publisherColorOverride,
      highlightedBlockIds: this.reader.getHighlightedCanvasBlockIdsForSection(
        page.spineIndex
      ),
      highlightRangesByBlock:
        this.reader.getHighlightedCanvasTextRangesForSection(page.spineIndex),
      underlinedBlockIds: this.reader.getUnderlinedCanvasBlockIdsForSection(
        page.spineIndex
      ),
      underlineColorsByBlock:
        this.reader.getUnderlinedCanvasBlockColorsForSection(page.spineIndex),
      underlineRangesByBlock:
        this.reader.getUnderlinedCanvasTextRangesForSection(page.spineIndex),
      activeBlockId: this.reader.getActiveCanvasBlockIdForSection(
        page.spineIndex
      ),
      resolveImageLoaded: (src) => this.reader.isImageResourceReady(src),
      resolveImageUrl: (src) => this.reader.resolveCanvasResourceUrl(src),
      resolveImageIntrinsicSize: (src) =>
        this.reader.resolveImageIntrinsicSizeForLayout(src),
      estimateBlockHeight: (block) =>
        this.reader.estimateBlockHeightForPage(block),
      buildSectionDisplayList: (input) =>
        this.reader.displayListBuilder.buildSection(input)
    });
  }

  estimateBlockHeightForPage(block: BlockNode): number {
    return (
      this.reader.layoutEngine.layout(
        {
          section: {
            id: "estimate",
            href: "estimate.xhtml",
            blocks: [block],
            anchors: {}
          },
          spineIndex: 0,
          viewportWidth: this.reader.getContentWidth(),
          viewportHeight: this.reader.options.container?.clientHeight ?? 720,
          typography: this.reader.typography,
          fontFamily: this.reader.getFontFamily(),
          resolveImageIntrinsicSize: (src) =>
            this.reader.resolveImageIntrinsicSizeForLayout(src)
        },
        "paginated"
      ).blocks[0]?.estimatedHeight ??
      this.reader.typography.fontSize * this.reader.typography.lineHeight
    );
  }

  isImageResourceReady(src: string): boolean {
    return this.reader.renderableResourceManager.isReady(src);
  }

  resolveImageIntrinsicSizeForLayout(
    src: string
  ): IntrinsicImageSize | null | undefined {
    const cached = this.reader.imageIntrinsicSizeCache.get(src);
    if (cached) {
      return cached;
    }
    if (this.reader.imageIntrinsicSizeCache.has(src)) {
      return null;
    }

    if (
      !this.reader.resources ||
      this.reader.pendingImageIntrinsicSizePaths.has(src)
    ) {
      return undefined;
    }

    if (!this.reader.resources.exists(src)) {
      this.reader.imageIntrinsicSizeCache.set(src, null);
      return undefined;
    }

    this.reader.pendingImageIntrinsicSizePaths.add(src);
    this.reader.resources
      .readBinary(src)
      .then((binary) => {
        const resolved = extractIntrinsicImageSize(binary, src);
        this.reader.imageIntrinsicSizeCache.set(src, resolved);
        if (resolved) {
          this.reader.scheduleDeferredResourceRenderRefresh();
        }
      })
      .catch(() => {
        this.reader.imageIntrinsicSizeCache.set(src, null);
      })
      .finally(() => {
        this.reader.pendingImageIntrinsicSizePaths.delete(src);
      });

    return undefined;
  }

  extractBlockText(block: BlockNode): string {
    return collectBlockText(block);
  }

  extractInlineText(inlines: InlineNode[]): string {
    return inlines.map((inline) => collectInlineText(inline)).join("");
  }

  resolveCanvasResourceUrl(path: string): string {
    return resolveEmbeddedResourceUrl(path, {
      allowExternalEmbeddedResources:
        this.reader.options.allowExternalEmbeddedResources === true,
      resolveInternalResourceUrl: (resourcePath) =>
        this.reader.resolveRenderableResourceUrl(resourcePath, "canvas")
    });
  }

  resolveDomResourceUrl(path: string): string {
    return this.reader.resolveRenderableResourceUrl(path, "dom");
  }

  resolveRenderableResourceUrl(
    path: string,
    consumer: RenderableResourceConsumer
  ): string {
    return this.reader.renderableResourceManager.resolveUrl(path, consumer);
  }

  createDomRenderInput(
    section: SectionDocument,
    input: SharedChapterRenderInput
  ): DomChapterRenderInput {
    const languageContext =
      this.reader.resolveReadingLanguageContextForSection(section);
    const fixedLayoutViewportBox =
      this.reader.getFixedLayoutViewportBox(section);
    const presentationViewportBox =
      this.reader.getPresentationViewportBox(section);
    const domRenderInput = createDomChapterRenderInput({
      book: this.reader.book,
      section,
      input,
      theme: this.reader.theme,
      typography: this.reader.typography,
      fontFamily: this.reader.getFontFamily(),
      publisherStyles: this.reader.publisherStyles,
      publisherColorOverride: this.reader.publisherColorOverride,
      ...(typeof fixedLayoutViewportBox?.width === "number"
        ? { availableWidth: fixedLayoutViewportBox.width }
        : typeof presentationViewportBox?.width === "number"
          ? { availableWidth: presentationViewportBox.width }
          : typeof this.reader.getContentWidth() === "number"
            ? { availableWidth: this.reader.getContentWidth() }
            : {}),
      ...(typeof fixedLayoutViewportBox?.height === "number"
        ? { availableHeight: fixedLayoutViewportBox.height }
        : typeof presentationViewportBox?.height === "number"
          ? { availableHeight: presentationViewportBox.height }
          : typeof this.reader.options.container?.clientHeight === "number"
            ? { availableHeight: this.reader.options.container.clientHeight }
            : {}),
      allowExternalEmbeddedResources:
        this.reader.options.allowExternalEmbeddedResources === true,
      resolveDomResourceUrl: (path) => this.reader.resolveDomResourceUrl(path)
    });

    return {
      ...domRenderInput,
      ...(languageContext?.resolvedLanguage
        ? { sectionLanguage: languageContext.resolvedLanguage }
        : {}),
      ...(languageContext?.rtlActive
        ? { sectionDirection: "rtl" as const }
        : {})
    };
  }

  resolveReadingLanguageContextForSection(
    section: SectionDocument
  ): ReadingLanguageContext | null {
    if (!this.reader.book) {
      return null;
    }

    const spineIndex = this.reader.getSectionIndexById(section.id);
    if (spineIndex < 0) {
      return null;
    }

    return resolveReadingLanguageContext({
      book: this.reader.book,
      section,
      spineIndex,
      experimentalRtl: this.reader.experimentalRtl
    });
  }

  resolveReadingLanguageContextForSectionIndex(
    spineIndex: number
  ): ReadingLanguageContext | null {
    if (!this.reader.book) {
      return null;
    }

    const section = this.reader.book.sections[spineIndex];
    if (!section) {
      return null;
    }

    return resolveReadingLanguageContext({
      book: this.reader.book,
      section,
      spineIndex,
      experimentalRtl: this.reader.experimentalRtl
    });
  }

  resolveReadingNavigationContextForSectionIndex(
    spineIndex: number
  ): ReadingNavigationContext | null {
    const languageContext =
      this.reader.resolveReadingLanguageContextForSectionIndex(spineIndex);
    return languageContext
      ? resolveReadingNavigationContext({ languageContext })
      : null;
  }

  resolveReadingSpreadContextForSectionIndex(
    spineIndex: number
  ): ReadingSpreadContext | null {
    if (!this.reader.book) {
      return null;
    }

    const section = this.reader.book.sections[spineIndex];
    if (!section) {
      return null;
    }

    const navigationContext =
      this.reader.resolveReadingNavigationContextForSectionIndex(spineIndex);
    const dimensions = this.reader.getContainerInnerDimensions();
    return resolveReadingSpreadContext({
      book: this.reader.book,
      section,
      spineIndex,
      mode: this.reader.mode,
      spreadMode: this.reader.spreadMode,
      pageProgression: navigationContext?.pageProgression ?? "ltr",
      containerWidth: dimensions.width,
      containerHeight: dimensions.height
    });
  }

  getSectionsForRender(): SectionDocument[] {
    return (
      this.reader.book?.sections.map((section) =>
        this.reader.getSectionForRender(section)
      ) ?? []
    );
  }

  getSectionForRender(section: SectionDocument): SectionDocument {
    return this.reader.publisherStyles === "enabled"
      ? section
      : stripPublisherStylesFromSection(section);
  }

  revokeObjectUrls(): void {
    this.reader.renderableResourceManager.revokeAll();
  }

  getContainerInnerDimensions(): { width: number; height: number } {
    if (!this.reader.options.container) {
      return {
        width: 672,
        height: 720
      };
    }

    const container = this.reader.options.container;
    const computed =
      typeof window !== "undefined" &&
      typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(container)
        : null;
    const paddingLeft = computed
      ? Number.parseFloat(computed.paddingLeft) || 0
      : 0;
    const paddingRight = computed
      ? Number.parseFloat(computed.paddingRight) || 0
      : 0;
    const paddingTop = computed
      ? Number.parseFloat(computed.paddingTop) || 0
      : 0;
    const paddingBottom = computed
      ? Number.parseFloat(computed.paddingBottom) || 0
      : 0;

    return {
      width: Math.max(120, container.clientWidth - paddingLeft - paddingRight),
      height: Math.max(120, container.clientHeight - paddingTop - paddingBottom)
    };
  }

  getPaginationMeasurement(): { width: number; height: number } {
    const { height } = this.reader.getContainerInnerDimensions();
    return {
      width: this.reader.getContentWidth(),
      height
    };
  }

  getFixedLayoutViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    if (section.renditionLayout !== "pre-paginated") {
      return null;
    }

    const sectionIndex = this.reader.getSectionIndexById(section.id);
    const viewportBox = this.reader.getContainerInnerDimensions();
    if (sectionIndex < 0) {
      return viewportBox;
    }

    const spreadContext =
      this.reader.resolveReadingSpreadContextForSectionIndex(sectionIndex);
    const partition = spreadContext
      ? resolveSyntheticSpreadViewportPartition({
          spreadContext,
          containerWidth: viewportBox.width,
          containerHeight: viewportBox.height
        })
      : null;

    return partition
      ? {
          width: partition.width,
          height: partition.height
        }
      : viewportBox;
  }

  getPresentationViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    if (
      section.presentationRole !== "cover" &&
      section.presentationRole !== "image-page"
    ) {
      return null;
    }

    return (
      this.reader.getFixedLayoutViewportBox(section) ??
      this.reader.getContainerInnerDimensions()
    );
  }

  resolveFixedLayoutRenderSignature(section: SectionDocument): string | null {
    const viewportBox = this.reader.getFixedLayoutViewportBox(section);
    if (!viewportBox) {
      return null;
    }

    const frame = resolveFixedLayoutFrame({
      section,
      availableWidth: viewportBox.width,
      availableHeight: viewportBox.height
    });
    if (!frame) {
      return null;
    }

    return `${frame.width}x${frame.height}@${frame.scale.toFixed(4)}`;
  }

  resolvePresentationRenderSignature(section: SectionDocument): string | null {
    const viewportBox = this.reader.getPresentationViewportBox(section);
    if (!viewportBox) {
      return null;
    }

    return `${Math.round(viewportBox.width)}x${Math.round(viewportBox.height)}`;
  }

  getContentWidth(): number {
    const { width } = this.reader.getContainerInnerDimensions();
    const rootFontSize =
      typeof document !== "undefined"
        ? Number.parseFloat(
            window.getComputedStyle(document.documentElement).fontSize
          ) || 16
        : 16;
    const maxContentWidth = 42 * rootFontSize;
    return Math.min(width, maxContentWidth);
  }

  getFontFamily(): string {
    if (this.reader.typography.fontFamily?.trim()) {
      return this.reader.typography.fontFamily;
    }

    if (!this.reader.options.container || typeof window === "undefined") {
      return '"Iowan Old Style", "Palatino Linotype", serif';
    }

    const fontFamily = window
      .getComputedStyle(this.reader.options.container)
      .fontFamily.trim();
    return fontFamily || '"Iowan Old Style", "Palatino Linotype", serif';
  }

  async waitForFonts(): Promise<void> {
    if (typeof document === "undefined" || !("fonts" in document)) {
      return;
    }

    const fonts = document.fonts;
    if (!fonts || typeof fonts.ready === "undefined") {
      return;
    }

    await fonts.ready;
  }
}
