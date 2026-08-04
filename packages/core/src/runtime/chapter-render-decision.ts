import type { ChapterRenderDecision, RenderMode } from "../model/types"

export type CreateChapterRenderDecisionInput = {
  mode?: RenderMode
  score?: number
  reasons?: string[]
}

export function createChapterRenderDecision(
  input: CreateChapterRenderDecisionInput = {}
): ChapterRenderDecision {
  return {
    mode: input.mode ?? "canvas",
    score: input.score ?? 0,
    reasons: [...(input.reasons ?? [])]
  }
}
