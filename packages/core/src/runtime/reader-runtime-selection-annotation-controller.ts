import { buildReadingStyleProfile } from "../renderer/reading-style-profile";
import type {
  Annotation,
  AnnotationActivatedEvent,
  AnnotationViewportSnapshot,
  Locator,
  Point,
  ReaderEventMap,
  ReaderSelectionHighlightState,
  ReaderTextSelectionSnapshot,
  SectionDocument,
  TextRangeSelector,
  VisibleDrawBounds
} from "../model/types";
import { extractBlockText as collectBlockText } from "../utils/block-text";
import {
  type ResolvedAnnotationActivation,
  type ResolvedAnnotationRange
} from "./reader-annotation-service";
import { resolveCanvasTextPosition } from "./canvas-text-locator";
import { createBlockLocator } from "./navigation-target";
import { normalizeLocator, restoreLocatorWithDiagnostics } from "./locator";
import {
  createAnnotation as createReaderAnnotation,
  mapAnnotationsToDecorations
} from "./annotation";
import {
  collectBlockIdsInReadingOrder,
  normalizeTextRangeSelector,
  toTransparentHighlightColor
} from "./reader-domain";
import { findBlockById, resolveRenderableBlockId } from "./reader-block-tree";
import {
  cloneReaderTextSelectionSnapshot,
  flattenTextRange,
  inflateFlattenedTextRange,
  resolveLeadingSelectionTarget,
  subtractFlattenedRange,
  type SectionTextRangeContext
} from "./reader-selection";
import * as readerRuntimeHelpers from "./reader-runtime-helpers";
import type {
  ReaderRuntimeHost,
  ReaderTextSelection
} from "./reader-runtime-controller";
export class ReaderRuntimeSelectionAnnotationController {
  constructor(private readonly reader: ReaderRuntimeHost) {}

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
    if (!this.reader.book) {
      return null;
    }

    const publicationId = this.reader.getPublicationId();
    const locator = input.locator ?? this.reader.getCurrentLocation();
    if (!publicationId || !locator) {
      return null;
    }
    const quote =
      input.quote ??
      (input.textRange
        ? this.reader.resolveAnnotationTextRangeQuote(locator, input.textRange)
        : this.reader.resolveAnnotationQuote(locator));

    return createReaderAnnotation({
      publicationId,
      locator,
      book: this.reader.book,
      ...(input.textRange ? { textRange: input.textRange } : {}),
      ...(quote ? { quote } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.style ? { style: input.style } : {}),
      ...(input.color ? { color: input.color } : {})
    });
  }

  createAnnotationFromSelection(
    input: {
      note?: string;
      style?: "highlight" | "underline";
      color?: string;
    } = {}
  ): Annotation | null {
    const selection = this.reader.getCurrentTextSelectionSnapshot();
    if (!selection) {
      return null;
    }

    return this.reader.createAnnotation({
      locator: selection.locator,
      quote: selection.text,
      ...(selection.textRange ? { textRange: selection.textRange } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.style ? { style: input.style } : {}),
      ...(input.color ? { color: input.color } : {})
    });
  }

  getCurrentTextSelection(): ReaderTextSelection | null {
    const selection = this.reader.getCurrentTextSelectionSnapshot();
    if (!selection) {
      return null;
    }

    return {
      text: selection.text,
      locator: { ...selection.locator },
      sectionId: selection.sectionId,
      ...(selection.blockId ? { blockId: selection.blockId } : {})
    };
  }

  getCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    const selection = this.reader.resolveCurrentTextSelectionSnapshot();
    this.reader.updateTextSelectionSnapshot(selection);
    return cloneReaderTextSelectionSnapshot(selection);
  }

  getCurrentSelectionHighlightState(): ReaderSelectionHighlightState | null {
    const selection = this.reader.getCurrentTextSelectionSnapshot();
    if (!selection) {
      return null;
    }

    return this.reader.resolveSelectionHighlightState(selection);
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
    if (!this.reader.book) {
      return null;
    }

    const selection = this.reader.getCurrentTextSelectionSnapshot();
    if (!selection) {
      return null;
    }

    const state = this.reader.resolveSelectionHighlightState(selection);
    if (!selection.textRange) {
      if (state.mode !== "highlight") {
        return {
          mode: state.mode,
          changedCount: 0
        };
      }

      const annotation = this.reader.createAnnotation({
        locator: selection.locator,
        quote: selection.text,
        ...(input.note ? { note: input.note } : {}),
        ...(input.style ? { style: input.style } : {}),
        ...(input.color ? { color: input.color } : {})
      });
      if (!annotation) {
        return {
          mode: state.mode,
          changedCount: 0
        };
      }

      this.reader.addAnnotation(annotation);
      return {
        mode: state.mode,
        changedCount: 1
      };
    }

    const section = this.reader.book.sections[selection.locator.spineIndex];
    if (!section) {
      return null;
    }

    const context = this.reader.createSectionTextRangeContext(section);
    const selectionRange = this.reader.normalizeTextRangeForSection(
      selection.locator.spineIndex,
      selection.textRange
    );
    if (!selectionRange) {
      return null;
    }

    if (state.mode === "remove-highlight") {
      const matchingAnnotations = this.reader.resolveAnnotationRangesForSection(
        selection.locator.spineIndex
      );
      const nextAnnotations: Annotation[] = [];
      let changedCount = 0;

      for (const annotation of this.reader.annotations) {
        const resolved = matchingAnnotations.find(
          (entry) => entry.annotation.id === annotation.id
        );
        if (!resolved) {
          nextAnnotations.push(annotation);
          continue;
        }

        const flattenedAnnotation = flattenTextRange(resolved.range, context);
        const flattenedSelection = flattenTextRange(selectionRange, context);
        if (!flattenedAnnotation || !flattenedSelection) {
          nextAnnotations.push(annotation);
          continue;
        }

        const remaining = subtractFlattenedRange(
          flattenedAnnotation,
          flattenedSelection
        );
        if (
          remaining.length === 1 &&
          remaining[0]!.start === flattenedAnnotation.start &&
          remaining[0]!.end === flattenedAnnotation.end
        ) {
          nextAnnotations.push(annotation);
          continue;
        }

        changedCount += 1;
        for (const piece of remaining) {
          const range = inflateFlattenedTextRange(piece, context);
          if (!range) {
            continue;
          }

          const rebuilt = this.reader.createAnnotationForResolvedRange({
            annotation,
            locator: resolved.locator,
            range,
            section,
            ...(annotation.style ? { style: annotation.style } : {}),
            ...(annotation.color ? { color: annotation.color } : {}),
            ...(annotation.note ? { note: annotation.note } : {})
          });
          if (rebuilt) {
            nextAnnotations.push(rebuilt);
          }
        }
      }

      this.reader.setAnnotations(nextAnnotations);
      return {
        mode: state.mode,
        changedCount
      };
    }

    const flattenedSelection = flattenTextRange(selectionRange, context);
    if (!flattenedSelection) {
      return null;
    }

    let remainingRanges = [flattenedSelection];
    for (const resolved of this.reader.resolveAnnotationRangesForSection(
      selection.locator.spineIndex
    )) {
      const flattened = flattenTextRange(resolved.range, context);
      if (!flattened) {
        continue;
      }

      remainingRanges = remainingRanges.flatMap((range) =>
        subtractFlattenedRange(range, flattened)
      );
      if (remainingRanges.length === 0) {
        break;
      }
    }

    const addedAnnotations = remainingRanges
      .map((range) => inflateFlattenedTextRange(range, context))
      .flatMap((range) => {
        if (!range) {
          return [];
        }

        const annotation = this.reader.createAnnotationForResolvedRange({
          locator: selection.locator,
          range,
          section,
          ...(input.style ? { style: input.style } : {}),
          ...(input.color ? { color: input.color } : {}),
          ...(input.note ? { note: input.note } : {})
        });
        return annotation ? [annotation] : [];
      });

    for (const annotation of addedAnnotations) {
      this.reader.addAnnotation(annotation);
    }

    return {
      mode: state.mode,
      changedCount: addedAnnotations.length
    };
  }

  clearCurrentTextSelection(): void {
    if (
      typeof window !== "undefined" &&
      typeof window.getSelection === "function"
    ) {
      window.getSelection()?.removeAllRanges();
    }
    this.reader.setPinnedTextSelectionSnapshot(null);
  }

  addAnnotation(annotation: Annotation): void {
    const publicationId = this.reader.getPublicationId();
    if (!publicationId || annotation.publicationId !== publicationId) {
      return;
    }

    this.reader.annotationSession.append(annotation);
    this.reader.syncAnnotationDecorations();
  }

  setAnnotations(annotations: Annotation[]): void {
    const publicationId = this.reader.getPublicationId();
    this.reader.annotations = publicationId
      ? annotations.filter(
          (annotation) => annotation.publicationId === publicationId
        )
      : [];
    this.reader.syncAnnotationDecorations();
  }

  getAnnotations(): Annotation[] {
    return this.reader.annotations.map((annotation) => ({
      ...annotation,
      locator: { ...annotation.locator }
    }));
  }

  getAnnotationViewportSnapshots(): AnnotationViewportSnapshot[] {
    const book = this.reader.book;
    if (!book) {
      return [];
    }

    return this.reader.annotations.map((annotation) => {
      const restored = restoreLocatorWithDiagnostics({
        book,
        locator: annotation.locator
      }).locator;
      const rects = restored
        ? this.reader.resolveAnnotationViewportRects(annotation, restored)
        : [];

      return {
        annotation: {
          ...annotation,
          locator: { ...annotation.locator }
        },
        resolvedLocator: restored ? { ...restored } : null,
        rects,
        visible: rects.length > 0
      };
    });
  }

  clearAnnotations(): void {
    this.reader.annotations = [];
    this.reader.syncAnnotationDecorations();
  }

  syncDerivedDecorationGroups(): void {
    if (!this.reader.locator || !this.reader.debugMode) {
      this.reader.decorationManager.clearDerivedGroup("current-location");
    } else {
      this.reader.decorationManager.setDerivedGroup("current-location", [
        {
          id: "current-location:active",
          group: "current-location",
          locator: this.reader.locator,
          style: "active"
        }
      ]);
    }
  }

  getHighlightedCanvasBlockIdsForSection(sectionIndex: number): Set<string> {
    if (!this.reader.book) {
      return new Set();
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return new Set();
    }

    return new Set(
      this.reader.decorationManager
        .getForSpineIndex(sectionIndex)
        .filter(
          (decoration) =>
            (decoration.style === "highlight" ||
              decoration.style === "search-hit") &&
            !decoration.extras?.textRange
        )
        .map((decoration) =>
          decoration.locator.blockId
            ? (resolveRenderableBlockId(
                section.blocks,
                decoration.locator.blockId
              ) ?? decoration.locator.blockId)
            : undefined
        )
        .filter((blockId): blockId is string => Boolean(blockId))
    );
  }

  getHighlightedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    if (!this.reader.book) {
      return new Map();
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return new Map();
    }

    const rangesByBlock = new Map<
      string,
      Array<{ start: number; end: number; color: string }>
    >();
    const defaultColor = toTransparentHighlightColor(
      buildReadingStyleProfile({
        theme: this.reader.theme,
        typography: this.reader.typography
      }).highlight.mark
    );

    for (const decoration of this.reader.decorationManager.getForSpineIndex(
      sectionIndex
    )) {
      const textRange = decoration.extras?.textRange;
      if (decoration.style !== "highlight" || !textRange) {
        continue;
      }

      const normalizedRange = normalizeTextRangeSelector(textRange);
      const blockIds = collectBlockIdsInReadingOrder(section.blocks);
      const startIndex = blockIds.indexOf(normalizedRange.start.blockId);
      const endIndex = blockIds.indexOf(normalizedRange.end.blockId);
      if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
        continue;
      }

      for (
        let blockIndex = startIndex;
        blockIndex <= endIndex;
        blockIndex += 1
      ) {
        const blockId = blockIds[blockIndex];
        if (!blockId) {
          continue;
        }

        const renderableBlockId = resolveRenderableBlockId(
          section.blocks,
          blockId
        );
        if (!renderableBlockId || renderableBlockId !== blockId) {
          continue;
        }

        const block = findBlockById(section.blocks, blockId);
        const blockTextLength = block
          ? Array.from(this.reader.extractBlockText(block)).length
          : 0;
        const start =
          blockId === normalizedRange.start.blockId
            ? Math.max(
                0,
                Math.min(blockTextLength, normalizedRange.start.inlineOffset)
              )
            : 0;
        const end =
          blockId === normalizedRange.end.blockId
            ? Math.max(
                start,
                Math.min(blockTextLength, normalizedRange.end.inlineOffset)
              )
            : blockTextLength;
        if (end <= start) {
          continue;
        }

        const entry = rangesByBlock.get(blockId) ?? [];
        entry.push({
          start,
          end,
          color: toTransparentHighlightColor(decoration.color ?? defaultColor)
        });
        rangesByBlock.set(blockId, entry);
      }
    }

    return rangesByBlock;
  }

  getActiveCanvasBlockIdForSection(sectionIndex: number): string | undefined {
    if (!this.reader.book) {
      return undefined;
    }

    const section = this.reader.book.sections[sectionIndex];
    const locator =
      this.reader.decorationManager.getFirstLocatorForStyle("active");
    if (
      !section ||
      !locator ||
      locator.spineIndex !== sectionIndex ||
      !locator.blockId
    ) {
      return undefined;
    }

    return (
      resolveRenderableBlockId(section.blocks, locator.blockId) ??
      locator.blockId
    );
  }

  getUnderlinedCanvasBlockIdsForSection(sectionIndex: number): Set<string> {
    if (!this.reader.book) {
      return new Set();
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return new Set();
    }

    return new Set(
      this.reader.decorationManager
        .getForSpineIndex(sectionIndex)
        .filter((decoration) => decoration.style === "underline")
        .filter((decoration) => !decoration.extras?.textRange)
        .map((decoration) =>
          decoration.locator.blockId
            ? (resolveRenderableBlockId(
                section.blocks,
                decoration.locator.blockId
              ) ?? decoration.locator.blockId)
            : undefined
        )
        .filter((blockId): blockId is string => Boolean(blockId))
    );
  }

  getUnderlinedCanvasBlockColorsForSection(
    sectionIndex: number
  ): Map<string, string> {
    if (!this.reader.book) {
      return new Map();
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return new Map();
    }

    const colors = new Map<string, string>();
    for (const decoration of this.reader.decorationManager.getForSpineIndex(
      sectionIndex
    )) {
      if (decoration.style !== "underline" || !decoration.color) {
        continue;
      }
      if (decoration.extras?.textRange) {
        continue;
      }

      const blockId = decoration.locator.blockId
        ? (resolveRenderableBlockId(
            section.blocks,
            decoration.locator.blockId
          ) ?? decoration.locator.blockId)
        : undefined;
      if (blockId) {
        colors.set(blockId, decoration.color);
      }
    }

    return colors;
  }

  getUnderlinedCanvasTextRangesForSection(
    sectionIndex: number
  ): Map<string, Array<{ start: number; end: number; color: string }>> {
    if (!this.reader.book) {
      return new Map();
    }

    const section = this.reader.book.sections[sectionIndex];
    if (!section) {
      return new Map();
    }

    const rangesByBlock = new Map<
      string,
      Array<{ start: number; end: number; color: string }>
    >();

    for (const decoration of this.reader.decorationManager.getForSpineIndex(
      sectionIndex
    )) {
      const textRange = decoration.extras?.textRange;
      if (decoration.style !== "underline" || !textRange) {
        continue;
      }

      const normalizedRange = normalizeTextRangeSelector(textRange);
      const blockIds = collectBlockIdsInReadingOrder(section.blocks);
      const startIndex = blockIds.indexOf(normalizedRange.start.blockId);
      const endIndex = blockIds.indexOf(normalizedRange.end.blockId);
      if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
        continue;
      }

      for (
        let blockIndex = startIndex;
        blockIndex <= endIndex;
        blockIndex += 1
      ) {
        const blockId = blockIds[blockIndex];
        if (!blockId) {
          continue;
        }

        const renderableBlockId = resolveRenderableBlockId(
          section.blocks,
          blockId
        );
        if (!renderableBlockId || renderableBlockId !== blockId) {
          continue;
        }

        const block = findBlockById(section.blocks, blockId);
        const blockTextLength = block
          ? Array.from(this.reader.extractBlockText(block)).length
          : 0;
        const start =
          blockId === normalizedRange.start.blockId
            ? Math.max(
                0,
                Math.min(blockTextLength, normalizedRange.start.inlineOffset)
              )
            : 0;
        const end =
          blockId === normalizedRange.end.blockId
            ? Math.max(
                start,
                Math.min(blockTextLength, normalizedRange.end.inlineOffset)
              )
            : blockTextLength;
        if (end <= start) {
          continue;
        }

        const entry = rangesByBlock.get(blockId) ?? [];
        entry.push({
          start,
          end,
          color: decoration.color ?? this.reader.theme.color
        });
        rangesByBlock.set(blockId, entry);
      }
    }

    return rangesByBlock;
  }

  resolveCanvasViewportBlockIds(locator: Locator): string[] {
    const blockId = locator.blockId;
    if (!blockId) {
      return [];
    }

    const section = this.reader.book?.sections[locator.spineIndex];
    if (!section) {
      return [blockId];
    }

    const renderableBlockId = resolveRenderableBlockId(section.blocks, blockId);
    return renderableBlockId && renderableBlockId !== blockId
      ? [blockId, renderableBlockId]
      : [blockId];
  }

  syncAnnotationDecorations(): void {
    this.reader.decorationManager.setExplicitGroup(
      "annotations",
      mapAnnotationsToDecorations(this.reader.annotations)
    );
    if (this.reader.book) {
      this.reader.renderCurrentSection("preserve");
    }
  }

  resolveAnnotationQuote(locator: Locator): string | undefined {
    const section = this.reader.book?.sections[locator.spineIndex];
    const blockId = locator.blockId;
    if (!section || !blockId) {
      return undefined;
    }

    const block = findBlockById(section.blocks, blockId);
    if (!block) {
      return undefined;
    }

    const text = collectBlockText(block).replace(/\s+/g, " ").trim();
    return text || undefined;
  }

  resolveAnnotationTextRangeQuote(
    locator: Locator,
    textRange: TextRangeSelector
  ): string | undefined {
    const section = this.reader.book?.sections[locator.spineIndex];
    if (!section) {
      return undefined;
    }

    return this.reader.annotationService.resolveTextRangeQuote(
      section,
      textRange
    );
  }

  resolveSelectionTarget(node: Node | null): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
  } | null {
    if (!this.reader.book || !this.reader.options.container || !node) {
      return null;
    }

    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (
      !(element instanceof HTMLElement) ||
      !this.reader.options.container.contains(element)
    ) {
      return null;
    }

    const canvasTextRun = element.closest<HTMLElement>(".epub-text-run");
    if (canvasTextRun) {
      const sectionId = canvasTextRun.dataset.readerSectionId?.trim();
      const blockId = canvasTextRun.dataset.readerBlockId?.trim();
      const sectionIndex = sectionId
        ? this.reader.getSectionIndexById(sectionId)
        : -1;
      const section =
        sectionIndex >= 0 ? this.reader.book.sections[sectionIndex] : null;
      if (sectionId && section && blockId) {
        return {
          element: canvasTextRun,
          locator: createBlockLocator({
            section,
            spineIndex: sectionIndex,
            blockId
          }),
          sectionId,
          blockId
        };
      }
    }

    const domSection = element.closest<HTMLElement>(".epub-dom-section");
    if (!(domSection instanceof HTMLElement)) {
      return null;
    }

    const sectionId = domSection.dataset.sectionId?.trim();
    const sectionIndex = sectionId
      ? this.reader.getSectionIndexById(sectionId)
      : -1;
    const section =
      sectionIndex >= 0 ? this.reader.book.sections[sectionIndex] : null;
    if (!sectionId || !section) {
      return null;
    }

    const identifiedElement = element.closest<HTMLElement>(
      "[id], [data-reader-block-id]"
    );
    const blockId =
      identifiedElement?.dataset.readerBlockId?.trim() ||
      identifiedElement?.id?.trim();
    if (blockId) {
      return {
        element: identifiedElement ?? domSection,
        locator: createBlockLocator({
          section,
          spineIndex: sectionIndex,
          blockId
        }),
        sectionId,
        blockId
      };
    }

    return {
      element: domSection,
      locator: normalizeLocator({
        spineIndex: sectionIndex,
        progressInSection:
          this.reader.locator?.spineIndex === sectionIndex
            ? (this.reader.locator.progressInSection ?? 0)
            : 0
      }),
      sectionId
    };
  }

  resolveSelectionEndpoint(input: { node: Node | null; offset: number }): {
    element: HTMLElement;
    locator: Locator;
    sectionId: string;
    blockId?: string;
    inlineOffset?: number;
  } | null {
    const target = this.reader.resolveSelectionTarget(input.node);
    if (!target || !target.blockId) {
      return target;
    }

    const clampedOffset = Math.max(0, Math.trunc(input.offset));
    const canvasTextRun = target.element.closest<HTMLElement>(".epub-text-run");
    if (canvasTextRun) {
      const inlineStart =
        Number.parseInt(canvasTextRun.dataset.readerInlineStart ?? "0", 10) ||
        0;
      const inlineEnd =
        Number.parseInt(
          canvasTextRun.dataset.readerInlineEnd ?? `${inlineStart}`,
          10
        ) || inlineStart;
      const inlineOffset = Math.max(
        inlineStart,
        Math.min(inlineEnd, inlineStart + clampedOffset)
      );
      return {
        ...target,
        locator: normalizeLocator({
          ...target.locator,
          inlineOffset
        }),
        inlineOffset
      };
    }

    const inlineOffset = readerRuntimeHelpers.resolveDomTextOffsetWithinBlock(
      target.element,
      input.node,
      clampedOffset
    );
    return {
      ...target,
      locator: normalizeLocator({
        ...target.locator,
        inlineOffset
      }),
      inlineOffset
    };
  }

  resolveCurrentTextSelectionSnapshot(): ReaderTextSelectionSnapshot | null {
    if (!this.reader.book || !this.reader.options.container) {
      return null;
    }

    const selection = readerRuntimeHelpers.getScopedTextSelectionRecord(
      this.reader.options.container
    );
    if (!selection) {
      return cloneReaderTextSelectionSnapshot(
        this.reader.pinnedTextSelectionSnapshot
      );
    }

    const startTarget = this.reader.resolveSelectionEndpoint({
      node: selection.startNode,
      offset: selection.range?.startOffset ?? 0
    });
    const endTarget = this.reader.resolveSelectionEndpoint({
      node: selection.endNode,
      offset: selection.range?.endOffset ?? 0
    });
    const target =
      resolveLeadingSelectionTarget(startTarget, endTarget) ??
      startTarget ??
      endTarget;
    if (!target) {
      return null;
    }

    const rects = readerRuntimeHelpers.measureSelectionRectsWithinContainer({
      container: this.reader.options.container,
      selection: selection.selection,
      fallbackElement: target.element,
      mode: this.reader.mode
    });

    return {
      text: selection.text,
      locator: normalizeLocator({
        ...target.locator,
        ...(target.inlineOffset !== undefined
          ? { inlineOffset: target.inlineOffset }
          : {})
      }),
      sectionId: target.sectionId,
      ...(target.blockId ? { blockId: target.blockId } : {}),
      ...(startTarget &&
      endTarget &&
      startTarget.sectionId === endTarget.sectionId &&
      startTarget.blockId &&
      endTarget.blockId
        ? {
            textRange: normalizeTextRangeSelector({
              start: {
                blockId: startTarget.blockId,
                inlineOffset: startTarget.inlineOffset ?? 0
              },
              end: {
                blockId: endTarget.blockId,
                inlineOffset:
                  endTarget.inlineOffset ?? startTarget.inlineOffset ?? 0
              }
            })
          }
        : {}),
      rects,
      visible: rects.length > 0
    };
  }

  setPinnedTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    const updatedSelection =
      this.reader.selectionSession.setPinnedTextSelectionSnapshot(selection);
    if (!updatedSelection.changed) {
      return;
    }
    const payload = {
      selection: updatedSelection.selection
    } satisfies ReaderEventMap["textSelectionChanged"];
    this.reader.events.emit("textSelectionChanged", payload);
    void this.reader.options.onTextSelectionChanged?.(payload);
  }

  resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState {
    return this.reader.annotationService.resolveSelectionHighlightState(
      selection
    );
  }

  resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[] {
    return this.reader.annotationService.resolveAnnotationRangesForSection(
      spineIndex
    );
  }

  resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null {
    return this.reader.annotationService.resolveAnnotationRange(annotation);
  }

  createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext {
    return this.reader.annotationService.createSectionTextRangeContext(section);
  }

  normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null {
    return this.reader.annotationService.normalizeTextRangeForSection(
      spineIndex,
      textRange
    );
  }

  resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null {
    return this.reader.annotationService.resolveFullBlockTextRange(
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
    return this.reader.annotationService.createAnnotationForResolvedRange(
      input
    );
  }

  resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined {
    return this.reader.annotationService.resolveTextRangeQuote(
      section,
      textRange
    );
  }

  resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds {
    return this.reader.annotationService.resolveAnnotationViewportRects(
      annotation,
      locator
    );
  }

  resolveCanvasTextRangeViewportRects(
    sectionId: string,
    textRange: TextRangeSelector
  ): VisibleDrawBounds {
    if (!this.reader.options.container) {
      return [];
    }

    const startPosition = resolveCanvasTextPosition({
      container: this.reader.options.container,
      sectionId,
      blockId: textRange.start.blockId,
      inlineOffset: textRange.start.inlineOffset,
      bias: "start"
    });
    const endPosition = resolveCanvasTextPosition({
      container: this.reader.options.container,
      sectionId,
      blockId: textRange.end.blockId,
      inlineOffset: textRange.end.inlineOffset,
      bias: "end"
    });
    if (!startPosition || !endPosition) {
      return [];
    }

    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
    const containerRect = this.reader.options.container.getBoundingClientRect();
    const rangeClientRects =
      typeof range.getClientRects === "function"
        ? Array.from(range.getClientRects())
        : [];
    return rangeClientRects
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x:
          rect.left -
          containerRect.left +
          this.reader.options.container!.scrollLeft,
        y:
          this.reader.mode === "scroll"
            ? rect.top -
              containerRect.top +
              this.reader.options.container!.scrollTop
            : rect.top - containerRect.top,
        width: rect.width,
        height: rect.height
      }));
  }

  resolveAnnotationSelectionAtPoint(
    point: Point
  ): ReaderTextSelectionSnapshot | null {
    return this.reader.annotationService.resolveAnnotationSelectionAtPoint(
      this.reader.toAnnotationViewportPoint(point)
    );
  }

  emitAnnotationActivatedAtPoint(point: Point): boolean {
    const activation =
      this.reader.annotationService.resolveAnnotationActivationAtPoint(
        this.reader.toAnnotationViewportPoint(point)
      );
    if (!activation) {
      return false;
    }

    return this.reader.emitAnnotationActivationPayload(activation, point);
  }

  emitAnnotationActivatedForDecoration(
    decorationId: string,
    point?: Point
  ): boolean {
    const activation =
      this.reader.annotationService.resolveAnnotationActivationByDecorationId(
        decorationId
      );
    if (!activation) {
      return false;
    }

    return this.reader.emitAnnotationActivationPayload(
      activation,
      point ??
        this.reader.getAnnotationActivationFallbackPoint(activation.rects)
    );
  }

  emitAnnotationActivationPayload(
    activation: ResolvedAnnotationActivation,
    point: Point
  ): boolean {
    const payload = {
      annotation: activation.annotation,
      locator: activation.locator,
      sectionId: activation.sectionId,
      ...(activation.blockId ? { blockId: activation.blockId } : {}),
      ...(activation.textRange ? { textRange: activation.textRange } : {}),
      ...(activation.quote ? { quote: activation.quote } : {}),
      point: { ...point },
      rects: activation.rects.map((rect) => ({ ...rect }))
    } satisfies AnnotationActivatedEvent;
    this.reader.events.emit("annotationActivated", payload);
    void this.reader.options.onAnnotationActivated?.(payload);
    return true;
  }

  getAnnotationActivationFallbackPoint(rects: VisibleDrawBounds): Point {
    const firstRect = rects.find((rect) => rect.width > 0 && rect.height > 0);
    if (!firstRect) {
      return { x: 0, y: 0 };
    }

    return {
      x: firstRect.x + firstRect.width / 2,
      y: firstRect.y + firstRect.height / 2
    };
  }

  toAnnotationViewportPoint(point: Point): Point {
    if (this.reader.mode !== "scroll" || !this.reader.options.container) {
      return point;
    }

    return {
      x: point.x,
      y: point.y + this.reader.options.container.scrollTop
    };
  }

  syncTextSelectionState(): void {
    this.reader.updateTextSelectionSnapshot(
      this.reader.resolveCurrentTextSelectionSnapshot()
    );
  }

  updateTextSelectionSnapshot(
    selection: ReaderTextSelectionSnapshot | null
  ): void {
    const result =
      this.reader.selectionSession.updateTextSelectionSnapshot(selection);
    if (!result.changed) {
      return;
    }

    const payload = {
      selection: result.selection
    } satisfies ReaderEventMap["textSelectionChanged"];
    this.reader.events.emit("textSelectionChanged", payload);
    void this.reader.options.onTextSelectionChanged?.(payload);
  }
}
