import { describe, expect, it } from "vitest"
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"
import { preprocessChapterDocument } from "../src/runtime/chapter-preprocess"
import {
  stripPublisherStylesFromPreprocessedNodes,
  stripPublisherStylesFromSection
} from "../src/runtime/publisher-styles"

describe("publisher styles helpers", () => {
  it("removes stylesheet-derived block and inline styles from section documents", () => {
    const stylesheet = parseCssStyleSheet(`
      p.callout { color: #b91c1c; margin-bottom: 28px; }
      p.callout strong { background-color: #fde68a; }
    `)
    const section = parseXhtmlDocument(
      `<?xml version="1.0"?>
      <html>
        <body>
          <p class="callout">Alpha <strong>Beta</strong></p>
        </body>
      </html>`,
      "OPS/chapter.xhtml",
      [stylesheet]
    )

    const stripped = stripPublisherStylesFromSection({
      ...section,
      id: "section-1"
    })

    expect(section.blocks[0]?.style?.color).toBe("#b91c1c")
    expect(section.blocks[0]?.style?.marginBottom).toBe(28)
    expect(
      section.blocks[0]?.kind === "text" &&
        section.blocks[0].inlines[1]?.kind === "strong"
        ? section.blocks[0].inlines[1].style?.backgroundColor
        : undefined
    ).toBe("#fde68a")
    expect(stripped.blocks[0]?.style).toBeUndefined()
    expect(
      stripped.blocks[0]?.kind === "text" &&
        stripped.blocks[0].inlines[1]?.kind === "strong"
        ? stripped.blocks[0].inlines[1].style
        : undefined
    ).toBeUndefined()
  })

  it("removes style tags, body stylesheet links, and inline style attributes from dom nodes", () => {
    const preprocessed = preprocessChapterDocument({
      href: "OPS/chapter.xhtml",
      content: `<?xml version="1.0"?>
        <html>
          <body>
            <link rel="stylesheet" href="../styles/book.css" />
            <style>.callout { color: red; }</style>
            <p class="callout" style="margin-bottom: 28px">Alpha</p>
          </body>
        </html>`
    })

    const stripped = stripPublisherStylesFromPreprocessedNodes(
      preprocessed.nodes
    )

    expect(stripped).toHaveLength(1)
    expect(stripped[0]).toEqual({
      kind: "element",
      tagName: "p",
      attributes: {
        class: "callout"
      },
      children: [{ kind: "text", text: "Alpha" }]
    })
  })
})
