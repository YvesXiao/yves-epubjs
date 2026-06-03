import EventEmitter from "eventemitter3";
import { LayoutEngine, type LayoutResult } from "../layout/layout-engine";
import { CanvasRenderer } from "../renderer/canvas-renderer";
import { DisplayListBuilder } from "../renderer/display-list-builder";
import {
  DomChapterRenderer,
  type DomChapterRenderInput
} from "../renderer/dom-chapter-renderer";
import { BookParser } from "../parser/book-parser";
import { type EpubInput } from "../container/normalize-input";
import type {
  Annotation,
  AnnotationViewportSnapshot,
  Bookmark,
  BlockNode,
  Book,
  ChapterRenderDecision,
  Decoration,
  HitTestResult,
  InlineNode,
  Locator,
  LocatorRestoreDiagnostics,
  Point,
  PublisherColorOverride,
  PublisherStylesMode,
  PublicationAccessibilitySnapshot,
  RenderMetrics,
  RenderDiagnostics,
  ReaderEvent,
  ReaderEventMap,
  ReadingLanguageContext,
  ReadingNavigationContext,
  ReadingProgressSnapshot,
  ReadingSpreadContext,
  ReaderOptions,
  ReaderPreferences,
  ReaderSelectionHighlightState,
  ReaderSettings,
  ReaderSpreadMode,
  ReaderTextSelectionSnapshot,
  Rect,
  SectionAccessibilitySnapshot,
  SectionDocument,
  SerializedLocator,
  SearchResult,
  SectionRenderedEvent,
  SectionRelocatedEvent,
  TextRangeSelector,
  Theme,
  TocTarget,
  TypographyOptions,
  VisibleSectionDiagnostics,
  VisibleDrawBounds
} from "../model/types";
import type {
  InteractionRegion,
  SectionDisplayList
} from "../renderer/draw-ops";
import { type IntrinsicImageSize } from "../utils/image-intrinsic-size";
import { ChapterRenderDecisionCache } from "./chapter-render-decision-cache";
import { ReaderInteractionController } from "./reader-interaction-controller";
import { ReaderNavigationController } from "./reader-navigation-controller";
import { ReaderRenderOrchestrator } from "./reader-render-orchestrator";
import {
  ReaderAnnotationService,
  type ResolvedAnnotationActivation,
  type ResolvedAnnotationRange
} from "./reader-annotation-service";
import { ReaderDomPaginationService } from "./reader-dom-pagination-service";
import {
  ReaderScrollPositionService,
  type ScrollAnchor
} from "./reader-scroll-position-service";
import type { RenderBehavior } from "./render-flow-types";
import {
  createReaderSessionState,
  type ReaderSessionState
} from "./reader-session-state";
import { ReaderDocumentSession } from "./reader-document-session";
import { ReaderAnnotationSession } from "./reader-annotation-session";
import { ReaderViewSession } from "./reader-view-session";
import { ReaderSelectionSession } from "./reader-selection-session";
import { ReaderNavigationSession } from "./reader-navigation-session";
import { ReaderRenderSession } from "./reader-render-session";
import { type SharedChapterRenderInput } from "./chapter-render-input";
import {
  DEFAULT_READER_SETTINGS,
  mergeReaderPreferences,
  resolveReaderSettings
} from "./preferences";
import {
  hasActiveTextSelection,
  type SectionTextRangeContext
} from "./reader-selection";
import { DecorationManager } from "./decoration-manager";
import { type ReaderPage } from "./paginated-render-plan";
import { type PaginatedSpread } from "./reader-pagination";
import {
  RenderableResourceManager,
  type RenderableResourceConsumer
} from "./renderable-resource-manager";
import { ScrollCoordinator } from "./scroll-coordinator";
import { ReaderRuntimeController } from "./reader-runtime-controller";
import { clampProgress, isEditableTarget } from "./reader-runtime-helpers";
export type PaginationInfo = {
  currentPage: number;
  totalPages: number;
};

type ReaderTextSelection = Omit<
  ReaderTextSelectionSnapshot,
  "rects" | "visible"
>;

export class EpubReader {
  protected readonly parser = new BookParser();
  protected readonly events = new EventEmitter<ReaderEventMap>();
  protected readonly layoutEngine = new LayoutEngine();
  protected readonly displayListBuilder = new DisplayListBuilder();
  protected readonly canvasRenderer = new CanvasRenderer();
  protected readonly domChapterRenderer = new DomChapterRenderer();
  protected readonly chapterRenderDecisionCache =
    new ChapterRenderDecisionCache();
  protected readonly scrollCoordinator: ScrollCoordinator;
  protected readonly renderableResourceManager: RenderableResourceManager;
  protected readonly decorationManager = new DecorationManager();
  protected readonly interactionController: ReaderInteractionController;
  protected readonly navigationController: ReaderNavigationController;
  protected readonly renderOrchestrator: ReaderRenderOrchestrator;
  protected readonly annotationService: ReaderAnnotationService;
  protected readonly domPaginationService = new ReaderDomPaginationService();
  protected readonly scrollPositionService = new ReaderScrollPositionService();
  protected readonly sessionState: ReaderSessionState;
  protected readonly documentSession: ReaderDocumentSession;
  protected readonly annotationSession: ReaderAnnotationSession;
  protected readonly viewSession: ReaderViewSession;
  protected readonly navigationSession: ReaderNavigationSession;
  protected readonly renderSession: ReaderRenderSession;
  protected readonly selectionSession: ReaderSelectionSession;
  protected readonly runtimeController: ReaderRuntimeController;
  protected resizeObserver: ResizeObserver | null = null;
  protected readonly measuredDomPaginationBySectionId: Map<
    string,
    {
      pages: ReaderPage[];
      sectionEstimatedHeight: number;
      width: number;
      height: number;
    }
  >;
  protected readonly handleDocumentSelectionChange = (): void => {
    this.syncTextSelectionState();
  };

  protected get book(): Book | null {
    return this.documentSession.book;
  }

  protected set book(value: Book | null) {
    this.documentSession.book = value;
  }

  protected get sourceName(): string | null {
    return this.documentSession.sourceName;
  }

  protected set sourceName(value: string | null) {
    this.documentSession.sourceName = value;
  }

  protected get resources(): {
    readBinary(path: string): Promise<Uint8Array>;
    exists(path: string): boolean;
  } | null {
    return this.documentSession.resources;
  }

  protected set resources(
    value: {
      readBinary(path: string): Promise<Uint8Array>;
      exists(path: string): boolean;
    } | null
  ) {
    this.documentSession.resources = value;
  }

  protected get chapterRenderInputs(): SharedChapterRenderInput[] {
    return this.documentSession.chapterRenderInputs;
  }

  protected set chapterRenderInputs(value: SharedChapterRenderInput[]) {
    this.documentSession.chapterRenderInputs = value;
  }

  protected get sectionIndexById(): Map<string, number> {
    return this.documentSession.sectionIndexById;
  }

  protected get annotations(): Annotation[] {
    return this.annotationSession.annotations;
  }

  protected set annotations(value: Annotation[]) {
    this.annotationSession.annotations = value;
  }

  protected get preferences(): ReaderPreferences {
    return this.viewSession.preferences;
  }

  protected set preferences(value: ReaderPreferences) {
    this.viewSession.preferences = value;
  }

  protected get mode(): "scroll" | "paginated" {
    return this.viewSession.mode;
  }

  protected set mode(value: "scroll" | "paginated") {
    this.viewSession.mode = value;
  }

  protected get publisherStyles(): PublisherStylesMode {
    return this.viewSession.publisherStyles;
  }

  protected set publisherStyles(value: PublisherStylesMode) {
    this.viewSession.publisherStyles = value;
  }

  protected get publisherColorOverride(): PublisherColorOverride {
    return this.viewSession.publisherColorOverride;
  }

  protected set publisherColorOverride(value: PublisherColorOverride) {
    this.viewSession.publisherColorOverride = value;
  }

  protected get experimentalRtl(): boolean {
    return this.viewSession.experimentalRtl;
  }

  protected set experimentalRtl(value: boolean) {
    this.viewSession.experimentalRtl = value;
  }

  protected get spreadMode(): ReaderSpreadMode {
    return this.viewSession.spreadMode;
  }

  protected set spreadMode(value: ReaderSpreadMode) {
    this.viewSession.spreadMode = value;
  }

  protected get debugMode(): boolean {
    return this.viewSession.debugMode;
  }

  protected set debugMode(value: boolean) {
    this.viewSession.debugMode = value;
  }

  protected get theme(): Theme {
    return this.viewSession.theme;
  }

  protected set theme(value: Theme) {
    this.viewSession.theme = value;
  }

  protected get typography(): TypographyOptions {
    return this.viewSession.typography;
  }

  protected set typography(value: TypographyOptions) {
    this.viewSession.typography = value;
  }

  protected get textSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionSession.textSelectionSnapshot;
  }

  protected get pinnedTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionSession.pinnedTextSelectionSnapshot;
  }

  protected get locator(): Locator | null {
    return this.navigationSession.locator;
  }

  protected set locator(value: Locator | null) {
    this.navigationSession.locator = value;
  }

  protected get currentSectionIndex(): number {
    return this.navigationSession.currentSectionIndex;
  }

  protected set currentSectionIndex(value: number) {
    this.navigationSession.currentSectionIndex = value;
  }

  protected get pages(): ReaderPage[] {
    return this.navigationSession.pages;
  }

  protected set pages(value: ReaderPage[]) {
    this.navigationSession.pages = value;
  }

  protected get currentPageNumber(): number {
    return this.navigationSession.currentPageNumber;
  }

  protected set currentPageNumber(value: number) {
    this.navigationSession.currentPageNumber = value;
  }

  protected get pendingModeSwitchLocator(): Locator | null {
    return this.navigationSession.pendingModeSwitchLocator;
  }

  protected set pendingModeSwitchLocator(value: Locator | null) {
    this.navigationSession.pendingModeSwitchLocator = value;
  }

  protected get preferLocatorOnNextDomPaginationSync(): boolean {
    return this.navigationSession.preferLocatorOnNextDomPaginationSync;
  }

  protected set preferLocatorOnNextDomPaginationSync(value: boolean) {
    this.navigationSession.preferLocatorOnNextDomPaginationSync = value;
  }

  protected get lastMeasuredWidth(): number {
    return this.renderSession.lastMeasuredWidth;
  }

  protected set lastMeasuredWidth(value: number) {
    this.renderSession.lastMeasuredWidth = value;
  }

  protected get lastMeasuredHeight(): number {
    return this.renderSession.lastMeasuredHeight;
  }

  protected set lastMeasuredHeight(value: number) {
    this.renderSession.lastMeasuredHeight = value;
  }

  protected get sectionEstimatedHeights(): number[] {
    return this.renderSession.sectionEstimatedHeights;
  }

  protected set sectionEstimatedHeights(value: number[]) {
    this.renderSession.sectionEstimatedHeights = value;
  }

  protected get scrollWindowStart(): number {
    return this.renderSession.scrollWindowStart;
  }

  protected set scrollWindowStart(value: number) {
    this.renderSession.scrollWindowStart = value;
  }

  protected get scrollWindowEnd(): number {
    return this.renderSession.scrollWindowEnd;
  }

  protected set scrollWindowEnd(value: number) {
    this.renderSession.scrollWindowEnd = value;
  }

  protected get lastVisibleBounds(): VisibleDrawBounds {
    return this.renderSession.lastVisibleBounds;
  }

  protected set lastVisibleBounds(value: VisibleDrawBounds) {
    this.renderSession.lastVisibleBounds = value;
  }

  protected get lastInteractionRegions(): InteractionRegion[] {
    return this.renderSession.lastInteractionRegions;
  }

  protected set lastInteractionRegions(value: InteractionRegion[]) {
    this.renderSession.lastInteractionRegions = value;
  }

  protected get lastRenderedSectionIds(): string[] {
    return this.renderSession.lastRenderedSectionIds;
  }

  protected set lastRenderedSectionIds(value: string[]) {
    this.renderSession.lastRenderedSectionIds = value;
  }

  protected get lastScrollRenderWindows(): Map<
    string,
    Array<{ top: number; height: number }>
  > {
    return this.renderSession.lastScrollRenderWindows;
  }

  protected set lastScrollRenderWindows(
    value: Map<string, Array<{ top: number; height: number }>>
  ) {
    this.renderSession.lastScrollRenderWindows = value;
  }

  protected get lastRenderMetrics(): RenderMetrics {
    return this.renderSession.lastRenderMetrics;
  }

  protected set lastRenderMetrics(value: RenderMetrics) {
    this.renderSession.lastRenderMetrics = value;
  }

  protected get renderVersion(): number {
    return this.renderSession.renderVersion;
  }

  protected set renderVersion(value: number) {
    this.renderSession.renderVersion = value;
  }

  protected get lastChapterRenderDecision(): ChapterRenderDecision | null {
    return this.renderSession.lastChapterRenderDecision;
  }

  protected set lastChapterRenderDecision(value: ChapterRenderDecision | null) {
    this.renderSession.lastChapterRenderDecision = value;
  }

  protected get imageIntrinsicSizeCache(): Map<
    string,
    IntrinsicImageSize | null
  > {
    return this.renderSession.imageIntrinsicSizeCache;
  }

  protected get pendingImageIntrinsicSizePaths(): Set<string> {
    return this.renderSession.pendingImageIntrinsicSizePaths;
  }

  protected get lastLocatorRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.renderSession.lastLocatorRestoreDiagnostics;
  }

  protected set lastLocatorRestoreDiagnostics(
    value: LocatorRestoreDiagnostics | null
  ) {
    this.renderSession.lastLocatorRestoreDiagnostics = value;
  }

  protected get lastFixedLayoutRenderSignature(): string | null {
    return this.renderSession.lastFixedLayoutRenderSignature;
  }

  protected set lastFixedLayoutRenderSignature(value: string | null) {
    this.renderSession.lastFixedLayoutRenderSignature = value;
  }

  protected get lastPresentationRenderSignature(): string | null {
    return this.renderSession.lastPresentationRenderSignature;
  }

  protected set lastPresentationRenderSignature(value: string | null) {
    this.renderSession.lastPresentationRenderSignature = value;
  }

  constructor(protected readonly options: ReaderOptions = {}) {
    const preferences = mergeReaderPreferences(
      {
        ...(options.mode ? { mode: options.mode } : {}),
        ...(options.theme ? { theme: options.theme } : {}),
        ...(options.typography ? { typography: options.typography } : {})
      },
      options.preferences
    );
    const settings = resolveReaderSettings(
      preferences,
      DEFAULT_READER_SETTINGS
    );
    this.sessionState = createReaderSessionState({
      preferences,
      mode: settings.mode,
      publisherStyles: settings.publisherStyles,
      publisherColorOverride: settings.publisherColorOverride,
      experimentalRtl: settings.experimentalRtl,
      spreadMode: settings.spreadMode,
      theme: { ...settings.theme },
      typography: { ...settings.typography }
    });
    this.documentSession = new ReaderDocumentSession(
      this.sessionState.document
    );
    this.annotationSession = new ReaderAnnotationSession(
      this.sessionState.annotations
    );
    this.viewSession = new ReaderViewSession(this.sessionState.view);
    this.navigationSession = new ReaderNavigationSession(
      this.sessionState.position
    );
    this.renderSession = new ReaderRenderSession(this.sessionState.render);
    this.selectionSession = new ReaderSelectionSession(
      this.sessionState.selection
    );
    this.measuredDomPaginationBySectionId = new Map();
    this.scrollCoordinator = new ScrollCoordinator({
      container: this.options.container,
      onScrollFrame: (emitEvent) => {
        this.syncPositionFromScroll(emitEvent);
        const refreshedWindow = this.refreshScrollWindowIfNeeded();
        if (!refreshedWindow) {
          this.refreshScrollSlicesIfNeeded();
        }
      },
      onDeferredScrollRefresh: () => {
        this.refreshScrollWindowIfNeeded();
      },
      onDeferredResourceRenderRefresh: () => {
        this.renderCurrentSection("preserve");
      },
      onDeferredAnchorRealignment: () => {
        this.currentSectionIndex =
          this.locator?.spineIndex ?? this.currentSectionIndex;
        if (!this.scrollToLocatorAnchor()) {
          return;
        }
        this.syncCurrentPageFromSection();
        this.updateLocator({
          ...this.locator,
          spineIndex: this.currentSectionIndex,
          progressInSection: this.getProgressForCurrentLocator()
        });
      }
    });
    this.renderableResourceManager = new RenderableResourceManager({
      getContainer: () => this.options.container,
      readBinary: (path) => this.resources?.readBinary(path) ?? null,
      hasBinary: (path) => this.resources?.exists(path) ?? null,
      shouldTrackDomLayoutChanges: () =>
        this.lastChapterRenderDecision?.mode === "dom" &&
        (this.mode === "paginated" || Boolean(this.locator?.anchorId)),
      onCanvasResourceResolved: () => {
        this.scheduleDeferredResourceRenderRefresh();
      },
      onDomLayoutChange: (element) => {
        if (element && !this.options.container?.contains(element)) {
          return;
        }
        if (element?.closest(".epub-dom-section-fxl")) {
          return;
        }
        if (
          this.mode === "paginated" &&
          this.lastChapterRenderDecision?.mode === "dom"
        ) {
          this.scheduleDeferredResourceRenderRefresh();
          return;
        }
        this.scheduleDeferredAnchorRealignment();
      }
    });
    this.annotationService = new ReaderAnnotationService({
      getBook: () => this.book,
      getAnnotations: () => this.annotations,
      getPublicationId: () => this.getPublicationId(),
      getContainer: () => this.options.container,
      getMode: () => this.mode,
      getSectionElement: (sectionId) => this.getSectionElement(sectionId),
      mapLocatorToViewport: (locator) => this.mapLocatorToViewport(locator),
      resolveCanvasTextRangeViewportRects: (sectionId, textRange) =>
        this.resolveCanvasTextRangeViewportRects(sectionId, textRange)
    });
    this.interactionController = new ReaderInteractionController({
      getContainer: () => this.options.container,
      getMode: () => this.mode,
      getBook: () => this.book,
      handleScrollEvent: (mode) =>
        this.scrollCoordinator.handleScrollEvent(mode),
      hasTextSelectionSnapshot: () => Boolean(this.textSelectionSnapshot),
      syncTextSelectionState: () => this.syncTextSelectionState(),
      hasActiveTextSelection: (scope) => hasActiveTextSelection(scope),
      handleDomClick: (event) => this.handleDomClick(event),
      getContainerRelativePoint: (event) =>
        this.getContainerRelativePoint(event),
      resolveAnnotationSelectionAtPoint: (point) =>
        this.resolveAnnotationSelectionAtPoint(point),
      emitAnnotationActivated: (point) =>
        this.emitAnnotationActivatedAtPoint(point),
      setPinnedTextSelectionSnapshot: (snapshot) =>
        this.setPinnedTextSelectionSnapshot(snapshot),
      hasPinnedTextSelectionSnapshot: () =>
        Boolean(this.pinnedTextSelectionSnapshot),
      hitTest: (point) => this.hitTest(point),
      resolvePaginatedClickNavigationAction: (input) =>
        this.resolvePaginatedClickNavigationAction(input),
      performPaginatedNavigationAction: (action) =>
        this.performPaginatedNavigationAction(action),
      emitPaginatedCenterTapped: (input) =>
        this.emitPaginatedCenterTapped(input),
      mapDomViewportPointToLocator: (point) =>
        this.mapDomViewportPointToLocator(point),
      getCurrentLocation: () => this.getCurrentLocation(),
      activateLink: (input) => this.activateLink(input),
      updateLocator: (locator) => this.updateLocator(locator),
      setCurrentSectionIndex: (sectionIndex) => {
        this.currentSectionIndex = sectionIndex;
      },
      syncCurrentPageFromSection: () => this.syncCurrentPageFromSection(),
      emitRelocated: () => this.emitRelocated(),
      isEditableTarget: (target) => isEditableTarget(target),
      getReadingNavigationContext: () => this.getReadingNavigationContext(),
      next: () => this.next(),
      prev: () => this.prev()
    });
    this.navigationController = new ReaderNavigationController({
      getBook: () => this.book,
      getMode: () => this.mode,
      getCurrentSectionIndex: () => this.currentSectionIndex,
      setCurrentSectionIndex: (sectionIndex) => {
        this.currentSectionIndex = sectionIndex;
      },
      getLocator: () => this.locator,
      updateLocator: (locator) => this.updateLocator(locator),
      ensurePages: () => this.ensurePages(),
      findPageForLocator: (locator) => this.findPageForLocator(locator),
      resolveDisplayPageNumberToLeafPage: (pageNumber) =>
        this.resolveDisplayPageNumberToLeafPage(pageNumber),
      findPageByNumber: (pageNumber) => this.findPageByNumber(pageNumber),
      createLocatorForPage: (page) => this.createLocatorForPage(page),
      renderCurrentSection: () => this.renderCurrentSection(),
      emitRelocated: () => this.emitRelocated(),
      setCurrentPageNumber: (pageNumber) => {
        this.currentPageNumber = pageNumber;
      },
      getCurrentPageNumber: () => this.currentPageNumber,
      getPageCount: () => this.pages.length,
      getPaginationInfo: () => this.getPaginationInfo(),
      getCurrentLocation: () => this.getCurrentLocation(),
      getPublicationId: () => this.getPublicationId(),
      setLastLocatorRestoreDiagnostics: (diagnostics) => {
        this.lastLocatorRestoreDiagnostics = diagnostics;
      },
      getProgressForCurrentLocator: () => this.getProgressForCurrentLocator(),
      getSectionProgressWeights: () => this.getSectionProgressWeights(),
      getPageHeight: () => this.getPageHeight()
    });
    this.renderOrchestrator = new ReaderRenderOrchestrator({
      getBook: () => this.book,
      getContainer: () => this.options.container,
      getMode: () => this.mode,
      getCurrentSectionIndex: () => this.currentSectionIndex,
      setCurrentSectionIndex: (sectionIndex) => {
        this.currentSectionIndex = sectionIndex;
      },
      getSectionForRender: (section) => this.getSectionForRender(section),
      captureScrollAnchor: () => this.captureScrollAnchor(),
      setLastPresentationRenderSignature: (signature) => {
        this.lastPresentationRenderSignature = signature;
      },
      resolvePresentationRenderSignature: (section) =>
        this.resolvePresentationRenderSignature(section),
      resolveChapterRenderDecision: (sectionIndex) =>
        this.resolveChapterRenderDecision(sectionIndex),
      setLastChapterRenderDecision: (decision) => {
        this.lastChapterRenderDecision = decision;
      },
      applyContainerTheme: () => this.applyContainerTheme(),
      getPublisherStyles: () => this.publisherStyles,
      syncFixedLayoutContainerState: (value) =>
        this.syncFixedLayoutContainerState(
          value as DomChapterRenderInput | null
        ),
      nextRenderVersion: () => this.renderSession.nextRenderVersion(),
      getPaginationMeasurement: () => this.getPaginationMeasurement(),
      layoutPaginatedSection: (section, spineIndex, measurement) =>
        this.layoutEngine.layout(
          {
            section,
            spineIndex,
            viewportWidth: measurement.width,
            viewportHeight: measurement.height,
            typography: this.typography,
            fontFamily: this.getFontFamily(),
            resolveImageIntrinsicSize: (src) =>
              this.resolveImageIntrinsicSizeForLayout(src)
          },
          this.mode
        ),
      setMeasuredSize: (size) => {
        this.lastMeasuredWidth = size.width;
        this.lastMeasuredHeight = size.height;
      },
      ensurePages: (layout) => this.ensurePages(layout),
      resolveRenderedPage: (sectionId) => this.resolveRenderedPage(sectionId),
      renderPaginatedDomSpread: (page, renderVersion) =>
        this.renderPaginatedDomSpread(page, renderVersion),
      renderDomSection: (section, renderVersion) =>
        this.renderDomSection(section, renderVersion),
      syncMeasuredPaginatedDomPages: (section) =>
        this.syncMeasuredPaginatedDomPages(section),
      setCurrentPageNumber: (pageNumber) => {
        this.currentPageNumber = pageNumber;
      },
      getLocator: () => this.locator,
      updateLocator: (locator) => this.updateLocator(locator),
      syncDomSectionStateAfterRender: (
        renderBehavior,
        preservedScrollAnchor,
        resolvedPage
      ) =>
        this.syncDomSectionStateAfterRender(
          renderBehavior,
          preservedScrollAnchor,
          resolvedPage
        ),
      renderPaginatedCanvas: (section, currentPage, renderVersion) =>
        this.renderPaginatedCanvas(section, currentPage, renderVersion),
      getContentWidth: () => this.getContentWidth(),
      getContainerClientHeight: () => this.options.container?.clientHeight ?? 0,
      updateScrollWindowBounds: () => this.updateScrollWindowBounds(),
      renderScrollableCanvas: (renderVersion) =>
        this.renderScrollableCanvas(renderVersion),
      scrollToCurrentLocation: () => this.scrollToCurrentLocation(),
      restoreScrollAnchor: (anchor) => this.restoreScrollAnchor(anchor),
      scrollToLocatorAnchor: () => this.scrollToLocatorAnchor(),
      syncCurrentPageFromSection: () => this.syncCurrentPageFromSection(),
      getProgressForCurrentLocator: () => this.getProgressForCurrentLocator(),
      clampProgress: (value) => clampProgress(value),
      syncPositionFromScroll: (emitEvent) =>
        this.syncPositionFromScroll(emitEvent),
      emitSectionRendered: (section) => this.emitSectionRendered(section)
    });
    this.runtimeController = new ReaderRuntimeController(this);
    this.attachResizeObserver();
    this.attachScrollListener();
    this.attachPointerListener();
    this.attachKeyboardListener();
    this.attachSelectionChangeListener();
  }

  async open(input: EpubInput): Promise<Book> {
    return this.runtimeController.open(input);
  }

  async render(): Promise<void> {
    return this.runtimeController.render();
  }

  async next(): Promise<void> {
    return this.runtimeController.next();
  }

  async prev(): Promise<void> {
    return this.runtimeController.prev();
  }

  protected isAtRenderedPaginatedDomSectionStart(): boolean {
    return this.runtimeController.isAtRenderedPaginatedDomSectionStart();
  }

  async goToLocation(locator: Locator): Promise<void> {
    return this.runtimeController.goToLocation(locator);
  }

  async restoreLocation(
    locator: Locator | SerializedLocator
  ): Promise<boolean> {
    return this.runtimeController.restoreLocation(locator);
  }

  async restoreBookmark(bookmark: Bookmark): Promise<boolean> {
    return this.runtimeController.restoreBookmark(bookmark);
  }

  async goToTocItem(id: string): Promise<void> {
    return this.runtimeController.goToTocItem(id);
  }

  async setTheme(theme: Partial<Theme>): Promise<void> {
    return this.runtimeController.setTheme(theme);
  }

  async setTypography(options: Partial<TypographyOptions>): Promise<void> {
    return this.runtimeController.setTypography(options);
  }

  async setMode(mode: "scroll" | "paginated"): Promise<void> {
    return this.runtimeController.setMode(mode);
  }

  async submitPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.runtimeController.submitPreferences(preferences);
  }

  async restorePreferences(
    preferences: ReaderPreferences | string | null | undefined
  ): Promise<ReaderSettings> {
    return this.runtimeController.restorePreferences(preferences);
  }

  serializePreferences(): string {
    return this.runtimeController.serializePreferences();
  }

  async goToPage(pageNumber: number): Promise<void> {
    return this.runtimeController.goToPage(pageNumber);
  }

  protected async goToScrollSection(sectionNumber: number): Promise<void> {
    return this.runtimeController.goToScrollSection(sectionNumber);
  }

  protected async goToLeafPage(pageNumber: number): Promise<void> {
    return this.runtimeController.goToLeafPage(pageNumber);
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.runtimeController.search(query);
  }

  async goToSearchResult(result: SearchResult): Promise<void> {
    return this.runtimeController.goToSearchResult(result);
  }

  getCurrentLocation(): Locator | null {
    return this.runtimeController.getCurrentLocation();
  }

  getReadingProgress(): ReadingProgressSnapshot | null {
    return this.runtimeController.getReadingProgress();
  }

  async goToProgress(progress: number): Promise<Locator | null> {
    return this.runtimeController.goToProgress(progress);
  }

  setDecorations(input: { group: string; decorations: Decoration[] }): void {
    return this.runtimeController.setDecorations(input);
  }

  clearDecorations(group?: string): void {
    return this.runtimeController.clearDecorations(group);
  }

  getDecorations(group?: string): Decoration[] {
    return this.runtimeController.getDecorations(group);
  }

  setDebugMode(enabled: boolean): void {
    return this.runtimeController.setDebugMode(enabled);
  }

  createAnnotation(
    input: {
      locator?: Locator;
      textRange?: TextRangeSelector;
      quote?: string;
      note?: string;
      style?: "highlight" | "underline";
      color?: string;
    } = {}
  ): Annotation | null {
    return this.runtimeController.createAnnotation(input);
  }

  createAnnotationFromSelection(
    input: {
      note?: string;
      style?: "highlight" | "underline";
      color?: string;
    } = {}
  ): Annotation | null {
    return this.runtimeController.createAnnotationFromSelection(input);
  }

  getCurrentTextSelection(): ReaderTextSelection | null {
    return this.runtimeController.getCurrentTextSelection();
  }

  getCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.runtimeController.getCurrentTextSelectionSnapshot();
  }

  getCurrentSelectionHighlightState(): ReaderSelectionHighlightState | null {
    return this.runtimeController.getCurrentSelectionHighlightState();
  }

  applyCurrentSelectionHighlightAction(
    input: {
      note?: string;
      style?: "highlight" | "underline";
      color?: string;
    } = {}
  ): {
    mode: "highlight" | "remove-highlight";
    changedCount: number;
  } | null {
    return this.runtimeController.applyCurrentSelectionHighlightAction(input);
  }

  clearCurrentTextSelection(): void {
    return this.runtimeController.clearCurrentTextSelection();
  }

  addAnnotation(annotation: Annotation): void {
    return this.runtimeController.addAnnotation(annotation);
  }

  setAnnotations(annotations: Annotation[]): void {
    return this.runtimeController.setAnnotations(annotations);
  }

  getAnnotations(): Annotation[] {
    return this.runtimeController.getAnnotations();
  }

  getAnnotationViewportSnapshots(): AnnotationViewportSnapshot[] {
    return this.runtimeController.getAnnotationViewportSnapshots();
  }

  clearAnnotations(): void {
    return this.runtimeController.clearAnnotations();
  }

  protected updateLocator(locator: Locator | null): void {
    return this.runtimeController.updateLocator(locator);
  }

  protected hitTestDom(point: Point): HitTestResult | null {
    return this.runtimeController.hitTestDom(point);
  }

  hitTest(point: Point): HitTestResult | null {
    return this.runtimeController.hitTest(point);
  }

  protected hitTestScrollableCanvas(point: Point): HitTestResult | null {
    return this.runtimeController.hitTestScrollableCanvas(point);
  }

  protected getScrollableCanvasSectionOffsetX(sectionId: string): number {
    return this.runtimeController.getScrollableCanvasSectionOffsetX(sectionId);
  }

  protected resolveDomLinkHref(sectionHref: string, href: string): string {
    return this.runtimeController.resolveDomLinkHref(sectionHref, href);
  }

  getVisibleDrawBounds(): VisibleDrawBounds {
    return this.runtimeController.getVisibleDrawBounds();
  }

  getRenderMetrics(): RenderMetrics {
    return this.runtimeController.getRenderMetrics();
  }

  getRenderDiagnostics(): RenderDiagnostics | null {
    return this.runtimeController.getRenderDiagnostics();
  }

  getVisibleSectionDiagnostics(): VisibleSectionDiagnostics[] {
    return this.runtimeController.getVisibleSectionDiagnostics();
  }

  mapLocatorToViewport(locator: Locator): VisibleDrawBounds {
    return this.runtimeController.mapLocatorToViewport(locator);
  }

  mapViewportToLocator(point: Point): Locator | null {
    return this.runtimeController.mapViewportToLocator(point);
  }

  protected captureModeSwitchLocator(): Locator | null {
    return this.runtimeController.captureModeSwitchLocator();
  }

  protected mapCanvasTextLayerPointToLocator(point: Point): Locator | null {
    return this.runtimeController.mapCanvasTextLayerPointToLocator(point);
  }

  protected applyPendingModeSwitchLocator(): void {
    return this.runtimeController.applyPendingModeSwitchLocator();
  }

  on<TEvent extends ReaderEvent>(
    event: TEvent,
    handler: (payload: ReaderEventMap[TEvent]) => void
  ): () => void {
    return this.runtimeController.on(event, handler);
  }

  destroy(): void {
    return this.runtimeController.destroy();
  }

  getBook(): Book | null {
    return this.runtimeController.getBook();
  }

  getPublicationId(): string | null {
    return this.runtimeController.getPublicationId();
  }

  createBookmark(
    input: {
      locator?: Locator;
      label?: string;
      excerpt?: string;
    } = {}
  ): Bookmark | null {
    return this.runtimeController.createBookmark(input);
  }

  getLastLocationRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.runtimeController.getLastLocationRestoreDiagnostics();
  }

  getPreferences(): ReaderPreferences {
    return this.runtimeController.getPreferences();
  }

  getSettings(): ReaderSettings {
    return this.runtimeController.getSettings();
  }

  getReadingLanguageContext(): ReadingLanguageContext | null {
    return this.runtimeController.getReadingLanguageContext();
  }

  getReadingNavigationContext(): ReadingNavigationContext | null {
    return this.runtimeController.getReadingNavigationContext();
  }

  getReadingSpreadContext(): ReadingSpreadContext | null {
    return this.runtimeController.getReadingSpreadContext();
  }

  getTocTargets(): TocTarget[] {
    return this.runtimeController.getTocTargets();
  }

  getSectionAccessibilitySnapshot(
    spineIndex = this.currentSectionIndex
  ): SectionAccessibilitySnapshot | null {
    return this.runtimeController.getSectionAccessibilitySnapshot(spineIndex);
  }

  getPublicationAccessibilitySnapshot(): PublicationAccessibilitySnapshot | null {
    return this.runtimeController.getPublicationAccessibilitySnapshot();
  }

  getTheme(): Theme {
    return this.runtimeController.getTheme();
  }

  getTypography(): TypographyOptions {
    return this.runtimeController.getTypography();
  }

  getPaginationInfo(): PaginationInfo {
    return this.runtimeController.getPaginationInfo();
  }

  async goToHref(href: string): Promise<Locator | null> {
    return this.runtimeController.goToHref(href);
  }

  protected async activateLink(input: {
    href: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }): Promise<void> {
    return this.runtimeController.activateLink(input);
  }

  protected getSectionProgressWeights(): number[] {
    return this.runtimeController.getSectionProgressWeights();
  }

  resolveHrefLocator(href: string): Locator | null {
    return this.runtimeController.resolveHrefLocator(href);
  }

  protected async applyPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.runtimeController.applyPreferences(preferences);
  }

  protected emitRelocated(): void {
    return this.runtimeController.emitRelocated();
  }

  protected buildSectionRelocatedEvent(): SectionRelocatedEvent | null {
    return this.runtimeController.buildSectionRelocatedEvent();
  }

  protected emitSectionRendered(section: SectionDocument): void {
    return this.runtimeController.emitSectionRendered(section);
  }

  protected buildSectionRenderedEvent(
    section: SectionDocument
  ): SectionRenderedEvent | null {
    return this.runtimeController.buildSectionRenderedEvent(section);
  }

  protected resolveSectionHookElements(sectionId: string): {
    containerElement?: HTMLElement;
    contentElement?: HTMLElement;
  } {
    return this.runtimeController.resolveSectionHookElements(sectionId);
  }

  protected invokeReaderHook(
    callback: () => void | Promise<void> | undefined
  ): void {
    return this.runtimeController.invokeReaderHook(callback);
  }

  protected renderCurrentSection(
    renderBehavior: RenderBehavior = "relocate"
  ): void {
    return this.runtimeController.renderCurrentSection(renderBehavior);
  }

  protected renderDomSection(
    section: SectionDocument,
    renderVersion: number
  ): void {
    return this.runtimeController.renderDomSection(section, renderVersion);
  }

  protected renderPaginatedDomSpread(
    page: ReaderPage,
    renderVersion: number
  ): void {
    return this.runtimeController.renderPaginatedDomSpread(page, renderVersion);
  }

  protected syncFixedLayoutContainerState(
    input: DomChapterRenderInput | null
  ): void {
    return this.runtimeController.syncFixedLayoutContainerState(input);
  }

  protected syncDomSectionStateAfterRender(
    renderBehavior: RenderBehavior,
    preservedScrollAnchor: ScrollAnchor | null,
    paginatedPage: ReaderPage | null = null
  ): void {
    return this.runtimeController.syncDomSectionStateAfterRender(
      renderBehavior,
      preservedScrollAnchor,
      paginatedPage
    );
  }

  protected scrollDomSectionToProgress(progressInSection: number): void {
    return this.runtimeController.scrollDomSectionToProgress(progressInSection);
  }

  protected scrollDomSectionToPaginatedPage(page: ReaderPage | null): void {
    return this.runtimeController.scrollDomSectionToPaginatedPage(page);
  }

  protected positionPaginatedDomSection(
    section: HTMLElement,
    page: ReaderPage
  ): void {
    return this.runtimeController.positionPaginatedDomSection(section, page);
  }

  protected syncMeasuredPaginatedDomPages(
    section: SectionDocument
  ): ReaderPage | null {
    return this.runtimeController.syncMeasuredPaginatedDomPages(section);
  }

  protected resolveChapterRenderDecision(
    sectionIndex: number
  ): ChapterRenderDecision {
    return this.runtimeController.resolveChapterRenderDecision(sectionIndex);
  }

  protected applyContainerTheme(): void {
    return this.runtimeController.applyContainerTheme();
  }

  protected renderPaginatedCanvas(
    section: SectionDocument,
    page: ReaderPage | null,
    renderVersion: number
  ): void {
    return this.runtimeController.renderPaginatedCanvas(
      section,
      page,
      renderVersion
    );
  }

  protected renderScrollableCanvas(renderVersion: number): void {
    return this.runtimeController.renderScrollableCanvas(renderVersion);
  }

  protected buildDisplayListForPage(
    section: SectionDocument,
    page: ReaderPage
  ): SectionDisplayList {
    return this.runtimeController.buildDisplayListForPage(section, page);
  }

  protected estimateBlockHeightForPage(block: BlockNode): number {
    return this.runtimeController.estimateBlockHeightForPage(block);
  }

  protected isImageResourceReady(src: string): boolean {
    return this.runtimeController.isImageResourceReady(src);
  }

  protected resolveImageIntrinsicSizeForLayout(
    src: string
  ): IntrinsicImageSize | null | undefined {
    return this.runtimeController.resolveImageIntrinsicSizeForLayout(src);
  }

  protected extractBlockText(block: BlockNode): string {
    return this.runtimeController.extractBlockText(block);
  }

  protected extractInlineText(inlines: InlineNode[]): string {
    return this.runtimeController.extractInlineText(inlines);
  }

  protected resolveCanvasResourceUrl(path: string): string {
    return this.runtimeController.resolveCanvasResourceUrl(path);
  }

  protected resolveDomResourceUrl(path: string): string {
    return this.runtimeController.resolveDomResourceUrl(path);
  }

  protected resolveRenderableResourceUrl(
    path: string,
    consumer: RenderableResourceConsumer
  ): string {
    return this.runtimeController.resolveRenderableResourceUrl(path, consumer);
  }

  protected createDomRenderInput(
    section: SectionDocument,
    input: SharedChapterRenderInput
  ): DomChapterRenderInput {
    return this.runtimeController.createDomRenderInput(section, input);
  }

  protected resolveReadingLanguageContextForSection(
    section: SectionDocument
  ): ReadingLanguageContext | null {
    return this.runtimeController.resolveReadingLanguageContextForSection(
      section
    );
  }

  protected resolveReadingLanguageContextForSectionIndex(
    spineIndex: number
  ): ReadingLanguageContext | null {
    return this.runtimeController.resolveReadingLanguageContextForSectionIndex(
      spineIndex
    );
  }

  protected resolveReadingNavigationContextForSectionIndex(
    spineIndex: number
  ): ReadingNavigationContext | null {
    return this.runtimeController.resolveReadingNavigationContextForSectionIndex(
      spineIndex
    );
  }

  protected resolveReadingSpreadContextForSectionIndex(
    spineIndex: number
  ): ReadingSpreadContext | null {
    return this.runtimeController.resolveReadingSpreadContextForSectionIndex(
      spineIndex
    );
  }

  protected getSectionsForRender(): SectionDocument[] {
    return this.runtimeController.getSectionsForRender();
  }

  protected getSectionForRender(section: SectionDocument): SectionDocument {
    return this.runtimeController.getSectionForRender(section);
  }

  protected revokeObjectUrls(): void {
    return this.runtimeController.revokeObjectUrls();
  }

  protected getContainerInnerDimensions(): { width: number; height: number } {
    return this.runtimeController.getContainerInnerDimensions();
  }

  protected getPaginationMeasurement(): { width: number; height: number } {
    return this.runtimeController.getPaginationMeasurement();
  }

  protected getFixedLayoutViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.runtimeController.getFixedLayoutViewportBox(section);
  }

  protected getPresentationViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.runtimeController.getPresentationViewportBox(section);
  }

  protected resolveFixedLayoutRenderSignature(
    section: SectionDocument
  ): string | null {
    return this.runtimeController.resolveFixedLayoutRenderSignature(section);
  }

  protected resolvePresentationRenderSignature(
    section: SectionDocument
  ): string | null {
    return this.runtimeController.resolvePresentationRenderSignature(section);
  }

  protected getContentWidth(): number {
    return this.runtimeController.getContentWidth();
  }

  protected getFontFamily(): string {
    return this.runtimeController.getFontFamily();
  }

  protected attachResizeObserver(): void {
    return this.runtimeController.attachResizeObserver();
  }

  protected attachScrollListener(): void {
    return this.runtimeController.attachScrollListener();
  }

  protected detachScrollListener(): void {
    return this.runtimeController.detachScrollListener();
  }

  protected attachSelectionChangeListener(): void {
    return this.runtimeController.attachSelectionChangeListener();
  }

  protected attachPointerListener(): void {
    return this.runtimeController.attachPointerListener();
  }

  protected detachPointerListener(): void {
    return this.runtimeController.detachPointerListener();
  }

  protected attachKeyboardListener(): void {
    return this.runtimeController.attachKeyboardListener();
  }

  protected detachKeyboardListener(): void {
    return this.runtimeController.detachKeyboardListener();
  }

  protected handleDomClick(event: MouseEvent): void {
    return this.runtimeController.handleDomClick(event);
  }

  protected handlePaginatedViewportClick(event: MouseEvent): void {
    return this.runtimeController.handlePaginatedViewportClick(event);
  }

  protected resolvePaginatedClickNavigationAction(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "previous" | "next" | null {
    return this.runtimeController.resolvePaginatedClickNavigationAction(input);
  }

  protected resolvePaginatedSpreadClickSlot(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "left" | "right" | null {
    return this.runtimeController.resolvePaginatedSpreadClickSlot(input);
  }

  protected performPaginatedNavigationAction(action: "previous" | "next"): void {
    return this.runtimeController.performPaginatedNavigationAction(action);
  }

  protected emitPaginatedCenterTapped(input: {
    source: "dom" | "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }): void {
    return this.runtimeController.emitPaginatedCenterTapped(input);
  }

  protected mapDomViewportPointToLocator(point: Point): Locator | null {
    return this.runtimeController.mapDomViewportPointToLocator(point);
  }

  protected getViewportCenterProbePoints(): Point[] {
    return this.runtimeController.getViewportCenterProbePoints();
  }

  protected getContainerRelativePoint(event: MouseEvent): Point | null {
    return this.runtimeController.getContainerRelativePoint(event);
  }

  protected getClientPointForContainerPoint(
    point: Point
  ): { x: number; y: number } | null {
    return this.runtimeController.getClientPointForContainerPoint(point);
  }

  protected realignDomSearchResult(result: SearchResult): void {
    return this.runtimeController.realignDomSearchResult(result);
  }

  protected async waitForFonts(): Promise<void> {
    return this.runtimeController.waitForFonts();
  }

  protected ensurePages(sectionLayout?: LayoutResult): void {
    return this.runtimeController.ensurePages(sectionLayout);
  }

  protected applyMeasuredDomPagination(plan: {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  }): {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  } {
    return this.runtimeController.applyMeasuredDomPagination(plan);
  }

  protected getPageHeight(): number {
    return this.runtimeController.getPageHeight();
  }

  protected findCurrentPageForSection(sectionId: string): ReaderPage | null {
    return this.runtimeController.findCurrentPageForSection(sectionId);
  }

  protected findPageForLocator(locator: Locator): ReaderPage | null {
    return this.runtimeController.findPageForLocator(locator);
  }

  protected resolveRenderedPage(sectionId: string): ReaderPage | null {
    return this.runtimeController.resolveRenderedPage(sectionId);
  }

  protected findPageByNumber(pageNumber: number): ReaderPage | null {
    return this.runtimeController.findPageByNumber(pageNumber);
  }

  protected resolvePaginatedSpread(
    page: ReaderPage | null
  ): PaginatedSpread | null {
    return this.runtimeController.resolvePaginatedSpread(page);
  }

  protected resolveCurrentPaginatedSpread(): PaginatedSpread | null {
    return this.runtimeController.resolveCurrentPaginatedSpread();
  }

  protected getVisiblePaginatedSpreads(): PaginatedSpread[] {
    return this.runtimeController.getVisiblePaginatedSpreads();
  }

  protected resolveDisplayPageNumberToLeafPage(
    pageNumber: number
  ): number | null {
    return this.runtimeController.resolveDisplayPageNumberToLeafPage(
      pageNumber
    );
  }

  protected resolveSpreadNavigationTarget(
    action: "previous" | "next"
  ): number | null {
    return this.runtimeController.resolveSpreadNavigationTarget(action);
  }

  protected syncCurrentPageFromSection(): void {
    return this.runtimeController.syncCurrentPageFromSection();
  }

  protected createLocatorForPage(page: ReaderPage): Locator {
    return this.runtimeController.createLocatorForPage(page);
  }

  protected getProgressForCurrentLocator(): number {
    return this.runtimeController.getProgressForCurrentLocator();
  }

  protected syncDerivedDecorationGroups(): void {
    return this.runtimeController.syncDerivedDecorationGroups();
  }

  protected getHighlightedCanvasBlockIdsForSection(
    sectionIndex: number
  ): Set<string> {
    return this.runtimeController.getHighlightedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  protected getHighlightedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.runtimeController.getHighlightedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  protected getActiveCanvasBlockIdForSection(
    sectionIndex: number
  ): string | undefined {
    return this.runtimeController.getActiveCanvasBlockIdForSection(
      sectionIndex
    );
  }

  protected getUnderlinedCanvasBlockIdsForSection(
    sectionIndex: number
  ): Set<string> {
    return this.runtimeController.getUnderlinedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  protected getUnderlinedCanvasBlockColorsForSection(
    sectionIndex: number
  ): Map<string, string> {
    return this.runtimeController.getUnderlinedCanvasBlockColorsForSection(
      sectionIndex
    );
  }

  protected getUnderlinedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.runtimeController.getUnderlinedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  protected resolveCanvasViewportBlockIds(locator: Locator): string[] {
    return this.runtimeController.resolveCanvasViewportBlockIds(locator);
  }

  protected syncAnnotationDecorations(): void {
    return this.runtimeController.syncAnnotationDecorations();
  }

  protected resolveAnnotationQuote(locator: Locator): string | undefined {
    return this.runtimeController.resolveAnnotationQuote(locator);
  }

  protected resolveAnnotationTextRangeQuote(
    locator: Locator,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.runtimeController.resolveAnnotationTextRangeQuote(
      locator,
      textRange
    );
  }

  protected getLocatorScrollAlignment(): "start" | "center" {
    return this.runtimeController.getLocatorScrollAlignment();
  }

  protected resolveScrollTopForRect(
    rectTop: number,
    rectHeight: number,
    alignment: "start" | "center"
  ): number {
    return this.runtimeController.resolveScrollTopForRect(
      rectTop,
      rectHeight,
      alignment
    );
  }

  protected findRenderedDomBlockTarget(
    sectionElement: HTMLElement,
    blockId: string | undefined
  ): HTMLElement | null {
    return this.runtimeController.findRenderedDomBlockTarget(
      sectionElement,
      blockId
    );
  }

  protected resolveRenderedDomTextPosition(
    sectionElement: HTMLElement,
    blockId: string | undefined,
    inlineOffset: number
  ): {
    node: Text;
    offset: number;
  } | null {
    return this.runtimeController.resolveRenderedDomTextPosition(
      sectionElement,
      blockId,
      inlineOffset
    );
  }

  protected scrollToLocatorBlock(): boolean {
    return this.runtimeController.scrollToLocatorBlock();
  }

  protected resolveScrollCanvasBlockRect(
    sourceSection: SectionDocument,
    sectionIndex: number,
    blockIds: string[]
  ): Rect | null {
    return this.runtimeController.resolveScrollCanvasBlockRect(
      sourceSection,
      sectionIndex,
      blockIds
    );
  }

  protected scrollToLocatorInlineOffset(): boolean {
    return this.runtimeController.scrollToLocatorInlineOffset();
  }

  protected scrollToLocatorAnchor(): boolean {
    return this.runtimeController.scrollToLocatorAnchor();
  }

  protected refreshScrollSlicesAfterModeSwitchRelocation(): void {
    return this.runtimeController.refreshScrollSlicesAfterModeSwitchRelocation();
  }

  protected scrollToCurrentLocation(): void {
    return this.runtimeController.scrollToCurrentLocation();
  }

  protected syncPositionFromScroll(emitEvent: boolean): boolean {
    return this.runtimeController.syncPositionFromScroll(emitEvent);
  }

  protected findRenderedSectionIndexForOffset(offset: number): number {
    return this.runtimeController.findRenderedSectionIndexForOffset(offset);
  }

  protected updateScrollWindowBounds(): void {
    return this.runtimeController.updateScrollWindowBounds();
  }

  protected refreshScrollWindowIfNeeded(): boolean {
    return this.runtimeController.refreshScrollWindowIfNeeded();
  }

  protected refreshScrollSlicesIfNeeded(): boolean {
    return this.runtimeController.refreshScrollSlicesIfNeeded();
  }

  protected scheduleDeferredScrollRefresh(): void {
    return this.runtimeController.scheduleDeferredScrollRefresh();
  }

  protected clearDeferredScrollRefresh(): void {
    return this.runtimeController.clearDeferredScrollRefresh();
  }

  protected rerenderScrollSlicesPreservingScrollTop(): void {
    return this.runtimeController.rerenderScrollSlicesPreservingScrollTop();
  }

  protected scheduleDeferredResourceRenderRefresh(): void {
    return this.runtimeController.scheduleDeferredResourceRenderRefresh();
  }

  protected clearDeferredResourceRenderRefresh(): void {
    return this.runtimeController.clearDeferredResourceRenderRefresh();
  }

  protected scheduleDeferredAnchorRealignment(): void {
    return this.runtimeController.scheduleDeferredAnchorRealignment();
  }

  protected clearDeferredAnchorRealignment(): void {
    return this.runtimeController.clearDeferredAnchorRealignment();
  }

  protected captureScrollAnchor(): ScrollAnchor | null {
    return this.runtimeController.captureScrollAnchor();
  }

  protected restoreScrollAnchor(anchor: ScrollAnchor | null): void {
    return this.runtimeController.restoreScrollAnchor(anchor);
  }

  protected setProgrammaticScrollTop(nextScrollTop: number): void {
    return this.runtimeController.setProgrammaticScrollTop(nextScrollTop);
  }

  protected collectRenderedCanvasSections(): Array<{
    sectionId: string;
    height: number;
    canvas: HTMLCanvasElement;
    interactions: InteractionRegion[];
  }> {
    return this.runtimeController.collectRenderedCanvasSections();
  }

  protected offsetInteractionRegionsForScroll(
    sections: Array<{
      sectionId: string;
      height: number;
      interactions: InteractionRegion[];
    }>
  ): InteractionRegion[] {
    return this.runtimeController.offsetInteractionRegionsForScroll(sections);
  }

  protected collectVisibleBoundsForScroll(
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
    return this.runtimeController.collectVisibleBoundsForScroll(
      sectionsToRender
    );
  }

  protected getSectionElement(sectionId: string): HTMLElement | null {
    return this.runtimeController.getSectionElement(sectionId);
  }

  protected findRenderedDomSectionAtPoint(point: Point): {
    section: SectionDocument;
    sectionIndex: number;
    sectionElement: HTMLElement;
  } | null {
    return this.runtimeController.findRenderedDomSectionAtPoint(point);
  }

  protected getSectionTop(sectionId: string): number {
    return this.runtimeController.getSectionTop(sectionId);
  }

  protected getSectionHeight(sectionId: string): number {
    return this.runtimeController.getSectionHeight(sectionId);
  }

  protected rebuildSectionIndex(): void {
    return this.runtimeController.rebuildSectionIndex();
  }

  protected getSectionIndexById(sectionId?: string | null): number {
    return this.runtimeController.getSectionIndexById(sectionId);
  }

  protected findSectionIndexForOffset(offset: number): number {
    return this.runtimeController.findSectionIndexForOffset(offset);
  }

  protected resolveSelectionTarget(node: Node | null): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
  } | null {
    return this.runtimeController.resolveSelectionTarget(node);
  }

  protected resolveSelectionEndpoint(input: {
    node: Node | null;
    offset: number;
  }): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
    inlineOffset?: number;
  } | null {
    return this.runtimeController.resolveSelectionEndpoint(input);
  }

  protected resolveCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.runtimeController.resolveCurrentTextSelectionSnapshot();
  }

  protected setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.runtimeController.setPinnedTextSelectionSnapshot(selection);
  }

  protected resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState {
    return this.runtimeController.resolveSelectionHighlightState(selection);
  }

  protected resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[] {
    return this.runtimeController.resolveAnnotationRangesForSection(spineIndex);
  }

  protected resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null {
    return this.runtimeController.resolveAnnotationRange(annotation);
  }

  protected createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext {
    return this.runtimeController.createSectionTextRangeContext(section);
  }

  protected normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null {
    return this.runtimeController.normalizeTextRangeForSection(
      spineIndex,
      textRange
    );
  }

  protected resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null {
    return this.runtimeController.resolveFullBlockTextRange(section, blockId);
  }

  protected createAnnotationForResolvedRange(input: {
    annotation?: Annotation;
    locator: Locator;
    range: TextRangeSelector;
    section: SectionDocument;
    style?: "highlight" | "underline";
    color?: string;
    note?: string;
  }): Annotation | null {
    return this.runtimeController.createAnnotationForResolvedRange(input);
  }

  protected resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.runtimeController.resolveTextRangeQuote(section, textRange);
  }

  protected resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds {
    return this.runtimeController.resolveAnnotationViewportRects(
      annotation,
      locator
    );
  }

  protected resolveCanvasTextRangeViewportRects(
    sectionId: string,
    textRange: TextRangeSelector
  ): VisibleDrawBounds {
    return this.runtimeController.resolveCanvasTextRangeViewportRects(
      sectionId,
      textRange
    );
  }

  protected resolveAnnotationSelectionAtPoint(
    point: Point
  ): ReaderTextSelectionSnapshot | null {
    return this.runtimeController.resolveAnnotationSelectionAtPoint(point);
  }

  emitAnnotationActivatedAtPoint(point: Point): boolean {
    return this.runtimeController.emitAnnotationActivatedAtPoint(point);
  }

  emitAnnotationActivatedForDecoration(
    decorationId: string,
    point?: Point
  ): boolean {
    return this.runtimeController.emitAnnotationActivatedForDecoration(
      decorationId,
      point
    );
  }

  protected emitAnnotationActivationPayload(
    activation: ResolvedAnnotationActivation,
    point: Point
  ): boolean {
    return this.runtimeController.emitAnnotationActivationPayload(
      activation,
      point
    );
  }

  protected getAnnotationActivationFallbackPoint(
    rects: VisibleDrawBounds
  ): Point {
    return this.runtimeController.getAnnotationActivationFallbackPoint(rects);
  }

  protected toAnnotationViewportPoint(point: Point): Point {
    return this.runtimeController.toAnnotationViewportPoint(point);
  }

  protected syncTextSelectionState(): void {
    return this.runtimeController.syncTextSelectionState();
  }

  protected updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.runtimeController.updateTextSelectionSnapshot(selection);
  }
}
