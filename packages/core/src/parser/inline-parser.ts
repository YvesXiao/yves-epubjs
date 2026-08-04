import { resolveResourcePath } from "../container/resource-path"
import type { InlineNode } from "../model/types"

type XmlNode = Record<string, unknown>

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ")
}

function createTextNode(text: string): InlineNode[] {
  const normalized = normalizeWhitespace(text)
  if (!normalized.trim()) {
    return []
  }

  return [{ kind: "text", text: normalized }]
}

function flattenChildren(source: unknown, sectionHref: string): InlineNode[] {
  if (typeof source === "string") {
    return createTextNode(source)
  }

  if (typeof source === "number") {
    return createTextNode(String(source))
  }

  if (Array.isArray(source)) {
    return source.flatMap((entry) => flattenChildren(entry, sectionHref))
  }

  if (!source || typeof source !== "object") {
    return []
  }

  const node = source as XmlNode
  const inlines: InlineNode[] = []

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue
    }

    if (key === "#text") {
      inlines.push(...createTextNode(String(value)))
      continue
    }

    for (const child of asArray(value)) {
      inlines.push(...parseInlineElement(key, child, sectionHref))
    }
  }

  return inlines
}

function parseInlineElement(
  tagName: string,
  source: unknown,
  sectionHref: string
): InlineNode[] {
  const node =
    source && typeof source === "object"
      ? (source as XmlNode)
      : { "#text": source }
  const childInlines = flattenChildren(node, sectionHref)

  if (tagName === "br") {
    return [{ kind: "line-break" }]
  }

  if (tagName === "span") {
    return childInlines.length > 0
      ? [{ kind: "span", children: childInlines }]
      : []
  }

  if (tagName === "strong" || tagName === "b") {
    return childInlines.length > 0
      ? [{ kind: "strong", children: childInlines }]
      : []
  }

  if (tagName === "em" || tagName === "i") {
    return childInlines.length > 0
      ? [{ kind: "emphasis", children: childInlines }]
      : []
  }

  if (tagName === "sub") {
    return childInlines.length > 0
      ? [{ kind: "sub", children: childInlines }]
      : []
  }

  if (tagName === "sup") {
    return childInlines.length > 0
      ? [{ kind: "sup", children: childInlines }]
      : []
  }

  if (tagName === "small") {
    return childInlines.length > 0
      ? [{ kind: "small", children: childInlines }]
      : []
  }

  if (tagName === "mark") {
    return childInlines.length > 0
      ? [{ kind: "mark", children: childInlines }]
      : []
  }

  if (tagName === "del") {
    return childInlines.length > 0
      ? [{ kind: "del", children: childInlines }]
      : []
  }

  if (tagName === "ins") {
    return childInlines.length > 0
      ? [{ kind: "ins", children: childInlines }]
      : []
  }

  if (tagName === "code") {
    const text = childInlines
      .map((inline) => ("text" in inline ? inline.text : ""))
      .join("")
      .trim()
    return text ? [{ kind: "code", text }] : []
  }

  if (tagName === "a") {
    const href =
      typeof node["@_href"] === "string"
        ? resolveResourcePath(sectionHref, node["@_href"])
        : ""
    const linkNode: InlineNode = {
      kind: "link",
      href,
      children: childInlines
    }

    if (typeof node["@_title"] === "string" && node["@_title"].trim()) {
      linkNode.title = node["@_title"].trim()
    }

    return [linkNode]
  }

  if (tagName === "img") {
    const src =
      typeof node["@_src"] === "string"
        ? resolveResourcePath(sectionHref, node["@_src"])
        : ""

    if (!src) {
      return []
    }

    const imageNode: InlineNode = {
      kind: "image",
      src
    }

    if (typeof node["@_alt"] === "string" && node["@_alt"].trim()) {
      imageNode.alt = node["@_alt"].trim()
    }
    if (typeof node["@_title"] === "string" && node["@_title"].trim()) {
      imageNode.title = node["@_title"].trim()
    }
    const width = Number(node["@_width"])
    const height = Number(node["@_height"])
    if (!Number.isNaN(width)) {
      imageNode.width = width
    }
    if (!Number.isNaN(height)) {
      imageNode.height = height
    }

    return [imageNode]
  }

  return childInlines.length > 0
    ? [{ kind: "span", children: childInlines }]
    : []
}

export function parseInlineContent(
  source: unknown,
  sectionHref: string
): InlineNode[] {
  return flattenChildren(source, sectionHref)
}
