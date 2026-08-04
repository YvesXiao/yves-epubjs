export function extractFontSize(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)px/)
  return match ? Number.parseFloat(match[1]!) : 16
}

const TEXT_WIDTH_CACHE_LIMIT = 20_000
const textWidthCache = new Map<string, number>()
let textMeasurementContext:
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null
  | undefined

export function approximateTextWidth(text: string, font: string): number {
  if (!text) {
    return 0
  }

  const cacheKey = `${font}\n${text}`
  const cached = textWidthCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const context = getTextMeasurementContext()
  if (context) {
    context.font = font
    const measuredWidth = context.measureText(text).width
    cacheTextWidth(cacheKey, measuredWidth)
    return measuredWidth
  }

  const fontSize = extractFontSize(font)
  const wideChars = Array.from(text).filter(
    (char) => char.charCodeAt(0) > 255
  ).length
  const asciiChars = Math.max(0, text.length - wideChars)
  const fallbackWidth =
    wideChars * fontSize * 0.92 + asciiChars * fontSize * 0.56
  cacheTextWidth(cacheKey, fallbackWidth)
  return fallbackWidth
}

export type WrappedTextLine = {
  text: string
  start: number
  end: number
}

export function wrapText(
  text: string,
  maxWidth: number,
  font: string
): string[] {
  return wrapTextWithOffsets(text, maxWidth, font).map((line) => line.text)
}

export function wrapTextWithOffsets(
  text: string,
  maxWidth: number,
  font: string
): WrappedTextLine[] {
  if (!text) {
    return [{ text: "", start: 0, end: 0 }]
  }

  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length > 0)
    let current = ""
    for (const word of words) {
      const candidate = current ? `${current}${word}` : word
      if (approximateTextWidth(candidate, font) <= maxWidth || !current) {
        current = candidate
        continue
      }
      lines.push(current.trimEnd())
      current = word.trimStart()
    }
    lines.push(current.trimEnd())
  }

  const normalizedLines = lines.map((line) => line || "")
  let cursor = 0
  return normalizedLines.map((line) => {
    if (!line) {
      return {
        text: line,
        start: cursor,
        end: cursor
      }
    }

    const start = text.indexOf(line, cursor)
    const safeStart = start >= 0 ? start : cursor
    const end = safeStart + line.length
    cursor = end
    return {
      text: line,
      start: safeStart,
      end
    }
  })
}

export function estimateWrappedTextHeight(
  text: string,
  width: number,
  font: string,
  lineHeight?: number
): number {
  const safeLineHeight =
    lineHeight ?? Math.max(extractFontSize(font) * 1.45, 18)
  return wrapText(text, width, font).length * safeLineHeight
}

function getTextMeasurementContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null {
  if (textMeasurementContext !== undefined) {
    return textMeasurementContext
  }

  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const canvas = document.createElement("canvas")
    textMeasurementContext = canvas.getContext("2d")
    return textMeasurementContext
  }

  if (typeof OffscreenCanvas !== "undefined") {
    textMeasurementContext = new OffscreenCanvas(1, 1).getContext("2d")
    return textMeasurementContext
  }

  textMeasurementContext = null
  return textMeasurementContext
}

function cacheTextWidth(key: string, width: number): void {
  if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
    textWidthCache.clear()
  }
  textWidthCache.set(key, width)
}
