import { nanoid } from "nanoid";
import type {
  Annotation,
  AnnotationStyle,
  Book,
  Decoration,
  Locator,
  SerializedLocator,
  TextRangeSelector
} from "../model/types";
import { deserializeLocator, serializeLocator } from "./locator";
import { normalizeTextRangeSelector } from "./reader-domain";

export function createAnnotation(input: {
  publicationId: string;
  locator: Locator;
  book?: Book;
  quote?: string;
  note?: string;
  style?: AnnotationStyle;
  color?: string;
  textRange?: TextRangeSelector;
  createdAt?: string;
  updatedAt?: string;
}): Annotation {
  const timestamp = input.createdAt ?? new Date().toISOString();
  const style = normalizeAnnotationStyle(input.style);

  return {
    id: nanoid(),
    publicationId: input.publicationId,
    locator: serializeLocator({
      locator: input.locator,
      generateCfi: true,
      ...(input.book ? { book: input.book } : {})
    }),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    ...(input.textRange
      ? { textRange: normalizeTextRangeSelector(input.textRange) }
      : {}),
    ...(input.quote?.trim() ? { quote: input.quote.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(style ? { style } : {}),
    ...(input.color?.trim() ? { color: input.color.trim() } : {})
  };
}

export function serializeAnnotation(annotation: Annotation): string {
  return JSON.stringify(annotation);
}

export function deserializeAnnotation(raw: unknown): Annotation | null {
  const value = parseAnnotationValue(raw);
  if (!value || typeof value !== "object") {
    return null;
  }

  const id =
    typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  const publicationId =
    typeof value.publicationId === "string" && value.publicationId.trim()
      ? value.publicationId.trim()
      : null;
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim()
      ? value.createdAt.trim()
      : null;
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : null;
  const locator = deserializeLocator(value.locator);
  const textRange = parseTextRangeSelector(value.textRange);
  const style = normalizeAnnotationStyle(value.style);

  if (!id || !publicationId || !createdAt || !updatedAt || !locator) {
    return null;
  }

  return {
    id,
    publicationId,
    locator,
    createdAt,
    updatedAt,
    ...(textRange ? { textRange } : {}),
    ...(typeof value.quote === "string" && value.quote.trim()
      ? { quote: value.quote.trim() }
      : {}),
    ...(typeof value.note === "string" && value.note.trim()
      ? { note: value.note.trim() }
      : {}),
    ...(style ? { style } : {}),
    ...(typeof value.color === "string" && value.color.trim()
      ? { color: value.color.trim() }
      : {})
  };
}

export function mapAnnotationToDecoration(annotation: Annotation): Decoration {
  return {
    id: `annotation:${annotation.id}`,
    group: "annotations",
    locator: {
      ...(annotation.locator.spineIndex !== undefined
        ? { spineIndex: annotation.locator.spineIndex }
        : { spineIndex: 0 }),
      ...(annotation.locator.blockId
        ? { blockId: annotation.locator.blockId }
        : {}),
      ...(annotation.locator.anchorId
        ? { anchorId: annotation.locator.anchorId }
        : {}),
      ...(annotation.locator.inlineOffset !== undefined
        ? { inlineOffset: annotation.locator.inlineOffset }
        : {}),
      ...(annotation.locator.cfi ? { cfi: annotation.locator.cfi } : {}),
      ...(annotation.locator.progressInSection !== undefined
        ? { progressInSection: annotation.locator.progressInSection }
        : {})
    },
    style: annotation.style ?? "highlight",
    ...(annotation.textRange
      ? {
          extras: {
            textRange: normalizeTextRangeSelector(annotation.textRange)
          }
        }
      : {}),
    ...(annotation.color ? { color: annotation.color } : {})
  };
}

function normalizeAnnotationStyle(value: unknown): AnnotationStyle | undefined {
  return value === "highlight" || value === "underline" ? value : undefined;
}

export function mapAnnotationsToDecorations(
  annotations: Annotation[]
): Decoration[] {
  return annotations.map(mapAnnotationToDecoration);
}

function parseAnnotationValue(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return raw && typeof raw === "object"
    ? (raw as Record<string, unknown>)
    : null;
}

function parseTextRangeSelector(raw: unknown): TextRangeSelector | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = raw as {
    start?: unknown;
    end?: unknown;
  };
  const start = parseTextRangePoint(value.start);
  const end = parseTextRangePoint(value.end);
  if (!start || !end) {
    return undefined;
  }

  return normalizeTextRangeSelector({
    start,
    end
  });
}

function parseTextRangePoint(
  raw: unknown
): TextRangeSelector["start"] | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = raw as {
    blockId?: unknown;
    inlineOffset?: unknown;
  };
  if (typeof value.blockId !== "string" || !value.blockId.trim()) {
    return undefined;
  }

  const inlineOffset =
    typeof value.inlineOffset === "number" &&
    Number.isFinite(value.inlineOffset)
      ? Math.max(0, Math.trunc(value.inlineOffset))
      : undefined;
  if (inlineOffset === undefined) {
    return undefined;
  }

  return {
    blockId: value.blockId.trim(),
    inlineOffset
  };
}

export type { SerializedLocator };
