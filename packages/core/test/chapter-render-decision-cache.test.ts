import { describe, expect, it } from "vitest"
import {
  ChapterRenderDecisionCache,
  createChapterRenderDecision,
  createChapterRenderDecisionCacheKey
} from "../src"

describe("chapter render decision cache", () => {
  it("hits on the same chapter input and invalidates when analyzer config changes", () => {
    const cache = new ChapterRenderDecisionCache()
    let computeCalls = 0

    const firstInput = {
      href: "OPS/chapter.xhtml",
      content: "<html><body><p>Hello</p></body></html>",
      analyzerConfig: {
        domThreshold: 20
      }
    }

    const firstDecision = cache.resolve(firstInput, () => {
      computeCalls += 1
      return createChapterRenderDecision({
        mode: "canvas",
        score: 0,
        reasons: []
      })
    })

    const secondDecision = cache.resolve(firstInput, () => {
      computeCalls += 1
      return createChapterRenderDecision({
        mode: "dom",
        score: 20,
        reasons: ["high-risk-tag:table"]
      })
    })

    const thirdDecision = cache.resolve(
      {
        ...firstInput,
        analyzerConfig: {
          domThreshold: 25
        }
      },
      () => {
        computeCalls += 1
        return createChapterRenderDecision({
          mode: "dom",
          score: 25,
          reasons: ["high-risk-tag:table"]
        })
      }
    )

    expect(firstDecision).toBe(secondDecision)
    expect(thirdDecision).not.toBe(firstDecision)
    expect(computeCalls).toBe(2)
    expect(cache.size()).toBe(2)
  })

  it("keeps theme, typography, and viewport changes out of the pure structure cache key", () => {
    const baseInput = {
      href: "OPS/chapter.xhtml",
      content: "<html><body><p>Hello</p></body></html>",
      analyzerConfig: {
        domThreshold: 20,
        imageDenseThreshold: 8
      }
    }

    const baseKey = createChapterRenderDecisionCacheKey(baseInput)
    const changedKey = createChapterRenderDecisionCacheKey({
      ...baseInput,
      themeKey: "sepia",
      typographyKey: "18/1.6",
      viewportWidth: 430,
      viewportHeight: 932
    })

    expect(changedKey).toBe(baseKey)
  })
})
