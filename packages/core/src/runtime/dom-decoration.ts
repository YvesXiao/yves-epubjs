import type { Decoration, ReadingMode, Rect } from "../model/types";
import { mapDomTextRangeToViewport } from "./dom-viewport-mapper";
import { findRenderedAnchorTarget } from "./navigation-target";
import { toTransparentHighlightColor } from "./reader-domain";

const DECORATION_STYLE_TAG_SELECTOR = "style[data-epub-dom-decorations='true']";
const DECORATION_OVERLAY_LAYER_SELECTOR =
  "[data-epub-dom-decoration-layer='true']";
const DECORATION_DATA_SELECTOR = "[data-epub-decoration-id]";
const DECORATION_UNDERLINE_HIT_TOLERANCE_X = 4;
const DECORATION_UNDERLINE_HIT_TOLERANCE_Y = 10;
const DECORATION_CLASSES = [
  "epub-dom-decoration-highlight",
  "epub-dom-decoration-underline",
  "epub-dom-decoration-search-hit",
  "epub-dom-decoration-active",
  "epub-dom-decoration-hint-margin-marker",
  "epub-dom-decoration-hint-note-icon"
] as const;

export function applyDomDecorations(input: {
  container: HTMLElement;
  sectionElement: HTMLElement;
  mode?: "scroll" | "paginated";
  decorations: Decoration[];
}): void {
  clearDomDecorations(input.container, input.sectionElement);
  if (input.decorations.length === 0) {
    return;
  }

  ensureDomDecorationStyleTag(input.container);
  for (const decoration of input.decorations) {
    if (
      (decoration.style === "highlight" || decoration.style === "underline") &&
      decoration.extras?.textRange
    ) {
      const rendered = renderPreciseTextRangeDecoration(
        input.container,
        input.sectionElement,
        input.mode ?? "paginated",
        decoration
      );
      if (rendered) {
        continue;
      }
    }

    const target = resolveDomDecorationTarget(input.sectionElement, decoration);
    bindDomDecorationMetadata(target, decoration);
    target.classList.add(toDomDecorationClass(decoration.style));
    const hintClass = toDomDecorationHintClass(decoration);
    if (hintClass) {
      target.classList.add(hintClass);
    }
    if (decoration.extras?.label) {
      target.dataset.epubDecorationLabel = decoration.extras.label;
    }
    applyDomDecorationColor(target, decoration);
  }
}

export function clearDomDecorations(
  container: HTMLElement,
  sectionElement?: HTMLElement
): void {
  const scope = sectionElement ?? container;
  scope
    .querySelectorAll<HTMLElement>(DECORATION_OVERLAY_LAYER_SELECTOR)
    .forEach((element) => element.remove());
  for (const className of DECORATION_CLASSES) {
    scope
      .querySelectorAll<HTMLElement>(`.${className}`)
      .forEach((element) => element.classList.remove(className));
  }
  scope
    .querySelectorAll<HTMLElement>("[data-epub-decoration-label]")
    .forEach((element) => delete element.dataset.epubDecorationLabel);
  scope
    .querySelectorAll<HTMLElement>("[data-epub-decoration-color]")
    .forEach((element) => {
      delete element.dataset.epubDecorationColor;
      element.style.removeProperty("--epub-decoration-color");
      element.style.removeProperty("--epub-decoration-highlight-color");
    });
  scope
    .querySelectorAll<HTMLElement>(DECORATION_DATA_SELECTOR)
    .forEach((element) => {
      delete element.dataset.epubDecorationId;
      delete element.dataset.epubDecorationGroup;
      delete element.dataset.epubDecorationStyle;
    });
}

export function getDomDecorationViewportRects(input: {
  container: HTMLElement;
  sectionElement: HTMLElement;
  mode: ReadingMode;
  decorationId: string;
  point?: RectPoint;
}): Rect[] {
  const selector = `[data-epub-decoration-id="${escapeAttributeSelectorValue(
    input.decorationId
  )}"]`;
  const elements = Array.from(
    input.sectionElement.querySelectorAll<HTMLElement>(selector)
  );

  return elements
    .map((element) => {
      const rect = measureDecorationElementRect({
        container: input.container,
        element,
        mode: input.mode
      });
      if (!input.point) {
        return rect;
      }
      return pointHitsDecorationRect({
        element,
        point: input.point,
        rect
      })
        ? rect
        : null;
    })
    .filter((rect): rect is Rect => Boolean(rect));
}

function ensureDomDecorationStyleTag(container: HTMLElement): void {
  if (container.querySelector(DECORATION_STYLE_TAG_SELECTOR)) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.epubDomDecorations = "true";
  style.textContent = `
    .epub-dom-section {
      position: relative;
    }
    .epub-dom-decoration-overlay-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 8;
    }
    .epub-dom-decoration-overlay-rect {
      position: absolute;
      border-radius: 0.18em;
      background: rgba(59, 130, 246, 0.22);
      pointer-events: none;
    }
    .epub-dom-decoration-overlay-rect.is-underline {
      border-radius: 999px;
      height: 2px;
      background: var(--epub-decoration-color, rgba(37, 99, 235, 0.8));
    }
    .epub-dom-decoration-highlight {
      background: var(--epub-decoration-highlight-color, rgba(59, 130, 246, 0.14));
      border-radius: 0.2em;
    }
    .epub-dom-decoration-search-hit {
      background: rgba(245, 158, 11, 0.18);
      border-radius: 0.2em;
    }
    .epub-dom-decoration-underline {
      text-decoration: underline;
      text-decoration-thickness: 0.12em;
      text-decoration-color: var(--epub-decoration-color, rgba(37, 99, 235, 0.8));
      text-underline-offset: 0.16em;
    }
    .epub-dom-decoration-active {
      outline: 2px solid rgba(245, 158, 11, 0.45);
      outline-offset: 2px;
      background: rgba(245, 158, 11, 0.08);
      border-radius: 0.25em;
    }
    .epub-dom-decoration-hint-margin-marker {
      box-shadow: inset 4px 0 0 rgba(37, 99, 235, 0.42);
    }
    .epub-dom-decoration-hint-note-icon {
      outline: 1px dashed rgba(37, 99, 235, 0.35);
      outline-offset: 3px;
    }
  `;
  container.prepend(style);
}

function resolveDomDecorationTarget(
  sectionElement: HTMLElement,
  decoration: Decoration
): HTMLElement {
  if (decoration.locator.anchorId) {
    const anchorTarget = findRenderedAnchorTarget(
      sectionElement,
      decoration.locator.anchorId
    );
    if (anchorTarget) {
      return anchorTarget;
    }
  }

  if (decoration.locator.blockId) {
    const blockTarget = findBlockElement(
      sectionElement,
      decoration.locator.blockId
    );
    if (blockTarget) {
      return blockTarget;
    }
  }

  return sectionElement;
}

function renderPreciseTextRangeDecoration(
  container: HTMLElement,
  sectionElement: HTMLElement,
  mode: "scroll" | "paginated",
  decoration: Decoration
): boolean {
  const textRange = decoration.extras?.textRange;
  if (!textRange) {
    return false;
  }

  const rects = mapDomTextRangeToViewport({
    container,
    mode,
    sectionElement,
    textRange
  });
  if (rects.length === 0) {
    return false;
  }

  const layer = ensureDomDecorationOverlayLayer(sectionElement);
  for (const rect of rects) {
    const overlay = document.createElement("span");
    overlay.className = "epub-dom-decoration-overlay-rect";
    bindDomDecorationMetadata(overlay, decoration);
    if (decoration.style === "underline") {
      overlay.classList.add("is-underline");
    }
    const sectionRect = sectionElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const localX =
      rect.x - container.scrollLeft - (sectionRect.left - containerRect.left);
    const localY =
      rect.y - container.scrollTop - (sectionRect.top - containerRect.top);
    overlay.style.left = `${localX}px`;
    overlay.style.top = `${
      decoration.style === "underline"
        ? localY + Math.max(1, rect.height - 3)
        : localY
    }px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${decoration.style === "underline" ? 2 : rect.height}px`;
    overlay.style.background =
      decoration.style === "underline"
        ? decoration.color?.trim() || "rgba(37, 99, 235, 0.8)"
        : toTransparentHighlightColor(decoration.color);
    layer.appendChild(overlay);
  }
  return true;
}

function bindDomDecorationMetadata(
  element: HTMLElement,
  decoration: Decoration
): void {
  element.dataset.epubDecorationId = decoration.id;
  element.dataset.epubDecorationGroup = decoration.group;
  element.dataset.epubDecorationStyle = decoration.style;
}

type RectPoint = {
  x: number;
  y: number;
};

function measureDecorationElementRect(input: {
  container: HTMLElement;
  element: HTMLElement;
  mode: ReadingMode;
}): Rect {
  const containerRect = input.container.getBoundingClientRect();
  const elementRect = input.element.getBoundingClientRect();

  return {
    x: elementRect.left - containerRect.left + input.container.scrollLeft,
    y:
      input.mode === "scroll"
        ? elementRect.top - containerRect.top + input.container.scrollTop
        : elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height
  };
}

function pointHitsDecorationRect(input: {
  element: HTMLElement;
  point: RectPoint;
  rect: Rect;
}): boolean {
  const isUnderline =
    input.element.dataset.epubDecorationStyle === "underline" ||
    input.element.classList.contains("is-underline");
  const toleranceX = isUnderline ? DECORATION_UNDERLINE_HIT_TOLERANCE_X : 0;
  const toleranceY = isUnderline ? DECORATION_UNDERLINE_HIT_TOLERANCE_Y : 0;

  return (
    input.point.x >= input.rect.x - toleranceX &&
    input.point.x <= input.rect.x + input.rect.width + toleranceX &&
    input.point.y >= input.rect.y - toleranceY &&
    input.point.y <= input.rect.y + input.rect.height + toleranceY
  );
}

function applyDomDecorationColor(
  target: HTMLElement,
  decoration: Decoration
): void {
  const color = decoration.color?.trim();
  if (!color) {
    return;
  }

  target.dataset.epubDecorationColor = color;
  target.style.setProperty("--epub-decoration-color", color);
  if (decoration.style === "highlight") {
    target.style.setProperty(
      "--epub-decoration-highlight-color",
      toTransparentHighlightColor(color)
    );
  }
}

function ensureDomDecorationOverlayLayer(
  sectionElement: HTMLElement
): HTMLElement {
  const existing = sectionElement.querySelector<HTMLElement>(
    DECORATION_OVERLAY_LAYER_SELECTOR
  );
  if (existing) {
    return existing;
  }

  const layer = document.createElement("div");
  layer.className = "epub-dom-decoration-overlay-layer";
  layer.dataset.epubDomDecorationLayer = "true";
  sectionElement.prepend(layer);
  return layer;
}

function findBlockElement(
  sectionElement: HTMLElement,
  blockId: string
): HTMLElement | null {
  const selectorValue = escapeAttributeSelectorValue(blockId);
  return (
    sectionElement.querySelector<HTMLElement>(`[id="${selectorValue}"]`) ??
    sectionElement.querySelector<HTMLElement>(
      `[data-reader-block-id="${selectorValue}"]`
    )
  );
}

function toDomDecorationClass(
  style: Decoration["style"]
): (typeof DECORATION_CLASSES)[number] {
  switch (style) {
    case "highlight":
      return "epub-dom-decoration-highlight";
    case "underline":
      return "epub-dom-decoration-underline";
    case "search-hit":
      return "epub-dom-decoration-search-hit";
    case "active":
      return "epub-dom-decoration-active";
  }
}

function toDomDecorationHintClass(
  decoration: Decoration
):
  | "epub-dom-decoration-hint-margin-marker"
  | "epub-dom-decoration-hint-note-icon"
  | null {
  switch (decoration.extras?.renderHint) {
    case "margin-marker":
      return "epub-dom-decoration-hint-margin-marker";
    case "note-icon":
      return "epub-dom-decoration-hint-note-icon";
    default:
      return null;
  }
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
