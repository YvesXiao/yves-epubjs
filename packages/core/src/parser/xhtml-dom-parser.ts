import {
  findHtmlElementsByTagName,
  getHtmlElementAttribute,
  getHtmlNodeTextContent,
  parseHtmlDocument,
  type HtmlDomDocument,
  type HtmlDomElement
} from "./html-dom-adapter"
import { normalizeLegacyHtmlEntities } from "./legacy-html-entity-normalizer"

export type XhtmlDomDocument = {
  document: HtmlDomDocument
  htmlElement: HtmlDomElement | null
  headElement: HtmlDomElement | null
  bodyElement: HtmlDomElement | null
  title?: string
  lang?: string
  dir?: "ltr" | "rtl"
  viewport?: {
    width: number
    height: number
  }
}

export function parseXhtmlDomDocument(xml: string): XhtmlDomDocument {
  const document = parseHtmlDocument(normalizeLegacyHtmlEntities(xml), {
    xmlMode: true
  })
  const htmlElement = findHtmlElementsByTagName(document, "html")[0] ?? null
  const headElement = findHtmlElementsByTagName(document, "head")[0] ?? null
  const bodyElement = findHtmlElementsByTagName(document, "body")[0] ?? null
  const titleElement = headElement
    ? (findHtmlElementsByTagName(headElement, "title")[0] ?? null)
    : null

  const title = titleElement
    ? getHtmlNodeTextContent(titleElement).replace(/\s+/g, " ").trim() ||
      undefined
    : undefined
  const viewport = headElement ? parseViewportMeta(headElement) : undefined
  const lang = htmlElement
    ? (getHtmlElementAttribute(htmlElement, "xml:lang") ??
      getHtmlElementAttribute(htmlElement, "lang"))
    : undefined
  const dir = htmlElement
    ? normalizeDirection(getHtmlElementAttribute(htmlElement, "dir"))
    : undefined

  return {
    document,
    htmlElement,
    headElement,
    bodyElement,
    ...(title ? { title } : {}),
    ...(lang ? { lang } : {}),
    ...(dir ? { dir } : {}),
    ...(viewport ? { viewport } : {})
  }
}

function normalizeDirection(
  value: string | undefined
): "ltr" | "rtl" | undefined {
  return value === "ltr" || value === "rtl" ? value : undefined
}

function parseViewportMeta(
  headElement: HtmlDomElement
): { width: number; height: number } | undefined {
  const metaElements = findHtmlElementsByTagName(headElement, "meta")
  for (const metaElement of metaElements) {
    const name = getHtmlElementAttribute(metaElement, "name")
      ?.trim()
      .toLowerCase()
    if (name !== "viewport") {
      continue
    }

    const content = getHtmlElementAttribute(metaElement, "content")
    const viewport = content ? parseViewportContent(content) : undefined
    if (viewport) {
      return viewport
    }
  }

  return undefined
}

function parseViewportContent(
  content: string
): { width: number; height: number } | undefined {
  const widthMatch = content.match(/(?:^|[\s,;])width\s*=\s*(\d+(?:\.\d+)?)/i)
  const heightMatch = content.match(/(?:^|[\s,;])height\s*=\s*(\d+(?:\.\d+)?)/i)
  const width = widthMatch ? Number(widthMatch[1]) : NaN
  const height = heightMatch ? Number(heightMatch[1]) : NaN

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined
  }

  return {
    width,
    height
  }
}
