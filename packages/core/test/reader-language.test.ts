import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import {
  createSharedChapterRenderInput,
  EpubReader,
  toCanvasChapterRenderInput
} from "../src"

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

describe("EpubReader reading language context", () => {
  it("exposes resolved language context and activates rtl direction experimentally on dom chapters", async () => {
    const container = createContainer()
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/arabic.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar">
          <body>
            <section>
              <p>مرحبا</p>
              <table><tr><td>rtl fallback</td></tr></table>
            </section>
          </body>
        </html>`
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    }
    const book: Book = {
      metadata: {
        title: "Arabic Reader",
        language: "ar"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    const reader = new EpubReader({ container, mode: "scroll" })

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).book = book
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).chapterRenderInputs = [sharedInput]

    await reader.render()

    expect(reader.getReadingLanguageContext()).toEqual({
      spineIndex: 0,
      sectionId: "section-1",
      sectionHref: "OPS/arabic.xhtml",
      bookLanguage: "ar",
      sectionLanguage: "ar",
      resolvedLanguage: "ar",
      contentDirection: "rtl",
      rtlSuggested: true,
      rtlActive: false
    })
    expect(container.dataset.contentDirection).toBe("rtl")
    expect(container.dataset.experimentalRtl).toBe("disabled")
    expect(container.getAttribute("dir")).toBeNull()
    expect(
      container.querySelector(".epub-dom-section")?.getAttribute("dir")
    ).toBeNull()

    await reader.submitPreferences({
      experimentalRtl: true
    })

    expect(reader.getReadingLanguageContext()?.rtlActive).toBe(true)
    expect(reader.getSettings().experimentalRtl).toBe(true)
    expect(container.dataset.experimentalRtl).toBe("enabled")
    expect(container.dir).toBe("rtl")
    expect(container.lang).toBe("ar")
    expect(
      container.querySelector(".epub-dom-section")?.getAttribute("dir")
    ).toBe("rtl")
    expect(
      container.querySelector(".epub-dom-section")?.getAttribute("lang")
    ).toBe("ar")
  })
})
