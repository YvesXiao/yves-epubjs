import { describe, expect, it } from "vitest"
import {
  createSharedChapterRenderInput,
  parseCssStyleSheet,
  parseXhtmlDocument,
  toCanvasChapterRenderInput,
  toDomChapterRenderInput
} from "../src"

const SAMPLE_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
    <head>
      <title>Shared Input Chapter</title>
    </head>
    <body>
      <section id="intro">
        <h1>Intro</h1>
        <p>Hello <strong>world</strong>.</p>
      </section>
    </body>
  </html>`

describe("chapter render input", () => {
  it("lets canvas and dom paths share the same preprocessed chapter result", () => {
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/shared-input.xhtml",
      content: SAMPLE_CHAPTER
    })

    const canvasInput = toCanvasChapterRenderInput(sharedInput)
    const domInput = toDomChapterRenderInput(sharedInput)

    expect(canvasInput.preprocessed).toBe(sharedInput.preprocessed)
    expect(domInput.preprocessed).toBe(sharedInput.preprocessed)
    expect(domInput.chapter).toBe(sharedInput.preprocessed)
    expect(canvasInput.kind).toBe("canvas")
    expect(domInput.kind).toBe("dom")
  })

  it("keeps the existing canvas chapter parsing output stable", () => {
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/shared-input.xhtml",
      content: SAMPLE_CHAPTER
    })

    const canvasInput = toCanvasChapterRenderInput(sharedInput)
    const directSection = parseXhtmlDocument(
      SAMPLE_CHAPTER,
      "OPS/shared-input.xhtml"
    )

    expect(canvasInput.section).toEqual(directSection)
    expect(canvasInput.section.title).toBe("Shared Input Chapter")
    expect(canvasInput.section.blocks[0]?.kind).toBe("heading")
    expect(canvasInput.section.blocks[1]?.kind).toBe("text")
  })

  it("keeps linked stylesheet resources shared across canvas and dom inputs", () => {
    const stylesheet = {
      href: "OPS/styles/chapter.css",
      mediaType: "text/css",
      text: ".badge { height: 1.1em; }",
      ast: parseCssStyleSheet(".badge { height: 1.1em; }")
    }
    const chapter = `<?xml version="1.0" encoding="utf-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>
          <p><img class="badge" src="badge.png" width="20" height="20" alt="Badge" /></p>
        </body>
      </html>`

    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/shared-input.xhtml",
      content: chapter,
      linkedStyleSheets: [stylesheet]
    })

    const canvasInput = toCanvasChapterRenderInput(sharedInput)
    const domInput = toDomChapterRenderInput(sharedInput)
    const directSection = parseXhtmlDocument(
      chapter,
      "OPS/shared-input.xhtml",
      [stylesheet.ast]
    )
    const inlineImage =
      canvasInput.section.blocks[0]?.kind === "text"
        ? canvasInput.section.blocks[0].inlines[0]
        : undefined

    expect(domInput.linkedStyleSheets).toEqual([stylesheet])
    expect(canvasInput.section).toEqual(directSection)
    expect(inlineImage).toMatchObject({
      kind: "image",
      style: {
        height: 17.6
      }
    })
  })
})
