import { describe, expect, it } from "vitest"
import {
  buildReadingStyleCssVariables,
  buildReadingStyleProfile
} from "../src/renderer/reading-style-profile"

describe("reading style profile", () => {
  it("builds stable profile values from theme and typography", () => {
    const profile = buildReadingStyleProfile({
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      }
    })

    expect(profile.name).toBe("default-reflowable")
    expect(profile.section.sidePadding).toBe(8)
    expect(profile.section.bottomPadding).toBe(24)
    expect(profile.text.marginBottom).toBe(12)
    expect(profile.heading.marginBottom).toBe(12)
    expect(profile.link.color).toBe("#1b4b72")
    expect(profile.caption.fontSize).toBe(17)
    expect(profile.caption.insetX).toBe(12)
    expect(profile.code.fontSize).toBe(17)
    expect(profile.code.blockPaddingX).toBe(12)
    expect(profile.media.blockSpacing).toBe(10)
    expect(profile.quote.accentGap).toBe(16)
    expect(profile.table.cellPadding).toBe(10)
  })

  it("builds css variables from the baseline profile", () => {
    const profile = buildReadingStyleProfile({
      theme: {
        color: "#ecf4ff",
        background: "#182028"
      },
      typography: {
        fontSize: 20,
        lineHeight: 1.7,
        paragraphSpacing: 14
      }
    })

    const variables = buildReadingStyleCssVariables(profile)

    expect(variables["--reader-side-padding"]).toBe("8px")
    expect(variables["--reader-bottom-padding"]).toBe("24px")
    expect(variables["--reader-link-color"]).toBe("#1b4b72")
    expect(variables["--reader-caption-color"]).toBe("#cbd5e1")
    expect(variables["--reader-code-bg"]).toBe("#0b1220")
    expect(variables["--reader-inline-code-color"]).toBe("#f8fafc")
    expect(variables["--reader-mark-bg"]).toBe("rgba(250, 204, 21, 0.22)")
    expect(variables["--reader-table-cell-padding"]).toBe("10px")
  })
})
