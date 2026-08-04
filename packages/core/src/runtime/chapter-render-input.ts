import type { SectionDocument } from "../model/types"
import type { ParsedStyleSheetResource } from "../parser/css-resource-loader"
import { parseXhtmlDocument } from "../parser/xhtml-parser"
import {
  preprocessChapterDocument,
  type PreprocessedChapter
} from "./chapter-preprocess"

export type SharedChapterRenderInput = {
  href: string
  content: string
  preprocessed: PreprocessedChapter
  linkedStyleSheets: ParsedStyleSheetResource[]
}

export type CanvasChapterRenderInput = {
  kind: "canvas"
  href: string
  preprocessed: PreprocessedChapter
  section: SectionDocument
}

export type DomChapterRouteInput = {
  kind: "dom"
  href: string
  preprocessed: PreprocessedChapter
  chapter: PreprocessedChapter
  linkedStyleSheets: ParsedStyleSheetResource[]
}

export function createSharedChapterRenderInput(input: {
  href: string
  content: string
  linkedStyleSheets?: ParsedStyleSheetResource[]
}): SharedChapterRenderInput {
  return {
    href: input.href,
    content: input.content,
    // Preprocess once so render analysis, DOM routing, and later render passes
    // all reason about the same normalized chapter structure.
    preprocessed: preprocessChapterDocument(input),
    linkedStyleSheets: [...(input.linkedStyleSheets ?? [])]
  }
}

export function toCanvasChapterRenderInput(
  input: SharedChapterRenderInput
): CanvasChapterRenderInput {
  return {
    kind: "canvas",
    href: input.href,
    preprocessed: input.preprocessed,
    section: parseXhtmlDocument(
      input.content,
      input.href,
      input.linkedStyleSheets.map((stylesheet) => stylesheet.ast)
    )
  }
}

export function toDomChapterRenderInput(
  input: SharedChapterRenderInput
): DomChapterRouteInput {
  return {
    kind: "dom",
    href: input.href,
    preprocessed: input.preprocessed,
    chapter: input.preprocessed,
    linkedStyleSheets: input.linkedStyleSheets
  }
}
