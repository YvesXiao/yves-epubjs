import { approximateTextWidth } from "./text-wrap"

function expandTabs(text: string, tabWidth: number): string {
  return text.replace(/\t/g, " ".repeat(Math.max(1, tabWidth)))
}

export function normalizePreformattedText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")

  if (lines[0]?.trim() === "") {
    lines.shift()
  }
  if (lines.at(-1)?.trim() === "") {
    lines.pop()
  }

  return lines.join("\n")
}

export type WrappedPreformattedLine = {
  text: string
  start: number
  end: number
}

export function wrapPreformattedText(
  text: string,
  maxWidth: number,
  font: string,
  tabWidth = 2
): string[] {
  return wrapPreformattedTextWithOffsets(text, maxWidth, font, tabWidth).map(
    (line) => line.text
  )
}

export function wrapPreformattedTextWithOffsets(
  text: string,
  maxWidth: number,
  font: string,
  tabWidth = 2
): WrappedPreformattedLine[] {
  const safeWidth = Math.max(1, maxWidth)
  const normalized = text.replace(/\r\n?/g, "\n")

  if (!normalized) {
    return [{ text: "", start: 0, end: 0 }]
  }

  const lines: WrappedPreformattedLine[] = []
  let globalOffset = 0
  for (const rawLine of normalized.split("\n")) {
    const expandedLine = expandTabs(rawLine, tabWidth)
    if (!expandedLine) {
      lines.push({
        text: "",
        start: globalOffset,
        end: globalOffset
      })
      globalOffset += rawLine.length + 1
      continue
    }

    let current = ""
    let lineStart = globalOffset
    let consumed = 0
    for (const char of Array.from(expandedLine)) {
      const candidate = current + char
      if (
        current.length === 0 ||
        approximateTextWidth(candidate, font) <= safeWidth
      ) {
        current = candidate
        consumed += char.length
        continue
      }

      lines.push({
        text: current,
        start: lineStart,
        end: lineStart + current.length
      })
      lineStart = globalOffset + consumed - char.length
      current = char
    }

    lines.push({
      text: current,
      start: lineStart,
      end: lineStart + current.length
    })
    globalOffset += rawLine.length + 1
  }

  return lines
}

export function countWrappedPreformattedLines(
  text: string,
  maxWidth: number,
  font: string,
  tabWidth = 2
): number {
  return wrapPreformattedText(text, maxWidth, font, tabWidth).length
}
