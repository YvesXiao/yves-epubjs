import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import {
  createSharedChapterRenderInput,
  EpubReader,
  toCanvasChapterRenderInput
} from "../src"
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter"

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

describe("EpubReader publisher styles", () => {
  it("keeps linked stylesheets and inline styles in DOM mode when publisher styles are enabled", async () => {
    const container = createContainer()
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/publisher.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <p class="callout" style="margin-bottom: 36px">
                <img src="images/photo.png" style="background-image: url('images/bg.png')" alt="Photo" />
              </p>
              <table><tr><td>Complex chapter</td></tr></table>
            </section>
          </body>
        </html>`,
      linkedStyleSheets: [
        {
          href: "OPS/styles/publisher.css",
          mediaType: "text/css",
          text: ".callout { color: #b91c1c; }",
          ast: parseCssStyleSheet(".callout { color: #b91c1c; }")
        }
      ]
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    }
    const book: Book = {
      metadata: { title: "Publisher Styles" },
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

    expect(
      container.querySelector(
        "style[data-epub-dom-source='OPS/styles/publisher.css']"
      )?.textContent
    ).toContain(".epub-dom-section .callout")
    expect(container.querySelector("img")?.getAttribute("style")).toContain(
      "background-image"
    )
    expect(reader.getRenderDiagnostics()?.publisherStyles).toBe("enabled")
  })

  it("suppresses linked stylesheets and inline style attributes in DOM mode when disabled", async () => {
    const container = createContainer()
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/publisher.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <p class="callout" style="margin-bottom: 36px">
                <img src="images/photo.png" style="background-image: url('images/bg.png')" alt="Photo" />
              </p>
              <table><tr><td>Complex chapter</td></tr></table>
            </section>
          </body>
        </html>`,
      linkedStyleSheets: [
        {
          href: "OPS/styles/publisher.css",
          mediaType: "text/css",
          text: ".callout { color: #b91c1c; }",
          ast: parseCssStyleSheet(".callout { color: #b91c1c; }")
        }
      ]
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    }
    const book: Book = {
      metadata: { title: "Publisher Styles" },
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

    await reader.submitPreferences({
      publisherStyles: "disabled"
    })
    await reader.render()

    expect(container.querySelector("style[data-epub-dom-source]")).toBeFalsy()
    expect(container.querySelector("img")?.getAttribute("style")).toBeNull()
    expect(reader.getSettings().publisherStyles).toBe("disabled")
    expect(reader.getRenderDiagnostics()?.publisherStyles).toBe("disabled")
  })
})
