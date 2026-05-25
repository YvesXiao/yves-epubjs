import type {
  Annotation,
  AnnotationActivatedEvent,
  Book,
  Locator,
  Point,
  ReadingMode,
  ReaderSelectionHighlightState,
  ReaderTextSelectionSnapshot,
  SectionDocument,
  TextRangeSelector,
  VisibleDrawBounds
} from "../model/types";
import { extractBlockText } from "../utils/block-text";
import { createAnnotation as createReaderAnnotation } from "./annotation";
import {
  findBlockById,
  resolveRenderableBlockId,
  collectSelectableBlocksInReadingOrder
} from "./reader-block-tree";
import { normalizeLocator, restoreLocatorWithDiagnostics } from "./locator";
import {
  cloneTextRangeSelector,
  flattenTextRange,
  inflateFlattenedTextRange,
  normalizeTextRangeForContext,
  subtractFlattenedRange,
  type SectionTextRangeContext
} from "./reader-selection";
import { mapDomTextRangeToViewport } from "./dom-viewport-mapper";
import { getDomDecorationViewportRects } from "./dom-decoration";

export type ResolvedAnnotationRange = {
  annotation: Annotation;
  locator: Locator;
  spineIndex: number;
  sectionId: string;
  range: TextRangeSelector;
};

export type ResolvedAnnotationActivation = Omit<
  AnnotationActivatedEvent,
  "point"
>;

export type ReaderAnnotationServiceDependencies = {
  getBook: () => Book | null;
  getAnnotations: () => Annotation[];
  getPublicationId: () => string | null;
  getContainer: () => HTMLElement | null | undefined;
  getMode: () => ReadingMode;
  getSectionElement: (sectionId: string) => HTMLElement | null;
  mapLocatorToViewport: (locator: Locator) => VisibleDrawBounds;
  resolveCanvasTextRangeViewportRects: (
    sectionId: string,
    textRange: TextRangeSelector
  ) => VisibleDrawBounds;
};

export class ReaderAnnotationService {
  constructor(
    private readonly dependencies: ReaderAnnotationServiceDependencies
  ) {}

  resolveSelectionHighlightState(
    selection: ReaderTextSelectionSnapshot
  ): ReaderSelectionHighlightState {
    const book = this.dependencies.getBook();
    if (!book || !selection.textRange) {
      return {
        mode: "highlight",
        disabled: false
      };
    }

    const section = book.sections[selection.locator.spineIndex];
    if (!section) {
      return {
        mode: "highlight",
        disabled: false
      };
    }

    const context = this.createSectionTextRangeContext(section);
    const selectionRange = this.normalizeTextRangeForSection(
      selection.locator.spineIndex,
      selection.textRange
    );
    if (!selectionRange) {
      return {
        mode: "highlight",
        disabled: false
      };
    }

    const flattenedSelection = flattenTextRange(selectionRange, context);
    if (!flattenedSelection) {
      return {
        mode: "highlight",
        disabled: false
      };
    }

    let remainingRanges = [flattenedSelection];
    for (const resolved of this.resolveAnnotationRangesForSection(
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
        return {
          mode: "remove-highlight",
          disabled: false
        };
      }
    }

    return {
      mode: "highlight",
      disabled: false
    };
  }

  resolveAnnotationRangesForSection(
    spineIndex: number
  ): ResolvedAnnotationRange[] {
    return this.dependencies
      .getAnnotations()
      .map((annotation) => this.resolveAnnotationRange(annotation))
      .filter((entry): entry is ResolvedAnnotationRange =>
        Boolean(entry && entry.spineIndex === spineIndex)
      );
  }

  resolveAnnotationRange(
    annotation: Annotation
  ): ResolvedAnnotationRange | null {
    const book = this.dependencies.getBook();
    if (!book) {
      return null;
    }

    const locator = restoreLocatorWithDiagnostics({
      book,
      locator: annotation.locator
    }).locator;
    if (!locator) {
      return null;
    }

    const section = book.sections[locator.spineIndex];
    if (!section) {
      return null;
    }

    const range = annotation.textRange
      ? this.normalizeTextRangeForSection(
          locator.spineIndex,
          annotation.textRange
        )
      : this.resolveFullBlockTextRange(section, locator.blockId);
    if (!range) {
      return null;
    }

    return {
      annotation,
      locator,
      spineIndex: locator.spineIndex,
      sectionId: section.id,
      range
    };
  }

  createSectionTextRangeContext(
    section: SectionDocument
  ): SectionTextRangeContext {
    const blocks = collectSelectableBlocksInReadingOrder(section.blocks);
    const blockIds: string[] = [];
    const blockTexts = new Map<string, string>();
    const blockTextLengths = new Map<string, number>();
    const blockOffsets = new Map<string, number>();
    let cursor = 0;

    for (const block of blocks) {
      if (blockTexts.has(block.id)) {
        continue;
      }

      const text = extractBlockText(block);
      blockIds.push(block.id);
      blockTexts.set(block.id, text);
      blockTextLengths.set(block.id, Array.from(text).length);
      blockOffsets.set(block.id, cursor);
      cursor += Array.from(text).length;
    }

    return {
      blockIds,
      blockTexts,
      blockTextLengths,
      blockOffsets,
      totalLength: cursor
    };
  }

  normalizeTextRangeForSection(
    spineIndex: number,
    textRange: TextRangeSelector
  ): TextRangeSelector | null {
    const section = this.dependencies.getBook()?.sections[spineIndex];
    if (!section) {
      return null;
    }

    const context = this.createSectionTextRangeContext(section);
    return normalizeTextRangeForContext({
      textRange,
      context,
      resolveBlockId: (blockId) =>
        resolveRenderableBlockId(section.blocks, blockId) ?? blockId
    });
  }

  resolveFullBlockTextRange(
    section: SectionDocument,
    blockId: string | undefined
  ): TextRangeSelector | null {
    const normalizedBlockId = blockId?.trim();
    if (!normalizedBlockId) {
      return null;
    }

    const renderableBlockId =
      resolveRenderableBlockId(section.blocks, normalizedBlockId) ??
      normalizedBlockId;
    const block = findBlockById(section.blocks, renderableBlockId);
    if (!block) {
      return null;
    }

    const blockTextLength = Array.from(extractBlockText(block)).length;
    return {
      start: {
        blockId: renderableBlockId,
        inlineOffset: 0
      },
      end: {
        blockId: renderableBlockId,
        inlineOffset: blockTextLength
      }
    };
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
    const publicationId =
      input.annotation?.publicationId ?? this.dependencies.getPublicationId();
    if (!publicationId) {
      return null;
    }

    const rangeLocator = normalizeLocator({
      spineIndex: input.locator.spineIndex,
      blockId: input.range.start.blockId,
      inlineOffset: input.range.start.inlineOffset,
      progressInSection: input.locator.progressInSection ?? 0
    });
    const quote = this.resolveTextRangeQuote(input.section, input.range);
    const style = input.style ?? input.annotation?.style;

    return createReaderAnnotation({
      publicationId,
      locator: rangeLocator,
      ...(this.dependencies.getBook()
        ? { book: this.dependencies.getBook()! }
        : {}),
      textRange: input.range,
      ...(quote ? { quote } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(style ? { style } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.annotation ? { createdAt: input.annotation.createdAt } : {}),
      ...(input.annotation ? { updatedAt: new Date().toISOString() } : {})
    });
  }

  resolveTextRangeQuote(
    section: SectionDocument,
    textRange: TextRangeSelector
  ): string | undefined {
    const context = this.createSectionTextRangeContext(section);
    const normalizedRange = normalizeTextRangeForContext({
      textRange,
      context
    });
    if (!normalizedRange) {
      return undefined;
    }

    const startIndex = context.blockIds.indexOf(normalizedRange.start.blockId);
    const endIndex = context.blockIds.indexOf(normalizedRange.end.blockId);
    if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
      return undefined;
    }

    const segments: string[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      const blockId = context.blockIds[index];
      if (!blockId) {
        continue;
      }

      const characters = Array.from(context.blockTexts.get(blockId) ?? "");
      const start =
        blockId === normalizedRange.start.blockId
          ? normalizedRange.start.inlineOffset
          : 0;
      const end =
        blockId === normalizedRange.end.blockId
          ? normalizedRange.end.inlineOffset
          : characters.length;
      if (end <= start) {
        continue;
      }

      segments.push(characters.slice(start, end).join(""));
    }

    const text = segments.join("");
    return text.trim() ? text : undefined;
  }

  resolveAnnotationViewportRects(
    annotation: Annotation,
    locator: Locator
  ): VisibleDrawBounds {
    const book = this.dependencies.getBook();
    const container = this.dependencies.getContainer();
    if (!book || !container) {
      return [];
    }

    const section = book.sections[locator.spineIndex];
    if (!section) {
      return [];
    }

    const textRange = annotation.textRange
      ? this.normalizeTextRangeForSection(
          locator.spineIndex,
          annotation.textRange
        )
      : this.resolveFullBlockTextRange(section, locator.blockId);
    if (!textRange) {
      return this.dependencies.mapLocatorToViewport(locator);
    }

    const sectionElement = this.dependencies.getSectionElement(section.id);
    if (sectionElement && isRenderedDomSectionElement(sectionElement)) {
      const rects = mapDomTextRangeToViewport({
        container,
        mode: this.dependencies.getMode(),
        sectionElement,
        textRange
      });
      if (rects.length > 0) {
        return rects;
      }
    }

    const canvasRects = this.dependencies.resolveCanvasTextRangeViewportRects(
      section.id,
      textRange
    );
    return canvasRects.length > 0
      ? canvasRects
      : this.dependencies.mapLocatorToViewport(locator);
  }

  resolveAnnotationRenderedDecorationViewportRects(
    annotation: Annotation,
    locator: Locator,
    point?: Point
  ): VisibleDrawBounds {
    const container = this.dependencies.getContainer();
    if (!container) {
      return [];
    }

    const section = this.dependencies.getBook()?.sections[locator.spineIndex];
    if (!section) {
      return [];
    }

    const sectionElement = this.dependencies.getSectionElement(section.id);
    if (!sectionElement || !isRenderedDomSectionElement(sectionElement)) {
      return [];
    }

    return getDomDecorationViewportRects({
      container,
      sectionElement,
      mode: this.dependencies.getMode(),
      decorationId: getAnnotationDecorationId(annotation),
      ...(point ? { point } : {})
    });
  }

  resolveAnnotationSelectionAtPoint(
    point: Point
  ): ReaderTextSelectionSnapshot | null {
    return this.resolveAnnotationActivationAtPoint(point)?.selection ?? null;
  }

  resolveAnnotationActivationByDecorationId(
    decorationId: string
  ):
    | (ResolvedAnnotationActivation & {
        selection: ReaderTextSelectionSnapshot;
      })
    | null {
    const id = decorationId.trim();
    if (!id) {
      return null;
    }

    const book = this.dependencies.getBook();
    if (!book) {
      return null;
    }

    const annotations = this.dependencies.getAnnotations();
    const annotation = annotations.find(
      (item) => getAnnotationDecorationId(item) === id
    );
    if (!annotation) {
      return null;
    }

    const resolved = this.resolveAnnotationRange(annotation);
    if (!resolved) {
      const locator: Locator = normalizeLocator({
        ...annotation.locator,
        spineIndex: annotation.locator.spineIndex ?? 0
      }) as Locator;
      const section = book.sections[locator.spineIndex];
      if (!section) {
        return null;
      }

      const rects = this.resolveAnnotationRenderedDecorationViewportRects(
        annotation,
        locator
      );
      if (rects.length === 0) {
        return null;
      }

      const selection: ReaderTextSelectionSnapshot = {
        text: annotation.quote ?? "",
        locator,
        sectionId: section.id,
        ...(locator.blockId ? { blockId: locator.blockId } : {}),
        ...(annotation.textRange
          ? { textRange: cloneTextRangeSelector(annotation.textRange) }
          : {}),
        rects,
        visible: true
      };

      return {
        annotation: cloneAnnotation(annotation),
        locator,
        sectionId: section.id,
        ...(locator.blockId ? { blockId: locator.blockId } : {}),
        ...(annotation.textRange
          ? { textRange: cloneTextRangeSelector(annotation.textRange) }
          : {}),
        ...(annotation.quote ? { quote: annotation.quote } : {}),
        rects,
        selection
      };
    }

    const renderedDecorationRects =
      this.resolveAnnotationRenderedDecorationViewportRects(
        annotation,
        resolved.locator
      );
    const rects =
      renderedDecorationRects.length > 0
        ? renderedDecorationRects
        : this.resolveAnnotationViewportRects(annotation, resolved.locator);
    const text =
      annotation.quote ??
      this.resolveTextRangeQuote(
        book.sections[resolved.spineIndex]!,
        resolved.range
      );

    const selection: ReaderTextSelectionSnapshot = {
      text: text ?? "",
      locator: normalizeLocator({
        ...resolved.locator,
        blockId: resolved.range.start.blockId,
        inlineOffset: resolved.range.start.inlineOffset
      }),
      sectionId: resolved.sectionId,
      blockId: resolved.range.start.blockId,
      textRange: cloneTextRangeSelector(resolved.range),
      rects,
      visible: rects.length > 0
    };

    return {
      annotation: cloneAnnotation(annotation),
      locator: selection.locator,
      sectionId: resolved.sectionId,
      ...(selection.blockId ? { blockId: selection.blockId } : {}),
      ...(selection.textRange
        ? { textRange: cloneTextRangeSelector(selection.textRange) }
        : {}),
      ...(text ? { quote: text } : {}),
      rects,
      selection
    };
  }

  resolveAnnotationActivationAtPoint(
    point: Point
  ):
    | (ResolvedAnnotationActivation & {
        selection: ReaderTextSelectionSnapshot;
      })
    | null {
    const book = this.dependencies.getBook();
    if (!book) {
      return null;
    }

    const annotations = this.dependencies.getAnnotations();
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      const annotation = annotations[index];
      if (!annotation) {
        continue;
      }

      const resolved = this.resolveAnnotationRange(annotation);
      if (!resolved) {
        continue;
      }

      const renderedDecorationHitRects =
        this.resolveAnnotationRenderedDecorationViewportRects(
          annotation,
          resolved.locator,
          point
        );
      const rects =
        renderedDecorationHitRects.length > 0
          ? this.resolveAnnotationRenderedDecorationViewportRects(
              annotation,
              resolved.locator
            )
          : this.resolveAnnotationViewportRects(annotation, resolved.locator);
      const hit = renderedDecorationHitRects.length > 0 || rects.some(
        (rect) =>
          point.x >= rect.x &&
          point.x <= rect.x + rect.width &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.height
      );
      if (!hit) {
        continue;
      }

      const text =
        annotation.quote ??
        this.resolveTextRangeQuote(
          book.sections[resolved.spineIndex]!,
          resolved.range
        );
      const selection: ReaderTextSelectionSnapshot = {
        text: text ?? "",
        locator: normalizeLocator({
          ...resolved.locator,
          blockId: resolved.range.start.blockId,
          inlineOffset: resolved.range.start.inlineOffset
        }),
        sectionId: resolved.sectionId,
        blockId: resolved.range.start.blockId,
        textRange: cloneTextRangeSelector(resolved.range),
        rects,
        visible: rects.length > 0
      };
      return {
        annotation: cloneAnnotation(annotation),
        locator: selection.locator,
        sectionId: resolved.sectionId,
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.textRange
          ? { textRange: cloneTextRangeSelector(selection.textRange) }
          : {}),
        ...(text ? { quote: text } : {}),
        rects,
        selection
      };
    }

    return null;
  }
}

function cloneAnnotation(annotation: Annotation): Annotation {
  return {
    ...annotation,
    locator: { ...annotation.locator },
    ...(annotation.textRange
      ? { textRange: cloneTextRangeSelector(annotation.textRange) }
      : {})
  };
}

function getAnnotationDecorationId(annotation: Annotation): string {
  return `annotation:${annotation.id}`;
}

export function subtractAnnotationRange(input: {
  source: TextRangeSelector;
  subtractor: TextRangeSelector;
  context: SectionTextRangeContext;
}): TextRangeSelector[] {
  const source = flattenTextRange(input.source, input.context);
  const subtractor = flattenTextRange(input.subtractor, input.context);
  if (!source || !subtractor) {
    return [input.source];
  }

  return subtractFlattenedRange(source, subtractor).flatMap((range) => {
    const inflated = inflateFlattenedTextRange(range, input.context);
    return inflated ? [inflated] : [];
  });
}

function isRenderedDomSectionElement(element: HTMLElement): boolean {
  return (
    element.matches(".epub-dom-section") ||
    Boolean(element.querySelector(".epub-dom-section"))
  );
}
