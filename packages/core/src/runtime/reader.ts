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
  private readonly parser = new BookParser();
  private readonly events = new EventEmitter<ReaderEventMap>();
  private readonly layoutEngine = new LayoutEngine();
  private readonly displayListBuilder = new DisplayListBuilder();
  private readonly canvasRenderer = new CanvasRenderer();
  private readonly domChapterRenderer = new DomChapterRenderer();
  private readonly chapterRenderDecisionCache =
    new ChapterRenderDecisionCache();
  private readonly scrollCoordinator: ScrollCoordinator;
  private readonly renderableResourceManager: RenderableResourceManager;
  private readonly decorationManager = new DecorationManager();
  private readonly interactionController: ReaderInteractionController;
  private readonly navigationController: ReaderNavigationController;
  private readonly renderOrchestrator: ReaderRenderOrchestrator;
  private readonly annotationService: ReaderAnnotationService;
  private readonly domPaginationService = new ReaderDomPaginationService();
  private readonly scrollPositionService = new ReaderScrollPositionService();
  private readonly sessionState: ReaderSessionState;
  private readonly documentSession: ReaderDocumentSession;
  private readonly annotationSession: ReaderAnnotationSession;
  private readonly viewSession: ReaderViewSession;
  private readonly navigationSession: ReaderNavigationSession;
  private readonly renderSession: ReaderRenderSession;
  private readonly selectionSession: ReaderSelectionSession;
  private readonly runtimeController: ReaderRuntimeController;
  private resizeObserver: ResizeObserver | null = null;
  private readonly measuredDomPaginationBySectionId: Map<
    string,
    {
      pages: ReaderPage[];
      sectionEstimatedHeight: number;
      width: number;
      height: number;
    }
  >;
  private readonly handleDocumentSelectionChange = (): void => {
    this.syncTextSelectionState();
  };

  private static readonly SCROLL_WINDOW_RADIUS = 1;
  private static readonly SCROLL_SLICE_OVERSCAN_MULTIPLIER = 0.75;
  private static readonly PAGINATED_CLICK_NAV_ZONE_RATIO = 0.28;

  private get book(): Book | null {
    return this.documentSession.book;
  }

  private set book(value: Book | null) {
    this.documentSession.book = value;
  }

  private get sourceName(): string | null {
    return this.documentSession.sourceName;
  }

  private set sourceName(value: string | null) {
    this.documentSession.sourceName = value;
  }

  private get resources(): {
    readBinary(path: string): Promise<Uint8Array>;
    exists(path: string): boolean;
  } | null {
    return this.documentSession.resources;
  }

  private set resources(
    value: {
      readBinary(path: string): Promise<Uint8Array>;
      exists(path: string): boolean;
    } | null
  ) {
    this.documentSession.resources = value;
  }

  private get chapterRenderInputs(): SharedChapterRenderInput[] {
    return this.documentSession.chapterRenderInputs;
  }

  private set chapterRenderInputs(value: SharedChapterRenderInput[]) {
    this.documentSession.chapterRenderInputs = value;
  }

  private get sectionIndexById(): Map<string, number> {
    return this.documentSession.sectionIndexById;
  }

  private get annotations(): Annotation[] {
    return this.annotationSession.annotations;
  }

  private set annotations(value: Annotation[]) {
    this.annotationSession.annotations = value;
  }

  private get preferences(): ReaderPreferences {
    return this.viewSession.preferences;
  }

  private set preferences(value: ReaderPreferences) {
    this.viewSession.preferences = value;
  }

  private get mode(): "scroll" | "paginated" {
    return this.viewSession.mode;
  }

  private set mode(value: "scroll" | "paginated") {
    this.viewSession.mode = value;
  }

  private get publisherStyles(): PublisherStylesMode {
    return this.viewSession.publisherStyles;
  }

  private set publisherStyles(value: PublisherStylesMode) {
    this.viewSession.publisherStyles = value;
  }

  private get publisherColorOverride(): PublisherColorOverride {
    return this.viewSession.publisherColorOverride;
  }

  private set publisherColorOverride(value: PublisherColorOverride) {
    this.viewSession.publisherColorOverride = value;
  }

  private get experimentalRtl(): boolean {
    return this.viewSession.experimentalRtl;
  }

  private set experimentalRtl(value: boolean) {
    this.viewSession.experimentalRtl = value;
  }

  private get spreadMode(): ReaderSpreadMode {
    return this.viewSession.spreadMode;
  }

  private set spreadMode(value: ReaderSpreadMode) {
    this.viewSession.spreadMode = value;
  }

  private get debugMode(): boolean {
    return this.viewSession.debugMode;
  }

  private set debugMode(value: boolean) {
    this.viewSession.debugMode = value;
  }

  private get theme(): Theme {
    return this.viewSession.theme;
  }

  private set theme(value: Theme) {
    this.viewSession.theme = value;
  }

  private get typography(): TypographyOptions {
    return this.viewSession.typography;
  }

  private set typography(value: TypographyOptions) {
    this.viewSession.typography = value;
  }

  private get textSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionSession.textSelectionSnapshot;
  }

  private get pinnedTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionSession.pinnedTextSelectionSnapshot;
  }

  private get locator(): Locator | null {
    return this.navigationSession.locator;
  }

  private set locator(value: Locator | null) {
    this.navigationSession.locator = value;
  }

  private get currentSectionIndex(): number {
    return this.navigationSession.currentSectionIndex;
  }

  private set currentSectionIndex(value: number) {
    this.navigationSession.currentSectionIndex = value;
  }

  private get pages(): ReaderPage[] {
    return this.navigationSession.pages;
  }

  private set pages(value: ReaderPage[]) {
    this.navigationSession.pages = value;
  }

  private get currentPageNumber(): number {
    return this.navigationSession.currentPageNumber;
  }

  private set currentPageNumber(value: number) {
    this.navigationSession.currentPageNumber = value;
  }

  private get pendingModeSwitchLocator(): Locator | null {
    return this.navigationSession.pendingModeSwitchLocator;
  }

  private set pendingModeSwitchLocator(value: Locator | null) {
    this.navigationSession.pendingModeSwitchLocator = value;
  }

  private get preferLocatorOnNextDomPaginationSync(): boolean {
    return this.navigationSession.preferLocatorOnNextDomPaginationSync;
  }

  private set preferLocatorOnNextDomPaginationSync(value: boolean) {
    this.navigationSession.preferLocatorOnNextDomPaginationSync = value;
  }

  private get lastMeasuredWidth(): number {
    return this.renderSession.lastMeasuredWidth;
  }

  private set lastMeasuredWidth(value: number) {
    this.renderSession.lastMeasuredWidth = value;
  }

  private get lastMeasuredHeight(): number {
    return this.renderSession.lastMeasuredHeight;
  }

  private set lastMeasuredHeight(value: number) {
    this.renderSession.lastMeasuredHeight = value;
  }

  private get sectionEstimatedHeights(): number[] {
    return this.renderSession.sectionEstimatedHeights;
  }

  private set sectionEstimatedHeights(value: number[]) {
    this.renderSession.sectionEstimatedHeights = value;
  }

  private get scrollWindowStart(): number {
    return this.renderSession.scrollWindowStart;
  }

  private set scrollWindowStart(value: number) {
    this.renderSession.scrollWindowStart = value;
  }

  private get scrollWindowEnd(): number {
    return this.renderSession.scrollWindowEnd;
  }

  private set scrollWindowEnd(value: number) {
    this.renderSession.scrollWindowEnd = value;
  }

  private get lastVisibleBounds(): VisibleDrawBounds {
    return this.renderSession.lastVisibleBounds;
  }

  private set lastVisibleBounds(value: VisibleDrawBounds) {
    this.renderSession.lastVisibleBounds = value;
  }

  private get lastInteractionRegions(): InteractionRegion[] {
    return this.renderSession.lastInteractionRegions;
  }

  private set lastInteractionRegions(value: InteractionRegion[]) {
    this.renderSession.lastInteractionRegions = value;
  }

  private get lastRenderedSectionIds(): string[] {
    return this.renderSession.lastRenderedSectionIds;
  }

  private set lastRenderedSectionIds(value: string[]) {
    this.renderSession.lastRenderedSectionIds = value;
  }

  private get lastScrollRenderWindows(): Map<
    string,
    Array<{ top: number; height: number }>
  > {
    return this.renderSession.lastScrollRenderWindows;
  }

  private set lastScrollRenderWindows(
    value: Map<string, Array<{ top: number; height: number }>>
  ) {
    this.renderSession.lastScrollRenderWindows = value;
  }

  private get lastRenderMetrics(): RenderMetrics {
    return this.renderSession.lastRenderMetrics;
  }

  private set lastRenderMetrics(value: RenderMetrics) {
    this.renderSession.lastRenderMetrics = value;
  }

  private get renderVersion(): number {
    return this.renderSession.renderVersion;
  }

  private set renderVersion(value: number) {
    this.renderSession.renderVersion = value;
  }

  private get lastChapterRenderDecision(): ChapterRenderDecision | null {
    return this.renderSession.lastChapterRenderDecision;
  }

  private set lastChapterRenderDecision(value: ChapterRenderDecision | null) {
    this.renderSession.lastChapterRenderDecision = value;
  }

  private get imageIntrinsicSizeCache(): Map<
    string,
    IntrinsicImageSize | null
  > {
    return this.renderSession.imageIntrinsicSizeCache;
  }

  private get pendingImageIntrinsicSizePaths(): Set<string> {
    return this.renderSession.pendingImageIntrinsicSizePaths;
  }

  private get lastLocatorRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.renderSession.lastLocatorRestoreDiagnostics;
  }

  private set lastLocatorRestoreDiagnostics(
    value: LocatorRestoreDiagnostics | null
  ) {
    this.renderSession.lastLocatorRestoreDiagnostics = value;
  }

  private get lastFixedLayoutRenderSignature(): string | null {
    return this.renderSession.lastFixedLayoutRenderSignature;
  }

  private set lastFixedLayoutRenderSignature(value: string | null) {
    this.renderSession.lastFixedLayoutRenderSignature = value;
  }

  private get lastPresentationRenderSignature(): string | null {
    return this.renderSession.lastPresentationRenderSignature;
  }

  private set lastPresentationRenderSignature(value: string | null) {
    this.renderSession.lastPresentationRenderSignature = value;
  }

  constructor(private readonly options: ReaderOptions = {}) {
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

  private isAtRenderedPaginatedDomSectionStart(): boolean {
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

  private async goToScrollSection(sectionNumber: number): Promise<void> {
    return this.runtimeController.goToScrollSection(sectionNumber);
  }

  private async goToLeafPage(pageNumber: number): Promise<void> {
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

  private updateLocator(locator: Locator | null): void {
    return this.runtimeController.updateLocator(locator);
  }

  private hitTestDom(point: Point): HitTestResult | null {
    return this.runtimeController.hitTestDom(point);
  }

  hitTest(point: Point): HitTestResult | null {
    return this.runtimeController.hitTest(point);
  }

  private hitTestScrollableCanvas(point: Point): HitTestResult | null {
    return this.runtimeController.hitTestScrollableCanvas(point);
  }

  private getScrollableCanvasSectionOffsetX(sectionId: string): number {
    return this.runtimeController.getScrollableCanvasSectionOffsetX(sectionId);
  }

  private resolveDomLinkHref(sectionHref: string, href: string): string {
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

  private captureModeSwitchLocator(): Locator | null {
    return this.runtimeController.captureModeSwitchLocator();
  }

  private mapCanvasTextLayerPointToLocator(point: Point): Locator | null {
    return this.runtimeController.mapCanvasTextLayerPointToLocator(point);
  }

  private applyPendingModeSwitchLocator(): void {
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

  private async activateLink(input: {
    href: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }): Promise<void> {
    return this.runtimeController.activateLink(input);
  }

  private getSectionProgressWeights(): number[] {
    return this.runtimeController.getSectionProgressWeights();
  }

  resolveHrefLocator(href: string): Locator | null {
    return this.runtimeController.resolveHrefLocator(href);
  }

  private async applyPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.runtimeController.applyPreferences(preferences);
  }

  private emitRelocated(): void {
    return this.runtimeController.emitRelocated();
  }

  private buildSectionRelocatedEvent(): SectionRelocatedEvent | null {
    return this.runtimeController.buildSectionRelocatedEvent();
  }

  private emitSectionRendered(section: SectionDocument): void {
    return this.runtimeController.emitSectionRendered(section);
  }

  private buildSectionRenderedEvent(
    section: SectionDocument
  ): SectionRenderedEvent | null {
    return this.runtimeController.buildSectionRenderedEvent(section);
  }

  private resolveSectionHookElements(sectionId: string): {
    containerElement?: HTMLElement;
    contentElement?: HTMLElement;
  } {
    return this.runtimeController.resolveSectionHookElements(sectionId);
  }

  private invokeReaderHook(
    callback: () => void | Promise<void> | undefined
  ): void {
    return this.runtimeController.invokeReaderHook(callback);
  }

  private renderCurrentSection(
    renderBehavior: RenderBehavior = "relocate"
  ): void {
    return this.runtimeController.renderCurrentSection(renderBehavior);
  }

  private renderDomSection(
    section: SectionDocument,
    renderVersion: number
  ): void {
    return this.runtimeController.renderDomSection(section, renderVersion);
  }

  private renderPaginatedDomSpread(
    page: ReaderPage,
    renderVersion: number
  ): void {
    return this.runtimeController.renderPaginatedDomSpread(page, renderVersion);
  }

  private syncFixedLayoutContainerState(
    input: DomChapterRenderInput | null
  ): void {
    return this.runtimeController.syncFixedLayoutContainerState(input);
  }

  private syncDomSectionStateAfterRender(
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

  private scrollDomSectionToProgress(progressInSection: number): void {
    return this.runtimeController.scrollDomSectionToProgress(progressInSection);
  }

  private scrollDomSectionToPaginatedPage(page: ReaderPage | null): void {
    return this.runtimeController.scrollDomSectionToPaginatedPage(page);
  }

  private positionPaginatedDomSection(
    section: HTMLElement,
    page: ReaderPage
  ): void {
    return this.runtimeController.positionPaginatedDomSection(section, page);
  }

  private syncMeasuredPaginatedDomPages(
    section: SectionDocument
  ): ReaderPage | null {
    return this.runtimeController.syncMeasuredPaginatedDomPages(section);
  }

  private resolveChapterRenderDecision(
    sectionIndex: number
  ): ChapterRenderDecision {
    return this.runtimeController.resolveChapterRenderDecision(sectionIndex);
  }

  private applyContainerTheme(): void {
    return this.runtimeController.applyContainerTheme();
  }

  private renderPaginatedCanvas(
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

  private renderScrollableCanvas(renderVersion: number): void {
    return this.runtimeController.renderScrollableCanvas(renderVersion);
  }

  private buildDisplayListForPage(
    section: SectionDocument,
    page: ReaderPage
  ): SectionDisplayList {
    return this.runtimeController.buildDisplayListForPage(section, page);
  }

  private estimateBlockHeightForPage(block: BlockNode): number {
    return this.runtimeController.estimateBlockHeightForPage(block);
  }

  private isImageResourceReady(src: string): boolean {
    return this.runtimeController.isImageResourceReady(src);
  }

  private resolveImageIntrinsicSizeForLayout(
    src: string
  ): IntrinsicImageSize | null | undefined {
    return this.runtimeController.resolveImageIntrinsicSizeForLayout(src);
  }

  private extractBlockText(block: BlockNode): string {
    return this.runtimeController.extractBlockText(block);
  }

  private extractInlineText(inlines: InlineNode[]): string {
    return this.runtimeController.extractInlineText(inlines);
  }

  private resolveCanvasResourceUrl(path: string): string {
    return this.runtimeController.resolveCanvasResourceUrl(path);
  }

  private resolveDomResourceUrl(path: string): string {
    return this.runtimeController.resolveDomResourceUrl(path);
  }

  private resolveRenderableResourceUrl(
    path: string,
    consumer: RenderableResourceConsumer
  ): string {
    return this.runtimeController.resolveRenderableResourceUrl(path, consumer);
  }

  private createDomRenderInput(
    section: SectionDocument,
    input: SharedChapterRenderInput
  ): DomChapterRenderInput {
    return this.runtimeController.createDomRenderInput(section, input);
  }

  private resolveReadingLanguageContextForSection(
    section: SectionDocument
  ): ReadingLanguageContext | null {
    return this.runtimeController.resolveReadingLanguageContextForSection(
      section
    );
  }

  private resolveReadingLanguageContextForSectionIndex(
    spineIndex: number
  ): ReadingLanguageContext | null {
    return this.runtimeController.resolveReadingLanguageContextForSectionIndex(
      spineIndex
    );
  }

  private resolveReadingNavigationContextForSectionIndex(
    spineIndex: number
  ): ReadingNavigationContext | null {
    return this.runtimeController.resolveReadingNavigationContextForSectionIndex(
      spineIndex
    );
  }

  private resolveReadingSpreadContextForSectionIndex(
    spineIndex: number
  ): ReadingSpreadContext | null {
    return this.runtimeController.resolveReadingSpreadContextForSectionIndex(
      spineIndex
    );
  }

  private getSectionsForRender(): SectionDocument[] {
    return this.runtimeController.getSectionsForRender();
  }

  private getSectionForRender(section: SectionDocument): SectionDocument {
    return this.runtimeController.getSectionForRender(section);
  }

  private revokeObjectUrls(): void {
    return this.runtimeController.revokeObjectUrls();
  }

  private getContainerInnerDimensions(): { width: number; height: number } {
    return this.runtimeController.getContainerInnerDimensions();
  }

  private getPaginationMeasurement(): { width: number; height: number } {
    return this.runtimeController.getPaginationMeasurement();
  }

  private getFixedLayoutViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.runtimeController.getFixedLayoutViewportBox(section);
  }

  private getPresentationViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.runtimeController.getPresentationViewportBox(section);
  }

  private resolveFixedLayoutRenderSignature(
    section: SectionDocument
  ): string | null {
    return this.runtimeController.resolveFixedLayoutRenderSignature(section);
  }

  private resolvePresentationRenderSignature(
    section: SectionDocument
  ): string | null {
    return this.runtimeController.resolvePresentationRenderSignature(section);
  }

  private getContentWidth(): number {
    return this.runtimeController.getContentWidth();
  }

  private getFontFamily(): string {
    return this.runtimeController.getFontFamily();
  }

  private attachResizeObserver(): void {
    return this.runtimeController.attachResizeObserver();
  }

  private attachScrollListener(): void {
    return this.runtimeController.attachScrollListener();
  }

  private detachScrollListener(): void {
    return this.runtimeController.detachScrollListener();
  }

  private attachSelectionChangeListener(): void {
    return this.runtimeController.attachSelectionChangeListener();
  }

  private attachPointerListener(): void {
    return this.runtimeController.attachPointerListener();
  }

  private detachPointerListener(): void {
    return this.runtimeController.detachPointerListener();
  }

  private attachKeyboardListener(): void {
    return this.runtimeController.attachKeyboardListener();
  }

  private detachKeyboardListener(): void {
    return this.runtimeController.detachKeyboardListener();
  }

  private handleDomClick(event: MouseEvent): void {
    return this.runtimeController.handleDomClick(event);
  }

  private handlePaginatedViewportClick(event: MouseEvent): void {
    return this.runtimeController.handlePaginatedViewportClick(event);
  }

  private resolvePaginatedClickNavigationAction(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "previous" | "next" | null {
    return this.runtimeController.resolvePaginatedClickNavigationAction(input);
  }

  private resolvePaginatedSpreadClickSlot(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "left" | "right" | null {
    return this.runtimeController.resolvePaginatedSpreadClickSlot(input);
  }

  private performPaginatedNavigationAction(action: "previous" | "next"): void {
    return this.runtimeController.performPaginatedNavigationAction(action);
  }

  private emitPaginatedCenterTapped(input: {
    source: "dom" | "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }): void {
    return this.runtimeController.emitPaginatedCenterTapped(input);
  }

  private mapDomViewportPointToLocator(point: Point): Locator | null {
    return this.runtimeController.mapDomViewportPointToLocator(point);
  }

  private getViewportCenterProbePoints(): Point[] {
    return this.runtimeController.getViewportCenterProbePoints();
  }

  private getContainerRelativePoint(event: MouseEvent): Point | null {
    return this.runtimeController.getContainerRelativePoint(event);
  }

  private getClientPointForContainerPoint(
    point: Point
  ): { x: number; y: number } | null {
    return this.runtimeController.getClientPointForContainerPoint(point);
  }

  private realignDomSearchResult(result: SearchResult): void {
    return this.runtimeController.realignDomSearchResult(result);
  }

  private async waitForFonts(): Promise<void> {
    return this.runtimeController.waitForFonts();
  }

  private ensurePages(sectionLayout?: LayoutResult): void {
    return this.runtimeController.ensurePages(sectionLayout);
  }

  private applyMeasuredDomPagination(plan: {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  }): {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  } {
    return this.runtimeController.applyMeasuredDomPagination(plan);
  }

  private getPageHeight(): number {
    return this.runtimeController.getPageHeight();
  }

  private findCurrentPageForSection(sectionId: string): ReaderPage | null {
    return this.runtimeController.findCurrentPageForSection(sectionId);
  }

  private findPageForLocator(locator: Locator): ReaderPage | null {
    return this.runtimeController.findPageForLocator(locator);
  }

  private resolveRenderedPage(sectionId: string): ReaderPage | null {
    return this.runtimeController.resolveRenderedPage(sectionId);
  }

  private findPageByNumber(pageNumber: number): ReaderPage | null {
    return this.runtimeController.findPageByNumber(pageNumber);
  }

  private resolvePaginatedSpread(
    page: ReaderPage | null
  ): PaginatedSpread | null {
    return this.runtimeController.resolvePaginatedSpread(page);
  }

  private resolveCurrentPaginatedSpread(): PaginatedSpread | null {
    return this.runtimeController.resolveCurrentPaginatedSpread();
  }

  private getVisiblePaginatedSpreads(): PaginatedSpread[] {
    return this.runtimeController.getVisiblePaginatedSpreads();
  }

  private resolveDisplayPageNumberToLeafPage(
    pageNumber: number
  ): number | null {
    return this.runtimeController.resolveDisplayPageNumberToLeafPage(
      pageNumber
    );
  }

  private resolveSpreadNavigationTarget(
    action: "previous" | "next"
  ): number | null {
    return this.runtimeController.resolveSpreadNavigationTarget(action);
  }

  private syncCurrentPageFromSection(): void {
    return this.runtimeController.syncCurrentPageFromSection();
  }

  private createLocatorForPage(page: ReaderPage): Locator {
    return this.runtimeController.createLocatorForPage(page);
  }

  private getProgressForCurrentLocator(): number {
    return this.runtimeController.getProgressForCurrentLocator();
  }

  private syncDerivedDecorationGroups(): void {
    return this.runtimeController.syncDerivedDecorationGroups();
  }

  private getHighlightedCanvasBlockIdsForSection(
    sectionIndex: number
  ): Set<string> {
    return this.runtimeController.getHighlightedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  private getHighlightedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.runtimeController.getHighlightedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  private getActiveCanvasBlockIdForSection(
    sectionIndex: number
  ): string | undefined {
    return this.runtimeController.getActiveCanvasBlockIdForSection(
      sectionIndex
    );
  }

  private getUnderlinedCanvasBlockIdsForSection(
    sectionIndex: number
  ): Set<string> {
    return this.runtimeController.getUnderlinedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  private getUnderlinedCanvasBlockColorsForSection(
    sectionIndex: number
  ): Map<string, string> {
    return this.runtimeController.getUnderlinedCanvasBlockColorsForSection(
      sectionIndex
    );
  }

  private getUnderlinedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.runtimeController.getUnderlinedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  private resolveCanvasViewportBlockIds(locator: Locator): string[] {
    return this.runtimeController.resolveCanvasViewportBlockIds(locator);
  }

  private syncAnnotationDecorations(): void {
    return this.runtimeController.syncAnnotationDecorations();
  }

  private resolveAnnotationQuote(locator: Locator): string | undefined {
    return this.runtimeController.resolveAnnotationQuote(locator);
  }

  private resolveAnnotationTextRangeQuote(
    locator: Locator,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.runtimeController.resolveAnnotationTextRangeQuote(
      locator,
      textRange
    );
  }

  private getLocatorScrollAlignment(): "start" | "center" {
    return this.runtimeController.getLocatorScrollAlignment();
  }

  private resolveScrollTopForRect(
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

  private findRenderedDomBlockTarget(
    sectionElement: HTMLElement,
    blockId: string | undefined
  ): HTMLElement | null {
    return this.runtimeController.findRenderedDomBlockTarget(
      sectionElement,
      blockId
    );
  }

  private resolveRenderedDomTextPosition(
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

  private scrollToLocatorBlock(): boolean {
    return this.runtimeController.scrollToLocatorBlock();
  }

  private resolveScrollCanvasBlockRect(
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

  private scrollToLocatorInlineOffset(): boolean {
    return this.runtimeController.scrollToLocatorInlineOffset();
  }

  private scrollToLocatorAnchor(): boolean {
    return this.runtimeController.scrollToLocatorAnchor();
  }

  private refreshScrollSlicesAfterModeSwitchRelocation(): void {
    return this.runtimeController.refreshScrollSlicesAfterModeSwitchRelocation();
  }

  private scrollToCurrentLocation(): void {
    return this.runtimeController.scrollToCurrentLocation();
  }

  private syncPositionFromScroll(emitEvent: boolean): boolean {
    return this.runtimeController.syncPositionFromScroll(emitEvent);
  }

  private findRenderedSectionIndexForOffset(offset: number): number {
    return this.runtimeController.findRenderedSectionIndexForOffset(offset);
  }

  private updateScrollWindowBounds(): void {
    return this.runtimeController.updateScrollWindowBounds();
  }

  private refreshScrollWindowIfNeeded(): boolean {
    return this.runtimeController.refreshScrollWindowIfNeeded();
  }

  private refreshScrollSlicesIfNeeded(): boolean {
    return this.runtimeController.refreshScrollSlicesIfNeeded();
  }

  private scheduleDeferredScrollRefresh(): void {
    return this.runtimeController.scheduleDeferredScrollRefresh();
  }

  private clearDeferredScrollRefresh(): void {
    return this.runtimeController.clearDeferredScrollRefresh();
  }

  private rerenderScrollSlicesPreservingScrollTop(): void {
    return this.runtimeController.rerenderScrollSlicesPreservingScrollTop();
  }

  private scheduleDeferredResourceRenderRefresh(): void {
    return this.runtimeController.scheduleDeferredResourceRenderRefresh();
  }

  private clearDeferredResourceRenderRefresh(): void {
    return this.runtimeController.clearDeferredResourceRenderRefresh();
  }

  private scheduleDeferredAnchorRealignment(): void {
    return this.runtimeController.scheduleDeferredAnchorRealignment();
  }

  private clearDeferredAnchorRealignment(): void {
    return this.runtimeController.clearDeferredAnchorRealignment();
  }

  private captureScrollAnchor(): ScrollAnchor | null {
    return this.runtimeController.captureScrollAnchor();
  }

  private restoreScrollAnchor(anchor: ScrollAnchor | null): void {
    return this.runtimeController.restoreScrollAnchor(anchor);
  }

  private setProgrammaticScrollTop(nextScrollTop: number): void {
    return this.runtimeController.setProgrammaticScrollTop(nextScrollTop);
  }

  private collectRenderedCanvasSections(): Array<{
    sectionId: string;
    height: number;
    canvas: HTMLCanvasElement;
    interactions: InteractionRegion[];
  }> {
    return this.runtimeController.collectRenderedCanvasSections();
  }

  private offsetInteractionRegionsForScroll(
    sections: Array<{
      sectionId: string;
      height: number;
      interactions: InteractionRegion[];
    }>
  ): InteractionRegion[] {
    return this.runtimeController.offsetInteractionRegionsForScroll(sections);
  }

  private collectVisibleBoundsForScroll(
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

  private getSectionElement(sectionId: string): HTMLElement | null {
    return this.runtimeController.getSectionElement(sectionId);
  }

  private findRenderedDomSectionAtPoint(point: Point): {
    section: SectionDocument;
    sectionIndex: number;
    sectionElement: HTMLElement;
  } | null {
    return this.runtimeController.findRenderedDomSectionAtPoint(point);
  }

  private getSectionTop(sectionId: string): number {
    return this.runtimeController.getSectionTop(sectionId);
  }

  private getSectionHeight(sectionId: string): number {
    return this.runtimeController.getSectionHeight(sectionId);
  }

  private rebuildSectionIndex(): void {
    return this.runtimeController.rebuildSectionIndex();
  }

  private getSectionIndexById(sectionId?: string | null): number {
    return this.runtimeController.getSectionIndexById(sectionId);
  }

  private findSectionIndexForOffset(offset: number): number {
    return this.runtimeController.findSectionIndexForOffset(offset);
  }

  private resolveSelectionTarget(node: Node | null): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
  } | null {
    return this.runtimeController.resolveSelectionTarget(node);
  }

  private resolveSelectionEndpoint(input: {
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

  private resolveCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.runtimeController.resolveCurrentTextSelectionSnapshot();
  }

  private setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.runtimeController.setPinnedTextSelectionSnapshot(selection);
  }

  private resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState {
    return this.runtimeController.resolveSelectionHighlightState(selection);
  }

  private resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[] {
    return this.runtimeController.resolveAnnotationRangesForSection(spineIndex);
  }

  private resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null {
    return this.runtimeController.resolveAnnotationRange(annotation);
  }

  private createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext {
    return this.runtimeController.createSectionTextRangeContext(section);
  }

  private normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null {
    return this.runtimeController.normalizeTextRangeForSection(
      spineIndex,
      textRange
    );
  }

  private resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null {
    return this.runtimeController.resolveFullBlockTextRange(section, blockId);
  }

  private createAnnotationForResolvedRange(input: {
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

  private resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.runtimeController.resolveTextRangeQuote(section, textRange);
  }

  private resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds {
    return this.runtimeController.resolveAnnotationViewportRects(
      annotation,
      locator
    );
  }

  private resolveCanvasTextRangeViewportRects(
    sectionId: string,
    textRange: TextRangeSelector
  ): VisibleDrawBounds {
    return this.runtimeController.resolveCanvasTextRangeViewportRects(
      sectionId,
      textRange
    );
  }

  private resolveAnnotationSelectionAtPoint(
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

  private emitAnnotationActivationPayload(
    activation: ResolvedAnnotationActivation,
    point: Point
  ): boolean {
    return this.runtimeController.emitAnnotationActivationPayload(
      activation,
      point
    );
  }

  private getAnnotationActivationFallbackPoint(
    rects: VisibleDrawBounds
  ): Point {
    return this.runtimeController.getAnnotationActivationFallbackPoint(rects);
  }

  private toAnnotationViewportPoint(point: Point): Point {
    return this.runtimeController.toAnnotationViewportPoint(point);
  }

  private syncTextSelectionState(): void {
    return this.runtimeController.syncTextSelectionState();
  }

  private updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.runtimeController.updateTextSelectionSnapshot(selection);
  }
}
