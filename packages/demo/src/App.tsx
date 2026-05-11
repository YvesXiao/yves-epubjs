import { useEffect, useRef, useState } from "react";
import {
  CustomSelect,
  ReaderDiagnosticsPanel,
  ReaderSelectionToolbar,
  type ReaderSelectionToolbarAction,
  ReaderSidebar,
  ReaderToolbar,
  ReaderViewportOverlay,
  SearchResultsPanel,
  toggleId
} from "./reader-ui";
import {
  ANNOTATION_COLORS,
  THEMES,
  useReaderController
} from "./use-reader-controller";

type DrawerPanel = "contents" | "search" | "settings" | "diagnostics";
const DEFAULT_READING_TITLE = "Open a local EPUB";

export function App(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const readingSurfaceRef = useRef<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("No file selected");
  const [activeDrawer, setActiveDrawer] = useState<DrawerPanel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const {
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
    hasSavedBookmark,
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
  } = useReaderController(containerRef);

  const readingTitle = resolveReadingTitle(selectedFileName, snapshot.metaText);
  const selectionToolbarActions: ReaderSelectionToolbarAction[] =
    snapshot.textSelection
      ? [
          {
            id: "highlight",
            label:
              snapshot.selectionHighlightState?.mode === "remove-highlight"
                ? "Remove"
                : annotationStyle === "underline"
                  ? "Underline"
                  : "Highlight",
            ...(snapshot.selectionHighlightState?.disabled
              ? { disabled: true }
              : {}),
            onSelect: async () => {
              await applySelectionHighlightAction();
              clearTextSelection();
            }
          },
          {
            id: "copy",
            label: "Copy",
            tone: "secondary",
            onSelect: async () => {
              const text = snapshot.textSelection?.text.trim();
              if (
                text &&
                typeof navigator !== "undefined" &&
                navigator.clipboard &&
                typeof navigator.clipboard.writeText === "function"
              ) {
                await navigator.clipboard.writeText(text);
              }
              clearTextSelection();
            }
          }
        ]
      : [];

  useEffect(() => {
    setDebugMode(activeDrawer === "diagnostics");
  }, [activeDrawer, setDebugMode]);

  useEffect(() => {
    const surface = readingSurfaceRef.current;
    setFullscreenAvailable(
      Boolean(document.fullscreenEnabled && surface?.requestFullscreen)
    );

    function syncFullscreenState(): void {
      setIsFullscreen(document.fullscreenElement === surface);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  function toggleDrawer(panel: DrawerPanel): void {
    setActiveDrawer((current) => (current === panel ? null : panel));
  }

  async function toggleFullscreen(): Promise<void> {
    const surface = readingSurfaceRef.current;
    if (!surface || !document.fullscreenEnabled || !surface.requestFullscreen) {
      return;
    }

    try {
      if (document.fullscreenElement === surface) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await surface.requestFullscreen();
    } catch {
      setIsFullscreen(document.fullscreenElement === surface);
    }
  }

  return (
    <main className="reading-shell">
      <header className="reading-topbar">
        <div className="reading-topbar-brand">
          <p className="eyebrow">Pretext EPUB Reader</p>
          <h1 title={readingTitle}>{readingTitle}</h1>
          <div className="reading-topbar-facts">
            <span className="reading-fact-chip">{mode}</span>
            <span className="reading-fact-chip">
              {snapshot.renderBackend ?? "no-backend"} /{" "}
              {mode === "scroll" ? "section" : "page"}{" "}
              {snapshot.pagination.currentPage} of{" "}
              {snapshot.pagination.totalPages}
            </span>
            <span className="reading-fact-chip">{bookmarkStatus}</span>
            <span className="reading-fact-chip">{highlightStatus}</span>
            <span className="reading-fact-chip">
              {annotationStyle === "underline" ? "Underline" : "Highlight"}{" "}
              {annotationColor}
            </span>
          </div>
        </div>
        <label className="file-picker file-picker-topbar">
          <span className="sr-only">Select EPUB</span>
          <span className="file-picker-shell">
            <span className="file-picker-button">Choose File</span>
            <input
              type="file"
              accept=".epub,application/epub+zip"
              className="file-picker-input"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                setSelectedFileName(file?.name ?? "No file selected");
                if (file) {
                  await openFile(file);
                }
              }}
            />
          </span>
        </label>
      </header>

      <section className="reading-viewport">
        <section
          ref={readingSurfaceRef}
          className="reading-surface"
          data-fullscreen={isFullscreen ? "true" : "false"}
        >
          <div className="reading-surface-strip">
            <ReaderToolbar
              mode={mode}
              currentPage={snapshot.pagination.currentPage}
              totalPages={snapshot.pagination.totalPages}
              pageValue={pageValue}
              hasSavedBookmark={hasSavedBookmark}
              annotationStyle={annotationStyle}
              annotationColor={annotationColor}
              annotationColors={ANNOTATION_COLORS}
              isFullscreen={isFullscreen}
              fullscreenAvailable={fullscreenAvailable}
              onPageValueChange={setPageValue}
              onGoToPage={goToPage}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
              onSaveBookmark={saveBookmark}
              onRestoreBookmark={restoreSavedBookmark}
              onAddHighlight={addHighlight}
              onClearHighlights={clearHighlights}
              onAnnotationStyleChange={setAnnotationStyle}
              onAnnotationColorChange={setAnnotationColor}
              onModeChange={handleModeChange}
              onToggleFullscreen={toggleFullscreen}
            />
          </div>

          <div className="reader-stage reader-stage-blueprint">
            <div ref={containerRef} data-mode={mode} className="reader-root">
              <article className="placeholder-page">
                <h2>Waiting for an EPUB</h2>
                <p>Select a local EPUB file to parse and render it.</p>
              </article>
            </div>
            <ReaderViewportOverlay
              searchOverlays={snapshot.searchOverlays}
              annotationOverlays={snapshot.annotationOverlays}
              viewportOffset={snapshot.viewportOffset}
            />
            <ReaderSelectionToolbar
              selection={snapshot.textSelection}
              viewportOffset={snapshot.viewportOffset}
              actions={selectionToolbarActions}
            />
          </div>
        </section>

        <div className="reading-action-rail" aria-label="Reader utilities">
          <button
            type="button"
            className="reading-action-button"
            data-active={activeDrawer === "contents" ? "true" : "false"}
            onClick={() => toggleDrawer("contents")}
          >
            TOC
          </button>
          <button
            type="button"
            className="reading-action-button"
            data-active={activeDrawer === "search" ? "true" : "false"}
            onClick={() => toggleDrawer("search")}
          >
            Find
          </button>
          <button
            type="button"
            className="reading-action-button"
            data-active={activeDrawer === "settings" ? "true" : "false"}
            onClick={() => toggleDrawer("settings")}
          >
            Tune
          </button>
          <button
            type="button"
            className="reading-action-button"
            data-active={activeDrawer === "diagnostics" ? "true" : "false"}
            onClick={() => toggleDrawer("diagnostics")}
          >
            Debug
          </button>
        </div>

        {activeDrawer ? (
          <>
            <button
              type="button"
              aria-label="Close drawer"
              className="reading-drawer-scrim"
              onClick={() => setActiveDrawer(null)}
            />
            <aside className="reading-drawer" data-panel={activeDrawer}>
              <div className="reading-drawer-header">
                <div>
                  <span className="drawer-kicker">
                    {resolveDrawerKicker(activeDrawer)}
                  </span>
                  <strong>{resolveDrawerTitle(activeDrawer)}</strong>
                </div>
                <button
                  type="button"
                  className="drawer-close"
                  onClick={() => setActiveDrawer(null)}
                >
                  Close
                </button>
              </div>

              <div className="reading-drawer-body">
                {activeDrawer === "contents" ? (
                  <ReaderSidebar
                    toc={snapshot.toc}
                    activeId={activeTocId}
                    expandedIds={expandedTocIds}
                    onToggle={(id) => {
                      setExpandedTocIds((current) => toggleId(current, id));
                    }}
                    onSelect={async (id) => {
                      await goToTocItem(id);
                      setActiveDrawer(null);
                    }}
                  />
                ) : null}

                {activeDrawer === "search" ? (
                  <div className="drawer-search-stack">
                    <label className="field-shell">
                      <span className="field-label">Search current book</span>
                      <div className="search-bar">
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          onKeyDown={async (event) => {
                            if (event.key === "Enter") {
                              await performSearch(searchQuery);
                            }
                          }}
                          placeholder="Search current book"
                          className="field-input search-input"
                        />
                        <button
                          type="button"
                          className="search-submit"
                          onClick={() => {
                            void performSearch(searchQuery);
                          }}
                        >
                          Search
                        </button>
                        <button
                          type="button"
                          className="search-clear"
                          onClick={() => {
                            setSearchQuery("");
                            clearSearchResults();
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </label>
                    <SearchResultsPanel
                      query={searchQuery}
                      results={results}
                      onSelect={async (index) => {
                        await goToSearchResult(results[index]!);
                        setActiveDrawer(null);
                      }}
                    />
                  </div>
                ) : null}

                {activeDrawer === "settings" ? (
                  <div className="drawer-settings-stack">
                    <div className="controls-grid controls-settings-row">
                      <label className="field-shell">
                        <span className="field-label">Theme</span>
                        <CustomSelect
                          value={themeKey}
                          options={[
                            { value: "paper", label: "Paper" },
                            { value: "night", label: "Night" },
                            { value: "sage", label: "Sage" }
                          ]}
                          onChange={async (value) => {
                            await handleThemeChange(
                              value as keyof typeof THEMES
                            );
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Mode</span>
                        <CustomSelect
                          value={mode}
                          options={[
                            { value: "scroll", label: "Scroll" },
                            { value: "paginated", label: "Paginated" }
                          ]}
                          onChange={async (value) => {
                            await handleModeChange(
                              value as "scroll" | "paginated"
                            );
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Publisher Styles</span>
                        <CustomSelect
                          value={publisherStyles}
                          options={[
                            { value: "enabled", label: "Enabled" },
                            { value: "disabled", label: "Disabled" }
                          ]}
                          onChange={async (value) => {
                            await handlePublisherStylesChange(
                              value as "enabled" | "disabled"
                            );
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Publisher Colors</span>
                        <CustomSelect
                          value={publisherColorOverride}
                          options={[
                            { value: "none", label: "Preserve" },
                            { value: "foreground", label: "Reader Text" }
                          ]}
                          onChange={async (value) => {
                            await handlePublisherColorOverrideChange(
                              value as "none" | "foreground"
                            );
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Experimental RTL</span>
                        <CustomSelect
                          value={experimentalRtl ? "enabled" : "disabled"}
                          options={[
                            { value: "disabled", label: "Disabled" },
                            { value: "enabled", label: "Enabled" }
                          ]}
                          onChange={async (value) => {
                            await handleExperimentalRtlChange(
                              value === "enabled"
                            );
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Font Family</span>
                        <CustomSelect
                          value={fontFamily}
                          options={[
                            {
                              value:
                                '"Iowan Old Style", "Palatino Linotype", serif',
                              label: "Iowan"
                            },
                            {
                              value: 'Georgia, "Times New Roman", serif',
                              label: "Georgia"
                            },
                            {
                              value:
                                '"Source Han Serif SC", "Noto Serif SC", serif',
                              label: "Source Han Serif"
                            }
                          ]}
                          onChange={async (value) => {
                            await handleFontFamilyChange(value);
                          }}
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Font Size</span>
                        <input
                          type="range"
                          min="14"
                          max="28"
                          value={fontSize}
                          onChange={async (event) =>
                            handleFontSizeChange(Number(event.target.value))
                          }
                          className="accent-amber-500"
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Letter Spacing</span>
                        <input
                          type="range"
                          min="-1"
                          max="4"
                          step="0.5"
                          value={letterSpacing}
                          onChange={async (event) =>
                            handleLetterSpacingChange(
                              Number(event.target.value)
                            )
                          }
                          className="accent-amber-500"
                        />
                      </label>
                      <label className="field-shell">
                        <span className="field-label">Word Spacing</span>
                        <input
                          type="range"
                          min="0"
                          max="12"
                          step="1"
                          value={wordSpacing}
                          onChange={async (event) =>
                            handleWordSpacingChange(Number(event.target.value))
                          }
                          className="accent-amber-500"
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {activeDrawer === "diagnostics" ? (
                  <ReaderDiagnosticsPanel
                    renderBackend={snapshot.renderBackend}
                    publisherStyles={publisherStyles}
                    locator={snapshot.locator}
                    restoreDiagnostics={snapshot.restoreDiagnostics}
                    languageContext={snapshot.languageContext}
                    navigationContext={snapshot.navigationContext}
                    spreadContext={snapshot.spreadContext}
                    diagnostics={snapshot.diagnostics}
                    visibleSectionDiagnostics={
                      snapshot.visibleSectionDiagnostics
                    }
                  />
                ) : null}
              </div>
            </aside>
          </>
        ) : null}
      </section>

      {lightbox ? (
        <div
          className="image-lightbox"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setLightbox(null);
            }
          }}
        >
          <button
            type="button"
            className="image-lightbox-close"
            onClick={() => setLightbox(null)}
          >
            Close
          </button>
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="image-lightbox-image"
          />
        </div>
      ) : null}
    </main>
  );
}

function resolveReadingTitle(
  selectedFileName: string,
  metaText: string
): string {
  const normalizedFileName =
    selectedFileName !== "No file selected"
      ? selectedFileName.replace(/\.epub$/i, "")
      : "";
  if (normalizedFileName) {
    return normalizedFileName;
  }

  return metaText !== "No book loaded"
    ? (metaText.split(" · ")[0] ?? DEFAULT_READING_TITLE)
    : DEFAULT_READING_TITLE;
}

function resolveDrawerTitle(panel: DrawerPanel): string {
  switch (panel) {
    case "contents":
      return "Table of Contents";
    case "search":
      return "Search";
    case "settings":
      return "Reader Settings";
    case "diagnostics":
      return "Debug";
  }
}

function resolveDrawerKicker(panel: DrawerPanel): string {
  switch (panel) {
    case "contents":
      return "Navigate";
    case "search":
      return "Find";
    case "settings":
      return "Tune";
    case "diagnostics":
      return "Debug";
  }
}
