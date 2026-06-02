import { DEFAULT_READER_BASELINE_STYLE_PROFILE } from "../renderer/reading-style-profile";
import { resolveResourcePath } from "../container/resource-path";
import type {
  HitTestResult,
  Locator,
  Point,
  RenderMetrics,
  RenderDiagnostics,
  ReaderEventMap,
  SearchResult,
  VisibleSectionDiagnostics,
  VisibleDrawBounds
} from "../model/types";
import { mapCanvasTextLayerClientPointToLocator } from "./canvas-text-locator";
import { normalizeLocator } from "./locator";
import { hasActiveTextSelection } from "./reader-selection";
import {
  findDomHitTargetAtPoint,
  mapDomLocatorToViewport,
  mapDomPointToLocator
} from "./dom-viewport-mapper";
import { classifyNavigationHref } from "./external-boundary";
import { resolveDomClickInteraction } from "./dom-interaction-model";
import { findRenderedSearchResultTarget } from "./dom-search-result-target";
import { resolveRenderBackendCapabilities } from "./render-backend-capabilities";
import * as readerRuntimeHelpers from "./reader-runtime-helpers";
import type { ReaderRuntimeHost } from "./reader-runtime-controller";
const READER_PAGINATED_CLICK_NAV_ZONE_RATIO = 0.28;

export class ReaderRuntimeInteractionController {
  private readonly reader: ReaderRuntimeHost;

  constructor(reader: ReaderRuntimeHost) {
    this.reader = reader;
  }

  hitTestDom(point: Point): HitTestResult | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const sectionEntry = this.reader.findRenderedDomSectionAtPoint(point);
    if (!sectionEntry) {
      return null;
    }

    const hitTarget = findDomHitTargetAtPoint({
      container: this.reader.options.container,
      sectionElement: sectionEntry.sectionElement,
      point
    });
    const locator = mapDomPointToLocator({
      container: this.reader.options.container,
      sectionElement: sectionEntry.sectionElement,
      section: sectionEntry.section,
      spineIndex: sectionEntry.sectionIndex,
      point
    });
    const normalizedLocator = normalizeLocator(locator);
    const blockId = normalizedLocator.blockId ?? sectionEntry.section.id;
    const link = hitTarget?.target.closest("a[href]");
    if (link instanceof HTMLAnchorElement && hitTarget) {
      return {
        kind: "link",
        rect: hitTarget.rect,
        sectionId: sectionEntry.section.id,
        blockId,
        href: link.getAttribute("href")?.trim() ?? "",
        locator: normalizedLocator,
        text: link.textContent?.trim() || undefined
      };
    }

    const image =
      hitTarget?.target.tagName.toLowerCase() === "img" ||
      hitTarget?.target.tagName.toLowerCase() === "image"
        ? hitTarget.target
        : hitTarget?.target.closest("img, image");
    if (image instanceof HTMLElement) {
      const imageRect =
        hitTarget?.target === image
          ? hitTarget.rect
          : {
              ...hitTarget!.rect
            };
      const src =
        image.getAttribute("src")?.trim() ??
        image.getAttribute("xlink:href")?.trim() ??
        image.getAttribute("href")?.trim() ??
        "";
      return {
        kind: "image",
        rect: imageRect,
        sectionId: sectionEntry.section.id,
        blockId,
        src,
        alt: image.getAttribute("alt")?.trim() || undefined,
        locator: normalizedLocator
      };
    }

    if (!hitTarget) {
      return null;
    }

    return {
      kind: "block",
      rect: hitTarget.rect,
      sectionId: sectionEntry.section.id,
      blockId,
      locator: normalizedLocator,
      text: hitTarget.target.textContent?.trim() || undefined
    };
  }

  hitTest(point: Point): HitTestResult | null {
    if (!this.reader.options.container) {
      return null;
    }

    if (this.reader.mode === "scroll") {
      const scrollHit = this.reader.hitTestScrollableCanvas(point);
      if (scrollHit) {
        return scrollHit;
      }
    }

    const hit = this.reader.canvasRenderer.hitTest(
      {
        sections: this.reader.collectRenderedCanvasSections(),
        bounds: this.reader.lastVisibleBounds,
        drawOpCount: this.reader.lastRenderMetrics.visibleDrawOpCount,
        totalCanvasHeight: this.reader.lastRenderMetrics.totalCanvasHeight
      },
      point,
      this.reader.mode === "scroll"
        ? this.reader.options.container.scrollTop
        : 0
    );

    if (hit) {
      return hit;
    }

    return this.reader.hitTestDom(point);
  }

  hitTestScrollableCanvas(point: Point): HitTestResult | null {
    if (!this.reader.options.container) {
      return null;
    }

    const absoluteY = point.y + this.reader.options.container.scrollTop;
    const sectionOffsetX = new Map<string, number>();
    return (
      [...this.reader.lastInteractionRegions].reverse().find((interaction) => {
        let offsetX = sectionOffsetX.get(interaction.sectionId);
        if (offsetX === undefined) {
          offsetX = this.reader.getScrollableCanvasSectionOffsetX(
            interaction.sectionId
          );
          sectionOffsetX.set(interaction.sectionId, offsetX);
        }
        const localX = point.x - offsetX;
        return (
          localX >= interaction.rect.x &&
          localX <= interaction.rect.x + interaction.rect.width &&
          absoluteY >= interaction.rect.y &&
          absoluteY <= interaction.rect.y + interaction.rect.height
        );
      }) ?? null
    );
  }

  getScrollableCanvasSectionOffsetX(sectionId: string): number {
    if (!this.reader.options.container) {
      return 0;
    }

    const sectionElement = this.reader.getSectionElement(sectionId);
    const canvasElement =
      sectionElement?.querySelector<HTMLElement>(".epub-text-layer-section") ??
      sectionElement?.querySelector<HTMLElement>(".epub-canvas-section");
    if (!canvasElement) {
      return 0;
    }

    const containerRect = this.reader.options.container.getBoundingClientRect();
    const canvasRect = canvasElement.getBoundingClientRect();
    return (
      canvasRect.left -
      containerRect.left +
      this.reader.options.container.scrollLeft
    );
  }

  resolveDomLinkHref(sectionHref: string, href: string): string {
    const resolution = classifyNavigationHref(href);
    if (resolution.kind !== "internal") {
      return href;
    }

    return resolveResourcePath(sectionHref, href);
  }

  getVisibleDrawBounds(): VisibleDrawBounds {
    return [...this.reader.lastVisibleBounds];
  }

  getRenderMetrics(): RenderMetrics {
    return { ...this.reader.lastRenderMetrics };
  }

  getRenderDiagnostics(): RenderDiagnostics | null {
    if (!this.reader.book || !this.reader.lastChapterRenderDecision) {
      return null;
    }

    const section = this.reader.book.sections[this.reader.currentSectionIndex];
    const capabilities = resolveRenderBackendCapabilities({
      backend: this.reader.lastChapterRenderDecision.mode,
      mode: this.reader.mode
    });
    const spreadContext = this.reader.getReadingSpreadContext();
    return {
      mode: this.reader.lastChapterRenderDecision.mode,
      score: this.reader.lastChapterRenderDecision.score,
      reasons: [...this.reader.lastChapterRenderDecision.reasons],
      ...(section?.renditionLayout
        ? { renditionLayout: section.renditionLayout }
        : {}),
      ...(spreadContext
        ? {
            renditionSpread: spreadContext.renditionSpread,
            spreadMode: spreadContext.spreadMode,
            pageSpreadPlacement: spreadContext.pageSpreadPlacement,
            syntheticSpreadActive: spreadContext.syntheticSpreadActive,
            viewportSlotCount: spreadContext.viewportSlotCount
          }
        : {}),
      publisherStyles: this.reader.publisherStyles,
      ...capabilities,
      alignmentTarget: "dom-baseline",
      styleProfile: DEFAULT_READER_BASELINE_STYLE_PROFILE,
      ...(section?.id ? { sectionId: section.id } : {}),
      ...(section?.href ? { sectionHref: section.href } : {})
    };
  }

  getVisibleSectionDiagnostics(): VisibleSectionDiagnostics[] {
    if (!this.reader.book) {
      return [];
    }

    const visibleSectionIds = this.reader.lastRenderedSectionIds.length
      ? this.reader.lastRenderedSectionIds
      : this.reader.book.sections[this.reader.currentSectionIndex]?.id
        ? [this.reader.book.sections[this.reader.currentSectionIndex]!.id]
        : [];

    const diagnostics: VisibleSectionDiagnostics[] = [];
    for (const sectionId of visibleSectionIds) {
      const sectionIndex = this.reader.getSectionIndexById(sectionId);
      if (sectionIndex < 0) {
        continue;
      }

      const section = this.reader.book.sections[sectionIndex];
      if (!section) {
        continue;
      }

      const decision = this.reader.resolveChapterRenderDecision(sectionIndex);
      const capabilities = resolveRenderBackendCapabilities({
        backend: decision.mode,
        mode: this.reader.mode
      });
      const spreadContext =
        this.reader.resolveReadingSpreadContextForSectionIndex(sectionIndex);
      diagnostics.push({
        mode: decision.mode,
        score: decision.score,
        reasons: [...decision.reasons],
        ...(section.renditionLayout
          ? { renditionLayout: section.renditionLayout }
          : {}),
        ...(spreadContext
          ? {
              renditionSpread: spreadContext.renditionSpread,
              spreadMode: spreadContext.spreadMode,
              pageSpreadPlacement: spreadContext.pageSpreadPlacement,
              syntheticSpreadActive: spreadContext.syntheticSpreadActive,
              viewportSlotCount: spreadContext.viewportSlotCount
            }
          : {}),
        publisherStyles: this.reader.publisherStyles,
        ...capabilities,
        alignmentTarget: "dom-baseline",
        styleProfile: DEFAULT_READER_BASELINE_STYLE_PROFILE,
        sectionId: section.id,
        sectionHref: section.href,
        isCurrent: sectionIndex === this.reader.currentSectionIndex
      });
    }

    return diagnostics;
  }

  mapLocatorToViewport(locator: Locator): VisibleDrawBounds {
    if (!this.reader.book || !this.reader.options.container) {
      return [];
    }

    const targetCanvasBlockIds =
      this.reader.resolveCanvasViewportBlockIds(locator);
    const targetSection = this.reader.book.sections[locator.spineIndex];
    if (!targetSection) {
      return [];
    }
    const targetSectionId = targetSection.id;

    const canvasRects = this.reader.lastInteractionRegions
      .filter((region) => {
        if (region.sectionId !== targetSectionId) {
          return false;
        }

        return targetCanvasBlockIds.length === 0
          ? true
          : targetCanvasBlockIds.includes(region.blockId);
      })
      .map((region) => region.rect);
    if (canvasRects.length > 0) {
      return canvasRects;
    }

    const sectionElement = this.reader.getSectionElement(targetSectionId);
    if (
      !sectionElement ||
      !readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
    ) {
      return [];
    }

    return mapDomLocatorToViewport({
      container: this.reader.options.container,
      mode: this.reader.mode,
      sectionElement,
      locator,
      sectionTop: this.reader.getSectionTop(targetSectionId),
      sectionHeight: this.reader.getSectionHeight(targetSectionId)
    });
  }

  mapViewportToLocator(point: Point): Locator | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const hit = this.reader.hitTest(point);
    return hit?.locator
      ? {
          ...hit.locator,
          blockId: hit.blockId
        }
      : this.reader.mapDomViewportPointToLocator(point);
  }

  captureModeSwitchLocator(): Locator | null {
    const fallbackLocator = this.reader.locator
      ? { ...this.reader.locator }
      : null;
    const probePoints = this.reader.getViewportCenterProbePoints();
    let nearestLocator: Locator | null = null;

    for (const point of probePoints) {
      const locator =
        this.reader.mapCanvasTextLayerPointToLocator(point) ??
        this.reader.mapViewportToLocator(point);
      if (!locator) {
        continue;
      }

      if (locator.anchorId || locator.blockId) {
        return locator;
      }

      if (!nearestLocator) {
        nearestLocator = locator;
      }
    }

    return nearestLocator ?? fallbackLocator;
  }

  mapCanvasTextLayerPointToLocator(point: Point): Locator | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const clientPoint = this.reader.getClientPointForContainerPoint(point);
    if (!clientPoint) {
      return null;
    }

    return mapCanvasTextLayerClientPointToLocator({
      container: this.reader.options.container,
      book: this.reader.book,
      clientPoint,
      getSectionIndexById: (sectionId) =>
        this.reader.getSectionIndexById(sectionId)
    });
  }

  applyPendingModeSwitchLocator(): void {
    if (!this.reader.pendingModeSwitchLocator) {
      return;
    }

    this.reader.currentSectionIndex =
      this.reader.pendingModeSwitchLocator.spineIndex;
    this.reader.updateLocator(this.reader.pendingModeSwitchLocator);
  }

  attachResizeObserver(): void {
    if (
      !this.reader.options.container ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    this.reader.resizeObserver = new ResizeObserver(() => {
      if (!this.reader.options.container || !this.reader.book) {
        return;
      }

      const { width: nextWidth, height: nextHeight } =
        this.reader.getPaginationMeasurement();
      const currentSection =
        this.reader.book.sections[this.reader.currentSectionIndex];
      const nextFixedLayoutRenderSignature = currentSection
        ? this.reader.resolveFixedLayoutRenderSignature(currentSection)
        : null;
      const nextPresentationRenderSignature = currentSection
        ? this.reader.resolvePresentationRenderSignature(currentSection)
        : null;
      const widthChanged =
        Math.abs(nextWidth - this.reader.lastMeasuredWidth) >= 1;
      const heightChanged =
        Math.abs(nextHeight - this.reader.lastMeasuredHeight) >= 1;
      const fixedLayoutChanged =
        nextFixedLayoutRenderSignature !==
        this.reader.lastFixedLayoutRenderSignature;
      const presentationChanged =
        nextPresentationRenderSignature !==
        this.reader.lastPresentationRenderSignature;

      if (
        !widthChanged &&
        !heightChanged &&
        !fixedLayoutChanged &&
        !presentationChanged
      ) {
        return;
      }

      this.reader.pages = [];
      this.reader.measuredDomPaginationBySectionId.clear();
      this.reader.renderCurrentSection("preserve");
    });

    this.reader.resizeObserver.observe(this.reader.options.container);
  }

  attachScrollListener(): void {
    this.reader.interactionController.attachScrollListener();
  }

  detachScrollListener(): void {
    this.reader.interactionController.detachScrollListener();
  }

  attachSelectionChangeListener(): void {
    if (typeof document === "undefined") {
      return;
    }

    document.addEventListener(
      "selectionchange",
      this.reader.handleDocumentSelectionChange
    );
  }

  attachPointerListener(): void {
    this.reader.interactionController.attachPointerListener();
  }

  detachPointerListener(): void {
    this.reader.interactionController.detachPointerListener();
  }

  attachKeyboardListener(): void {
    this.reader.interactionController.attachKeyboardListener();
  }

  detachKeyboardListener(): void {
    this.reader.interactionController.detachKeyboardListener();
  }

  handleDomClick(event: MouseEvent): void {
    if (!this.reader.options.container || !this.reader.book) {
      return;
    }

    if (hasActiveTextSelection(this.reader.options.container)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const sectionElement = target.closest(".epub-dom-section");
    if (!(sectionElement instanceof HTMLElement)) {
      return;
    }

    const sectionId = sectionElement.dataset.sectionId;
    const sectionIndex = sectionId
      ? this.reader.getSectionIndexById(sectionId)
      : this.reader.currentSectionIndex;
    if (sectionIndex < 0) {
      return;
    }

    const point = this.reader.getContainerRelativePoint(event);
    if (!point) {
      return;
    }

    const annotationSelection =
      this.reader.resolveAnnotationSelectionAtPoint(point);
    if (annotationSelection) {
      event.preventDefault();
      this.reader.setPinnedTextSelectionSnapshot(annotationSelection);
      this.reader.emitAnnotationActivatedAtPoint(point);
      return;
    }

    if (this.reader.pinnedTextSelectionSnapshot) {
      this.reader.setPinnedTextSelectionSnapshot(null);
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return;
    }

    const interaction = resolveDomClickInteraction({
      target,
      resolveLocator: () =>
        mapDomPointToLocator({
          container: this.reader.options.container!,
          sectionElement,
          section,
          spineIndex: sectionIndex,
          point
        })
    });
    const paginatedClickAction =
      this.reader.mode === "paginated"
        ? this.reader.resolvePaginatedClickNavigationAction({
            offsetX: point.x,
            target
          })
        : null;
    if (paginatedClickAction && interaction?.kind !== "link") {
      event.preventDefault();
      this.reader.performPaginatedNavigationAction(paginatedClickAction);
      return;
    }

    if (
      this.reader.mode === "paginated" &&
      !paginatedClickAction &&
      interaction?.kind !== "link"
    ) {
      event.preventDefault();
      const clickedAnchorId =
        readerRuntimeHelpers.resolveSectionAnchorIdForElement(section, target);
      const anchoredInteractionLocator =
        interaction?.kind === "locator"
          ? {
              ...interaction.locator,
              ...(clickedAnchorId ? { anchorId: clickedAnchorId } : {})
            }
          : null;
      if (interaction?.kind === "locator") {
        this.reader.currentSectionIndex = interaction.locator.spineIndex;
        this.reader.updateLocator(
          anchoredInteractionLocator ?? interaction.locator
        );
        this.reader.syncCurrentPageFromSection();
        this.reader.emitRelocated();
      }
      const centerTapLocator =
        interaction?.kind === "locator"
          ? (anchoredInteractionLocator ?? interaction.locator)
          : (mapDomPointToLocator({
              container: this.reader.options.container,
              sectionElement,
              section,
              spineIndex: sectionIndex,
              point
            }) ?? this.reader.getCurrentLocation());
      this.reader.emitPaginatedCenterTapped({
        source: "dom",
        offsetX: point.x,
        locator: centerTapLocator,
        sectionId: section.id
      });
      return;
    }

    if (!interaction) {
      return;
    }

    if (interaction.kind === "link") {
      event.preventDefault();
      void this.reader.activateLink({
        href: this.reader.resolveDomLinkHref(section.href, interaction.href),
        source: "dom",
        sectionId: section.id
      });
      return;
    }

    this.reader.currentSectionIndex = interaction.locator.spineIndex;
    const clickedAnchorId =
      readerRuntimeHelpers.resolveSectionAnchorIdForElement(section, target);
    this.reader.updateLocator({
      ...interaction.locator,
      ...(clickedAnchorId ? { anchorId: clickedAnchorId } : {})
    });
    this.reader.syncCurrentPageFromSection();
    this.reader.emitRelocated();
  }

  handlePaginatedViewportClick(event: MouseEvent): void {
    if (
      !this.reader.options.container ||
      !this.reader.book ||
      this.reader.mode !== "paginated"
    ) {
      return;
    }

    const point = this.reader.getContainerRelativePoint(event);
    if (!point) {
      return;
    }

    const action = this.reader.resolvePaginatedClickNavigationAction({
      offsetX: point.x,
      ...(event.target instanceof HTMLElement ? { target: event.target } : {})
    });
    if (!action) {
      return;
    }

    event.preventDefault();
    this.reader.performPaginatedNavigationAction(action);
  }

  resolvePaginatedClickNavigationAction(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "previous" | "next" | null {
    if (!this.reader.options.container) {
      return null;
    }

    const width = this.reader.options.container.clientWidth;
    if (width <= 0) {
      return null;
    }

    const navigationContext = this.reader.getReadingNavigationContext();
    if (!navigationContext) {
      return null;
    }

    const spread = this.reader.resolveCurrentPaginatedSpread();
    if (spread && spread.slots.length === 2) {
      const slotPosition = this.reader.resolvePaginatedSpreadClickSlot({
        offsetX: input.offsetX,
        ...(input.target ? { target: input.target } : {})
      });
      if (slotPosition === "left") {
        return navigationContext.pageProgression === "rtl"
          ? "next"
          : "previous";
      }

      if (slotPosition === "right") {
        return navigationContext.pageProgression === "rtl"
          ? "previous"
          : "next";
      }
    }

    const normalizedX = Math.max(0, Math.min(input.offsetX, width));
    const zoneWidth = width * READER_PAGINATED_CLICK_NAV_ZONE_RATIO;
    if (normalizedX <= zoneWidth) {
      return navigationContext.pageProgression === "rtl" ? "next" : "previous";
    }

    if (normalizedX >= width - zoneWidth) {
      return navigationContext.pageProgression === "rtl" ? "previous" : "next";
    }

    return null;
  }

  resolvePaginatedSpreadClickSlot(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "left" | "right" | null {
    if (!this.reader.options.container) {
      return null;
    }

    const slotElement =
      input.target?.closest<HTMLElement>("[data-spread-slot]");
    const slotName = slotElement?.dataset.spreadSlot;
    if (slotName === "left" || slotName === "right") {
      return slotName;
    }

    const width = this.reader.options.container.clientWidth;
    if (width <= 0) {
      return null;
    }

    return input.offsetX < width / 2 ? "left" : "right";
  }

  performPaginatedNavigationAction(action: "previous" | "next"): void {
    if (action === "next") {
      void this.reader.next();
      return;
    }

    void this.reader.prev();
  }

  emitPaginatedCenterTapped(input: {
    source: "dom" | "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }): void {
    if (this.reader.mode !== "paginated" || !this.reader.options.container) {
      return;
    }

    const locator = input.locator ?? null;
    const sectionFromId =
      input.sectionId && this.reader.book
        ? this.reader.book.sections.find(
            (section) => section.id === input.sectionId
          )
        : null;
    const sectionFromLocator =
      !sectionFromId &&
      this.reader.book &&
      locator &&
      Number.isInteger(locator.spineIndex) &&
      locator.spineIndex >= 0 &&
      locator.spineIndex < this.reader.book.sections.length
        ? this.reader.book.sections[locator.spineIndex]
        : null;
    const section = sectionFromId ?? sectionFromLocator;

    const payload = {
      locator,
      source: input.source,
      offsetX: input.offsetX,
      containerWidth: this.reader.options.container.clientWidth,
      ...(section?.id ? { sectionId: section.id } : {}),
      ...(section?.href ? { sectionHref: section.href } : {})
    } satisfies ReaderEventMap["paginatedCenterTapped"];

    this.reader.events.emit("paginatedCenterTapped", payload);
    this.reader.invokeReaderHook(() =>
      this.reader.options.onPaginatedCenterTap?.(payload)
    );
  }

  mapDomViewportPointToLocator(point: Point): Locator | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const sectionEntry = this.reader.findRenderedDomSectionAtPoint(point);
    if (!sectionEntry) {
      return null;
    }

    return mapDomPointToLocator({
      container: this.reader.options.container,
      sectionElement: sectionEntry.sectionElement,
      section: sectionEntry.section,
      spineIndex: sectionEntry.sectionIndex,
      point
    });
  }

  getViewportCenterProbePoints(): Point[] {
    const container = this.reader.options.container;
    if (!container) {
      return [];
    }

    const width = Math.max(
      1,
      container.clientWidth ||
        Math.round(container.getBoundingClientRect().width)
    );
    const height = Math.max(
      1,
      container.clientHeight ||
        Math.round(container.getBoundingClientRect().height)
    );
    const centerX = container.scrollLeft + width / 2;
    const centerY = height / 2;
    const xOffsets = [
      0,
      -width * 0.16,
      width * 0.16,
      -width * 0.28,
      width * 0.28
    ];
    const yOffsets = [
      0,
      -height * 0.16,
      height * 0.16,
      -height * 0.28,
      height * 0.28
    ];
    const seen = new Set<string>();
    const points: Point[] = [];

    for (const [xOffset, yOffset] of [
      [0, 0],
      [xOffsets[1], 0],
      [xOffsets[2], 0],
      [0, yOffsets[1]],
      [0, yOffsets[2]],
      [xOffsets[3], 0],
      [xOffsets[4], 0],
      [0, yOffsets[3]],
      [0, yOffsets[4]]
    ] as Array<[number, number]>) {
      const x = Math.max(
        container.scrollLeft,
        Math.min(centerX + xOffset, container.scrollLeft + width - 1)
      );
      const y = Math.max(0, Math.min(centerY + yOffset, height - 1));
      const key = `${Math.round(x)}:${Math.round(y)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      points.push({ x, y });
    }

    return points;
  }

  getContainerRelativePoint(event: MouseEvent): Point | null {
    if (!this.reader.options.container) {
      return null;
    }

    const bounds = this.reader.options.container.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left + this.reader.options.container.scrollLeft,
      y: event.clientY - bounds.top
    };
  }

  getClientPointForContainerPoint(
    point: Point
  ): { x: number; y: number } | null {
    if (!this.reader.options.container) {
      return null;
    }

    const bounds = this.reader.options.container.getBoundingClientRect();
    return {
      x: bounds.left + point.x - this.reader.options.container.scrollLeft,
      y: bounds.top + point.y
    };
  }

  realignDomSearchResult(result: SearchResult): void {
    if (!this.reader.options.container || !this.reader.book) {
      return;
    }

    const section = this.reader.book.sections[this.reader.currentSectionIndex];
    if (!section) {
      return;
    }

    const sectionElement = this.reader.getSectionElement(section.id);
    if (
      !sectionElement ||
      !readerRuntimeHelpers.isRenderedDomSectionElement(sectionElement)
    ) {
      return;
    }

    const target = findRenderedSearchResultTarget({
      sectionElement,
      result
    });
    if (!target) {
      return;
    }

    const containerRect = this.reader.options.container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (this.reader.mode === "scroll") {
      const nextScrollTop =
        this.reader.options.container.scrollTop +
        targetRect.top -
        containerRect.top -
        16;
      this.reader.setProgrammaticScrollTop(nextScrollTop);
    }

    const containerWidth =
      this.reader.options.container.clientWidth ||
      Math.max(1, containerRect.width);
    const containerHeight =
      this.reader.options.container.clientHeight ||
      Math.max(1, containerRect.height);
    const targetPoint = {
      x: Math.max(
        0,
        Math.min(
          targetRect.left -
            containerRect.left +
            Math.max(1, Math.min(12, targetRect.width / 2)),
          containerWidth - 1
        )
      ),
      y: Math.max(
        0,
        Math.min(
          targetRect.top -
            containerRect.top +
            Math.max(1, Math.min(12, targetRect.height / 2)),
          containerHeight - 1
        )
      )
    };
    const preciseLocator =
      this.reader.mapDomViewportPointToLocator(targetPoint);
    if (!preciseLocator) {
      return;
    }

    this.reader.currentSectionIndex = preciseLocator.spineIndex;
    this.reader.updateLocator({
      ...result.locator,
      ...preciseLocator,
      ...((preciseLocator.blockId ?? result.locator.blockId)
        ? { blockId: preciseLocator.blockId ?? result.locator.blockId }
        : {}),
      ...((preciseLocator.anchorId ?? result.locator.anchorId)
        ? { anchorId: preciseLocator.anchorId ?? result.locator.anchorId }
        : {})
    });
    this.reader.syncCurrentPageFromSection();
    this.reader.emitRelocated();
  }
}
