import type {
  Locator,
  ReaderTextSelectionSnapshot,
  Rect,
  TextRangeSelector
} from "../model/types"
import { normalizeTextRangeSelector } from "./reader-domain"

export type SectionTextRangeContext = {
  blockIds: string[]
  blockTexts: Map<string, string>
  blockTextLengths: Map<string, number>
  blockOffsets: Map<string, number>
  totalLength: number
}

export type FlattenedTextRange = {
  start: number
  end: number
}

export function hasActiveTextSelection(scope?: Node | null): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.getSelection !== "function"
  ) {
    return false
  }

  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return false
  }

  if (!scope) {
    return true
  }

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  return Boolean(
    (anchorNode && scope.contains(anchorNode)) ||
    (focusNode && scope.contains(focusNode))
  )
}

export function cloneReaderTextSelectionSnapshot(
  selection: ReaderTextSelectionSnapshot | null
): ReaderTextSelectionSnapshot | null {
  if (!selection) {
    return null
  }

  return {
    text: selection.text,
    locator: { ...selection.locator },
    sectionId: selection.sectionId,
    ...(selection.blockId ? { blockId: selection.blockId } : {}),
    ...(selection.textRange
      ? { textRange: cloneTextRangeSelector(selection.textRange) }
      : {}),
    rects: selection.rects.map((rect) => ({ ...rect })),
    visible: selection.visible
  }
}

export function readerTextSelectionSnapshotsEqual(
  left: ReaderTextSelectionSnapshot | null,
  right: ReaderTextSelectionSnapshot | null
): boolean {
  if (!left || !right) {
    return left === right
  }

  if (
    left.text !== right.text ||
    left.sectionId !== right.sectionId ||
    left.blockId !== right.blockId ||
    left.visible !== right.visible
  ) {
    return false
  }

  if (
    !locatorsEqual(left.locator, right.locator) ||
    left.rects.length !== right.rects.length
  ) {
    return false
  }

  if (!textRangesEqual(left.textRange, right.textRange)) {
    return false
  }

  return left.rects.every((rect, index) =>
    rectsEqual(rect, right.rects[index] ?? null)
  )
}

export function cloneTextRangeSelector(
  textRange: TextRangeSelector
): TextRangeSelector {
  return {
    start: {
      blockId: textRange.start.blockId,
      inlineOffset: textRange.start.inlineOffset
    },
    end: {
      blockId: textRange.end.blockId,
      inlineOffset: textRange.end.inlineOffset
    }
  }
}

export function normalizeTextRangeForContext(input: {
  textRange: TextRangeSelector
  context: SectionTextRangeContext
  resolveBlockId?: (blockId: string) => string
}): TextRangeSelector | null {
  const normalizePoint = (
    point: TextRangeSelector["start"]
  ): TextRangeSelector["start"] | null => {
    const blockId = input.resolveBlockId?.(point.blockId) ?? point.blockId
    if (!input.context.blockTextLengths.has(blockId)) {
      return null
    }

    const length = input.context.blockTextLengths.get(blockId) ?? 0
    return {
      blockId,
      inlineOffset: Math.max(
        0,
        Math.min(length, Math.trunc(point.inlineOffset))
      )
    }
  }

  const start = normalizePoint(input.textRange.start)
  const end = normalizePoint(input.textRange.end)
  if (!start || !end) {
    return null
  }

  const normalized = normalizeTextRangeSelector({
    start,
    end
  })
  const flattened = flattenTextRange(normalized, input.context)
  if (!flattened) {
    return null
  }

  return inflateFlattenedTextRange(flattened, input.context)
}

export function flattenTextRange(
  textRange: TextRangeSelector,
  context: SectionTextRangeContext
): FlattenedTextRange | null {
  const startBlockOffset = context.blockOffsets.get(textRange.start.blockId)
  const endBlockOffset = context.blockOffsets.get(textRange.end.blockId)
  if (startBlockOffset === undefined || endBlockOffset === undefined) {
    return null
  }

  const start = startBlockOffset + textRange.start.inlineOffset
  const end = endBlockOffset + textRange.end.inlineOffset
  const normalizedStart = Math.max(0, Math.min(start, end))
  const normalizedEnd = Math.max(normalizedStart, Math.max(start, end))
  return {
    start: normalizedStart,
    end: normalizedEnd
  }
}

export function inflateFlattenedTextRange(
  flattened: FlattenedTextRange,
  context: SectionTextRangeContext
): TextRangeSelector | null {
  const start = resolveTextRangePointFromAbsoluteOffset(
    flattened.start,
    context,
    "start"
  )
  const end = resolveTextRangePointFromAbsoluteOffset(
    flattened.end,
    context,
    "end"
  )
  if (!start || !end) {
    return null
  }

  return {
    start,
    end
  }
}

export function subtractFlattenedRange(
  source: FlattenedTextRange,
  subtractor: FlattenedTextRange
): FlattenedTextRange[] {
  const overlapStart = Math.max(source.start, subtractor.start)
  const overlapEnd = Math.min(source.end, subtractor.end)
  if (overlapEnd <= overlapStart) {
    return [source]
  }

  const remaining: FlattenedTextRange[] = []
  if (source.start < overlapStart) {
    remaining.push({
      start: source.start,
      end: overlapStart
    })
  }
  if (overlapEnd < source.end) {
    remaining.push({
      start: overlapEnd,
      end: source.end
    })
  }
  return remaining
}

export function resolveLeadingSelectionTarget<
  TTarget extends { element: HTMLElement }
>(left: TTarget | null, right: TTarget | null): TTarget | null {
  if (left && !right) {
    return left
  }

  if (right && !left) {
    return right
  }

  if (!left || !right) {
    return null
  }

  if (left.element === right.element) {
    return left
  }

  const position = left.element.compareDocumentPosition(right.element)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return left
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return right
  }

  return left
}

function resolveTextRangePointFromAbsoluteOffset(
  absoluteOffset: number,
  context: SectionTextRangeContext,
  bias: "start" | "end"
): TextRangeSelector["start"] | null {
  const clampedOffset = Math.max(
    0,
    Math.min(context.totalLength, Math.trunc(absoluteOffset))
  )
  for (let index = 0; index < context.blockIds.length; index += 1) {
    const blockId = context.blockIds[index]
    if (!blockId) {
      continue
    }

    const blockStart = context.blockOffsets.get(blockId) ?? 0
    const blockLength = context.blockTextLengths.get(blockId) ?? 0
    const blockEnd = blockStart + blockLength
    const isLastBlock = index === context.blockIds.length - 1

    if (
      clampedOffset < blockEnd ||
      (isLastBlock && clampedOffset <= blockEnd)
    ) {
      return {
        blockId,
        inlineOffset: clampedOffset - blockStart
      }
    }

    if (clampedOffset === blockEnd && bias === "end") {
      return {
        blockId,
        inlineOffset: blockLength
      }
    }
  }

  const lastBlockId = context.blockIds.at(-1)
  if (!lastBlockId) {
    return null
  }

  return {
    blockId: lastBlockId,
    inlineOffset: context.blockTextLengths.get(lastBlockId) ?? 0
  }
}

function locatorsEqual(left: Locator, right: Locator): boolean {
  return (
    left.spineIndex === right.spineIndex &&
    left.blockId === right.blockId &&
    left.anchorId === right.anchorId &&
    left.inlineOffset === right.inlineOffset &&
    left.cfi === right.cfi &&
    left.progressInSection === right.progressInSection
  )
}

function rectsEqual(left: Rect, right: Rect | null): boolean {
  if (!right) {
    return false
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function textRangesEqual(
  left: TextRangeSelector | undefined,
  right: TextRangeSelector | undefined
): boolean {
  if (!left || !right) {
    return left === right
  }

  return (
    left.start.blockId === right.start.blockId &&
    left.start.inlineOffset === right.start.inlineOffset &&
    left.end.blockId === right.end.blockId &&
    left.end.inlineOffset === right.end.inlineOffset
  )
}
