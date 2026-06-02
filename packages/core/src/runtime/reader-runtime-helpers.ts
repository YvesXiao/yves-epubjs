import type {
  ReadingMode,
  ReaderPreferences,
  Rect,
  SectionDocument,
  Theme,
  TypographyOptions,
  VisibleDrawBounds
} from "../model/types";
import { extractBlockText as collectBlockText } from "../utils/block-text";
import { collectSelectableBlocksInReadingOrder } from "./reader-block-tree";
export function cloneReaderPreferences(
  preferences: ReaderPreferences
): ReaderPreferences {
  return {
    ...(preferences.mode ? { mode: preferences.mode } : {}),
    ...(preferences.publisherStyles
      ? { publisherStyles: preferences.publisherStyles }
      : {}),
    ...(preferences.publisherColorOverride
      ? { publisherColorOverride: preferences.publisherColorOverride }
      : {}),
    ...(preferences.experimentalRtl !== undefined
      ? { experimentalRtl: preferences.experimentalRtl }
      : {}),
    ...(preferences.spreadMode ? { spreadMode: preferences.spreadMode } : {}),
    ...(preferences.theme ? { theme: { ...preferences.theme } } : {}),
    ...(preferences.typography
      ? { typography: { ...preferences.typography } }
      : {})
  };
}

export function themesEqual(left: Theme, right: Theme): boolean {
  return left.background === right.background && left.color === right.color;
}

export function typographyEqual(
  left: TypographyOptions,
  right: TypographyOptions
): boolean {
  return (
    left.fontSize === right.fontSize &&
    left.lineHeight === right.lineHeight &&
    left.paragraphSpacing === right.paragraphSpacing &&
    left.fontFamily === right.fontFamily &&
    left.letterSpacing === right.letterSpacing &&
    left.wordSpacing === right.wordSpacing
  );
}

export function resolveDomTextOffsetWithinBlock(
  blockElement: HTMLElement,
  node: Node | null,
  offset: number
): number {
  const safeOffset = Math.max(0, Math.trunc(offset));
  const textNodes = collectTextNodes(blockElement);
  if (textNodes.length === 0) {
    return safeOffset;
  }

  let cursor = 0;
  for (const textNode of textNodes) {
    const length = textNode.textContent?.length ?? 0;
    if (textNode === node) {
      return cursor + Math.min(length, safeOffset);
    }
    cursor += length;
  }

  const ownerTextNode =
    node?.nodeType === Node.TEXT_NODE ? node : node?.firstChild;
  if (ownerTextNode && ownerTextNode.nodeType === Node.TEXT_NODE) {
    const matchingIndex = textNodes.indexOf(ownerTextNode as Text);
    if (matchingIndex >= 0) {
      const priorLength = textNodes
        .slice(0, matchingIndex)
        .reduce(
          (total, textNode) => total + (textNode.textContent?.length ?? 0),
          0
        );
      const localLength = ownerTextNode.textContent?.length ?? 0;
      return priorLength + Math.min(localLength, safeOffset);
    }
  }

  return Math.min(cursor, safeOffset);
}

export function collectTextNodes(root: Node): Text[] {
  if (typeof document === "undefined") {
    return [];
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }
  return textNodes;
}

export function getScopedTextSelectionRecord(scope: Node): {
  selection: Selection;
  range: Range | null;
  text: string;
  startNode: Node | null;
  endNode: Node | null;
} | null {
  if (
    typeof window === "undefined" ||
    typeof window.getSelection !== "function"
  ) {
    return null;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!selection || !text) {
    return null;
  }

  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const startNode = range?.startContainer ?? selection.anchorNode;
  const endNode = range?.endContainer ?? selection.focusNode;
  if (
    !(
      (startNode && scope.contains(startNode)) ||
      (endNode && scope.contains(endNode))
    )
  ) {
    return null;
  }

  return {
    selection,
    range,
    text,
    startNode: startNode ?? null,
    endNode: endNode ?? null
  };
}

export function measureSelectionRectsWithinContainer(input: {
  container: HTMLElement;
  selection: Selection;
  fallbackElement?: HTMLElement | null;
  mode: ReadingMode;
}): VisibleDrawBounds {
  const selectionRange =
    input.selection.rangeCount > 0 ? input.selection.getRangeAt(0) : null;
  const rangeRects =
    selectionRange && typeof selectionRange.getClientRects === "function"
      ? Array.from(selectionRange.getClientRects())
      : [];
  const rects = rangeRects
    .map((rect) =>
      projectClientRectIntoContainer(rect, input.container, input.mode)
    )
    .filter((rect): rect is Rect => Boolean(rect));

  if (rects.length > 0) {
    return rects;
  }

  if (!input.fallbackElement) {
    return [];
  }

  const fallbackRect = projectClientRectIntoContainer(
    input.fallbackElement.getBoundingClientRect(),
    input.container,
    input.mode
  );
  return fallbackRect ? [fallbackRect] : [];
}

export function projectClientRectIntoContainer(
  rect: DOMRect | DOMRectReadOnly,
  container: HTMLElement,
  mode: ReadingMode
): Rect | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left + container.scrollLeft,
    y:
      mode === "scroll"
        ? rect.top - containerRect.top + container.scrollTop
        : rect.top - containerRect.top,
    width: rect.width,
    height: rect.height
  };
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 1));
}

export function readTranslateY(element: HTMLElement): number {
  const transform =
    element.style.transform ||
    (typeof window !== "undefined"
      ? window.getComputedStyle(element).transform
      : "");
  if (!transform || transform === "none") {
    return 0;
  }

  const translateMatch = transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
  if (translateMatch?.[1]) {
    return Number.parseFloat(translateMatch[1]);
  }

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch?.[1]) {
    const parts = matrixMatch[1]
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    return parts[5] ?? 0;
  }

  const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
  if (matrix3dMatch?.[1]) {
    const parts = matrix3dMatch[1]
      .split(",")
      .map((part) => Number.parseFloat(part.trim()));
    return parts[13] ?? 0;
  }

  return 0;
}

export function isRenderedDomSectionElement(element: HTMLElement): boolean {
  return (
    element.matches(".epub-dom-section") ||
    Boolean(element.querySelector(".epub-dom-section"))
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']")
  );
}

export function annotateDomSectionWithBlockIds(
  section: SectionDocument,
  sectionElement: HTMLElement
): void {
  for (const element of sectionElement.querySelectorAll<HTMLElement>(
    "[data-reader-block-id]"
  )) {
    delete element.dataset.readerBlockId;
  }

  const elements = collectDomReadableBlockElements(sectionElement);
  const blocks = collectSelectableBlocksInReadingOrder(section.blocks).map(
    (block) => ({
      id: block.id,
      text: normalizeBlockMatchText(collectBlockText(block))
    })
  );

  let searchStartIndex = 0;
  for (const element of elements) {
    if (element.id.trim()) {
      element.dataset.readerBlockId = element.id.trim();
      continue;
    }

    const elementText = normalizeBlockMatchText(element.textContent ?? "");
    if (!elementText) {
      continue;
    }

    const matchIndex = findMatchingSelectableBlockIndex(
      blocks,
      elementText,
      searchStartIndex
    );
    if (matchIndex < 0) {
      continue;
    }

    element.dataset.readerBlockId = blocks[matchIndex]!.id;
    searchStartIndex = matchIndex + 1;
  }
}

export function collectDomReadableBlockElements(
  sectionElement: HTMLElement
): HTMLElement[] {
  return Array.from(
    sectionElement.querySelectorAll<HTMLElement>(
      "p, li, pre, h1, h2, h3, h4, h5, h6, td, th, dt, dd, figcaption"
    )
  );
}

export function resolveSectionAnchorIdForElement(
  section: SectionDocument,
  element: HTMLElement
): string | undefined {
  const elementId = element.id.trim();
  if (elementId && section.anchors[elementId]) {
    return elementId;
  }

  const namedAnchor = element.getAttribute("name")?.trim();
  if (namedAnchor && section.anchors[namedAnchor]) {
    return namedAnchor;
  }

  if (elementId) {
    const resolvedAnchor = Object.entries(section.anchors).find(
      ([, blockId]) => blockId === elementId
    )?.[0];
    if (resolvedAnchor) {
      return resolvedAnchor;
    }
  }

  return undefined;
}

export function normalizeBlockMatchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function findMatchingSelectableBlockIndex(
  blocks: Array<{ id: string; text: string }>,
  elementText: string,
  searchStartIndex: number
): number {
  for (let index = searchStartIndex; index < blocks.length; index += 1) {
    const candidate = blocks[index];
    if (!candidate?.text) {
      continue;
    }

    if (candidate.text === elementText) {
      return index;
    }

    const shortestLength = Math.min(candidate.text.length, elementText.length);
    if (
      shortestLength >= 12 &&
      (candidate.text.includes(elementText) ||
        elementText.includes(candidate.text))
    ) {
      return index;
    }
  }

  return -1;
}
