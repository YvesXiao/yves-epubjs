import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  analyzeChapterRenderMode,
  buildChapterAnalysisInput,
  createSharedChapterRenderInput,
  parseXhtmlDocument
} from "../src"

const ROOT = resolve(__dirname, "../../..")
const FIXTURE_ROOT = resolve(ROOT, "test-fixtures/books/hybrid-render-fallback")

describe("hybrid render fixtures", () => {
  it("matches expected chapter render mode decisions for every fallback sample", () => {
    const fixtureInfo = JSON.parse(
      readFileSync(resolve(FIXTURE_ROOT, "fixture-info.json"), "utf8")
    ) as {
      samples: Array<{
        id: string
        file: string
        expectedMode: "canvas" | "dom"
      }>
    }

    for (const sample of fixtureInfo.samples) {
      const content = readFileSync(resolve(FIXTURE_ROOT, sample.file), "utf8")
      const input = createSharedChapterRenderInput({
        href: `OPS/${sample.file}`,
        content
      })
      const decision = analyzeChapterRenderMode(
        buildChapterAnalysisInput({
          href: input.href,
          chapter: input.preprocessed
        })
      )

      expect(decision.mode, sample.id).toBe(sample.expectedMode)
    }
  })

  it("keeps fixture chapters consumable by the existing section parser", () => {
    const canvasSection = parseXhtmlDocument(
      readFileSync(
        resolve(FIXTURE_ROOT, "chapters/canvas-linear.xhtml"),
        "utf8"
      ),
      "OPS/chapters/canvas-linear.xhtml"
    )
    const domSection = parseXhtmlDocument(
      readFileSync(resolve(FIXTURE_ROOT, "chapters/dom-complex.xhtml"), "utf8"),
      "OPS/chapters/dom-complex.xhtml"
    )

    expect(canvasSection.blocks.length).toBeGreaterThan(0)
    expect(canvasSection.blocks.every((block) => block.kind !== "table")).toBe(
      true
    )
    expect(domSection.blocks.some((block) => block.kind === "table")).toBe(true)
  })
})
