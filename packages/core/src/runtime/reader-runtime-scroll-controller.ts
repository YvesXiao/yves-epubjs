import type {
  Point,
  Rect,
  SectionDocument,
  VisibleDrawBounds
} from "../model/types";
import type {
  InteractionRegion,
  SectionDisplayList
} from "../renderer/draw-ops";
import { type ScrollAnchor } from "./reader-scroll-position-service";
import { resolveCanvasTextPosition } from "./canvas-text-locator";
import { findRenderedAnchorTarget } from "./navigation-target";
import * as readerRuntimeHelpers from "./reader-runtime-helpers";
import type { ReaderRuntimeHost } from "./reader-runtime-controller";
const READER_SCROLL_WINDOW_RADIUS = 1;

export class ReaderRuntimeScrollController {
  constructor(private readonly reader: ReaderRuntimeHost) {}

  getLocatorScrollAlignment(): "start" | "center" {
    return this.reader.pendingModeSwitchLocator ? "center" : "start";
  }

  resolveScrollTopForRect(
    rectTop: number,
    rectHeight: number,
    alignment: "start" | "center"
  ): number {
    if (!this.reader.options.container || alignment === "start") {
      return rectTop - 16;
    }

    return (
      rectTop - this.reader.options.container.clientHeight / 2 + rectHeight / 2
    );
  }

  findRenderedDomBlockTarget(
    sectionElement: HTMLElement,
    blockId: string | undefined
  ): HTMLElement | null {
    const normalizedBlockId = blockId?.trim();
    if (!normalizedBlockId) {
      return null;
    }

    const directMatch =
      sectionElement.dataset.readerBlockId?.trim() === normalizedBlockId ||
      sectionElement.id.trim() === normalizedBlockId
        ? sectionElement
        : null;
    if (directMatch) {
      return directMatch;
    }

    for (const element of sectionElement.querySelectorAll<HTMLElement>(
      "[data-reader-block-id], [id]"
    )) {
      if (
        element.dataset.readerBlockId?.trim() === normalizedBlockId ||
        element.id.trim() === normalizedBlockId
      ) {
        return element;
      }
    }

    return null;
  }

  resolveRenderedDomTextPosition(
    sectionElement: HTMLElement,
    blockId: string | undefined,
    inlineOffset: number
  ): {
    node: Text;
    offset: number;
  } | null {
    const blockElement = this.reader.findRenderedDomBlockTarget(
      sectionElement,
      blockId
    );
    if (!blockElement) {
      return null;
    }

    const textNodes = readerRuntimeHelpers.collectTextNodes(blockElement);
    if (textNodes.length === 0) {
      return null;
    }

    let remaining = Math.max(0, Math.trunc(inlineOffset));
    for (const textNode of textNodes) {
      const length = textNode.textContent?.length ?? 0;
      if (remaining <= length) {
        return {
          node: textNode,
          offset: remaining
        };
      }
      remaining -= length;
    }

    const lastNode = textNodes.at(-1);
    return lastNode
      ? {
          node: lastNode,
          offset: lastNode.textContent?.length ?? 0
        }
      : null;
  }

  scrollToLocatorBlock(): boolean {
    if (!this.reader.options.container || !this.reader.locator?.blockId) {
      return false;
    }

    const section = this.reader.book?.sections[this.reader.currentSectionIndex];
    const sectionElement = section
      ? this.reader.getSectionElement(section.id)
      : null;
    if (
      sectionElement &&
      readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
    ) {
      const target = this.reader.findRenderedDomBlockTarget(
        sectionElement,
        this.reader.locator.blockId
      );
      if (target) {
        const containerRect =
          this.reader.options.container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (targetRect.width <= 0 && targetRect.height <= 0) {
          return false;
        }
        const absoluteRectTop =
          this.reader.options.container.scrollTop +
          targetRect.top -
          containerRect.top;
        this.reader.setProgrammaticScrollTop(
          Math.max(
            0,
            this.reader.resolveScrollTopForRect(
              absoluteRectTop,
              targetRect.height,
              this.reader.getLocatorScrollAlignment()
            )
          )
        );
        return true;
      }
    }

    const targetBlockIds = this.reader.resolveCanvasViewportBlockIds({
      ...this.reader.locator,
      spineIndex: this.reader.currentSectionIndex
    });
    const blockRegion = this.reader.lastInteractionRegions.find(
      (region) =>
        region.kind === "block" &&
        targetBlockIds.includes(region.blockId) &&
        region.sectionId === section?.id
    );
    const targetRect =
      blockRegion?.rect ??
      (section
        ? this.reader.resolveScrollCanvasBlockRect(
            section,
            this.reader.currentSectionIndex,
            targetBlockIds
          )
        : null);
    if (!targetRect) {
      return false;
    }
    this.reader.setProgrammaticScrollTop(
      Math.max(
        0,
        this.reader.resolveScrollTopForRect(
          targetRect.y,
          targetRect.height,
          this.reader.getLocatorScrollAlignment()
        )
      )
    );
    return true;
  }

  resolveScrollCanvasBlockRect(
    sourceSection: SectionDocument,
    sectionIndex: number,
    blockIds: string[]
  ): Rect | null {
    if (!this.reader.options.container || blockIds.length === 0) {
      return null;
    }

    const section = this.reader.getSectionForRender(sourceSection);
    const layout = this.reader.layoutEngine.layout(
      {
        section,
        spineIndex: sectionIndex,
        viewportWidth: this.reader.getContentWidth(),
        viewportHeight: this.reader.options.container.clientHeight,
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
      viewportHeight: this.reader.options.container.clientHeight,
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
        this.reader.getHighlightedCanvasBlockIdsForSection(sectionIndex),
      highlightRangesByBlock:
        this.reader.getHighlightedCanvasTextRangesForSection(sectionIndex),
      underlinedBlockIds:
        this.reader.getUnderlinedCanvasBlockIdsForSection(sectionIndex),
      underlineColorsByBlock:
        this.reader.getUnderlinedCanvasBlockColorsForSection(sectionIndex),
      underlineRangesByBlock:
        this.reader.getUnderlinedCanvasTextRangesForSection(sectionIndex),
      activeBlockId: this.reader.getActiveCanvasBlockIdForSection(sectionIndex)
    });
    const targetInteraction = displayList.interactions.find(
      (interaction) =>
        interaction.kind === "block" && blockIds.includes(interaction.blockId)
    );
    const targetOp = displayList.ops.find((op) =>
      blockIds.includes(op.blockId)
    );
    const localRect = targetInteraction?.rect ?? targetOp?.rect ?? null;
    if (!localRect) {
      return null;
    }

    const sectionTop = this.reader.getSectionTop(sourceSection.id);
    return {
      ...localRect,
      y: localRect.y + sectionTop
    };
  }

  scrollToLocatorInlineOffset(): boolean {
    if (
      !this.reader.options.container ||
      !this.reader.locator?.blockId ||
      this.reader.locator.inlineOffset === undefined
    ) {
      return false;
    }

    const section = this.reader.book?.sections[this.reader.currentSectionIndex];
    if (!section) {
      return false;
    }

    const sectionElement = this.reader.getSectionElement(section.id);
    const textPosition =
      resolveCanvasTextPosition({
        container: this.reader.options.container,
        sectionId: section.id,
        blockId: this.reader.locator.blockId,
        inlineOffset: this.reader.locator.inlineOffset,
        bias: "start"
      }) ??
      (sectionElement &&
      readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
        ? this.reader.resolveRenderedDomTextPosition(
            sectionElement,
            this.reader.locator.blockId,
            this.reader.locator.inlineOffset
          )
        : null);
    if (!textPosition) {
      return false;
    }

    if (typeof document.createRange !== "function") {
      return false;
    }

    const range = document.createRange();
    if (typeof range.getBoundingClientRect !== "function") {
      return false;
    }

    const textLength = textPosition.node.textContent?.length ?? 0;
    const startOffset = Math.max(0, Math.min(textLength, textPosition.offset));
    const endOffset =
      startOffset < textLength
        ? startOffset + 1
        : Math.max(0, Math.min(textLength, startOffset - 1));

    range.setStart(textPosition.node, Math.min(startOffset, endOffset));
    range.setEnd(textPosition.node, Math.max(startOffset, endOffset));
    const rangeRect = range.getBoundingClientRect();
    const rect =
      rangeRect.height > 0
        ? rangeRect
        : (textPosition.node.parentElement?.getBoundingClientRect() ?? null);
    if (!rect || (rect.width <= 0 && rect.height <= 0)) {
      return false;
    }

    const containerRect = this.reader.options.container.getBoundingClientRect();
    const nextScrollTop =
      this.reader.options.container.scrollTop +
      rect.top -
      containerRect.top -
      16;
    const alignedScrollTop =
      this.reader.getLocatorScrollAlignment() === "center"
        ? this.reader.options.container.scrollTop +
          rect.top -
          containerRect.top -
          this.reader.options.container.clientHeight / 2 +
          rect.height / 2
        : nextScrollTop;
    this.reader.setProgrammaticScrollTop(Math.max(0, alignedScrollTop));
    return true;
  }

  scrollToLocatorAnchor(): boolean {
    if (!this.reader.options.container || !this.reader.locator?.anchorId) {
      return false;
    }

    const section = this.reader.book?.sections[this.reader.currentSectionIndex];
    const sectionElement = section
      ? this.reader.getSectionElement(section.id)
      : null;
    if (!sectionElement) {
      return false;
    }

    const target = findRenderedAnchorTarget(
      sectionElement,
      this.reader.locator.anchorId
    );
    if (!target) {
      return false;
    }

    const containerRect = this.reader.options.container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextScrollTop =
      this.reader.getLocatorScrollAlignment() === "center"
        ? this.reader.options.container.scrollTop +
          targetRect.top -
          containerRect.top -
          this.reader.options.container.clientHeight / 2 +
          targetRect.height / 2
        : this.reader.options.container.scrollTop +
          targetRect.top -
          containerRect.top -
          16;
    this.reader.setProgrammaticScrollTop(nextScrollTop);
    return true;
  }

  refreshScrollSlicesAfterModeSwitchRelocation(): void {
    if (this.reader.pendingModeSwitchLocator) {
      this.reader.refreshScrollSlicesIfNeeded();
    }
  }

  scrollToCurrentLocation(): void {
    if (!this.reader.options.container) {
      return;
    }

    if (this.reader.scrollToLocatorAnchor()) {
      this.reader.refreshScrollSlicesAfterModeSwitchRelocation();
      return;
    }

    if (this.reader.scrollToLocatorInlineOffset()) {
      this.reader.refreshScrollSlicesAfterModeSwitchRelocation();
      return;
    }

    if (this.reader.locator?.blockId && this.reader.scrollToLocatorBlock()) {
      this.reader.refreshScrollSlicesAfterModeSwitchRelocation();
      return;
    }

    const section = this.reader.book?.sections[this.reader.currentSectionIndex];
    if (!section) {
      this.reader.setProgrammaticScrollTop(0);
      return;
    }

    const progress = this.reader.locator?.progressInSection ?? 0;
    if (this.reader.currentSectionIndex === 0 && progress <= 0) {
      this.reader.setProgrammaticScrollTop(0);
      return;
    }

    const sectionTop = this.reader.getSectionTop(section.id);
    const sectionHeight = this.reader.getSectionHeight(section.id);
    const targetTop =
      sectionTop +
      Math.max(0, Math.min(progress, 1)) *
        Math.max(0, sectionHeight - this.reader.options.container.clientHeight);
    this.reader.setProgrammaticScrollTop(Math.max(0, targetTop));
  }

  syncPositionFromScroll(emitEvent: boolean): boolean {
    if (
      !this.reader.options.container ||
      !this.reader.book ||
      this.reader.mode !== "scroll"
    ) {
      return false;
    }

    const preservedBlockId = emitEvent
      ? undefined
      : this.reader.locator?.blockId;
    const preservedAnchorId = emitEvent
      ? undefined
      : this.reader.locator?.anchorId;
    if (!emitEvent && this.reader.locator?.anchorId) {
      this.reader.currentSectionIndex = this.reader.locator.spineIndex;
      this.reader.syncCurrentPageFromSection();
      this.reader.updateLocator({
        ...this.reader.locator,
        spineIndex: this.reader.currentSectionIndex,
        progressInSection: this.reader.getProgressForCurrentLocator()
      });
      return true;
    }

    const probe =
      this.reader.options.container.scrollTop +
      this.reader.options.container.clientHeight * 0.5;
    const nextSectionIndex = this.reader.findSectionIndexForOffset(probe);
    if (nextSectionIndex < 0) {
      return false;
    }
    const section = this.reader.book.sections[nextSectionIndex];
    if (!section) {
      return false;
    }
    const sectionTop = this.reader.getSectionTop(section.id);
    const sectionHeight = Math.max(1, this.reader.getSectionHeight(section.id));
    const localOffset = probe - sectionTop;
    const progress = Math.max(0, Math.min(localOffset / sectionHeight, 1));
    this.reader.currentSectionIndex = nextSectionIndex;
    this.reader.updateLocator({
      spineIndex: nextSectionIndex,
      progressInSection: progress,
      ...(preservedAnchorId ? { anchorId: preservedAnchorId } : {}),
      ...(preservedBlockId ? { blockId: preservedBlockId } : {})
    });
    this.reader.syncCurrentPageFromSection();

    if (emitEvent) {
      this.reader.emitRelocated();
    }

    return true;
  }

  findRenderedSectionIndexForOffset(offset: number): number {
    if (!this.reader.book) {
      return -1;
    }

    return this.reader.scrollPositionService.findRenderedSectionIndexForOffset({
      container: this.reader.options.container,
      sections: this.reader.book.sections,
      offset
    });
  }

  updateScrollWindowBounds(): void {
    if (!this.reader.book) {
      this.reader.scrollWindowStart = -1;
      this.reader.scrollWindowEnd = -1;
      return;
    }

    const bounds = this.reader.scrollPositionService.resolveScrollWindowBounds({
      currentSectionIndex: this.reader.currentSectionIndex,
      sectionCount: this.reader.book.sections.length,
      radius: READER_SCROLL_WINDOW_RADIUS
    });
    this.reader.scrollWindowStart = bounds.start;
    this.reader.scrollWindowEnd = bounds.end;
  }

  refreshScrollWindowIfNeeded(): boolean {
    if (
      !this.reader.options.container ||
      !this.reader.book ||
      this.reader.mode !== "scroll"
    ) {
      return false;
    }

    const nextBounds =
      this.reader.scrollPositionService.shouldRefreshScrollWindow({
        currentSectionIndex: this.reader.currentSectionIndex,
        sectionCount: this.reader.book.sections.length,
        radius: READER_SCROLL_WINDOW_RADIUS,
        scrollWindowStart: this.reader.scrollWindowStart,
        scrollWindowEnd: this.reader.scrollWindowEnd
      });
    if (!nextBounds) {
      return false;
    }

    const scrollAnchor = this.reader.captureScrollAnchor();
    this.reader.scrollWindowStart = nextBounds.start;
    this.reader.scrollWindowEnd = nextBounds.end;
    this.reader.renderScrollableCanvas(this.reader.renderVersion);
    this.reader.restoreScrollAnchor(scrollAnchor);
    this.reader.syncPositionFromScroll(false);
    return true;
  }

  refreshScrollSlicesIfNeeded(): boolean {
    if (
      !this.reader.options.container ||
      !this.reader.book ||
      this.reader.mode !== "scroll" ||
      this.reader.lastRenderedSectionIds.length === 0
    ) {
      return false;
    }

    const viewportTop = this.reader.options.container.scrollTop;
    const viewportBottom =
      viewportTop + this.reader.options.container.clientHeight;
    const refreshGuard = Math.max(
      this.reader.options.container.clientHeight * 0.2,
      48
    );

    for (const sectionId of this.reader.lastRenderedSectionIds) {
      const window = this.reader.lastScrollRenderWindows.get(sectionId);
      const sectionIndex = this.reader.getSectionIndexById(sectionId);
      if (
        sectionIndex >= 0 &&
        this.reader.resolveChapterRenderDecision(sectionIndex).mode === "dom"
      ) {
        continue;
      }
      if (!window || window.length === 0) {
        this.reader.rerenderScrollSlicesPreservingScrollTop();
        return true;
      }

      const sectionTop = this.reader.getSectionTop(sectionId);
      const sectionHeight = this.reader.getSectionHeight(sectionId);
      const visibleTop = Math.max(viewportTop, sectionTop);
      const visibleBottom = Math.min(
        viewportBottom,
        sectionTop + sectionHeight
      );
      if (visibleBottom <= visibleTop) {
        continue;
      }

      const localVisibleTop = visibleTop - sectionTop;
      const localVisibleBottom = visibleBottom - sectionTop;
      const coverageTop = Math.min(...window.map((entry) => entry.top));
      const coverageBottom = Math.max(
        ...window.map((entry) => entry.top + entry.height)
      );
      if (
        localVisibleTop < coverageTop + refreshGuard ||
        localVisibleBottom > coverageBottom - refreshGuard
      ) {
        this.reader.rerenderScrollSlicesPreservingScrollTop();
        return true;
      }
    }

    return false;
  }

  scheduleDeferredScrollRefresh(): void {
    this.reader.scrollCoordinator.scheduleDeferredScrollRefresh(
      this.reader.mode
    );
  }

  clearDeferredScrollRefresh(): void {
    this.reader.scrollCoordinator.clearDeferredScrollRefresh();
  }

  rerenderScrollSlicesPreservingScrollTop(): void {
    if (!this.reader.options.container) {
      return;
    }

    const scrollAnchor = this.reader.captureScrollAnchor();
    const preservedScrollTop = this.reader.options.container.scrollTop;
    const preservedScrollLeft = this.reader.options.container.scrollLeft;
    this.reader.renderScrollableCanvas(this.reader.renderVersion);
    if (scrollAnchor) {
      this.reader.restoreScrollAnchor(scrollAnchor);
    } else {
      this.reader.setProgrammaticScrollTop(preservedScrollTop);
    }
    this.reader.options.container.scrollLeft = preservedScrollLeft;
  }

  scheduleDeferredResourceRenderRefresh(): void {
    if (!this.reader.book || !this.reader.options.container) {
      return;
    }

    this.reader.scrollCoordinator.scheduleDeferredResourceRenderRefresh();
  }

  clearDeferredResourceRenderRefresh(): void {
    this.reader.scrollCoordinator.clearDeferredResourceRenderRefresh();
  }

  scheduleDeferredAnchorRealignment(): void {
    if (!this.reader.options.container || !this.reader.locator?.anchorId) {
      return;
    }

    this.reader.scrollCoordinator.scheduleDeferredAnchorRealignment();
  }

  clearDeferredAnchorRealignment(): void {
    this.reader.scrollCoordinator.clearDeferredAnchorRealignment();
  }

  captureScrollAnchor(): ScrollAnchor | null {
    return this.reader.scrollPositionService.captureScrollAnchor({
      container: this.reader.options.container
    });
  }

  restoreScrollAnchor(anchor: ScrollAnchor | null): void {
    if (!this.reader.options.container) {
      return;
    }

    this.reader.setProgrammaticScrollTop(
      this.reader.scrollPositionService.resolveScrollTopForAnchor({
        anchor,
        currentScrollTop: this.reader.options.container.scrollTop,
        getSectionTop: (sectionId) => this.reader.getSectionTop(sectionId)
      })
    );
  }

  setProgrammaticScrollTop(nextScrollTop: number): void {
    this.reader.scrollCoordinator.setProgrammaticScrollTop(nextScrollTop);
  }

  collectRenderedCanvasSections(): Array<{
    sectionId: string;
    height: number;
    canvas: HTMLCanvasElement;
    interactions: InteractionRegion[];
  }> {
    if (!this.reader.options.container || !this.reader.book) {
      return [];
    }

    return this.reader.lastRenderedSectionIds.map((sectionId) => {
      const sectionTop = this.reader.getSectionTop(sectionId);
      return {
        sectionId,
        height: this.reader.getSectionHeight(sectionId),
        canvas: this.reader.options.canvas ?? document.createElement("canvas"),
        interactions: this.reader.lastInteractionRegions
          .filter((region) => region.sectionId === sectionId)
          .map((region) => ({
            ...region,
            rect: {
              ...region.rect,
              y: region.rect.y - sectionTop
            }
          }))
      };
    });
  }

  offsetInteractionRegionsForScroll(
    sections: Array<{
      sectionId: string;
      height: number;
      interactions: InteractionRegion[];
    }>
  ): InteractionRegion[] {
    return this.reader.scrollPositionService.offsetInteractionRegionsForScroll({
      sections,
      getSectionTop: (sectionId) => this.reader.getSectionTop(sectionId)
    });
  }

  collectVisibleBoundsForScroll(
    sectionsToRender: Array<{
      sectionId: string;
      sectionHref: string;
      height: number;
      displayList?: SectionDisplayList;
      renderWindows?: Array<{
        top: number;
        height: number;
      }>;
    }>
  ): VisibleDrawBounds {
    return this.reader.scrollPositionService.collectVisibleBoundsForScroll({
      sectionsToRender,
      getSectionTop: (sectionId) => this.reader.getSectionTop(sectionId)
    });
  }

  getSectionElement(sectionId: string): HTMLElement | null {
    if (!this.reader.options.container) {
      return null;
    }

    return (
      this.reader.options.container.querySelector<HTMLElement>(
        `article[data-section-id="${sectionId}"]`
      ) ??
      this.reader.options.container.querySelector<HTMLElement>(
        `.epub-dom-section[data-section-id="${sectionId}"]`
      )
    );
  }

  findRenderedDomSectionAtPoint(point: Point): {
    section: SectionDocument;
    sectionIndex: number;
    sectionElement: HTMLElement;
  } | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const candidateSectionIds = this.reader.lastRenderedSectionIds.length
      ? this.reader.lastRenderedSectionIds
      : this.reader.book.sections[this.reader.currentSectionIndex]?.id
        ? [this.reader.book.sections[this.reader.currentSectionIndex]!.id]
        : [];

    if (this.reader.mode === "paginated") {
      const containerRect =
        this.reader.options.container.getBoundingClientRect();
      for (const sectionId of candidateSectionIds) {
        const sectionIndex = this.reader.getSectionIndexById(sectionId);
        if (sectionIndex < 0) {
          continue;
        }

        const section = this.reader.book.sections[sectionIndex];
        const sectionElement = this.reader.getSectionElement(sectionId);
        if (
          !section ||
          !sectionElement ||
          !readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
        ) {
          continue;
        }

        const rect = sectionElement.getBoundingClientRect();
        const relativeLeft = rect.left - containerRect.left;
        const relativeTop = rect.top - containerRect.top;
        if (
          point.x >= relativeLeft &&
          point.x <= relativeLeft + rect.width &&
          point.y >= relativeTop &&
          point.y <= relativeTop + rect.height
        ) {
          return {
            section,
            sectionIndex,
            sectionElement
          };
        }
      }

      for (const sectionId of candidateSectionIds) {
        const sectionIndex = this.reader.getSectionIndexById(sectionId);
        if (sectionIndex < 0) {
          continue;
        }

        const section = this.reader.book.sections[sectionIndex];
        const sectionElement = this.reader.getSectionElement(sectionId);
        if (
          !section ||
          !sectionElement ||
          !readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
        ) {
          continue;
        }

        return {
          section,
          sectionIndex,
          sectionElement
        };
      }

      return null;
    }

    const absoluteY = point.y + this.reader.options.container.scrollTop;
    for (const sectionId of candidateSectionIds) {
      const sectionIndex = this.reader.getSectionIndexById(sectionId);
      if (sectionIndex < 0) {
        continue;
      }

      const section = this.reader.book.sections[sectionIndex];
      const sectionElement = this.reader.getSectionElement(sectionId);
      if (
        !section ||
        !sectionElement ||
        !readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
      ) {
        continue;
      }

      const top = this.reader.getSectionTop(sectionId);
      const height = this.reader.getSectionHeight(sectionId);
      if (absoluteY >= top && absoluteY <= top + height) {
        return {
          section,
          sectionIndex,
          sectionElement
        };
      }
    }

    return null;
  }

  getSectionTop(sectionId: string): number {
    const sectionElement = this.reader.getSectionElement(sectionId);
    const sectionIndex = this.reader.getSectionIndexById(sectionId);
    if (
      sectionElement &&
      Number.isFinite(sectionElement.offsetTop) &&
      (sectionIndex <= 0 || sectionElement.offsetTop > 0)
    ) {
      return sectionElement.offsetTop;
    }

    if (!this.reader.book) {
      return 0;
    }

    let offset = 0;
    for (let index = 0; index < sectionIndex; index += 1) {
      const section = this.reader.book.sections[index];
      if (!section) {
        continue;
      }
      offset += this.reader.getSectionHeight(section.id);
    }
    return offset;
  }

  getSectionHeight(sectionId: string): number {
    const sectionElement = this.reader.getSectionElement(sectionId);
    if (sectionElement && sectionElement.offsetHeight > 0) {
      return sectionElement.offsetHeight;
    }
    if (sectionElement) {
      const domSection =
        sectionElement.querySelector<HTMLElement>(".epub-dom-section");
      if (domSection) {
        const domHeight = domSection.scrollHeight || domSection.offsetHeight;
        if (domHeight > 0) {
          return domHeight;
        }
      }
    }

    if (!this.reader.book) {
      return this.reader.getPageHeight();
    }
    const index = this.reader.getSectionIndexById(sectionId);
    if (index < 0) {
      return this.reader.getPageHeight();
    }
    return Math.max(
      this.reader.getPageHeight(),
      this.reader.sectionEstimatedHeights[index] ?? this.reader.getPageHeight()
    );
  }

  rebuildSectionIndex(): void {
    this.reader.documentSession.rebuildSectionIndex();
  }

  getSectionIndexById(sectionId?: string | null): number {
    if (!sectionId) {
      return -1;
    }

    return this.reader.documentSession.resolveSectionIndexById(sectionId);
  }

  findSectionIndexForOffset(offset: number): number {
    if (!this.reader.book) {
      return -1;
    }

    return this.reader.scrollPositionService.findSectionIndexForOffset({
      container: this.reader.options.container,
      sections: this.reader.book.sections,
      offset,
      getSectionHeight: (sectionId) => this.reader.getSectionHeight(sectionId)
    });
  }
}
