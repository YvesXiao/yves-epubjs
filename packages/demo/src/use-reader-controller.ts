import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import {
  type AnnotationStyle,
  type AnnotationViewportSnapshot,
  type Bookmark,
  EpubReader,
  type Locator,
  type LocatorRestoreDiagnostics,
  type ReadingLanguageContext,
  type ReadingNavigationContext,
  type ReadingSpreadContext,
  type ReaderSettings,
  type PublisherColorOverride,
  type PublisherStylesMode,
  type ReaderSelectionHighlightState,
  type ReaderTextSelectionSnapshot,
  type PaginationInfo,
  type RenderDiagnostics,
  resolveReaderSettings,
  type SearchResult,
  type Theme,
  type TocItem,
  type VisibleSectionDiagnostics
} from "@yves-epub/core";
import { openExternalLink, readViewportOffset } from "./reader-host-actions";
import {
  buildAnnotationOverlays,
  buildSearchOverlays,
  type ReaderDecorationOverlay
} from "./reader-overlays";
import {
  defaultFontFamily,
  loadBookmark,
  loadStoredGlobalReaderPreferences,
  loadStoredReaderPreferences,
  persistBookmark,
  persistReaderPreferences
} from "./reader-storage";
import { findActiveTocId } from "./toc-active";

export type ReaderSnapshot = {
  metaText: string;
  pagination: PaginationInfo;
  toc: TocItem[];
  renderBackend: "canvas" | "dom" | null;
  locator: Locator | null;
  restoreDiagnostics: LocatorRestoreDiagnostics | null;
  languageContext: ReadingLanguageContext | null;
  navigationContext: ReadingNavigationContext | null;
  spreadContext: ReadingSpreadContext | null;
  diagnostics: RenderDiagnostics | null;
  visibleSectionDiagnostics: VisibleSectionDiagnostics[];
  searchOverlays: ReaderDecorationOverlay[];
  annotationOverlays: AnnotationViewportSnapshot[];
  textSelection: ReaderTextSelectionSnapshot | null;
  selectionHighlightState: ReaderSelectionHighlightState | null;
  viewportOffset: {
    x: number;
    y: number;
  };
};

export const THEMES = {
  paper: {
    background: "#fffaf0",
    color: "#1f2328"
  },
  night: {
    background: "#182028",
    color: "#ecf4ff"
  },
  sage: {
    background: "#eef4ea",
    color: "#203126"
  }
} as const satisfies Record<string, Theme>;

type ThemeKey = keyof typeof THEMES;
export const ANNOTATION_COLORS = ["#f59e0b", "#2563eb", "#ef4444"] as const;
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

type DemoPreferenceState = {
  themeKey: ThemeKey;
  mode: "scroll" | "paginated";
  publisherStyles: PublisherStylesMode;
  publisherColorOverride: PublisherColorOverride;
  experimentalRtl: boolean;
  fontSize: number;
  fontFamily: string;
  letterSpacing: number;
  wordSpacing: number;
};

const INITIAL_SNAPSHOT: ReaderSnapshot = {
  metaText: "No book loaded",
  pagination: {
    currentPage: 1,
    totalPages: 1
  },
  toc: [],
  renderBackend: null,
  locator: null,
  restoreDiagnostics: null,
  languageContext: null,
  navigationContext: null,
  spreadContext: null,
  diagnostics: null,
  visibleSectionDiagnostics: [],
  searchOverlays: [],
  annotationOverlays: [],
  textSelection: null,
  selectionHighlightState: null,
  viewportOffset: {
    x: 0,
    y: 0
  }
};
export function useReaderController(
  containerRef: RefObject<HTMLDivElement | null>
): {
  snapshot: ReaderSnapshot;
  results: SearchResult[];
  themeKey: ThemeKey;
  mode: "scroll" | "paginated";
  publisherStyles: PublisherStylesMode;
  publisherColorOverride: PublisherColorOverride;
  experimentalRtl: boolean;
  fontSize: number;
  fontFamily: string;
  letterSpacing: number;
  wordSpacing: number;
  pageValue: string;
  activeTocId: string | null;
  expandedTocIds: Set<string>;
  lightbox: { src: string; alt: string } | null;
  hasSavedBookmark: boolean;
  bookmarkStatus: string;
  highlightStatus: string;
  annotationStyle: AnnotationStyle;
  annotationColor: AnnotationColor;
  setPageValue: (value: string) => void;
  setAnnotationStyle: Dispatch<SetStateAction<AnnotationStyle>>;
  setAnnotationColor: Dispatch<SetStateAction<AnnotationColor>>;
  setExpandedTocIds: Dispatch<SetStateAction<Set<string>>>;
  setLightbox: Dispatch<SetStateAction<{ src: string; alt: string } | null>>;
  clearSearchResults: () => void;
  clearTextSelection: () => void;
  openFile: (file: File) => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  performSearch: (query: string) => Promise<void>;
  goToSearchResult: (result: SearchResult) => Promise<void>;
  handleThemeChange: (nextThemeKey: ThemeKey) => Promise<void>;
  handleModeChange: (nextMode: "scroll" | "paginated") => Promise<void>;
  handlePublisherStylesChange: (nextMode: PublisherStylesMode) => Promise<void>;
  handlePublisherColorOverrideChange: (
    nextMode: PublisherColorOverride
  ) => Promise<void>;
  handleExperimentalRtlChange: (enabled: boolean) => Promise<void>;
  handleFontSizeChange: (nextSize: number) => Promise<void>;
  handleFontFamilyChange: (nextFamily: string) => Promise<void>;
  handleLetterSpacingChange: (nextSpacing: number) => Promise<void>;
  handleWordSpacingChange: (nextSpacing: number) => Promise<void>;
  goToPreviousPage: () => Promise<void>;
  goToNextPage: () => Promise<void>;
  goToTocItem: (id: string) => Promise<void>;
  saveBookmark: () => Promise<void>;
  restoreSavedBookmark: () => Promise<void>;
  addHighlight: () => Promise<void>;
  applySelectionHighlightAction: () => Promise<boolean>;
  setDebugMode: (enabled: boolean) => void;
  clearHighlights: () => void;
} {
  const readerRef = useRef<EpubReader | null>(null);
  const activeTocIdRef = useRef<string | null>(null);
  const initialPreferenceStateRef = useRef<DemoPreferenceState | null>(null);
  const syncSnapshotRef = useRef<(() => void) | null>(null);

  if (!initialPreferenceStateRef.current) {
    initialPreferenceStateRef.current = getInitialDemoPreferenceState();
  }

  const [snapshot, setSnapshot] = useState<ReaderSnapshot>(INITIAL_SNAPSHOT);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [themeKey, setThemeKey] = useState<ThemeKey>(
    initialPreferenceStateRef.current.themeKey
  );
  const [mode, setMode] = useState<"scroll" | "paginated">(
    initialPreferenceStateRef.current.mode
  );
  const [publisherStyles, setPublisherStyles] = useState<PublisherStylesMode>(
    initialPreferenceStateRef.current.publisherStyles
  );
  const [publisherColorOverride, setPublisherColorOverride] =
    useState<PublisherColorOverride>(
      initialPreferenceStateRef.current.publisherColorOverride
    );
  const [experimentalRtl, setExperimentalRtl] = useState(
    initialPreferenceStateRef.current.experimentalRtl
  );
  const [fontSize, setFontSize] = useState(
    initialPreferenceStateRef.current.fontSize
  );
  const [fontFamily, setFontFamily] = useState(
    initialPreferenceStateRef.current.fontFamily
  );
  const [letterSpacing, setLetterSpacing] = useState(
    initialPreferenceStateRef.current.letterSpacing
  );
  const [wordSpacing, setWordSpacing] = useState(
    initialPreferenceStateRef.current.wordSpacing
  );
  const [pageValue, setPageValue] = useState("1");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [expandedTocIds, setExpandedTocIds] = useState<Set<string>>(new Set());
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [savedBookmark, setSavedBookmark] = useState<Bookmark | null>(null);
  const [bookmarkStatus, setBookmarkStatus] = useState("No bookmark saved");
  const [highlightStatus, setHighlightStatus] = useState("No highlights saved");
  const [annotationStyle, setAnnotationStyle] =
    useState<AnnotationStyle>("highlight");
  const [annotationColor, setAnnotationColor] =
    useState<AnnotationColor>("#f59e0b");

  function syncPreferenceState(settings: ReaderSettings): void {
    setThemeKey(resolveThemeKey(settings.theme));
    setMode(settings.mode);
    setPublisherStyles(settings.publisherStyles);
    setPublisherColorOverride(settings.publisherColorOverride);
    setExperimentalRtl(settings.experimentalRtl);
    setFontSize(settings.typography.fontSize);
    setFontFamily(settings.typography.fontFamily ?? defaultFontFamily());
    setLetterSpacing(settings.typography.letterSpacing ?? 0);
    setWordSpacing(settings.typography.wordSpacing ?? 0);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const reader = new EpubReader({
      container,
      onExternalLink: ({ href }) => {
        openExternalLink(href);
      }
    });
    readerRef.current = reader;

    const syncSnapshot = (): void => {
      const book = reader.getBook();
      const locator = reader.getCurrentLocation();
      const restoreDiagnostics = reader.getLastLocationRestoreDiagnostics();
      const metrics = reader.getRenderMetrics();
      const languageContext = reader.getReadingLanguageContext();
      const navigationContext = reader.getReadingNavigationContext();
      const spreadContext = reader.getReadingSpreadContext();
      const diagnostics = reader.getRenderDiagnostics();
      const visibleSectionDiagnostics = reader.getVisibleSectionDiagnostics();
      const searchOverlays = buildSearchOverlays(reader);
      const annotationOverlays = buildAnnotationOverlays(reader);
      const textSelection = reader.getCurrentTextSelectionSnapshot();
      const selectionHighlightState =
        reader.getCurrentSelectionHighlightState();
      const viewportOffset = readViewportOffset(container);
      const baseSnapshot = {
        pagination: reader.getPaginationInfo(),
        toc: book?.toc ?? [],
        renderBackend: metrics.backend,
        locator,
        restoreDiagnostics,
        languageContext,
        navigationContext,
        spreadContext,
        diagnostics,
        visibleSectionDiagnostics,
        searchOverlays,
        annotationOverlays,
        textSelection,
        selectionHighlightState,
        viewportOffset
      } satisfies Omit<ReaderSnapshot, "metaText">;

      if (!book || !locator) {
        setSnapshot({
          ...baseSnapshot,
          metaText: "No book loaded"
        });
        setPageValue("1");
        return;
      }

      const section = book.sections[locator.spineIndex];
      const pagination = reader.getPaginationInfo();
      const positionLabel =
        reader.getSettings().mode === "scroll" ? "Section" : "Page";
      const nextActiveTocId = findActiveTocId(
        book.toc,
        section?.href ?? "",
        activeTocIdRef.current
      );
      setSnapshot({
        ...baseSnapshot,
        metaText: `${book.metadata.title} · ${section?.title ?? section?.href ?? "Section"} · ${
          locator.spineIndex + 1
        } / ${book.sections.length} · ${positionLabel} ${pagination.currentPage} / ${pagination.totalPages} · ${metrics.backend}`,
        pagination,
        toc: book.toc
      });
      activeTocIdRef.current = nextActiveTocId;
      setActiveTocId(nextActiveTocId);
      if (nextActiveTocId) {
        setExpandedTocIds((current) =>
          expandAncestors(current, book.toc, nextActiveTocId)
        );
      }
      setPageValue(String(pagination.currentPage));
    };
    syncSnapshotRef.current = syncSnapshot;

    const offPreferences = reader.on("preferencesChanged", ({ settings }) => {
      syncPreferenceState(settings);
      const publicationId = reader.getPublicationId();
      persistReaderPreferences({
        preferences: reader.getPreferences(),
        ...(publicationId ? { publicationId } : {})
      });
      syncSnapshot();
    });
    const offOpened = reader.on("opened", ({ book }) => {
      setResults([]);
      setExpandedTocIds(new Set(flattenBranchIds(book.toc)));
      activeTocIdRef.current = null;
      setActiveTocId(null);
      setSnapshot((current) => ({
        ...current,
        toc: book.toc
      }));
      syncSnapshot();
    });
    const offRelocated = reader.on("relocated", syncSnapshot);
    const offRendered = reader.on("rendered", syncSnapshot);
    const offTextSelectionChanged = reader.on(
      "textSelectionChanged",
      ({ selection }) => {
        setSnapshot((current) => ({
          ...current,
          textSelection: selection,
          selectionHighlightState: reader.getCurrentSelectionHighlightState()
        }));
      }
    );
    const offAnnotationActivated = reader.on(
      "annotationActivated",
      ({ annotation, quote }) => {
        setHighlightStatus(
          `${formatAnnotationStyleLabel(annotation.style ?? "highlight")} tapped · ${
            quote?.trim() || annotation.quote || "annotation"
          }`
        );
      }
    );
    const offTypography = reader.on("typographyChanged", syncSnapshot);
    const offSearch = reader.on(
      "searchCompleted",
      ({ results: nextResults }) => {
        setResults(nextResults);
      }
    );

    const handleReaderClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const hit = reader.hitTest({
        x: event.clientX - rect.left + container.scrollLeft,
        y: event.clientY - rect.top
      });
      if (!hit || hit.kind !== "image") {
        return;
      }

      setLightbox({
        src: hit.src,
        alt: hit.alt ?? ""
      });
    };

    container.addEventListener("click", handleReaderClick);
    const handleReaderScroll = (): void => {
      setSnapshot((current) => ({
        ...current,
        viewportOffset: readViewportOffset(container)
      }));
    };
    container.addEventListener("scroll", handleReaderScroll);
    const storedPreferences = loadStoredGlobalReaderPreferences();
    if (storedPreferences) {
      void reader.restorePreferences(storedPreferences).then((settings) => {
        syncPreferenceState(settings);
        persistReaderPreferences({
          preferences: reader.getPreferences()
        });
        syncSnapshot();
      });
    }
    syncSnapshot();

    return () => {
      container.removeEventListener("click", handleReaderClick);
      container.removeEventListener("scroll", handleReaderScroll);
      offSearch();
      offTypography();
      offAnnotationActivated();
      offTextSelectionChanged();
      offRendered();
      offRelocated();
      offOpened();
      offPreferences();
      syncSnapshotRef.current = null;
      reader.destroy();
      readerRef.current = null;
    };
  }, [containerRef]);

  async function openFile(file: File): Promise<void> {
    const reader = readerRef.current;
    if (!reader) {
      return;
    }

    setSnapshot((current) => ({
      ...current,
      metaText: "Opening EPUB..."
    }));
    try {
      await reader.open(file);
      await reader.render();
      const publicationId = reader.getPublicationId();
      const mergedPreferences = loadStoredReaderPreferences(
        publicationId ?? undefined
      );
      if (mergedPreferences) {
        const settings = await reader.restorePreferences(mergedPreferences);
        syncPreferenceState(settings);
        persistReaderPreferences({
          preferences: reader.getPreferences(),
          ...(publicationId ? { publicationId } : {})
        });
      }
      const restoredBookmark = publicationId
        ? loadBookmark(publicationId)
        : null;
      setSavedBookmark(restoredBookmark);
      setBookmarkStatus(
        restoredBookmark ? "Saved bookmark available" : "No bookmark saved"
      );
      setHighlightStatus("No highlights saved");
    } catch (error) {
      const message = getOpenFileErrorMessage(error);
      console.error("Failed to open EPUB", error);
      setSavedBookmark(null);
      setBookmarkStatus("Open failed");
      setHighlightStatus("No highlights saved");
      setSnapshot((current) => ({
        ...current,
        metaText: `Open failed · ${message}`
      }));
    }
  }

  async function goToPage(page: number): Promise<void> {
    const reader = readerRef.current;
    if (!reader || !Number.isFinite(page)) {
      return;
    }

    await reader.goToPage(page);
  }

  async function performSearch(query: string): Promise<void> {
    const reader = readerRef.current;
    if (!reader) {
      return;
    }

    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      return;
    }

    const nextResults = await reader.search(normalized);
    if (nextResults.length === 0) {
      setResults([]);
    }
    syncSnapshotRef.current?.();
  }

  async function goToSearchResult(result: SearchResult): Promise<void> {
    await readerRef.current?.goToSearchResult(result);
  }

  async function handleThemeChange(nextThemeKey: ThemeKey): Promise<void> {
    await readerRef.current?.submitPreferences({
      theme: THEMES[nextThemeKey]
    });
  }

  async function handleModeChange(
    nextMode: "scroll" | "paginated"
  ): Promise<void> {
    await readerRef.current?.submitPreferences({
      mode: nextMode
    });
  }

  async function handlePublisherStylesChange(
    nextMode: PublisherStylesMode
  ): Promise<void> {
    await readerRef.current?.submitPreferences({
      publisherStyles: nextMode
    });
  }

  async function handlePublisherColorOverrideChange(
    nextMode: PublisherColorOverride
  ): Promise<void> {
    await readerRef.current?.submitPreferences({
      publisherColorOverride: nextMode
    });
  }

  async function handleExperimentalRtlChange(enabled: boolean): Promise<void> {
    await readerRef.current?.submitPreferences({
      experimentalRtl: enabled
    });
  }

  async function handleFontSizeChange(nextSize: number): Promise<void> {
    await readerRef.current?.submitPreferences({
      typography: {
        fontSize: nextSize
      }
    });
  }

  async function handleFontFamilyChange(nextFamily: string): Promise<void> {
    await readerRef.current?.submitPreferences({
      typography: {
        fontFamily: nextFamily
      }
    });
  }

  async function handleLetterSpacingChange(nextSpacing: number): Promise<void> {
    await readerRef.current?.submitPreferences({
      typography: {
        letterSpacing: nextSpacing
      }
    });
  }

  async function handleWordSpacingChange(nextSpacing: number): Promise<void> {
    await readerRef.current?.submitPreferences({
      typography: {
        wordSpacing: nextSpacing
      }
    });
  }

  async function goToPreviousPage(): Promise<void> {
    await readerRef.current?.prev();
  }

  async function goToNextPage(): Promise<void> {
    await readerRef.current?.next();
  }

  async function goToTocItem(id: string): Promise<void> {
    setActiveTocId(id);
    activeTocIdRef.current = id;
    setExpandedTocIds((current) => expandAncestors(current, snapshot.toc, id));
    await readerRef.current?.goToTocItem(id);
  }

  async function saveBookmark(): Promise<void> {
    const reader = readerRef.current;
    if (!reader) {
      return;
    }

    const bookmark = reader.createBookmark();
    if (!bookmark) {
      setBookmarkStatus("Bookmark save failed");
      return;
    }

    persistBookmark(bookmark);
    setSavedBookmark(bookmark);
    setBookmarkStatus(
      `Bookmark saved · ${new Date(bookmark.createdAt).toLocaleString()}`
    );
  }

  async function restoreSavedBookmark(): Promise<void> {
    const reader = readerRef.current;
    if (!reader || !savedBookmark) {
      return;
    }

    const restored = await reader.restoreBookmark(savedBookmark);
    const diagnostics = reader.getLastLocationRestoreDiagnostics();
    syncSnapshotRef.current?.();
    if (!restored) {
      setBookmarkStatus(
        `Bookmark restore failed${diagnostics?.reason ? ` · ${diagnostics.reason}` : ""}`
      );
      return;
    }

    setBookmarkStatus(
      diagnostics?.fallbackApplied
        ? `Bookmark restored with fallback · ${diagnostics.resolvedPrecision ?? "progress"}`
        : "Bookmark restored"
    );
  }

  function clearSearchResults(): void {
    setResults([]);
    readerRef.current?.clearDecorations("search-results");
    syncSnapshotRef.current?.();
  }

  function clearTextSelection(): void {
    readerRef.current?.clearCurrentTextSelection();
  }

  async function addHighlight(): Promise<void> {
    const reader = readerRef.current;
    if (!reader) {
      return;
    }

    if (await applySelectionHighlightAction()) {
      return;
    }

    const selectionAnnotation = reader.createAnnotationFromSelection({
      style: annotationStyle,
      color: annotationColor
    });
    if (selectionAnnotation) {
      reader.addAnnotation(selectionAnnotation);
      syncSnapshotRef.current?.();
      setHighlightStatus(
        `${formatAnnotationStyleLabel(annotationStyle)} saved from selection at ${new Date(
          selectionAnnotation.createdAt
        ).toLocaleTimeString()}`
      );
      return;
    }

    const searchTarget = reader
      .getDecorations("search-results")
      .map((decoration) => ({
        locator: decoration.locator,
        rects: reader.mapLocatorToViewport(decoration.locator)
      }))
      .find((entry) => entry.rects.length > 0);
    const annotation = reader.createAnnotation({
      ...(searchTarget ? { locator: searchTarget.locator } : {}),
      style: annotationStyle,
      color: annotationColor
    });
    if (!annotation) {
      setHighlightStatus("Annotation save failed");
      return;
    }

    reader.addAnnotation(annotation);
    setHighlightStatus(
      `${formatAnnotationStyleLabel(annotationStyle)} saved at ${new Date(
        annotation.createdAt
      ).toLocaleTimeString()}`
    );
    syncSnapshotRef.current?.();
  }

  async function applySelectionHighlightAction(): Promise<boolean> {
    const reader = readerRef.current;
    if (!reader || !reader.getCurrentTextSelectionSnapshot()) {
      return false;
    }

    const result = reader.applyCurrentSelectionHighlightAction({
      style: annotationStyle,
      color: annotationColor
    });
    syncSnapshotRef.current?.();
    if (!result) {
      setHighlightStatus("Annotation action failed");
      return true;
    }

    if (result.mode === "remove-highlight") {
      setHighlightStatus(
        result.changedCount > 0
          ? "Annotation removed from selection"
          : "Selection was not changed"
      );
      return true;
    }

    setHighlightStatus(
      result.changedCount > 0
        ? `${formatAnnotationStyleLabel(annotationStyle)} saved from selection`
        : "Selection already annotated"
    );
    return true;
  }
  const setDebugMode = useCallback((enabled: boolean): void => {
    readerRef.current?.setDebugMode(enabled);
    syncSnapshotRef.current?.();
  }, []);

  function clearHighlights(): void {
    readerRef.current?.clearAnnotations();
    setHighlightStatus("Highlights cleared");
    syncSnapshotRef.current?.();
  }

  return {
    snapshot,
    results,
    themeKey,
    mode,
    publisherStyles,
    publisherColorOverride,
    experimentalRtl,
    fontSize,
    fontFamily,
    letterSpacing,
    wordSpacing,
    pageValue,
    activeTocId,
    expandedTocIds,
    lightbox,
    hasSavedBookmark: Boolean(savedBookmark),
    bookmarkStatus,
    highlightStatus,
    annotationStyle,
    annotationColor,
    setPageValue,
    setAnnotationStyle,
    setAnnotationColor,
    setExpandedTocIds,
    setLightbox,
    clearSearchResults,
    clearTextSelection,
    openFile,
    goToPage,
    performSearch,
    goToSearchResult,
    handleThemeChange,
    handleModeChange,
    handlePublisherStylesChange,
    handlePublisherColorOverrideChange,
    handleExperimentalRtlChange,
    handleFontSizeChange,
    handleFontFamilyChange,
    handleLetterSpacingChange,
    handleWordSpacingChange,
    goToPreviousPage,
    goToNextPage,
    goToTocItem,
    saveBookmark,
    restoreSavedBookmark,
    addHighlight,
    applySelectionHighlightAction,
    setDebugMode,
    clearHighlights
  };
}

function getOpenFileErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown parser error";
}

function formatAnnotationStyleLabel(style: AnnotationStyle): string {
  return style === "underline" ? "Underline" : "Highlight";
}

function getInitialDemoPreferenceState(): DemoPreferenceState {
  const settings = resolveReaderSettings(loadStoredGlobalReaderPreferences());
  return {
    themeKey: resolveThemeKey(settings.theme),
    mode: settings.mode,
    publisherStyles: settings.publisherStyles,
    publisherColorOverride: settings.publisherColorOverride,
    experimentalRtl: settings.experimentalRtl,
    fontSize: settings.typography.fontSize,
    fontFamily: settings.typography.fontFamily ?? defaultFontFamily(),
    letterSpacing: settings.typography.letterSpacing ?? 0,
    wordSpacing: settings.typography.wordSpacing ?? 0
  };
}

function resolveThemeKey(theme: Theme): ThemeKey {
  for (const [key, candidate] of Object.entries(THEMES) as Array<
    [ThemeKey, Theme]
  >) {
    if (
      candidate.background === theme.background &&
      candidate.color === theme.color
    ) {
      return key;
    }
  }

  return "paper";
}

function flattenBranchIds(items: TocItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.children.length > 0 ? [item.id] : []),
    ...flattenBranchIds(item.children)
  ]);
}

function findAncestorIds(
  items: TocItem[],
  targetId: string,
  trail: string[] = []
): string[] | null {
  for (const item of items) {
    if (item.id === targetId) {
      return trail;
    }

    const nested = findAncestorIds(item.children, targetId, [
      ...trail,
      item.id
    ]);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function expandAncestors(
  current: Set<string>,
  items: TocItem[],
  targetId: string
): Set<string> {
  const next = new Set(current);
  const ancestors = findAncestorIds(items, targetId) ?? [];
  for (const id of ancestors) {
    next.add(id);
  }
  return next;
}
