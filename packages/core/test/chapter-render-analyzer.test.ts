import { describe, expect, it } from "vitest"
import {
  analyzeChapterRenderMode,
  collectComplexStyleReasons,
  collectHighRiskTagReasons,
  scoreChapterComplexity,
  type ChapterAnalysisInput
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

describe("chapter render analyzer", () => {
  it("detects configured high-risk tags without flagging ordinary tags", () => {
    const reasons = collectHighRiskTagReasons(
      createAnalysisInput({
        tagCounts: {
          p: 4,
          img: 1,
          table: 1,
          svg: 2,
          iframe: 1
        }
      })
    )

    expect(reasons).toEqual([
      "high-risk-tag:table",
      "high-risk-tag:svg",
      "high-risk-tag:iframe"
    ])
  })

  it("detects configured complex style properties without flagging ordinary text styles", () => {
    const reasons = collectComplexStyleReasons(
      createAnalysisInput({
        stylePropertyCounts: {
          color: 1,
          "font-size": 1,
          float: 1,
          "text-indent": 1,
          position: 1,
          display: 2
        },
        stylePropertyValueCounts: {
          "display:flex": 1,
          "display:grid": 1
        }
      })
    )

    expect(reasons).toEqual([
      "complex-style:float",
      "complex-style:text-indent",
      "complex-style:position",
      "complex-style:flex",
      "complex-style:grid"
    ])
  })

  it("does not escalate ordinary display declarations into dom-only layout signals", () => {
    const reasons = collectComplexStyleReasons(
      createAnalysisInput({
        stylePropertyCounts: {
          display: 2,
          color: 1,
          "font-size": 1
        },
        stylePropertyValueCounts: {
          "display:block": 1,
          "display:inline-block": 1
        }
      })
    )

    expect(reasons).toEqual([])
  })

  it("prefers canvas for low-complexity chapters", () => {
    const analysis = createAnalysisInput({
      nodeCount: 42,
      maxDepth: 4,
      tagCounts: {
        p: 6,
        h1: 1,
        img: 1
      },
      stylePropertyCounts: {
        color: 2,
        "font-size": 2
      },
      stylePropertyValueCounts: {
        "color:#333": 2,
        "font-size:1em": 2
      }
    })

    const decision = analyzeChapterRenderMode(analysis)

    expect(decision).toEqual({
      mode: "canvas",
      score: 0,
      reasons: []
    })
  })

  it("forces dom for high-complexity chapters with high-risk tags", () => {
    const analysis = createAnalysisInput({
      tagCounts: {
        p: 3,
        table: 1,
        svg: 1
      }
    })

    const decision = analyzeChapterRenderMode(analysis)

    expect(decision.mode).toBe("dom")
    expect(decision.score).toBe(40)
    expect(decision.reasons).toEqual([
      "high-risk-tag:table",
      "high-risk-tag:svg"
    ])
  })

  it("accumulates multiple weaker signals into a dom decision when threshold is exceeded", () => {
    const analysis = createAnalysisInput({
      nodeCount: 320,
      maxDepth: 7,
      inlineStyleDeclarationCount: 14,
      tagCounts: {
        p: 12,
        img: 9
      },
      stylePropertyCounts: {
        float: 1
      },
      stylePropertyValueCounts: {
        "float:left": 1
      }
    })

    const scored = scoreChapterComplexity(analysis)
    const decision = analyzeChapterRenderMode(analysis)

    expect(scored).toEqual({
      score: 43,
      reasons: [
        "complex-style:float",
        "deep-nest:7",
        "image-dense:9",
        "large-node-count:320",
        "complex-inline-style:14"
      ]
    })
    expect(decision.mode).toBe("dom")
    expect(decision.score).toBe(43)
  })
})
