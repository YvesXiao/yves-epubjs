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
import { type ReaderSessionState } from "./reader-session-state";
import { ReaderDocumentSession } from "./reader-document-session";
import { ReaderAnnotationSession } from "./reader-annotation-session";
import { ReaderViewSession } from "./reader-view-session";
import { ReaderSelectionSession } from "./reader-selection-session";
import { ReaderNavigationSession } from "./reader-navigation-session";
import { ReaderRenderSession } from "./reader-render-session";
import { type SharedChapterRenderInput } from "./chapter-render-input";
import { type SectionTextRangeContext } from "./reader-selection";
import { DecorationManager } from "./decoration-manager";
import { type ReaderPage } from "./paginated-render-plan";
import { type PaginatedSpread } from "./reader-pagination";
import {
  RenderableResourceManager,
  type RenderableResourceConsumer
} from "./renderable-resource-manager";
import { ScrollCoordinator } from "./scroll-coordinator";
import { ReaderRuntimeRenderController } from "./reader-runtime-render-controller";
import { ReaderRuntimePaginationController } from "./reader-runtime-pagination-controller";
import { ReaderRuntimeScrollController } from "./reader-runtime-scroll-controller";
import { ReaderRuntimeSelectionAnnotationController } from "./reader-runtime-selection-annotation-controller";
import { ReaderRuntimeApiController } from "./reader-runtime-api-controller";
import { ReaderRuntimeInteractionController } from "./reader-runtime-interaction-controller";
export type PaginationInfo = {
  currentPage: number;
  totalPages: number;
};

export type ReaderTextSelection = Omit<
  ReaderTextSelectionSnapshot,
  "rects" | "visible"
>;

export interface ReaderRuntimeHost {
  options: ReaderOptions;
  parser: BookParser;
  events: EventEmitter<ReaderEventMap>;
  layoutEngine: LayoutEngine;
  displayListBuilder: DisplayListBuilder;
  canvasRenderer: CanvasRenderer;
  domChapterRenderer: DomChapterRenderer;
  chapterRenderDecisionCache: ChapterRenderDecisionCache;
  scrollCoordinator: ScrollCoordinator;
  renderableResourceManager: RenderableResourceManager;
  decorationManager: DecorationManager;
  interactionController: ReaderInteractionController;
  navigationController: ReaderNavigationController;
  renderOrchestrator: ReaderRenderOrchestrator;
  annotationService: ReaderAnnotationService;
  domPaginationService: ReaderDomPaginationService;
  scrollPositionService: ReaderScrollPositionService;
  sessionState: ReaderSessionState;
  documentSession: ReaderDocumentSession;
  annotationSession: ReaderAnnotationSession;
  viewSession: ReaderViewSession;
  navigationSession: ReaderNavigationSession;
  renderSession: ReaderRenderSession;
  selectionSession: ReaderSelectionSession;
  resizeObserver: ResizeObserver | null;
  measuredDomPaginationBySectionId: Map<
    string,
    {
      pages: ReaderPage[];
      sectionEstimatedHeight: number;
      width: number;
      height: number;
    }
  >;
  handleDocumentSelectionChange: () => void;
  book: Book | null;
  sourceName: string | null;
  resources: {
    readBinary(path: string): Promise<Uint8Array>;
    exists(path: string): boolean;
  } | null;
  chapterRenderInputs: SharedChapterRenderInput[];
  sectionIndexById: Map<string, number>;
  annotations: Annotation[];
  preferences: ReaderPreferences;
  mode: "scroll" | "paginated";
  publisherStyles: PublisherStylesMode;
  publisherColorOverride: PublisherColorOverride;
  experimentalRtl: boolean;
  spreadMode: ReaderSpreadMode;
  debugMode: boolean;
  theme: Theme;
  typography: TypographyOptions;
  textSelectionSnapshot: ReaderTextSelectionSnapshot | null;
  pinnedTextSelectionSnapshot: ReaderTextSelectionSnapshot | null;
  locator: Locator | null;
  currentSectionIndex: number;
  pages: ReaderPage[];
  currentPageNumber: number;
  pendingModeSwitchLocator: Locator | null;
  preferLocatorOnNextDomPaginationSync: boolean;
  lastMeasuredWidth: number;
  lastMeasuredHeight: number;
  sectionEstimatedHeights: number[];
  scrollWindowStart: number;
  scrollWindowEnd: number;
  lastVisibleBounds: VisibleDrawBounds;
  lastInteractionRegions: InteractionRegion[];
  lastRenderedSectionIds: string[];
  lastScrollRenderWindows: Map<string, Array<{ top: number; height: number }>>;
  lastRenderMetrics: RenderMetrics;
  renderVersion: number;
  lastChapterRenderDecision: ChapterRenderDecision | null;
  imageIntrinsicSizeCache: Map<string, IntrinsicImageSize | null>;
  pendingImageIntrinsicSizePaths: Set<string>;
  lastLocatorRestoreDiagnostics: LocatorRestoreDiagnostics | null;
  lastFixedLayoutRenderSignature: string | null;
  lastPresentationRenderSignature: string | null;
  open(input: EpubInput): Promise<Book>;
  render(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  isAtRenderedPaginatedDomSectionStart(): boolean;
  goToLocation(locator: Locator): Promise<void>;
  restoreLocation(locator: Locator | SerializedLocator): Promise<boolean>;
  restoreBookmark(bookmark: Bookmark): Promise<boolean>;
  goToTocItem(id: string): Promise<void>;
  setTheme(theme: Partial<Theme>): Promise<void>;
  setTypography(options: Partial<TypographyOptions>): Promise<void>;
  setMode(mode: "scroll" | "paginated"): Promise<void>;
  submitPreferences(preferences: ReaderPreferences): Promise<ReaderSettings>;
  restorePreferences(
    preferences: ReaderPreferences | string | null | undefined
  ): Promise<ReaderSettings>;
  serializePreferences(): string;
  goToPage(pageNumber: number): Promise<void>;
  goToScrollSection(sectionNumber: number): Promise<void>;
  goToLeafPage(pageNumber: number): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
  goToSearchResult(result: SearchResult): Promise<void>;
  getCurrentLocation(): Locator | null;
  getReadingProgress(): ReadingProgressSnapshot | null;
  goToProgress(progress: number): Promise<Locator | null>;
  setDecorations(input: { group: string; decorations: Decoration[] }): void;
  clearDecorations(group?: string): void;
  getDecorations(group?: string): Decoration[];
  setDebugMode(enabled: boolean): void;
  createAnnotation(input: {
    locator?: Locator;
    textRange?: TextRangeSelector;
    quote?: string;
    note?: string;
    style?: "highlight" | "underline";
    color?: string;
  }): Annotation | null;
  createAnnotationFromSelection(input: {
    note?: string;
    style?: "highlight" | "underline";
    color?: string;
  }): Annotation | null;
  getCurrentTextSelection(): ReaderTextSelection | null;
  getCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null;
  getCurrentSelectionHighlightState(): ReaderSelectionHighlightState | null;
  applyCurrentSelectionHighlightAction(input: {
    note?: string;
    style?: "highlight" | "underline";
    color?: string;
  }): {
    mode: "highlight" | "remove-highlight";
    changedCount: number;
  } | null;
  clearCurrentTextSelection(): void;
  addAnnotation(annotation: Annotation): void;
  setAnnotations(annotations: Annotation[]): void;
  getAnnotations(): Annotation[];
  getAnnotationViewportSnapshots(): AnnotationViewportSnapshot[];
  clearAnnotations(): void;
  updateLocator(locator: Locator | null): void;
  hitTestDom(point: Point): HitTestResult | null;
  hitTest(point: Point): HitTestResult | null;
  hitTestScrollableCanvas(point: Point): HitTestResult | null;
  getScrollableCanvasSectionOffsetX(sectionId: string): number;
  resolveDomLinkHref(sectionHref: string, href: string): string;
  getVisibleDrawBounds(): VisibleDrawBounds;
  getRenderMetrics(): RenderMetrics;
  getRenderDiagnostics(): RenderDiagnostics | null;
  getVisibleSectionDiagnostics(): VisibleSectionDiagnostics[];
  mapLocatorToViewport(locator: Locator): VisibleDrawBounds;
  mapViewportToLocator(point: Point): Locator | null;
  captureModeSwitchLocator(): Locator | null;
  mapCanvasTextLayerPointToLocator(point: Point): Locator | null;
  applyPendingModeSwitchLocator(): void;
  on<TEvent extends ReaderEvent>(
    event: TEvent,
    handler: (payload: ReaderEventMap[TEvent]) => void
  ): () => void;
  destroy(): void;
  getBook(): Book | null;
  getPublicationId(): string | null;
  createBookmark(input: {
    locator?: Locator;
    label?: string;
    excerpt?: string;
  }): Bookmark | null;
  getLastLocationRestoreDiagnostics(): LocatorRestoreDiagnostics | null;
  getPreferences(): ReaderPreferences;
  getSettings(): ReaderSettings;
  getReadingLanguageContext(): ReadingLanguageContext | null;
  getReadingNavigationContext(): ReadingNavigationContext | null;
  getReadingSpreadContext(): ReadingSpreadContext | null;
  getTocTargets(): TocTarget[];
  getSectionAccessibilitySnapshot(
    spineIndex?: number
  ): SectionAccessibilitySnapshot | null;
  getPublicationAccessibilitySnapshot(): PublicationAccessibilitySnapshot | null;
  getTheme(): Theme;
  getTypography(): TypographyOptions;
  getPaginationInfo(): PaginationInfo;
  goToHref(href: string): Promise<Locator | null>;
  activateLink(input: {
    href: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }): Promise<void>;
  getSectionProgressWeights(): number[];
  resolveHrefLocator(href: string): Locator | null;
  applyPreferences(preferences: ReaderPreferences): Promise<ReaderSettings>;
  emitRelocated(): void;
  buildSectionRelocatedEvent(): SectionRelocatedEvent | null;
  emitSectionRendered(section: SectionDocument): void;
  buildSectionRenderedEvent(
    section: SectionDocument
  ): SectionRenderedEvent | null;
  resolveSectionHookElements(sectionId: string): {
    containerElement?: HTMLElement;
    contentElement?: HTMLElement;
  };
  invokeReaderHook(callback: () => void | Promise<void> | undefined): void;
  renderCurrentSection(renderBehavior?: RenderBehavior): void;
  renderDomSection(section: SectionDocument, renderVersion: number): void;
  renderPaginatedDomSpread(page: ReaderPage, renderVersion: number): void;
  syncFixedLayoutContainerState(input: DomChapterRenderInput | null): void;
  syncDomSectionStateAfterRender(
    renderBehavior: RenderBehavior,
    preservedScrollAnchor: ScrollAnchor | null,
    paginatedPage?: ReaderPage | null
  ): void;
  scrollDomSectionToProgress(progressInSection: number): void;
  scrollDomSectionToPaginatedPage(page: ReaderPage | null): void;
  positionPaginatedDomSection(section: HTMLElement, page: ReaderPage): void;
  syncMeasuredPaginatedDomPages(section: SectionDocument): ReaderPage | null;
  resolveChapterRenderDecision(sectionIndex: number): ChapterRenderDecision;
  applyContainerTheme(): void;
  renderPaginatedCanvas(
    section: SectionDocument,
    page: ReaderPage | null,
    renderVersion: number
  ): void;
  renderScrollableCanvas(renderVersion: number): void;
  buildDisplayListForPage(
    section: SectionDocument,
    page: ReaderPage
  ): SectionDisplayList;
  estimateBlockHeightForPage(block: BlockNode): number;
  isImageResourceReady(src: string): boolean;
  resolveImageIntrinsicSizeForLayout(
    src: string
  ): IntrinsicImageSize | null | undefined;
  extractBlockText(block: BlockNode): string;
  extractInlineText(inlines: InlineNode[]): string;
  resolveCanvasResourceUrl(path: string): string;
  resolveDomResourceUrl(path: string): string;
  resolveRenderableResourceUrl(
    path: string,
    consumer: RenderableResourceConsumer
  ): string;
  createDomRenderInput(
    section: SectionDocument,
    input: SharedChapterRenderInput
  ): DomChapterRenderInput;
  resolveReadingLanguageContextForSection(
    section: SectionDocument
  ): ReadingLanguageContext | null;
  resolveReadingLanguageContextForSectionIndex(
    spineIndex: number
  ): ReadingLanguageContext | null;
  resolveReadingNavigationContextForSectionIndex(
    spineIndex: number
  ): ReadingNavigationContext | null;
  resolveReadingSpreadContextForSectionIndex(
    spineIndex: number
  ): ReadingSpreadContext | null;
  getSectionsForRender(): SectionDocument[];
  getSectionForRender(section: SectionDocument): SectionDocument;
  revokeObjectUrls(): void;
  getContainerInnerDimensions(): { width: number; height: number };
  getPaginationMeasurement(): { width: number; height: number };
  getFixedLayoutViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null;
  getPresentationViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null;
  resolveFixedLayoutRenderSignature(section: SectionDocument): string | null;
  resolvePresentationRenderSignature(section: SectionDocument): string | null;
  getContentWidth(): number;
  getFontFamily(): string;
  attachResizeObserver(): void;
  attachScrollListener(): void;
  detachScrollListener(): void;
  attachSelectionChangeListener(): void;
  attachPointerListener(): void;
  detachPointerListener(): void;
  attachKeyboardListener(): void;
  detachKeyboardListener(): void;
  handleDomClick(event: MouseEvent): void;
  handlePaginatedViewportClick(event: MouseEvent): void;
  resolvePaginatedClickNavigationAction(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "previous" | "next" | null;
  resolvePaginatedSpreadClickSlot(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "left" | "right" | null;
  performPaginatedNavigationAction(action: "previous" | "next"): void;
  emitPaginatedCenterTapped(input: {
    source: "dom" | "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }): void;
  mapDomViewportPointToLocator(point: Point): Locator | null;
  getViewportCenterProbePoints(): Point[];
  getContainerRelativePoint(event: MouseEvent): Point | null;
  getClientPointForContainerPoint(
    point: Point
  ): { x: number; y: number } | null;
  realignDomSearchResult(result: SearchResult): void;
  waitForFonts(): Promise<void>;
  ensurePages(sectionLayout?: LayoutResult): void;
  applyMeasuredDomPagination(plan: {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  }): {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  };
  getPageHeight(): number;
  findCurrentPageForSection(sectionId: string): ReaderPage | null;
  findPageForLocator(locator: Locator): ReaderPage | null;
  resolveRenderedPage(sectionId: string): ReaderPage | null;
  findPageByNumber(pageNumber: number): ReaderPage | null;
  resolvePaginatedSpread(page: ReaderPage | null): PaginatedSpread | null;
  resolveCurrentPaginatedSpread(): PaginatedSpread | null;
  getVisiblePaginatedSpreads(): PaginatedSpread[];
  resolveDisplayPageNumberToLeafPage(pageNumber: number): number | null;
  resolveSpreadNavigationTarget(action: "previous" | "next"): number | null;
  syncCurrentPageFromSection(): void;
  createLocatorForPage(page: ReaderPage): Locator;
  getProgressForCurrentLocator(): number;
  syncDerivedDecorationGroups(): void;
  getHighlightedCanvasBlockIdsForSection(sectionIndex: number): Set<string>;
  getHighlightedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>>;
  getActiveCanvasBlockIdForSection(sectionIndex: number): string | undefined;
  getUnderlinedCanvasBlockIdsForSection(sectionIndex: number): Set<string>;
  getUnderlinedCanvasBlockColorsForSection(
    sectionIndex: number
  ): Map<string, string>;
  getUnderlinedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>>;
  resolveCanvasViewportBlockIds(locator: Locator): string[];
  syncAnnotationDecorations(): void;
  resolveAnnotationQuote(locator: Locator): string | undefined;
  resolveAnnotationTextRangeQuote(
    locator: Locator,
    textRange: TextRangeSelector
  ): string | undefined;
  getLocatorScrollAlignment(): "start" | "center";
  resolveScrollTopForRect(
    rectTop: number,
    rectHeight: number,
    alignment: "start" | "center"
  ): number;
  findRenderedDomBlockTarget(
    sectionElement: HTMLElement,
    blockId: string | undefined
  ): HTMLElement | null;
  resolveRenderedDomTextPosition(
    sectionElement: HTMLElement,
    blockId: string | undefined,
    inlineOffset: number
  ): {
    node: Text;
    offset: number;
  } | null;
  scrollToLocatorBlock(): boolean;
  resolveScrollCanvasBlockRect(
    sourceSection: SectionDocument,
    sectionIndex: number,
    blockIds: string[]
  ): Rect | null;
  scrollToLocatorInlineOffset(): boolean;
  scrollToLocatorAnchor(): boolean;
  refreshScrollSlicesAfterModeSwitchRelocation(): void;
  scrollToCurrentLocation(): void;
  syncPositionFromScroll(emitEvent: boolean): boolean;
  findRenderedSectionIndexForOffset(offset: number): number;
  updateScrollWindowBounds(): void;
  refreshScrollWindowIfNeeded(): boolean;
  refreshScrollSlicesIfNeeded(): boolean;
  scheduleDeferredScrollRefresh(): void;
  clearDeferredScrollRefresh(): void;
  rerenderScrollSlicesPreservingScrollTop(): void;
  scheduleDeferredResourceRenderRefresh(): void;
  clearDeferredResourceRenderRefresh(): void;
  scheduleDeferredAnchorRealignment(): void;
  clearDeferredAnchorRealignment(): void;
  captureScrollAnchor(): ScrollAnchor | null;
  restoreScrollAnchor(anchor: ScrollAnchor | null): void;
  setProgrammaticScrollTop(nextScrollTop: number): void;
  collectRenderedCanvasSections(): Array<{
    sectionId: string;
    height: number;
    canvas: HTMLCanvasElement;
    interactions: InteractionRegion[];
  }>;
  offsetInteractionRegionsForScroll(
    sections: Array<{
      sectionId: string;
      height: number;
      interactions: InteractionRegion[];
    }>
  ): InteractionRegion[];
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
  ): VisibleDrawBounds;
  getSectionElement(sectionId: string): HTMLElement | null;
  findRenderedDomSectionAtPoint(point: Point): {
    section: SectionDocument;
    sectionIndex: number;
    sectionElement: HTMLElement;
  } | null;
  getSectionTop(sectionId: string): number;
  getSectionHeight(sectionId: string): number;
  rebuildSectionIndex(): void;
  getSectionIndexById(sectionId?: string | null): number;
  findSectionIndexForOffset(offset: number): number;
  resolveSelectionTarget(node: Node | null): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
  } | null;
  resolveSelectionEndpoint(input: { node: Node | null; offset: number }): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
    inlineOffset?: number;
  } | null;
  resolveCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null;
  setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void;
  resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState;
  resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[];
  resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null;
  createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext;
  normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null;
  resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null;
  createAnnotationForResolvedRange(input: {
    annotation?: Annotation;
    locator: Locator;
    range: TextRangeSelector;
    section: SectionDocument;
    style?: "highlight" | "underline";
    color?: string;
    note?: string;
  }): Annotation | null;
  resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined;
  resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds;
  resolveCanvasTextRangeViewportRects(
    sectionId: string,
    textRange: TextRangeSelector
  ): VisibleDrawBounds;
  resolveAnnotationSelectionAtPoint(
    point: Point
  ): ReaderTextSelectionSnapshot | null;
  emitAnnotationActivatedAtPoint(point: Point): boolean;
  emitAnnotationActivatedForDecoration(
    decorationId: string,
    point?: Point
  ): boolean;
  emitAnnotationActivationPayload(
    activation: ResolvedAnnotationActivation,
    point: Point
  ): boolean;
  getAnnotationActivationFallbackPoint(rects: VisibleDrawBounds): Point;
  toAnnotationViewportPoint(point: Point): Point;
  syncTextSelectionState(): void;
  updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void;
}

export class ReaderRuntimeController {
  private readonly reader: ReaderRuntimeHost;
  private readonly runtimeApiController: ReaderRuntimeApiController;
  private readonly runtimeInteractionController: ReaderRuntimeInteractionController;
  private readonly renderController: ReaderRuntimeRenderController;
  private readonly paginationController: ReaderRuntimePaginationController;
  private readonly scrollController: ReaderRuntimeScrollController;
  private readonly selectionAnnotationController: ReaderRuntimeSelectionAnnotationController;

  constructor(reader: unknown) {
    this.reader = reader as ReaderRuntimeHost;
    this.runtimeApiController = new ReaderRuntimeApiController(this.reader);
    this.runtimeInteractionController = new ReaderRuntimeInteractionController(
      this.reader
    );
    this.renderController = new ReaderRuntimeRenderController(this.reader);
    this.paginationController = new ReaderRuntimePaginationController(
      this.reader
    );
    this.scrollController = new ReaderRuntimeScrollController(this.reader);
    this.selectionAnnotationController =
      new ReaderRuntimeSelectionAnnotationController(this.reader);
  }

  async open(input: EpubInput): Promise<Book> {
    return this.runtimeApiController.open(input);
  }

  async render(): Promise<void> {
    return this.runtimeApiController.render();
  }

  async next(): Promise<void> {
    return this.runtimeApiController.next();
  }

  async prev(): Promise<void> {
    return this.runtimeApiController.prev();
  }

  isAtRenderedPaginatedDomSectionStart(): boolean {
    return this.runtimeApiController.isAtRenderedPaginatedDomSectionStart();
  }

  async goToLocation(locator: Locator): Promise<void> {
    return this.runtimeApiController.goToLocation(locator);
  }

  async restoreLocation(
    locator: Locator | SerializedLocator
  ): Promise<boolean> {
    return this.runtimeApiController.restoreLocation(locator);
  }

  async restoreBookmark(bookmark: Bookmark): Promise<boolean> {
    return this.runtimeApiController.restoreBookmark(bookmark);
  }

  async goToTocItem(id: string): Promise<void> {
    return this.runtimeApiController.goToTocItem(id);
  }

  async setTheme(theme: Partial<Theme>): Promise<void> {
    return this.runtimeApiController.setTheme(theme);
  }

  async setTypography(options: Partial<TypographyOptions>): Promise<void> {
    return this.runtimeApiController.setTypography(options);
  }

  async setMode(mode: "scroll" | "paginated"): Promise<void> {
    return this.runtimeApiController.setMode(mode);
  }

  async submitPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.runtimeApiController.submitPreferences(preferences);
  }

  async restorePreferences(
    preferences: ReaderPreferences | string | null | undefined
  ): Promise<ReaderSettings> {
    return this.runtimeApiController.restorePreferences(preferences);
  }

  serializePreferences(): string {
    return this.runtimeApiController.serializePreferences();
  }

  async goToPage(pageNumber: number): Promise<void> {
    return this.runtimeApiController.goToPage(pageNumber);
  }

  async goToScrollSection(sectionNumber: number): Promise<void> {
    return this.runtimeApiController.goToScrollSection(sectionNumber);
  }

  async goToLeafPage(pageNumber: number): Promise<void> {
    return this.runtimeApiController.goToLeafPage(pageNumber);
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.runtimeApiController.search(query);
  }

  async goToSearchResult(result: SearchResult): Promise<void> {
    return this.runtimeApiController.goToSearchResult(result);
  }

  getCurrentLocation(): Locator | null {
    return this.runtimeApiController.getCurrentLocation();
  }

  getReadingProgress(): ReadingProgressSnapshot | null {
    return this.runtimeApiController.getReadingProgress();
  }

  async goToProgress(progress: number): Promise<Locator | null> {
    return this.runtimeApiController.goToProgress(progress);
  }

  setDecorations(input: { group: string; decorations: Decoration[] }): void {
    return this.runtimeApiController.setDecorations(input);
  }

  clearDecorations(group?: string): void {
    return this.runtimeApiController.clearDecorations(group);
  }

  getDecorations(group?: string): Decoration[] {
    return this.runtimeApiController.getDecorations(group);
  }

  setDebugMode(enabled: boolean): void {
    return this.runtimeApiController.setDebugMode(enabled);
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
    return this.selectionAnnotationController.createAnnotation(input);
  }

  createAnnotationFromSelection(
    input: {
      note?: string;
      style?: "highlight" | "underline";
      color?: string;
    } = {}
  ): Annotation | null {
    return this.selectionAnnotationController.createAnnotationFromSelection(
      input
    );
  }

  getCurrentTextSelection(): ReaderTextSelection | null {
    return this.selectionAnnotationController.getCurrentTextSelection();
  }

  getCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionAnnotationController.getCurrentTextSelectionSnapshot();
  }

  getCurrentSelectionHighlightState(): ReaderSelectionHighlightState | null {
    return this.selectionAnnotationController.getCurrentSelectionHighlightState();
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
    return this.selectionAnnotationController.applyCurrentSelectionHighlightAction(
      input
    );
  }

  clearCurrentTextSelection(): void {
    return this.selectionAnnotationController.clearCurrentTextSelection();
  }

  addAnnotation(annotation: Annotation): void {
    return this.selectionAnnotationController.addAnnotation(annotation);
  }

  setAnnotations(annotations: Annotation[]): void {
    return this.selectionAnnotationController.setAnnotations(annotations);
  }

  getAnnotations(): Annotation[] {
    return this.selectionAnnotationController.getAnnotations();
  }

  getAnnotationViewportSnapshots(): AnnotationViewportSnapshot[] {
    return this.selectionAnnotationController.getAnnotationViewportSnapshots();
  }

  clearAnnotations(): void {
    return this.selectionAnnotationController.clearAnnotations();
  }

  updateLocator(locator: Locator | null): void {
    return this.runtimeApiController.updateLocator(locator);
  }

  hitTestDom(point: Point): HitTestResult | null {
    return this.runtimeInteractionController.hitTestDom(point);
  }

  hitTest(point: Point): HitTestResult | null {
    return this.runtimeInteractionController.hitTest(point);
  }

  hitTestScrollableCanvas(point: Point): HitTestResult | null {
    return this.runtimeInteractionController.hitTestScrollableCanvas(point);
  }

  getScrollableCanvasSectionOffsetX(sectionId: string): number {
    return this.runtimeInteractionController.getScrollableCanvasSectionOffsetX(
      sectionId
    );
  }

  resolveDomLinkHref(sectionHref: string, href: string): string {
    return this.runtimeInteractionController.resolveDomLinkHref(
      sectionHref,
      href
    );
  }

  getVisibleDrawBounds(): VisibleDrawBounds {
    return this.runtimeInteractionController.getVisibleDrawBounds();
  }

  getRenderMetrics(): RenderMetrics {
    return this.runtimeInteractionController.getRenderMetrics();
  }

  getRenderDiagnostics(): RenderDiagnostics | null {
    return this.runtimeInteractionController.getRenderDiagnostics();
  }

  getVisibleSectionDiagnostics(): VisibleSectionDiagnostics[] {
    return this.runtimeInteractionController.getVisibleSectionDiagnostics();
  }

  mapLocatorToViewport(locator: Locator): VisibleDrawBounds {
    return this.runtimeInteractionController.mapLocatorToViewport(locator);
  }

  mapViewportToLocator(point: Point): Locator | null {
    return this.runtimeInteractionController.mapViewportToLocator(point);
  }

  captureModeSwitchLocator(): Locator | null {
    return this.runtimeInteractionController.captureModeSwitchLocator();
  }

  mapCanvasTextLayerPointToLocator(point: Point): Locator | null {
    return this.runtimeInteractionController.mapCanvasTextLayerPointToLocator(
      point
    );
  }

  applyPendingModeSwitchLocator(): void {
    return this.runtimeInteractionController.applyPendingModeSwitchLocator();
  }

  on<TEvent extends ReaderEvent>(
    event: TEvent,
    handler: (payload: ReaderEventMap[TEvent]) => void
  ): () => void {
    return this.runtimeApiController.on(event, handler);
  }

  destroy(): void {
    return this.runtimeApiController.destroy();
  }

  getBook(): Book | null {
    return this.runtimeApiController.getBook();
  }

  getPublicationId(): string | null {
    return this.runtimeApiController.getPublicationId();
  }

  createBookmark(
    input: {
      locator?: Locator;
      label?: string;
      excerpt?: string;
    } = {}
  ): Bookmark | null {
    return this.runtimeApiController.createBookmark(input);
  }

  getLastLocationRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.runtimeApiController.getLastLocationRestoreDiagnostics();
  }

  getPreferences(): ReaderPreferences {
    return this.runtimeApiController.getPreferences();
  }

  getSettings(): ReaderSettings {
    return this.runtimeApiController.getSettings();
  }

  getReadingLanguageContext(): ReadingLanguageContext | null {
    return this.runtimeApiController.getReadingLanguageContext();
  }

  getReadingNavigationContext(): ReadingNavigationContext | null {
    return this.runtimeApiController.getReadingNavigationContext();
  }

  getReadingSpreadContext(): ReadingSpreadContext | null {
    return this.runtimeApiController.getReadingSpreadContext();
  }

  getTocTargets(): TocTarget[] {
    return this.runtimeApiController.getTocTargets();
  }

  getSectionAccessibilitySnapshot(
    spineIndex = this.reader.currentSectionIndex
  ): SectionAccessibilitySnapshot | null {
    return this.runtimeApiController.getSectionAccessibilitySnapshot(
      spineIndex
    );
  }

  getPublicationAccessibilitySnapshot(): PublicationAccessibilitySnapshot | null {
    return this.runtimeApiController.getPublicationAccessibilitySnapshot();
  }

  getTheme(): Theme {
    return this.runtimeApiController.getTheme();
  }

  getTypography(): TypographyOptions {
    return this.runtimeApiController.getTypography();
  }

  getPaginationInfo(): PaginationInfo {
    return this.runtimeApiController.getPaginationInfo();
  }

  async goToHref(href: string): Promise<Locator | null> {
    return this.runtimeApiController.goToHref(href);
  }

  async activateLink(input: {
    href: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }): Promise<void> {
    return this.runtimeApiController.activateLink(input);
  }

  getSectionProgressWeights(): number[] {
    return this.runtimeApiController.getSectionProgressWeights();
  }

  resolveHrefLocator(href: string): Locator | null {
    return this.runtimeApiController.resolveHrefLocator(href);
  }

  async applyPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.runtimeApiController.applyPreferences(preferences);
  }

  emitRelocated(): void {
    return this.runtimeApiController.emitRelocated();
  }

  buildSectionRelocatedEvent(): SectionRelocatedEvent | null {
    return this.runtimeApiController.buildSectionRelocatedEvent();
  }

  emitSectionRendered(section: SectionDocument): void {
    return this.runtimeApiController.emitSectionRendered(section);
  }

  buildSectionRenderedEvent(
    section: SectionDocument
  ): SectionRenderedEvent | null {
    return this.runtimeApiController.buildSectionRenderedEvent(section);
  }

  resolveSectionHookElements(sectionId: string): {
    containerElement?: HTMLElement;
    contentElement?: HTMLElement;
  } {
    return this.runtimeApiController.resolveSectionHookElements(sectionId);
  }

  invokeReaderHook(callback: () => void | Promise<void> | undefined): void {
    return this.runtimeApiController.invokeReaderHook(callback);
  }

  renderCurrentSection(renderBehavior: RenderBehavior = "relocate"): void {
    return this.renderController.renderCurrentSection(renderBehavior);
  }

  renderDomSection(section: SectionDocument, renderVersion: number): void {
    return this.renderController.renderDomSection(section, renderVersion);
  }

  renderPaginatedDomSpread(page: ReaderPage, renderVersion: number): void {
    return this.renderController.renderPaginatedDomSpread(page, renderVersion);
  }

  syncFixedLayoutContainerState(input: DomChapterRenderInput | null): void {
    return this.renderController.syncFixedLayoutContainerState(input);
  }

  syncDomSectionStateAfterRender(
    renderBehavior: RenderBehavior,
    preservedScrollAnchor: ScrollAnchor | null,
    paginatedPage: ReaderPage | null = null
  ): void {
    return this.renderController.syncDomSectionStateAfterRender(
      renderBehavior,
      preservedScrollAnchor,
      paginatedPage
    );
  }

  scrollDomSectionToProgress(progressInSection: number): void {
    return this.renderController.scrollDomSectionToProgress(progressInSection);
  }

  scrollDomSectionToPaginatedPage(page: ReaderPage | null): void {
    return this.renderController.scrollDomSectionToPaginatedPage(page);
  }

  positionPaginatedDomSection(section: HTMLElement, page: ReaderPage): void {
    return this.renderController.positionPaginatedDomSection(section, page);
  }

  syncMeasuredPaginatedDomPages(section: SectionDocument): ReaderPage | null {
    return this.renderController.syncMeasuredPaginatedDomPages(section);
  }

  resolveChapterRenderDecision(sectionIndex: number): ChapterRenderDecision {
    return this.renderController.resolveChapterRenderDecision(sectionIndex);
  }

  applyContainerTheme(): void {
    return this.renderController.applyContainerTheme();
  }

  renderPaginatedCanvas(
    section: SectionDocument,
    page: ReaderPage | null,
    renderVersion: number
  ): void {
    return this.renderController.renderPaginatedCanvas(
      section,
      page,
      renderVersion
    );
  }

  renderScrollableCanvas(renderVersion: number): void {
    return this.renderController.renderScrollableCanvas(renderVersion);
  }

  buildDisplayListForPage(
    section: SectionDocument,
    page: ReaderPage
  ): SectionDisplayList {
    return this.renderController.buildDisplayListForPage(section, page);
  }

  estimateBlockHeightForPage(block: BlockNode): number {
    return this.renderController.estimateBlockHeightForPage(block);
  }

  isImageResourceReady(src: string): boolean {
    return this.renderController.isImageResourceReady(src);
  }

  resolveImageIntrinsicSizeForLayout(
    src: string
  ): IntrinsicImageSize | null | undefined {
    return this.renderController.resolveImageIntrinsicSizeForLayout(src);
  }

  extractBlockText(block: BlockNode): string {
    return this.renderController.extractBlockText(block);
  }

  extractInlineText(inlines: InlineNode[]): string {
    return this.renderController.extractInlineText(inlines);
  }

  resolveCanvasResourceUrl(path: string): string {
    return this.renderController.resolveCanvasResourceUrl(path);
  }

  resolveDomResourceUrl(path: string): string {
    return this.renderController.resolveDomResourceUrl(path);
  }

  resolveRenderableResourceUrl(
    path: string,
    consumer: RenderableResourceConsumer
  ): string {
    return this.renderController.resolveRenderableResourceUrl(path, consumer);
  }

  createDomRenderInput(
    section: SectionDocument,
    input: SharedChapterRenderInput
  ): DomChapterRenderInput {
    return this.renderController.createDomRenderInput(section, input);
  }

  resolveReadingLanguageContextForSection(
    section: SectionDocument
  ): ReadingLanguageContext | null {
    return this.renderController.resolveReadingLanguageContextForSection(
      section
    );
  }

  resolveReadingLanguageContextForSectionIndex(
    spineIndex: number
  ): ReadingLanguageContext | null {
    return this.renderController.resolveReadingLanguageContextForSectionIndex(
      spineIndex
    );
  }

  resolveReadingNavigationContextForSectionIndex(
    spineIndex: number
  ): ReadingNavigationContext | null {
    return this.renderController.resolveReadingNavigationContextForSectionIndex(
      spineIndex
    );
  }

  resolveReadingSpreadContextForSectionIndex(
    spineIndex: number
  ): ReadingSpreadContext | null {
    return this.renderController.resolveReadingSpreadContextForSectionIndex(
      spineIndex
    );
  }

  getSectionsForRender(): SectionDocument[] {
    return this.renderController.getSectionsForRender();
  }

  getSectionForRender(section: SectionDocument): SectionDocument {
    return this.renderController.getSectionForRender(section);
  }

  revokeObjectUrls(): void {
    return this.renderController.revokeObjectUrls();
  }

  getContainerInnerDimensions(): { width: number; height: number } {
    return this.renderController.getContainerInnerDimensions();
  }

  getPaginationMeasurement(): { width: number; height: number } {
    return this.renderController.getPaginationMeasurement();
  }

  getFixedLayoutViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.renderController.getFixedLayoutViewportBox(section);
  }

  getPresentationViewportBox(
    section: SectionDocument
  ): { width: number; height: number } | null {
    return this.renderController.getPresentationViewportBox(section);
  }

  resolveFixedLayoutRenderSignature(section: SectionDocument): string | null {
    return this.renderController.resolveFixedLayoutRenderSignature(section);
  }

  resolvePresentationRenderSignature(section: SectionDocument): string | null {
    return this.renderController.resolvePresentationRenderSignature(section);
  }

  getContentWidth(): number {
    return this.renderController.getContentWidth();
  }

  getFontFamily(): string {
    return this.renderController.getFontFamily();
  }

  attachResizeObserver(): void {
    return this.runtimeInteractionController.attachResizeObserver();
  }

  attachScrollListener(): void {
    return this.runtimeInteractionController.attachScrollListener();
  }

  detachScrollListener(): void {
    return this.runtimeInteractionController.detachScrollListener();
  }

  attachSelectionChangeListener(): void {
    return this.runtimeInteractionController.attachSelectionChangeListener();
  }

  attachPointerListener(): void {
    return this.runtimeInteractionController.attachPointerListener();
  }

  detachPointerListener(): void {
    return this.runtimeInteractionController.detachPointerListener();
  }

  attachKeyboardListener(): void {
    return this.runtimeInteractionController.attachKeyboardListener();
  }

  detachKeyboardListener(): void {
    return this.runtimeInteractionController.detachKeyboardListener();
  }

  handleDomClick(event: MouseEvent): void {
    return this.runtimeInteractionController.handleDomClick(event);
  }

  handlePaginatedViewportClick(event: MouseEvent): void {
    return this.runtimeInteractionController.handlePaginatedViewportClick(
      event
    );
  }

  resolvePaginatedClickNavigationAction(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "previous" | "next" | null {
    return this.runtimeInteractionController.resolvePaginatedClickNavigationAction(
      input
    );
  }

  resolvePaginatedSpreadClickSlot(input: {
    offsetX: number;
    target?: HTMLElement;
  }): "left" | "right" | null {
    return this.runtimeInteractionController.resolvePaginatedSpreadClickSlot(
      input
    );
  }

  performPaginatedNavigationAction(action: "previous" | "next"): void {
    return this.runtimeInteractionController.performPaginatedNavigationAction(
      action
    );
  }

  emitPaginatedCenterTapped(input: {
    source: "dom" | "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }): void {
    return this.runtimeInteractionController.emitPaginatedCenterTapped(input);
  }

  mapDomViewportPointToLocator(point: Point): Locator | null {
    return this.runtimeInteractionController.mapDomViewportPointToLocator(
      point
    );
  }

  getViewportCenterProbePoints(): Point[] {
    return this.runtimeInteractionController.getViewportCenterProbePoints();
  }

  getContainerRelativePoint(event: MouseEvent): Point | null {
    return this.runtimeInteractionController.getContainerRelativePoint(event);
  }

  getClientPointForContainerPoint(
    point: Point
  ): { x: number; y: number } | null {
    return this.runtimeInteractionController.getClientPointForContainerPoint(
      point
    );
  }

  realignDomSearchResult(result: SearchResult): void {
    return this.runtimeInteractionController.realignDomSearchResult(result);
  }

  async waitForFonts(): Promise<void> {
    return this.renderController.waitForFonts();
  }

  ensurePages(sectionLayout?: LayoutResult): void {
    return this.paginationController.ensurePages(sectionLayout);
  }

  applyMeasuredDomPagination(plan: {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  }): {
    pages: ReaderPage[];
    sectionEstimatedHeights: number[];
  } {
    return this.paginationController.applyMeasuredDomPagination(plan);
  }

  getPageHeight(): number {
    return this.paginationController.getPageHeight();
  }

  findCurrentPageForSection(sectionId: string): ReaderPage | null {
    return this.paginationController.findCurrentPageForSection(sectionId);
  }

  findPageForLocator(locator: Locator): ReaderPage | null {
    return this.paginationController.findPageForLocator(locator);
  }

  resolveRenderedPage(sectionId: string): ReaderPage | null {
    return this.paginationController.resolveRenderedPage(sectionId);
  }

  findPageByNumber(pageNumber: number): ReaderPage | null {
    return this.paginationController.findPageByNumber(pageNumber);
  }

  resolvePaginatedSpread(page: ReaderPage | null): PaginatedSpread | null {
    return this.paginationController.resolvePaginatedSpread(page);
  }

  resolveCurrentPaginatedSpread(): PaginatedSpread | null {
    return this.paginationController.resolveCurrentPaginatedSpread();
  }

  getVisiblePaginatedSpreads(): PaginatedSpread[] {
    return this.paginationController.getVisiblePaginatedSpreads();
  }

  resolveDisplayPageNumberToLeafPage(pageNumber: number): number | null {
    return this.paginationController.resolveDisplayPageNumberToLeafPage(
      pageNumber
    );
  }

  resolveSpreadNavigationTarget(action: "previous" | "next"): number | null {
    return this.paginationController.resolveSpreadNavigationTarget(action);
  }

  syncCurrentPageFromSection(): void {
    return this.paginationController.syncCurrentPageFromSection();
  }

  createLocatorForPage(page: ReaderPage): Locator {
    return this.paginationController.createLocatorForPage(page);
  }

  getProgressForCurrentLocator(): number {
    return this.paginationController.getProgressForCurrentLocator();
  }

  syncDerivedDecorationGroups(): void {
    return this.selectionAnnotationController.syncDerivedDecorationGroups();
  }

  getHighlightedCanvasBlockIdsForSection(sectionIndex: number): Set<string> {
    return this.selectionAnnotationController.getHighlightedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  getHighlightedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.selectionAnnotationController.getHighlightedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  getActiveCanvasBlockIdForSection(sectionIndex: number): string | undefined {
    return this.selectionAnnotationController.getActiveCanvasBlockIdForSection(
      sectionIndex
    );
  }

  getUnderlinedCanvasBlockIdsForSection(sectionIndex: number): Set<string> {
    return this.selectionAnnotationController.getUnderlinedCanvasBlockIdsForSection(
      sectionIndex
    );
  }

  getUnderlinedCanvasBlockColorsForSection(
    sectionIndex: number
  ): Map<string, string> {
    return this.selectionAnnotationController.getUnderlinedCanvasBlockColorsForSection(
      sectionIndex
    );
  }

  getUnderlinedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    return this.selectionAnnotationController.getUnderlinedCanvasTextRangesForSection(
      sectionIndex
    );
  }

  resolveCanvasViewportBlockIds(locator: Locator): string[] {
    return this.selectionAnnotationController.resolveCanvasViewportBlockIds(
      locator
    );
  }

  syncAnnotationDecorations(): void {
    return this.selectionAnnotationController.syncAnnotationDecorations();
  }

  resolveAnnotationQuote(locator: Locator): string | undefined {
    return this.selectionAnnotationController.resolveAnnotationQuote(locator);
  }

  resolveAnnotationTextRangeQuote(
    locator: Locator,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.selectionAnnotationController.resolveAnnotationTextRangeQuote(
      locator,
      textRange
    );
  }

  getLocatorScrollAlignment(): "start" | "center" {
    return this.scrollController.getLocatorScrollAlignment();
  }

  resolveScrollTopForRect(
    rectTop: number,
    rectHeight: number,
    alignment: "start" | "center"
  ): number {
    return this.scrollController.resolveScrollTopForRect(
      rectTop,
      rectHeight,
      alignment
    );
  }

  findRenderedDomBlockTarget(
    sectionElement: HTMLElement,
    blockId: string | undefined
  ): HTMLElement | null {
    return this.scrollController.findRenderedDomBlockTarget(
      sectionElement,
      blockId
    );
  }

  resolveRenderedDomTextPosition(
    sectionElement: HTMLElement,
    blockId: string | undefined,
    inlineOffset: number
  ): {
    node: Text;
    offset: number;
  } | null {
    return this.scrollController.resolveRenderedDomTextPosition(
      sectionElement,
      blockId,
      inlineOffset
    );
  }

  scrollToLocatorBlock(): boolean {
    return this.scrollController.scrollToLocatorBlock();
  }

  resolveScrollCanvasBlockRect(
    sourceSection: SectionDocument,
    sectionIndex: number,
    blockIds: string[]
  ): Rect | null {
    return this.scrollController.resolveScrollCanvasBlockRect(
      sourceSection,
      sectionIndex,
      blockIds
    );
  }

  scrollToLocatorInlineOffset(): boolean {
    return this.scrollController.scrollToLocatorInlineOffset();
  }

  scrollToLocatorAnchor(): boolean {
    return this.scrollController.scrollToLocatorAnchor();
  }

  refreshScrollSlicesAfterModeSwitchRelocation(): void {
    return this.scrollController.refreshScrollSlicesAfterModeSwitchRelocation();
  }

  scrollToCurrentLocation(): void {
    return this.scrollController.scrollToCurrentLocation();
  }

  syncPositionFromScroll(emitEvent: boolean): boolean {
    return this.scrollController.syncPositionFromScroll(emitEvent);
  }

  findRenderedSectionIndexForOffset(offset: number): number {
    return this.scrollController.findRenderedSectionIndexForOffset(offset);
  }

  updateScrollWindowBounds(): void {
    return this.scrollController.updateScrollWindowBounds();
  }

  refreshScrollWindowIfNeeded(): boolean {
    return this.scrollController.refreshScrollWindowIfNeeded();
  }

  refreshScrollSlicesIfNeeded(): boolean {
    return this.scrollController.refreshScrollSlicesIfNeeded();
  }

  scheduleDeferredScrollRefresh(): void {
    return this.scrollController.scheduleDeferredScrollRefresh();
  }

  clearDeferredScrollRefresh(): void {
    return this.scrollController.clearDeferredScrollRefresh();
  }

  rerenderScrollSlicesPreservingScrollTop(): void {
    return this.scrollController.rerenderScrollSlicesPreservingScrollTop();
  }

  scheduleDeferredResourceRenderRefresh(): void {
    return this.scrollController.scheduleDeferredResourceRenderRefresh();
  }

  clearDeferredResourceRenderRefresh(): void {
    return this.scrollController.clearDeferredResourceRenderRefresh();
  }

  scheduleDeferredAnchorRealignment(): void {
    return this.scrollController.scheduleDeferredAnchorRealignment();
  }

  clearDeferredAnchorRealignment(): void {
    return this.scrollController.clearDeferredAnchorRealignment();
  }

  captureScrollAnchor(): ScrollAnchor | null {
    return this.scrollController.captureScrollAnchor();
  }

  restoreScrollAnchor(anchor: ScrollAnchor | null): void {
    return this.scrollController.restoreScrollAnchor(anchor);
  }

  setProgrammaticScrollTop(nextScrollTop: number): void {
    return this.scrollController.setProgrammaticScrollTop(nextScrollTop);
  }

  collectRenderedCanvasSections(): Array<{
    sectionId: string;
    height: number;
    canvas: HTMLCanvasElement;
    interactions: InteractionRegion[];
  }> {
    return this.scrollController.collectRenderedCanvasSections();
  }

  offsetInteractionRegionsForScroll(
    sections: Array<{
      sectionId: string;
      height: number;
      interactions: InteractionRegion[];
    }>
  ): InteractionRegion[] {
    return this.scrollController.offsetInteractionRegionsForScroll(sections);
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
    return this.scrollController.collectVisibleBoundsForScroll(
      sectionsToRender
    );
  }

  getSectionElement(sectionId: string): HTMLElement | null {
    return this.scrollController.getSectionElement(sectionId);
  }

  findRenderedDomSectionAtPoint(point: Point): {
    section: SectionDocument;
    sectionIndex: number;
    sectionElement: HTMLElement;
  } | null {
    return this.scrollController.findRenderedDomSectionAtPoint(point);
  }

  getSectionTop(sectionId: string): number {
    return this.scrollController.getSectionTop(sectionId);
  }

  getSectionHeight(sectionId: string): number {
    return this.scrollController.getSectionHeight(sectionId);
  }

  rebuildSectionIndex(): void {
    return this.scrollController.rebuildSectionIndex();
  }

  getSectionIndexById(sectionId?: string | null): number {
    return this.scrollController.getSectionIndexById(sectionId);
  }

  findSectionIndexForOffset(offset: number): number {
    return this.scrollController.findSectionIndexForOffset(offset);
  }

  resolveSelectionTarget(node: Node | null): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
  } | null {
    return this.selectionAnnotationController.resolveSelectionTarget(node);
  }

  resolveSelectionEndpoint(input: { node: Node | null; offset: number }): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
    inlineOffset?: number;
  } | null {
    return this.selectionAnnotationController.resolveSelectionEndpoint(input);
  }

  resolveCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    return this.selectionAnnotationController.resolveCurrentTextSelectionSnapshot();
  }

  setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.selectionAnnotationController.setPinnedTextSelectionSnapshot(
      selection
    );
  }

  resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState {
    return this.selectionAnnotationController.resolveSelectionHighlightState(
      selection
    );
  }

  resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[] {
    return this.selectionAnnotationController.resolveAnnotationRangesForSection(
      spineIndex
    );
  }

  resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null {
    return this.selectionAnnotationController.resolveAnnotationRange(
      annotation
    );
  }

  createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext {
    return this.selectionAnnotationController.createSectionTextRangeContext(
      section
    );
  }

  normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null {
    return this.selectionAnnotationController.normalizeTextRangeForSection(
      spineIndex,
      textRange
    );
  }

  resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null {
    return this.selectionAnnotationController.resolveFullBlockTextRange(
      section,
      blockId
    );
  }

  createAnnotationForResolvedRange(input: {
    annotation?: Annotation;
    locator: Locator;
    range: TextRangeSelector;
    section: SectionDocument;
    style?: "highlight" | "underline";
    color?: string;
    note?: string;
  }): Annotation | null {
    return this.selectionAnnotationController.createAnnotationForResolvedRange(
      input
    );
  }

  resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.selectionAnnotationController.resolveTextRangeQuote(
      section,
      textRange
    );
  }

  resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds {
    return this.selectionAnnotationController.resolveAnnotationViewportRects(
      annotation,
      locator
    );
  }

  resolveCanvasTextRangeViewportRects(
    sectionId: string,
    textRange: TextRangeSelector
  ): VisibleDrawBounds {
    return this.selectionAnnotationController.resolveCanvasTextRangeViewportRects(
      sectionId,
      textRange
    );
  }

  resolveAnnotationSelectionAtPoint(
    point: Point
  ): ReaderTextSelectionSnapshot | null {
    return this.selectionAnnotationController.resolveAnnotationSelectionAtPoint(
      point
    );
  }

  emitAnnotationActivatedAtPoint(point: Point): boolean {
    return this.selectionAnnotationController.emitAnnotationActivatedAtPoint(
      point
    );
  }

  emitAnnotationActivatedForDecoration(
    decorationId: string,
    point?: Point
  ): boolean {
    return this.selectionAnnotationController.emitAnnotationActivatedForDecoration(
      decorationId,
      point
    );
  }

  emitAnnotationActivationPayload(
    activation: ResolvedAnnotationActivation,
    point: Point
  ): boolean {
    return this.selectionAnnotationController.emitAnnotationActivationPayload(
      activation,
      point
    );
  }

  getAnnotationActivationFallbackPoint(rects: VisibleDrawBounds): Point {
    return this.selectionAnnotationController.getAnnotationActivationFallbackPoint(
      rects
    );
  }

  toAnnotationViewportPoint(point: Point): Point {
    return this.selectionAnnotationController.toAnnotationViewportPoint(point);
  }

  syncTextSelectionState(): void {
    return this.selectionAnnotationController.syncTextSelectionState();
  }

  updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    return this.selectionAnnotationController.updateTextSelectionSnapshot(
      selection
    );
  }
}
