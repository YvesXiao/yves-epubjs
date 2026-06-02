import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type {
  AnnotationStyle,
  AnnotationViewportSnapshot,
  Locator,
  LocatorRestoreDiagnostics,
  ReaderTextSelectionSnapshot,
  ReadingLanguageContext,
  ReadingNavigationContext,
  ReadingSpreadContext,
  Rect,
  RenderDiagnostics,
  TocItem,
  VisibleSectionDiagnostics
} from "@yves-epub/core";
import type { ReaderDecorationOverlay } from "./reader-overlays";
import type { AnnotationColor } from "./use-reader-controller";

export type ReaderSelectionToolbarAction = {
  id: string;
  label: string;
  disabled?: boolean;
  tone?: "primary" | "secondary";
  onSelect: () => void | Promise<void>;
};

export function SearchResultsPanel(props: {
  query: string;
  results: Array<{ sectionId: string; href: string; excerpt: string }>;
  onSelect: (index: number) => void | Promise<void>;
}): JSX.Element {
  return (
    <div className="hero-search-results">
      <div className="hero-search-results-header">Search Results</div>
      <div className="hero-search-results-body">
        {props.results.length === 0 ? (
          <p className="empty-state">
            {props.query.trim()
              ? `No matches for "${props.query.trim()}".`
              : "Run a search to see results."}
          </p>
        ) : (
          props.results.map((result, index) => (
            <button
              key={`${result.sectionId}-${index}`}
              type="button"
              className="search-card"
              onClick={() => {
                void props.onSelect(index);
              }}
            >
              <span className="block text-sm font-semibold">{result.href}</span>
              <span className="mt-1 block text-sm text-slate-600">
                {result.excerpt}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function ReaderSidebar(props: {
  toc: TocItem[];
  activeId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void | Promise<void>;
}): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-panel">
        <div className="sidebar-panel-header">
          <h2>Contents</h2>
        </div>
        <div className="sidebar-panel-body">
          <div className="space-y-2">
            {props.toc.length === 0 ? (
              <p className="empty-state">No table of contents available.</p>
            ) : (
              <TocTree
                items={props.toc}
                activeId={props.activeId}
                expandedIds={props.expandedIds}
                onToggle={props.onToggle}
                onSelect={props.onSelect}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ReaderToolbar(props: {
  mode: "scroll" | "paginated";
  currentPage: number;
  totalPages: number;
  pageValue: string;
  hasSavedBookmark: boolean;
  annotationStyle: AnnotationStyle;
  annotationColor: AnnotationColor;
  annotationColors: readonly AnnotationColor[];
  isFullscreen: boolean;
  fullscreenAvailable: boolean;
  onPageValueChange: (value: string) => void;
  onGoToPage: (page: number) => void | Promise<void>;
  onPrevious: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onSaveBookmark: () => void | Promise<void>;
  onRestoreBookmark: () => void | Promise<void>;
  onAddHighlight: () => void | Promise<void>;
  onClearHighlights: () => void;
  onAnnotationStyleChange: (style: AnnotationStyle) => void;
  onAnnotationColorChange: (color: AnnotationColor) => void;
  onModeChange: (mode: "scroll" | "paginated") => void | Promise<void>;
  onToggleFullscreen: () => void | Promise<void>;
}): JSX.Element {
  const positionLabel = props.mode === "scroll" ? "Section" : "Page";
  const modeOptions: Array<{ value: "scroll" | "paginated"; label: string }> = [
    { value: "scroll", label: "Scroll" },
    { value: "paginated", label: "Paginated" }
  ];

  return (
    <div className="reader-toolbar">
      <div className="reader-toolbar-group">
        <ToolbarButton onClick={props.onPrevious}>Previous</ToolbarButton>
        <ToolbarButton onClick={props.onNext}>Next</ToolbarButton>
      </div>
      <div className="reader-toolbar-group reader-toolbar-group-page">
        <label className="page-jump">
          <span>{positionLabel}</span>
          <input
            type="number"
            min="1"
            max={props.totalPages}
            value={props.pageValue}
            onChange={(event) => props.onPageValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void props.onGoToPage(Number(props.pageValue));
              }
            }}
            className="field-input page-input"
          />
          <span
            className="page-total"
            aria-label={`${positionLabel} ${props.currentPage} of ${props.totalPages}`}
          >
            / {props.totalPages}
          </span>
        </label>
        <ToolbarButton
          onClick={() => props.onGoToPage(Number(props.pageValue))}
        >
          Go
        </ToolbarButton>
      </div>
      <div className="reader-toolbar-group">
        <ToolbarButton onClick={props.onSaveBookmark}>Save</ToolbarButton>
        <ToolbarButton
          disabled={!props.hasSavedBookmark}
          onClick={props.onRestoreBookmark}
        >
          Restore
        </ToolbarButton>
      </div>
      <div className="reader-toolbar-group">
        <ToolbarButton onClick={props.onAddHighlight}>Highlight</ToolbarButton>
        <ToolbarButton onClick={props.onClearHighlights}>Clear</ToolbarButton>
      </div>
      <div
        className="reader-toolbar-group reader-toolbar-group-annotation"
        aria-label="Annotation style"
      >
        {(["highlight", "underline"] as const).map((style) => (
          <button
            key={style}
            type="button"
            className={`toolbar-mode-button toolbar-annotation-style${
              props.annotationStyle === style ? " is-active" : ""
            }`}
            aria-pressed={props.annotationStyle === style}
            onClick={() => props.onAnnotationStyleChange(style)}
          >
            {style === "underline" ? "Underline" : "Fill"}
          </button>
        ))}
        <div className="toolbar-color-swatches" aria-label="Annotation color">
          {props.annotationColors.map((color) => (
            <button
              key={color}
              type="button"
              className={`toolbar-color-swatch${
                props.annotationColor === color ? " is-active" : ""
              }`}
              style={{ "--swatch-color": color } as CSSProperties}
              aria-label={`Use ${color}`}
              aria-pressed={props.annotationColor === color}
              onClick={() => props.onAnnotationColorChange(color)}
            />
          ))}
        </div>
      </div>
      <div
        className="reader-toolbar-group reader-toolbar-group-mode"
        aria-label="Reading mode"
      >
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`toolbar-mode-button${
              props.mode === option.value ? " is-active" : ""
            }`}
            aria-pressed={props.mode === option.value}
            onClick={() => {
              if (props.mode === option.value) {
                return;
              }
              void props.onModeChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="reader-toolbar-group reader-toolbar-group-fullscreen">
        <ToolbarButton
          disabled={!props.fullscreenAvailable}
          onClick={props.onToggleFullscreen}
        >
          {props.isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </ToolbarButton>
      </div>
    </div>
  );
}

export function ReaderViewportOverlay(props: {
  searchOverlays: ReaderDecorationOverlay[];
  annotationOverlays: AnnotationViewportSnapshot[];
  viewportOffset: {
    x: number;
    y: number;
  };
}): JSX.Element | null {
  const visibleSearchOverlays = props.searchOverlays.filter(
    (overlay) => overlay.visible
  );
  const visibleAnnotationOverlays = props.annotationOverlays.filter(
    (overlay) => overlay.visible
  );

  if (
    visibleSearchOverlays.length === 0 &&
    visibleAnnotationOverlays.length === 0
  ) {
    return null;
  }

  return (
    <div className="reader-viewport-overlay" aria-hidden="true">
      {visibleSearchOverlays.flatMap((overlay) =>
        overlay.rects.map((rect, index) => (
          <OverlayRect
            key={`${overlay.id}-${index}`}
            rect={rect}
            viewportOffset={props.viewportOffset}
            className="reader-viewport-overlay-rect is-search-hit"
            {...(index === 0 ? { label: "Search" } : {})}
          />
        ))
      )}
      {visibleAnnotationOverlays.flatMap((overlay) =>
        overlay.rects.map((rect, index) => (
          <OverlayRect
            key={`${overlay.annotation.id}-${index}`}
            rect={rect}
            viewportOffset={props.viewportOffset}
            className={`reader-viewport-overlay-rect is-annotation${
              overlay.annotation.style === "underline" ? " is-underline" : ""
            }`}
            {...(index === 0
              ? {
                  label:
                    overlay.annotation.style === "underline" ? "Line" : "Note"
                }
              : {})}
          />
        ))
      )}
    </div>
  );
}

export function ReaderSelectionToolbar(props: {
  selection: ReaderTextSelectionSnapshot | null;
  viewportOffset: {
    x: number;
    y: number;
  };
  actions: ReaderSelectionToolbarAction[];
}): JSX.Element | null {
  if (
    !props.selection?.visible ||
    props.selection.rects.length === 0 ||
    props.actions.length === 0
  ) {
    return null;
  }

  const anchor = resolveSelectionToolbarAnchor(
    props.selection.rects,
    props.viewportOffset
  );
  return (
    <div
      className="reader-selection-toolbar"
      style={{
        left: `${anchor.x}px`,
        top: `${anchor.y}px`
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
    >
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`reader-selection-toolbar-button${
            action.tone === "secondary" ? " is-secondary" : ""
          }`}
          disabled={action.disabled}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (action.disabled) {
              return;
            }
            void action.onSelect();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function ReaderDiagnosticsPanel(props: {
  renderBackend: "canvas" | "dom" | null;
  publisherStyles: "enabled" | "disabled";
  locator: Locator | null;
  restoreDiagnostics: LocatorRestoreDiagnostics | null;
  languageContext: ReadingLanguageContext | null;
  navigationContext: ReadingNavigationContext | null;
  spreadContext: ReadingSpreadContext | null;
  diagnostics: RenderDiagnostics | null;
  visibleSectionDiagnostics: VisibleSectionDiagnostics[];
}): JSX.Element {
  return (
    <div
      className="reader-diagnostics"
      data-render-backend={props.renderBackend ?? "none"}
    >
      <div className="reader-diagnostics-header">Debug Panel</div>
      <div className="reader-diagnostics-grid">
        <span>Backend</span>
        <strong>{props.renderBackend ?? "none"}</strong>
        <span>Mode</span>
        <strong>{props.diagnostics?.mode ?? "none"}</strong>
        <span>Publisher CSS</span>
        <strong>
          {props.diagnostics?.publisherStyles ?? props.publisherStyles}
        </strong>
        <span>Rendition</span>
        <strong>{props.diagnostics?.renditionLayout ?? "reflowable"}</strong>
        <span>Language</span>
        <strong>{props.languageContext?.resolvedLanguage ?? "none"}</strong>
        <span>Direction</span>
        <strong>{props.languageContext?.contentDirection ?? "ltr"}</strong>
        <span>RTL</span>
        <strong>
          {props.languageContext?.rtlActive ? "experimental-on" : "off"}
        </strong>
        <span>Page Flow</span>
        <strong>{props.navigationContext?.pageProgression ?? "ltr"}</strong>
        <span>Spread</span>
        <strong>
          {props.spreadContext
            ? `${props.spreadContext.spreadMode} / ${
                props.spreadContext.syntheticSpreadActive
                  ? "synthetic-on"
                  : "single-page"
              }`
            : "auto / single-page"}
        </strong>
        <span>Page Slot</span>
        <strong>
          {props.spreadContext
            ? `${props.spreadContext.pageSpreadPlacement} / ${props.spreadContext.viewportSlotCount}`
            : "center / 1"}
        </strong>
        <span>Nav Keys</span>
        <strong>
          {props.navigationContext
            ? `${props.navigationContext.previousPageKey} / ${props.navigationContext.nextPageKey}`
            : "ArrowLeft / ArrowRight"}
        </strong>
        <span>Locator</span>
        <strong>{formatLocatorSummary(props.locator)}</strong>
        <span>Restore</span>
        <strong>{formatRestoreSummary(props.restoreDiagnostics)}</strong>
        <span>Restore Match</span>
        <strong>{formatRestoreMatch(props.restoreDiagnostics)}</strong>
        <span>Restore Reason</span>
        <strong>{props.restoreDiagnostics?.reason ?? "none"}</strong>
        <span>Score</span>
        <strong>{props.diagnostics?.score ?? 0}</strong>
        <span>Reasons</span>
        <strong>
          {props.diagnostics?.reasons.length
            ? props.diagnostics.reasons.join(", ")
            : "none"}
        </strong>
        <span>Layout</span>
        <strong>{props.diagnostics?.layoutAuthority ?? "none"}</strong>
        <span>Geometry</span>
        <strong>{props.diagnostics?.geometrySource ?? "none"}</strong>
        <span>Interaction</span>
        <strong>{props.diagnostics?.interactionModel ?? "none"}</strong>
        <span>Flow</span>
        <strong>{props.diagnostics?.flowModel ?? "none"}</strong>
        <span>Alignment</span>
        <strong>
          {props.diagnostics
            ? `${props.diagnostics.alignmentTarget ?? "none"} / ${
                props.diagnostics.styleProfile ?? "none"
              }`
            : "none"}
        </strong>
      </div>
      <div className="reader-diagnostics-list">
        {props.visibleSectionDiagnostics.length === 0 ? (
          <p className="reader-diagnostics-empty">No visible sections</p>
        ) : (
          props.visibleSectionDiagnostics.map((diagnostic) => (
            <article
              key={
                diagnostic.sectionId ??
                diagnostic.sectionHref ??
                diagnostic.mode
              }
              className="reader-diagnostics-card"
              data-current={diagnostic.isCurrent ? "true" : "false"}
              data-mode={diagnostic.mode}
            >
              <div className="reader-diagnostics-card-header">
                <strong>
                  {diagnostic.sectionHref ??
                    diagnostic.sectionId ??
                    "Unknown section"}
                </strong>
                <span>{diagnostic.isCurrent ? "Current" : "Visible"}</span>
              </div>
              <div className="reader-diagnostics-card-meta">
                <span>Mode {diagnostic.mode}</span>
                <span>
                  Publisher{" "}
                  {diagnostic.publisherStyles ?? props.publisherStyles}
                </span>
                <span>Score {diagnostic.score}</span>
                <span>{diagnostic.layoutAuthority}</span>
                <span>{diagnostic.flowModel}</span>
              </div>
              <p className="reader-diagnostics-card-reasons">
                {diagnostic.reasons.length
                  ? diagnostic.reasons.join(", ")
                  : "No fallback reasons"}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function formatLocatorSummary(locator: Locator | null): string {
  if (!locator) {
    return "none";
  }

  const parts = [`s${locator.spineIndex + 1}`];
  if (locator.blockId) {
    parts.push(`block:${locator.blockId}`);
  }
  if (locator.anchorId) {
    parts.push(`anchor:${locator.anchorId}`);
  }
  if (typeof locator.progressInSection === "number") {
    parts.push(`progress:${locator.progressInSection.toFixed(3)}`);
  }
  return parts.join(" / ");
}

function formatRestoreSummary(
  diagnostics: LocatorRestoreDiagnostics | null
): string {
  if (!diagnostics) {
    return "none";
  }

  return `${diagnostics.status} / ${diagnostics.requestedPrecision} -> ${
    diagnostics.resolvedPrecision ?? "none"
  }`;
}

function formatRestoreMatch(
  diagnostics: LocatorRestoreDiagnostics | null
): string {
  if (!diagnostics) {
    return "none / fallback:no";
  }

  return `${diagnostics.matchedBy ?? "none"} / fallback:${diagnostics.fallbackApplied ? "yes" : "no"}`;
}

export function CustomSelect(props: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void | Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const selected =
    props.options.find((option) => option.value === props.value) ??
    props.options[0];

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className={`custom-select${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? ""}</span>
        <span className="custom-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div id={listboxId} role="listbox" className="custom-select-menu">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === props.value}
              className={`custom-select-option${
                option.value === props.value ? " is-selected" : ""
              }`}
              onClick={() => {
                setOpen(false);
                void props.onChange(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function toggleId(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

function ToolbarButton(props: {
  children: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}): JSX.Element {
  return (
    <button
      type="button"
      className="toolbar-button"
      disabled={props.disabled}
      onClick={() => {
        if (props.disabled) {
          return;
        }
        void props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

function OverlayRect(props: {
  rect: Rect;
  viewportOffset: {
    x: number;
    y: number;
  };
  className: string;
  label?: string;
}): JSX.Element {
  return (
    <span
      className={props.className}
      style={
        {
          width: `${props.rect.width}px`,
          height: `${props.rect.height}px`,
          "--overlay-height": `${props.rect.height}px`,
          transform: `translate(${props.rect.x - props.viewportOffset.x}px, ${
            props.rect.y - props.viewportOffset.y
          }px)`
        } as CSSProperties
      }
      data-label={props.label}
    />
  );
}

function resolveSelectionToolbarAnchor(
  rects: Rect[],
  viewportOffset: {
    x: number;
    y: number;
  }
): {
  x: number;
  y: number;
} {
  const bounds = rects.reduce(
    (accumulator, rect) => ({
      left: Math.min(accumulator.left, rect.x),
      top: Math.min(accumulator.top, rect.y),
      right: Math.max(accumulator.right, rect.x + rect.width),
      bottom: Math.max(accumulator.bottom, rect.y + rect.height)
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  );

  const centerX = (bounds.left + bounds.right) / 2 - viewportOffset.x;
  const top = bounds.top - viewportOffset.y;
  return {
    x: centerX,
    y: Math.max(12, top - 18)
  };
}

function TocTree(props: {
  items: TocItem[];
  activeId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void | Promise<void>;
}): JSX.Element {
  return (
    <ul className="toc-tree">
      {props.items.map((item) => (
        <li key={item.id} className="toc-item">
          <div className="toc-row">
            {item.children.length > 0 ? (
              <button
                type="button"
                className={`toc-disclosure${props.expandedIds.has(item.id) ? " is-open" : ""}`}
                aria-label={
                  props.expandedIds.has(item.id)
                    ? "Collapse section"
                    : "Expand section"
                }
                onClick={() => props.onToggle(item.id)}
              >
                ▸
              </button>
            ) : (
              <span className="toc-bullet" aria-hidden="true">
                •
              </span>
            )}
            <button
              type="button"
              className={`toc-link${props.activeId === item.id ? " is-active" : ""}`}
              onClick={() => {
                void props.onSelect(item.id);
              }}
            >
              {item.label}
            </button>
          </div>
          {item.children.length > 0 && props.expandedIds.has(item.id) ? (
            <div className="toc-children">
              <TocTree
                items={item.children}
                activeId={props.activeId}
                expandedIds={props.expandedIds}
                onToggle={props.onToggle}
                onSelect={props.onSelect}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
