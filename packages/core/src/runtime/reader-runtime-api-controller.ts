import {
  normalizeEpubInput,
  type EpubInput
} from "../container/normalize-input";
import type {
  Bookmark,
  Book,
  Decoration,
  Locator,
  LocatorRestoreDiagnostics,
  PublicationAccessibilitySnapshot,
  ReaderEvent,
  ReaderEventMap,
  ReadingLanguageContext,
  ReadingNavigationContext,
  ReadingProgressSnapshot,
  ReadingSpreadContext,
  ReaderPreferences,
  ReaderSettings,
  SectionAccessibilitySnapshot,
  SectionDocument,
  SerializedLocator,
  SearchResult,
  SectionRenderedEvent,
  SectionRelocatedEvent,
  Theme,
  TocTarget,
  TypographyOptions
} from "../model/types";
import { createSharedChapterRenderInput } from "./chapter-render-input";
import { flattenTocTargets, resolveBookHrefLocator } from "./navigation-target";
import { normalizeLocator } from "./locator";
import {
  createBookmark as createReaderBookmark,
  derivePublicationId
} from "./bookmark";
import {
  DEFAULT_READER_SETTINGS,
  deserializeReaderPreferences,
  mergeReaderPreferences,
  normalizeReaderPreferences,
  resolveReaderSettings,
  serializeReaderPreferences
} from "./preferences";
import {
  buildPublicationAccessibilitySnapshot,
  buildSectionAccessibilitySnapshot
} from "./accessibility";
import { classifyNavigationHref } from "./external-boundary";
import { buildSearchResultsForSection } from "./search-results";
import * as readerRuntimeHelpers from "./reader-runtime-helpers";
import type {
  PaginationInfo,
  ReaderRuntimeHost
} from "./reader-runtime-controller";
export class ReaderRuntimeApiController {
  private readonly reader: ReaderRuntimeHost;

  constructor(reader: ReaderRuntimeHost) {
    this.reader = reader;
  }

  async open(input: EpubInput): Promise<Book> {
    const normalized = await normalizeEpubInput(input);
    const parserInput = {
      data: normalized.data
    } as {
      data: Uint8Array;
      sourceName?: string;
    };

    if (normalized.sourceName) {
      parserInput.sourceName = normalized.sourceName;
    }

    const parsed = await this.reader.parser.parseDetailed(parserInput);
    this.reader.layoutEngine.clearCache();
    const chapterRenderInputs = parsed.sectionContents.map((entry) =>
      createSharedChapterRenderInput(entry)
    );
    this.reader.documentSession.resetForOpen({
      book: parsed.book,
      sourceName: normalized.sourceName ?? null,
      resources: parsed.resources,
      chapterRenderInputs
    });
    this.reader.annotationSession.reset();
    this.reader.revokeObjectUrls();
    const startLocator = parsed.book.metadata.startHref
      ? resolveBookHrefLocator({
          book: parsed.book,
          currentSectionIndex: 0,
          href: parsed.book.metadata.startHref
        })
      : null;
    this.reader.navigationSession.resetForOpen(startLocator);
    this.reader.renderSession.resetForOpen();
    this.reader.measuredDomPaginationBySectionId.clear();
    this.reader.selectionSession.reset();
    this.reader.decorationManager.clearAll();
    this.reader.scrollCoordinator.reset();
    if (this.reader.options.container) {
      this.reader.options.container.scrollTop = 0;
      this.reader.options.container.scrollLeft = 0;
    }
    this.reader.events.emit("opened", { book: parsed.book });
    return parsed.book;
  }

  async render(): Promise<void> {
    await this.reader.waitForFonts();
    this.reader.renderCurrentSection();

    this.reader.events.emit("rendered", { mode: this.reader.mode });
  }

  async next(): Promise<void> {
    if (!this.reader.book) {
      return;
    }

    if (this.reader.mode === "scroll") {
      await this.reader.goToScrollSection(this.reader.currentSectionIndex + 2);
      return;
    }

    this.reader.ensurePages();
    const spreadTargetPage =
      this.reader.mode === "paginated"
        ? this.reader.resolveSpreadNavigationTarget("next")
        : null;
    if (typeof spreadTargetPage === "number") {
      await this.reader.goToLeafPage(spreadTargetPage);
      return;
    }
    const nextPage = Math.min(
      this.reader.currentPageNumber + 1,
      this.reader.pages.length || 1
    );
    await this.reader.goToLeafPage(nextPage);
  }

  async prev(): Promise<void> {
    if (!this.reader.book) {
      return;
    }

    if (this.reader.mode === "scroll") {
      await this.reader.goToScrollSection(this.reader.currentSectionIndex);
      return;
    }

    this.reader.ensurePages();
    if (this.reader.isAtRenderedPaginatedDomSectionStart()) {
      this.reader.preferLocatorOnNextDomPaginationSync = true;
      await this.reader.goToLocation({
        spineIndex: this.reader.currentSectionIndex - 1,
        progressInSection: 1
      });
      return;
    }
    const spreadTargetPage =
      this.reader.mode === "paginated"
        ? this.reader.resolveSpreadNavigationTarget("previous")
        : null;
    if (typeof spreadTargetPage === "number") {
      await this.reader.goToLeafPage(spreadTargetPage);
      return;
    }
    const currentPage = this.reader.findPageByNumber(
      this.reader.currentPageNumber
    );
    if (
      currentPage &&
      currentPage.pageNumberInSection <= 1 &&
      currentPage.spineIndex > 0
    ) {
      this.reader.preferLocatorOnNextDomPaginationSync = true;
      await this.reader.goToLocation({
        spineIndex: currentPage.spineIndex - 1,
        progressInSection: 1
      });
      return;
    }
    const previousPage = Math.max(this.reader.currentPageNumber - 1, 1);
    await this.reader.goToLeafPage(previousPage);
  }

  isAtRenderedPaginatedDomSectionStart(): boolean {
    if (
      !this.reader.book ||
      !this.reader.options.container ||
      this.reader.mode !== "paginated"
    ) {
      return false;
    }

    if (this.reader.currentSectionIndex <= 0) {
      return false;
    }

    const section = this.reader.book.sections[this.reader.currentSectionIndex];
    if (!section) {
      return false;
    }

    const sectionElement =
      this.reader.options.container.querySelector<HTMLElement>(
        ".epub-dom-section"
      );
    if (!sectionElement || sectionElement.dataset.sectionId !== section.id) {
      return false;
    }

    return Math.abs(readerRuntimeHelpers.readTranslateY(sectionElement)) <= 1;
  }

  async goToLocation(locator: Locator): Promise<void> {
    await this.reader.navigationController.goToLocation(locator);
  }

  async restoreLocation(
    locator: Locator | SerializedLocator
  ): Promise<boolean> {
    return this.reader.navigationController.restoreLocation(locator);
  }

  async restoreBookmark(bookmark: Bookmark): Promise<boolean> {
    return this.reader.navigationController.restoreBookmark(bookmark);
  }

  async goToTocItem(id: string): Promise<void> {
    await this.reader.navigationController.goToTocItem(id);
  }

  async setTheme(theme: Partial<Theme>): Promise<void> {
    await this.reader.submitPreferences({
      theme
    });
  }

  async setTypography(options: Partial<TypographyOptions>): Promise<void> {
    await this.reader.submitPreferences({
      typography: options
    });
  }

  async setMode(mode: "scroll" | "paginated"): Promise<void> {
    await this.reader.submitPreferences({
      mode
    });
  }

  async submitPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    return this.reader.applyPreferences(
      mergeReaderPreferences(this.reader.preferences, preferences)
    );
  }

  async restorePreferences(
    preferences: ReaderPreferences | string | null | undefined
  ): Promise<ReaderSettings> {
    if (typeof preferences === "string") {
      const restored = deserializeReaderPreferences(preferences);
      return restored
        ? this.reader.applyPreferences(restored)
        : this.reader.getSettings();
    }

    return this.reader.applyPreferences(
      normalizeReaderPreferences(preferences)
    );
  }

  serializePreferences(): string {
    return serializeReaderPreferences(this.reader.preferences);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.reader.navigationController.goToPage(pageNumber);
  }

  async goToScrollSection(sectionNumber: number): Promise<void> {
    await this.reader.navigationController.goToScrollSection(sectionNumber);
  }

  async goToLeafPage(pageNumber: number): Promise<void> {
    await this.reader.navigationController.goToLeafPage(pageNumber);
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.reader.book || !query.trim()) {
      this.reader.decorationManager.clearExplicitGroup("search-results");
      if (this.reader.book) {
        this.reader.renderCurrentSection("preserve");
      }
      return [];
    }

    const results: SearchResult[] = [];
    const searchDecorations: Decoration[] = [];

    for (let index = 0; index < this.reader.book.sections.length; index += 1) {
      const section = this.reader.book.sections[index];
      if (!section) {
        continue;
      }

      const sectionResults = buildSearchResultsForSection({
        section,
        spineIndex: index,
        query
      });
      for (const result of sectionResults) {
        results.push(result);
        searchDecorations.push({
          id: `search:${result.sectionId}:${searchDecorations.length + 1}`,
          group: "search-results",
          locator: result.locator,
          style: "search-hit"
        });
      }
    }

    this.reader.decorationManager.setExplicitGroup(
      "search-results",
      searchDecorations
    );
    this.reader.renderCurrentSection("preserve");
    this.reader.events.emit("searchCompleted", { query, results });
    return results;
  }

  async goToSearchResult(result: SearchResult): Promise<void> {
    await this.reader.goToLocation(result.locator);
    this.reader.realignDomSearchResult(result);
  }

  getCurrentLocation(): Locator | null {
    return this.reader.locator ? normalizeLocator(this.reader.locator) : null;
  }

  getReadingProgress(): ReadingProgressSnapshot | null {
    return this.reader.navigationController.getReadingProgress();
  }

  async goToProgress(progress: number): Promise<Locator | null> {
    return this.reader.navigationController.goToProgress(progress);
  }

  setDecorations(input: { group: string; decorations: Decoration[] }): void {
    this.reader.decorationManager.setExplicitGroup(
      input.group,
      input.decorations
    );
    if (this.reader.book) {
      this.reader.renderCurrentSection("preserve");
    }
  }

  clearDecorations(group?: string): void {
    if (group) {
      this.reader.decorationManager.clearExplicitGroup(group);
    } else {
      this.reader.decorationManager.clearAllExplicit();
    }

    if (this.reader.book) {
      this.reader.renderCurrentSection("preserve");
    }
  }

  getDecorations(group?: string): Decoration[] {
    return group
      ? this.reader.decorationManager.getGroup(group)
      : this.reader.decorationManager.getAll();
  }

  setDebugMode(enabled: boolean): void {
    const nextDebugMode = Boolean(enabled);
    if (this.reader.debugMode === nextDebugMode) {
      return;
    }

    this.reader.debugMode = nextDebugMode;
    this.reader.syncDerivedDecorationGroups();
    if (this.reader.book) {
      this.reader.renderCurrentSection("preserve");
    }
  }

  updateLocator(locator: Locator | null): void {
    this.reader.locator = locator ? normalizeLocator(locator) : null;
    this.reader.syncDerivedDecorationGroups();
  }

  on<TEvent extends ReaderEvent>(
    event: TEvent,
    handler: (payload: ReaderEventMap[TEvent]) => void
  ): () => void {
    const wrapped = ((payload: ReaderEventMap[TEvent]) => {
      handler(payload);
    }) as never;

    this.reader.events.on(event, wrapped);
    return () => this.reader.events.off(event, wrapped);
  }

  destroy(): void {
    this.reader.events.removeAllListeners();
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "selectionchange",
        this.reader.handleDocumentSelectionChange
      );
    }
    this.reader.detachScrollListener();
    this.reader.detachPointerListener();
    this.reader.detachKeyboardListener();
    this.reader.documentSession.resetForDestroy();
    this.reader.layoutEngine.clearCache();
    this.reader.navigationSession.resetForDestroy();
    this.reader.renderSession.resetForDestroy();
    this.reader.measuredDomPaginationBySectionId.clear();
    this.reader.selectionSession.reset();
    this.reader.scrollCoordinator.clearAll();
    this.reader.revokeObjectUrls();
    if (this.reader.options.container) {
      this.reader.options.container.innerHTML = "";
      this.reader.options.container.removeAttribute("style");
    }
    this.reader.resizeObserver?.disconnect();
    this.reader.resizeObserver = null;
  }

  getBook(): Book | null {
    return this.reader.book;
  }

  getPublicationId(): string | null {
    if (!this.reader.book) {
      return null;
    }

    return derivePublicationId({
      book: this.reader.book,
      ...(this.reader.sourceName ? { sourceName: this.reader.sourceName } : {})
    });
  }

  createBookmark(
    input: {
      locator?: Locator;
      label?: string;
      excerpt?: string;
    } = {}
  ): Bookmark | null {
    if (!this.reader.book) {
      return null;
    }

    const publicationId = this.reader.getPublicationId();
    const locator = input.locator ?? this.reader.getCurrentLocation();
    if (!publicationId || !locator) {
      return null;
    }

    return createReaderBookmark({
      publicationId,
      locator,
      book: this.reader.book,
      ...(input.label ? { label: input.label } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {})
    });
  }

  getLastLocationRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.reader.lastLocatorRestoreDiagnostics
      ? { ...this.reader.lastLocatorRestoreDiagnostics }
      : null;
  }

  getPreferences(): ReaderPreferences {
    return readerRuntimeHelpers.cloneReaderPreferences(this.reader.preferences);
  }

  getSettings(): ReaderSettings {
    return this.reader.viewSession.snapshotSettings();
  }

  getReadingLanguageContext(): ReadingLanguageContext | null {
    return this.reader.resolveReadingLanguageContextForSectionIndex(
      this.reader.currentSectionIndex
    );
  }

  getReadingNavigationContext(): ReadingNavigationContext | null {
    return this.reader.resolveReadingNavigationContextForSectionIndex(
      this.reader.currentSectionIndex
    );
  }

  getReadingSpreadContext(): ReadingSpreadContext | null {
    return this.reader.resolveReadingSpreadContextForSectionIndex(
      this.reader.currentSectionIndex
    );
  }

  getTocTargets(): TocTarget[] {
    if (!this.reader.book) {
      return [];
    }

    return flattenTocTargets(this.reader.book);
  }

  getSectionAccessibilitySnapshot(
    spineIndex = this.reader.currentSectionIndex
  ): SectionAccessibilitySnapshot | null {
    if (!this.reader.book) {
      return null;
    }

    const section = this.reader.book.sections[spineIndex];
    if (!section) {
      return null;
    }

    return buildSectionAccessibilitySnapshot({
      section,
      spineIndex
    });
  }

  getPublicationAccessibilitySnapshot(): PublicationAccessibilitySnapshot | null {
    if (!this.reader.book) {
      return null;
    }

    const publicationId = this.reader.getPublicationId();
    return buildPublicationAccessibilitySnapshot({
      book: this.reader.book,
      ...(publicationId ? { publicationId } : {})
    });
  }

  getTheme(): Theme {
    return { ...this.reader.theme };
  }

  getTypography(): TypographyOptions {
    return { ...this.reader.typography };
  }

  getPaginationInfo(): PaginationInfo {
    if (this.reader.mode === "scroll") {
      return {
        currentPage: Math.max(
          1,
          Math.min(
            this.reader.currentSectionIndex + 1,
            this.reader.book?.sections.length ?? 1
          )
        ),
        totalPages: Math.max(1, this.reader.book?.sections.length ?? 1)
      };
    }
    this.reader.ensurePages();
    if (this.reader.mode === "paginated") {
      const visibleSpreads = this.reader.getVisiblePaginatedSpreads();
      if (visibleSpreads.length > 0) {
        const currentSpreadIndex = visibleSpreads.findIndex((spread) =>
          spread.pageNumbers.includes(this.reader.currentPageNumber)
        );
        return {
          currentPage: Math.max(
            1,
            currentSpreadIndex >= 0 ? currentSpreadIndex + 1 : 1
          ),
          totalPages: visibleSpreads.length
        };
      }
    }
    return {
      currentPage: Math.max(
        1,
        Math.min(this.reader.currentPageNumber, this.reader.pages.length || 1)
      ),
      totalPages: Math.max(1, this.reader.pages.length)
    };
  }

  async goToHref(href: string): Promise<Locator | null> {
    return this.reader.navigationController.goToHref(href);
  }

  async activateLink(input: {
    href: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }): Promise<void> {
    const resolved = classifyNavigationHref(input.href);
    if (resolved.kind === "internal") {
      await this.reader.goToHref(input.href);
      return;
    }

    if (resolved.kind === "external-safe") {
      const payload = {
        href: input.href,
        scheme: resolved.scheme,
        source: input.source,
        ...(input.text ? { text: input.text } : {}),
        ...(input.sectionId ? { sectionId: input.sectionId } : {}),
        ...(input.blockId ? { blockId: input.blockId } : {})
      } satisfies ReaderEventMap["externalLinkActivated"];
      this.reader.events.emit("externalLinkActivated", payload);
      await this.reader.options.onExternalLink?.(payload);
      return;
    }

    this.reader.events.emit("externalLinkBlocked", {
      href: input.href,
      scheme: resolved.scheme,
      reason: "unsafe-scheme"
    });
  }

  getSectionProgressWeights(): number[] {
    if (!this.reader.book || this.reader.book.sections.length === 0) {
      return [];
    }

    return this.reader.book.sections.map((section, index) =>
      Math.max(
        1,
        index === this.reader.currentSectionIndex
          ? this.reader.getSectionHeight(section.id)
          : (this.reader.sectionEstimatedHeights[index] ??
              this.reader.getPageHeight())
      )
    );
  }

  resolveHrefLocator(href: string): Locator | null {
    return this.reader.navigationController.resolveHrefLocator(href);
  }

  async applyPreferences(
    preferences: ReaderPreferences
  ): Promise<ReaderSettings> {
    const nextPreferences = normalizeReaderPreferences(preferences);
    const previousSettings = this.reader.getSettings();
    const nextSettings = resolveReaderSettings(
      nextPreferences,
      DEFAULT_READER_SETTINGS
    );
    const modeChanged = previousSettings.mode !== nextSettings.mode;
    const publisherStylesChanged =
      previousSettings.publisherStyles !== nextSettings.publisherStyles;
    const publisherColorOverrideChanged =
      previousSettings.publisherColorOverride !==
      nextSettings.publisherColorOverride;
    const experimentalRtlChanged =
      previousSettings.experimentalRtl !== nextSettings.experimentalRtl;
    const spreadModeChanged =
      previousSettings.spreadMode !== nextSettings.spreadMode;
    const themeChanged = !readerRuntimeHelpers.themesEqual(
      previousSettings.theme,
      nextSettings.theme
    );
    const typographyChanged = !readerRuntimeHelpers.typographyEqual(
      previousSettings.typography,
      nextSettings.typography
    );
    const didChange =
      modeChanged ||
      publisherStylesChanged ||
      publisherColorOverrideChanged ||
      experimentalRtlChanged ||
      spreadModeChanged ||
      themeChanged ||
      typographyChanged;
    const capturedModeSwitchLocator =
      modeChanged && this.reader.book
        ? this.reader.captureModeSwitchLocator()
        : null;

    this.reader.viewSession.applySettings({
      preferences: nextPreferences,
      settings: nextSettings
    });
    this.reader.applyContainerTheme();

    if (didChange) {
      await this.reader.waitForFonts();
      this.reader.pages = [];
      this.reader.measuredDomPaginationBySectionId.clear();
      if (this.reader.book) {
        this.reader.pendingModeSwitchLocator = capturedModeSwitchLocator;
        this.reader.applyPendingModeSwitchLocator();
        try {
          this.reader.renderCurrentSection(
            modeChanged || publisherStylesChanged || experimentalRtlChanged
              ? "relocate"
              : "preserve"
          );
        } finally {
          this.reader.pendingModeSwitchLocator = null;
        }
      }
    }

    const settings = this.reader.getSettings();
    if (didChange) {
      this.reader.events.emit("preferencesChanged", {
        preferences: this.reader.getPreferences(),
        settings
      });
    }
    if (themeChanged) {
      this.reader.events.emit("themeChanged", { theme: { ...settings.theme } });
    }
    if (typographyChanged) {
      this.reader.events.emit("typographyChanged", {
        typography: { ...settings.typography }
      });
    }
    if (modeChanged) {
      this.reader.events.emit("rendered", { mode: settings.mode });
    }

    return settings;
  }

  emitRelocated(): void {
    this.reader.events.emit("relocated", { locator: this.reader.locator });
    const event = this.reader.buildSectionRelocatedEvent();
    if (!event) {
      return;
    }
    this.reader.invokeReaderHook(() =>
      this.reader.options.onSectionRelocated?.(event)
    );
  }

  buildSectionRelocatedEvent(): SectionRelocatedEvent | null {
    if (!this.reader.book || this.reader.book.sections.length === 0) {
      return null;
    }

    const spineIndex = Math.max(
      0,
      Math.min(
        this.reader.locator?.spineIndex ?? this.reader.currentSectionIndex,
        this.reader.book.sections.length - 1
      )
    );
    const section = this.reader.book.sections[spineIndex];
    if (!section) {
      return null;
    }

    const elements = this.reader.resolveSectionHookElements(section.id);
    return {
      spineIndex,
      sectionId: section.id,
      sectionHref: section.href,
      locator: this.reader.getCurrentLocation(),
      mode: this.reader.mode,
      backend: this.reader.lastRenderMetrics.backend,
      diagnostics: this.reader.getRenderDiagnostics(),
      ...(elements.containerElement
        ? { containerElement: elements.containerElement }
        : {}),
      ...(elements.contentElement
        ? { contentElement: elements.contentElement }
        : {})
    };
  }

  emitSectionRendered(section: SectionDocument): void {
    const event = this.reader.buildSectionRenderedEvent(section);
    if (!event) {
      return;
    }
    this.reader.invokeReaderHook(() =>
      this.reader.options.onSectionRendered?.(event)
    );
  }

  buildSectionRenderedEvent(
    section: SectionDocument
  ): SectionRenderedEvent | null {
    if (!this.reader.book) {
      return null;
    }

    const sectionIndex = this.reader.getSectionIndexById(section.id);
    if (sectionIndex < 0) {
      return null;
    }

    const elements = this.reader.resolveSectionHookElements(section.id);
    return {
      spineIndex: sectionIndex,
      sectionId: section.id,
      sectionHref: section.href,
      mode: this.reader.mode,
      backend: this.reader.lastRenderMetrics.backend,
      diagnostics: this.reader.getRenderDiagnostics(),
      ...(elements.containerElement
        ? { containerElement: elements.containerElement }
        : {}),
      ...(elements.contentElement
        ? { contentElement: elements.contentElement }
        : {}),
      isCurrent: sectionIndex === this.reader.currentSectionIndex
    };
  }

  resolveSectionHookElements(sectionId: string): {
    containerElement?: HTMLElement;
    contentElement?: HTMLElement;
  } {
    const containerElement = this.reader.getSectionElement(sectionId);
    const contentElement = containerElement?.matches(".epub-dom-section")
      ? containerElement
      : containerElement?.querySelector<HTMLElement>(".epub-dom-section");

    return {
      ...(containerElement ? { containerElement } : {}),
      ...(contentElement ? { contentElement } : {})
    };
  }

  invokeReaderHook(callback: () => void | Promise<void> | undefined): void {
    try {
      const result = callback();
      if (result) {
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Hook failures must stay isolated from the reader lifecycle.
    }
  }
}
