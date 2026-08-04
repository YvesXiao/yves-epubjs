import type { ManifestItem } from "../model/types"
import { resolveResourcePath } from "../container/resource-path"
import { getHtmlElementAttribute, isHtmlElementNode } from "./html-dom-adapter"
import { parseCssStyleSheet, type CssAstStyleSheet } from "./css-ast-adapter"
import { parseXhtmlDomDocument } from "./xhtml-dom-parser"

export type ParsedStyleSheetResource = {
  href: string
  mediaType: string
  text: string
  ast: CssAstStyleSheet
}

export class CssAstCache {
  private readonly byHref = new Map<string, CssAstStyleSheet>()

  get(href: string): CssAstStyleSheet | undefined {
    return this.byHref.get(href)
  }

  getOrParse(href: string, source: string): CssAstStyleSheet {
    const cached = this.byHref.get(href)
    if (cached) {
      return cached
    }

    const parsed = parseCssStyleSheet(source)
    this.byHref.set(href, parsed)
    return parsed
  }
}

export function extractLinkedStyleSheetHrefs(
  sectionXml: string,
  sectionHref: string
): string[] {
  const parsed = parseXhtmlDomDocument(sectionXml)
  const headElement = parsed.headElement
  if (!headElement) {
    return []
  }

  const hrefs = new Set<string>()
  for (const child of headElement.children) {
    if (!isHtmlElementNode(child) || child.name !== "link") {
      continue
    }

    const rel = getHtmlElementAttribute(child, "rel")
    const href = getHtmlElementAttribute(child, "href")
    if (!rel || !href) {
      continue
    }

    if (!rel.split(/\s+/).includes("stylesheet")) {
      continue
    }

    hrefs.add(resolveResourcePath(sectionHref, href))
  }

  return [...hrefs]
}

export function resolveChapterStyleSheetManifestItems(
  manifest: ManifestItem[],
  linkedHrefs: string[]
): ManifestItem[] {
  const linkedHrefSet = new Set(linkedHrefs)
  return manifest.filter(
    (item) => item.mediaType === "text/css" && linkedHrefSet.has(item.href)
  )
}

export async function loadChapterStyleSheets(input: {
  sectionXml: string
  sectionHref: string
  manifest: ManifestItem[]
  readText: (href: string) => Promise<string>
  cache?: CssAstCache
}): Promise<ParsedStyleSheetResource[]> {
  const linkedHrefs = extractLinkedStyleSheetHrefs(
    input.sectionXml,
    input.sectionHref
  )
  const manifestItems = resolveChapterStyleSheetManifestItems(
    input.manifest,
    linkedHrefs
  )
  const cache = input.cache ?? new CssAstCache()

  return Promise.all(
    manifestItems.map(async (item) => {
      const text = await input.readText(item.href)
      return {
        href: item.href,
        mediaType: item.mediaType,
        text,
        ast: cache.getOrParse(item.href, text)
      }
    })
  )
}
