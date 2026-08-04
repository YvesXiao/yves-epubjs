import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

function createContainer(): HTMLDivElement {
  const container = document.createElement("div")
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: 320
  })
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    value: 480
  })
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    writable: true,
    value: 0
  })
  document.body.appendChild(container)
  return container
}

describe("EpubReader preferences", () => {
  it("submits unified preferences and exposes resolved settings", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container })

    const settings = await reader.submitPreferences({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 22,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })

    expect(reader.getPreferences()).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 22,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })
    expect(settings).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 22,
        lineHeight: 1.6,
        paragraphSpacing: 12,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })
    expect(reader.getSettings()).toEqual(settings)
    expect(reader.getTheme()).toEqual(settings.theme)
    expect(reader.getTypography()).toEqual(settings.typography)
    expect(container.style.fontSize).toBe("22px")
    expect(container.style.fontFamily).toBe("Georgia, serif")
    expect(container.style.letterSpacing).toBe("0.5px")
    expect(container.style.wordSpacing).toBe("3px")
    expect(container.style.getPropertyValue("--reader-bottom-padding")).toBe(
      "24px"
    )
  })

  it("restores serialized preferences and replaces previous explicit values", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container })

    await reader.submitPreferences({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 21,
        lineHeight: 1.75,
        fontFamily: "Georgia, serif"
      }
    })
    const serialized = reader.serializePreferences()

    await reader.submitPreferences({
      mode: "scroll",
      publisherStyles: "enabled",
      experimentalRtl: false,
      spreadMode: "none",
      theme: {
        background: "#eef4ea",
        color: "#203126"
      },
      typography: {
        fontSize: 16,
        paragraphSpacing: 20,
        letterSpacing: 0.2
      }
    })
    const restored = await reader.restorePreferences(serialized)

    expect(reader.getPreferences()).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 21,
        lineHeight: 1.75,
        fontFamily: "Georgia, serif"
      }
    })
    expect(restored).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 21,
        lineHeight: 1.75,
        paragraphSpacing: 12,
        fontFamily: "Georgia, serif",
        letterSpacing: 0,
        wordSpacing: 0
      }
    })
  })

  it("captures the mode-switch locator before applying the next mode and clears it after render", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: []
    }
    const book: Book = {
      metadata: { title: "Preferences Hook" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book | null
      locator: {
        spineIndex: number
        progressInSection: number
        blockId?: string
      } | null
      mode: "scroll" | "paginated"
      currentSectionIndex: number
      pendingModeSwitchLocator: {
        spineIndex: number
        progressInSection: number
        blockId?: string
      } | null
      captureModeSwitchLocator(): {
        spineIndex: number
        progressInSection: number
        blockId?: string
      } | null
      renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
    }
    state.book = book
    state.locator = {
      spineIndex: 0,
      progressInSection: 0,
      blockId: "old-block"
    }

    const seen: Array<string> = []
    state.captureModeSwitchLocator = () => {
      seen.push(`capture:${state.mode}`)
      return {
        spineIndex: 0,
        progressInSection: 0.6,
        blockId: "captured-block"
      }
    }
    state.renderCurrentSection = (renderBehavior = "relocate") => {
      seen.push(
        `render:${renderBehavior}:${state.mode}:${state.currentSectionIndex}:${state.locator?.blockId}:${state.pendingModeSwitchLocator?.blockId}`
      )
    }

    await reader.submitPreferences({
      mode: "paginated"
    })

    expect(seen).toEqual([
      "capture:scroll",
      "render:relocate:paginated:0:captured-block:captured-block"
    ])
    expect(state.pendingModeSwitchLocator).toBeNull()
    expect(reader.getCurrentLocation()).toEqual({
      spineIndex: 0,
      progressInSection: 0.6,
      blockId: "captured-block"
    })
  })

  it("does not capture a mode-switch locator for non-mode preference updates", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: []
    }
    const book: Book = {
      metadata: { title: "Preferences No Capture" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book | null
      pendingModeSwitchLocator: unknown
      captureModeSwitchLocator(): {
        spineIndex: number
        progressInSection: number
      } | null
      renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
    }
    state.book = book

    let captureCount = 0
    state.captureModeSwitchLocator = () => {
      captureCount += 1
      return {
        spineIndex: 0,
        progressInSection: 0.5
      }
    }
    state.renderCurrentSection = () => {}

    await reader.submitPreferences({
      typography: {
        fontSize: 20
      }
    })

    expect(captureCount).toBe(0)
    expect(state.pendingModeSwitchLocator).toBeNull()
  })
})
