import type { Decoration } from "../model/types";
import { mapDomTextRangeToViewport } from "./dom-viewport-mapper";
import { findRenderedAnchorTarget } from "./navigation-target";
import { toTransparentHighlightColor } from "./reader-domain";

const DECORATION_STYLE_TAG_SELECTOR = "style[data-epub-dom-decorations='true']";
const DECORATION_OVERLAY_LAYER_SELECTOR =
  "[data-epub-dom-decoration-layer='true']";
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
