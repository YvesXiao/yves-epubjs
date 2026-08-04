import { describe, expect, it } from "vitest"
import type { ChapterAnalysisInput } from "../src"
import {
  analyzeChapterRenderMode,
  DEFAULT_CHAPTER_RENDER_ANALYZER_CONFIG,
  scoreChapterComplexity
} from "../src"

function createAnalysisInput(
  overrides: Partial<ChapterAnalysisInput> = {}
): ChapterAnalysisInput {
  return {
    href: "OPS/test.xhtml",
    rootTagName: "body",
    nodeCount: 0,
    elementCount: 0,
    textNodeCount: 0,
    maxDepth: 0,
    tagCounts: {},
    styledElementCount: 0,
    inlineStyleDeclarationCount: 0,
    stylePropertyCounts: {},
    stylePropertyValueCounts: {},
    classTokenCount: 0,
    idAttributeCount: 0,
    ...overrides
  }
}

describe("chapter render threshold policy", () => {
  it("keeps the evaluated dom threshold at 20", () => {
    expect(DEFAULT_CHAPTER_RENDER_ANALYZER_CONFIG.domThreshold).toBe(20)
  })

  it("keeps a single frozen complex-style signal on canvas", () => {
    const analysis = createAnalysisInput({
      stylePropertyCounts: {
        float: 1
      },
      stylePropertyValueCounts: {
        "float:left": 1
      }
    })

    const scored = scoreChapterComplexity(analysis)
    const decision = analyzeChapterRenderMode(analysis)

    expect(scored.score).toBe(15)
    expect(scored.reasons).toEqual(["complex-style:float"])
    expect(decision).toEqual({
      mode: "canvas",
      score: 15,
      reasons: ["complex-style:float"]
    })
  })

  it("routes a single high-risk tag to dom at the current threshold", () => {
    const analysis = createAnalysisInput({
      tagCounts: {
        table: 1
      }
    })

    const scored = scoreChapterComplexity(analysis)
    const decision = analyzeChapterRenderMode(analysis)

    expect(scored.score).toBe(20)
    expect(decision).toEqual({
      mode: "dom",
      score: 20,
      reasons: ["high-risk-tag:table"]
    })
  })

  it("routes publisher typography with two frozen style signals to dom", () => {
    const analysis = createAnalysisInput({
      stylePropertyCounts: {
        float: 1,
        "text-indent": 1
      },
      stylePropertyValueCounts: {
        "float:left": 1,
        "text-indent:2em": 1
      }
    })

    const scored = scoreChapterComplexity(analysis)
    const decision = analyzeChapterRenderMode(analysis)

    expect(scored.score).toBe(30)
    expect(decision).toEqual({
      mode: "dom",
      score: 30,
      reasons: ["complex-style:float", "complex-style:text-indent"]
    })
  })
})
