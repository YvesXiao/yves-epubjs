import { describe, expect, it } from "vitest"
import {
  countWrappedPreformattedLines,
  normalizePreformattedText,
  wrapPreformattedText
} from "../src/utils/preformatted-text"

describe("preformatted text utilities", () => {
  it("preserves indentation while normalizing surrounding pre block newlines", () => {
    expect(
      normalizePreformattedText("\n  const value = 1\n    return value\n")
    ).toBe("  const value = 1\n    return value")
  })

  it("wraps long lines without collapsing spaces", () => {
    const font = '400 14px "SFMono-Regular", Consolas, monospace'
    const lines = wrapPreformattedText("  alpha beta gamma", 48, font)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]?.startsWith("  ")).toBe(true)
    expect(lines.join("")).toBe("  alpha beta gamma")
  })

  it("counts wrapped lines consistently with the wrapper output", () => {
    const font = '400 14px "SFMono-Regular", Consolas, monospace'
    const text = "alpha\n  beta gamma delta"

    expect(countWrappedPreformattedLines(text, 64, font)).toBe(
      wrapPreformattedText(text, 64, font).length
    )
  })
})
