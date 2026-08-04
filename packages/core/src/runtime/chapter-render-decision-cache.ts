import type { ChapterRenderDecision } from "../model/types"
import type { ChapterRenderAnalyzerConfig } from "./chapter-render-analyzer"

export type ChapterRenderDecisionCacheKeyInput = {
  href: string
  content: string
  analyzerConfig?: Partial<ChapterRenderAnalyzerConfig>
  themeKey?: string
  typographyKey?: string
  viewportWidth?: number
  viewportHeight?: number
}

export class ChapterRenderDecisionCache {
  private readonly cache = new Map<string, ChapterRenderDecision>()

  get(
    input: ChapterRenderDecisionCacheKeyInput
  ): ChapterRenderDecision | undefined {
    return this.cache.get(createChapterRenderDecisionCacheKey(input))
  }

  set(
    input: ChapterRenderDecisionCacheKeyInput,
    decision: ChapterRenderDecision
  ): ChapterRenderDecision {
    const key = createChapterRenderDecisionCacheKey(input)
    this.cache.set(key, decision)
    return decision
  }

  resolve(
    input: ChapterRenderDecisionCacheKeyInput,
    compute: () => ChapterRenderDecision
  ): ChapterRenderDecision {
    const cached = this.get(input)
    if (cached) {
      return cached
    }

    return this.set(input, compute())
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

export function createChapterRenderDecisionCacheKey(
  input: ChapterRenderDecisionCacheKeyInput
): string {
  return JSON.stringify({
    href: input.href,
    content: input.content,
    analyzerConfig: normalizeAnalyzerConfig(input.analyzerConfig)
  })
}

function normalizeAnalyzerConfig(
  config: Partial<ChapterRenderAnalyzerConfig> | undefined
): Record<string, number> {
  if (!config) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(config)
      .filter(
        (entry): entry is [string, number] => typeof entry[1] === "number"
      )
      .sort(([left], [right]) => left.localeCompare(right))
  )
}
