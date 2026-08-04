import type { SectionDocument } from "../model/types"
import type { CssAstStyleSheet } from "./css-ast-adapter"
import { parseXhtmlDocument } from "./xhtml-parser"

const SUPPORTED_SPINE_CONTENT_MEDIA_TYPES = new Set([
  "application/xhtml+xml",
  "text/html"
])

export type ParseSpineContentDocumentInput = {
  href: string
  mediaType?: string
  content: string
  stylesheets?: CssAstStyleSheet[]
}

export function canParseSpineContentDocument(
  mediaType: string | undefined
): boolean {
  return (
    typeof mediaType === "string" &&
    SUPPORTED_SPINE_CONTENT_MEDIA_TYPES.has(mediaType)
  )
}

export function parseSpineContentDocument(
  input: ParseSpineContentDocumentInput
): SectionDocument {
  if (!canParseSpineContentDocument(input.mediaType)) {
    throw new Error(
      `Unsupported spine content media type: ${input.mediaType ?? "unknown"} (${input.href})`
    )
  }

  return parseXhtmlDocument(input.content, input.href, input.stylesheets ?? [])
}
