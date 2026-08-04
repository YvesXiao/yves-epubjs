import type { BlockNode, TextRangeSelector } from "../model/types"

export function normalizeTextRangeSelector(
  input: TextRangeSelector
): TextRangeSelector {
  const normalized = {
    start: {
      blockId: input.start.blockId.trim(),
      inlineOffset: Math.max(0, Math.trunc(input.start.inlineOffset))
    },
    end: {
      blockId: input.end.blockId.trim(),
      inlineOffset: Math.max(0, Math.trunc(input.end.inlineOffset))
    }
  }

  if (
    normalized.start.blockId === normalized.end.blockId &&
    normalized.end.inlineOffset < normalized.start.inlineOffset
  ) {
    return {
      start: normalized.end,
      end: normalized.start
    }
  }

  return normalized
}

export function toTransparentHighlightColor(color?: string): string {
  if (!color) {
    return "rgba(59, 130, 246, 0.18)"
  }

  const normalized = color.trim()
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!hex) {
    return normalized
  }

  const raw = hex[1]!
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, 0.18)`
}

export function collectBlockIdsInReadingOrder(blocks: BlockNode[]): string[] {
  const orderedIds: string[] = []

  for (const block of blocks) {
    orderedIds.push(block.id)
    switch (block.kind) {
      case "quote":
      case "aside":
      case "nav":
        orderedIds.push(...collectBlockIdsInReadingOrder(block.blocks))
        break
      case "figure":
        orderedIds.push(...collectBlockIdsInReadingOrder(block.blocks))
        if (block.caption) {
          orderedIds.push(...collectBlockIdsInReadingOrder(block.caption))
        }
        break
      case "list":
        for (const item of block.items) {
          orderedIds.push(item.id)
          orderedIds.push(...collectBlockIdsInReadingOrder(item.blocks))
        }
        break
      case "table":
        if (block.caption) {
          orderedIds.push(...collectBlockIdsInReadingOrder(block.caption))
        }
        for (const row of block.rows) {
          orderedIds.push(row.id)
          for (const cell of row.cells) {
            orderedIds.push(cell.id)
            orderedIds.push(...collectBlockIdsInReadingOrder(cell.blocks))
          }
        }
        break
      case "definition-list":
        for (const item of block.items) {
          orderedIds.push(item.id)
          orderedIds.push(...collectBlockIdsInReadingOrder(item.term))
          for (const description of item.descriptions) {
            orderedIds.push(...collectBlockIdsInReadingOrder(description))
          }
        }
        break
      default:
        break
    }
  }

  return orderedIds
}
