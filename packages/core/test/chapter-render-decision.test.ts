import { describe, expect, it } from "vitest"
import {
  createChapterRenderDecision,
  type ChapterRenderDecision,
  type RenderMode
} from "../src"

describe("chapter render decision", () => {
  it("creates a default canvas decision with complete fields", () => {
    const decision = createChapterRenderDecision()

    expect(decision).toEqual({
      mode: "canvas",
      score: 0,
      reasons: []
    } satisfies ChapterRenderDecision)
  })

  it("supports explicit render mode, score, and reasons", () => {
    const mode: RenderMode = "dom"
    const reasons = ["table", "complex-style"]
    const decision = createChapterRenderDecision({
      mode,
      score: 30,
      reasons
    })

    expect(decision).toEqual({
      mode: "dom",
      score: 30,
      reasons: ["table", "complex-style"]
    } satisfies ChapterRenderDecision)
    expect(decision.reasons).not.toBe(reasons)
  })
})
