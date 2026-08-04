import { describe, expect, it } from "vitest"
import type { ChapterAnalysisInput } from "../src"
import {
  analyzeChapterRenderMode,
  COMPLEX_STYLE_PROPERTIES,
  HIGH_RISK_TAGS
} from "../src"
import {
  CANVAS_BACKLOG_FREEZE_SIGNALS,
  COMPLEX_DOM_STYLE_PROPERTIES,
  HIGH_RISK_DOM_TAGS
} from "../src/runtime/canvas-backlog-boundary"

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

describe("canvas backlog boundary", () => {
  it("keeps analyzer freeze signals aligned with the single source of truth", () => {
    expect(HIGH_RISK_TAGS).toEqual(HIGH_RISK_DOM_TAGS)
    expect(COMPLEX_STYLE_PROPERTIES).toEqual(COMPLEX_DOM_STYLE_PROPERTIES)
    expect(
      CANVAS_BACKLOG_FREEZE_SIGNALS.map((signal) => signal.renderer)
    ).toEqual(["dom", "dom", "dom", "dom", "dom", "dom", "dom", "dom", "dom"])
  })

  it("routes every frozen high-risk tag to dom by default", () => {
    for (const tagName of HIGH_RISK_DOM_TAGS) {
      const decision = analyzeChapterRenderMode(
        createAnalysisInput({
          tagCounts: {
            [tagName]: 1
          }
        })
      )

      expect(decision.mode).toBe("dom")
      expect(decision.reasons).toContain(`high-risk-tag:${tagName}`)
    }
  })

  it("marks every frozen complex style signal as a dom-only backlog reason", () => {
    for (const property of COMPLEX_DOM_STYLE_PROPERTIES) {
      const decision = analyzeChapterRenderMode(
        createAnalysisInput({
          stylePropertyCounts:
            property === "flex" || property === "grid"
              ? { display: 1 }
              : { [property]: 1 },
          stylePropertyValueCounts:
            property === "flex"
              ? { "display:flex": 1 }
              : property === "grid"
                ? { "display:grid": 1 }
                : { [`${property}:active`]: 1 }
        })
      )

      expect(decision.reasons).toContain(`complex-style:${property}`)
      expect(decision.score).toBeGreaterThan(0)
    }
  })
})
