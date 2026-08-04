import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { LayoutEngine } from "../src/layout/layout-engine"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"
import { DisplayListBuilder } from "../src/renderer/display-list-builder"

const ROOT = resolve(__dirname, "../../..")
const FIXTURE_ROOT = resolve(ROOT, "test-fixtures/books/reflowable-compat")
const typography = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12
} as const
const theme = {
  color: "#1f2328",
  background: "#fffdf7"
} as const

describe("reflowable compatibility fixtures", () => {
  it("parses and renders every compatibility chapter sample", () => {
    const fixtureInfo = JSON.parse(
      readFileSync(resolve(FIXTURE_ROOT, "fixture-info.json"), "utf8")
    ) as {
      samples: Array<{ id: string; file: string }>
    }

    const engine = new LayoutEngine()
    const builder = new DisplayListBuilder()

    for (const sample of fixtureInfo.samples) {
      const xml = readFileSync(resolve(FIXTURE_ROOT, sample.file), "utf8")
      const section = parseXhtmlDocument(xml, `OPS/${sample.file}`)
      const layout = engine.layout(
        {
          section,
          spineIndex: 0,
          viewportWidth: 320,
          viewportHeight: 640,
          typography,
          fontFamily: "serif"
        },
        "scroll"
      )
      const displayList = builder.buildSection({
        section,
        width: 320,
        viewportHeight: 640,
        blocks: layout.blocks,
        theme,
        typography,
        activeBlockId: undefined
      })

      expect(section.blocks.length, sample.id).toBeGreaterThan(0)
      expect(layout.blocks.length, sample.id).toBe(section.blocks.length)
      expect(displayList.ops.length, sample.id).toBeGreaterThan(0)
    }
  })

  it("keeps footnote anchors and figure samples readable through fixtures", () => {
    const footnotes = parseXhtmlDocument(
      readFileSync(resolve(FIXTURE_ROOT, "chapters/footnotes.xhtml"), "utf8"),
      "OPS/chapters/footnotes.xhtml"
    )
    const figure = parseXhtmlDocument(
      readFileSync(resolve(FIXTURE_ROOT, "chapters/figure-note.xhtml"), "utf8"),
      "OPS/chapters/figure-note.xhtml"
    )

    expect(footnotes.anchors["note-1"]).toBeTruthy()
    expect(figure.blocks.map((block) => block.kind)).toEqual([
      "figure",
      "aside"
    ])
  })
})
