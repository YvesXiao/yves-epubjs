import type { ChapterAnalysisInput } from "./chapter-analysis-input"
import type { ChapterRenderDecision } from "../model/types"
import { createChapterRenderDecision } from "./chapter-render-decision"
import {
  COMPLEX_DOM_STYLE_PROPERTIES,
  HIGH_RISK_DOM_TAGS
} from "./canvas-backlog-boundary"

export const HIGH_RISK_TAGS = HIGH_RISK_DOM_TAGS

export const COMPLEX_STYLE_PROPERTIES = COMPLEX_DOM_STYLE_PROPERTIES

// Analyzer deliberately treats layout-heavy CSS as an opt-in DOM signal.
// We only escalate flex/grid when the declaration value itself is `display:flex`
// or `display:grid`; ordinary `display:block` / `display:inline-block` should
// stay on the canvas-friendly path and must not trigger fallback by themselves.
// The source-of-truth freeze list lives in `canvas-backlog-boundary.ts`; adding
// new complex CSS compatibility work now requires updating that boundary first.

export type ChapterRenderAnalyzerConfig = {
  domThreshold: number
  deepNestThreshold: number
  imageDenseThreshold: number
  largeNodeCountThreshold: number
  complexInlineStyleThreshold: number
}

export const DEFAULT_CHAPTER_RENDER_ANALYZER_CONFIG: ChapterRenderAnalyzerConfig =
  {
    // `20` is deliberate:
    // - one high-risk tag (20) routes directly to DOM
    // - one frozen complex-style signal (15) stays on canvas unless combined
    // - two frozen complex-style signals (30) route to DOM
    domThreshold: 20,
    deepNestThreshold: 6,
    imageDenseThreshold: 8,
    largeNodeCountThreshold: 300,
    complexInlineStyleThreshold: 12
  }

export function collectHighRiskTagReasons(
  input: Pick<ChapterAnalysisInput, "tagCounts">
): string[] {
  const reasons: string[] = []

  for (const tagName of HIGH_RISK_TAGS) {
    if ((input.tagCounts[tagName] ?? 0) > 0) {
      reasons.push(`high-risk-tag:${tagName}`)
    }
  }

  return reasons
}

export function collectComplexStyleReasons(
  input: Pick<
    ChapterAnalysisInput,
    "stylePropertyCounts" | "stylePropertyValueCounts"
  >
): string[] {
  const reasons: string[] = []

  for (const property of COMPLEX_STYLE_PROPERTIES) {
    if (hasComplexStyleProperty(input, property)) {
      reasons.push(`complex-style:${property}`)
    }
  }

  return reasons
}

export function scoreChapterComplexity(
  input: ChapterAnalysisInput,
  config: Partial<ChapterRenderAnalyzerConfig> = {}
): { score: number; reasons: string[] } {
  const resolvedConfig = {
    ...DEFAULT_CHAPTER_RENDER_ANALYZER_CONFIG,
    ...config
  }
  const reasons: string[] = []
  let score = 0

  for (const reason of collectHighRiskTagReasons(input)) {
    reasons.push(reason)
    score += 20
  }

  for (const reason of collectComplexStyleReasons(input)) {
    reasons.push(reason)
    score += 15
  }

  if (input.maxDepth > resolvedConfig.deepNestThreshold) {
    reasons.push(`deep-nest:${input.maxDepth}`)
    score += 5
  }

  const imageCount = input.tagCounts.img ?? 0
  if (imageCount >= resolvedConfig.imageDenseThreshold) {
    reasons.push(`image-dense:${imageCount}`)
    score += 8
  }

  if (input.nodeCount >= resolvedConfig.largeNodeCountThreshold) {
    reasons.push(`large-node-count:${input.nodeCount}`)
    score += 5
  }

  if (
    input.inlineStyleDeclarationCount >=
    resolvedConfig.complexInlineStyleThreshold
  ) {
    reasons.push(`complex-inline-style:${input.inlineStyleDeclarationCount}`)
    score += 10
  }

  return {
    score,
    reasons
  }
}

export function analyzeChapterRenderMode(
  input: ChapterAnalysisInput,
  config: Partial<ChapterRenderAnalyzerConfig> = {}
): ChapterRenderDecision {
  const resolvedConfig = {
    ...DEFAULT_CHAPTER_RENDER_ANALYZER_CONFIG,
    ...config
  }
  const scored = scoreChapterComplexity(input, resolvedConfig)

  return createChapterRenderDecision({
    mode: scored.score >= resolvedConfig.domThreshold ? "dom" : "canvas",
    score: scored.score,
    reasons: scored.reasons
  })
}

function hasComplexStyleProperty(
  input: Pick<
    ChapterAnalysisInput,
    "stylePropertyCounts" | "stylePropertyValueCounts"
  >,
  property: string
): boolean {
  if ((input.stylePropertyCounts[property] ?? 0) > 0) {
    return true
  }

  if (property === "flex") {
    return (input.stylePropertyValueCounts["display:flex"] ?? 0) > 0
  }

  if (property === "grid") {
    return (input.stylePropertyValueCounts["display:grid"] ?? 0) > 0
  }

  return false
}
