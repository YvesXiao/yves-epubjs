import { XMLParser } from "fast-xml-parser"
import { resolveResourcePath } from "../container/resource-path"
import type { TocItem } from "../model/types"

type XmlNode = Record<string, unknown>

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  removeNSPrefix: false
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }

  if (typeof value === "number") {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(readText).filter(Boolean).join(" ").trim()
  }

  if (value && typeof value === "object") {
    const node = value as XmlNode
    const textParts: string[] = []

    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("@_")) {
        continue
      }

      const text = readText(child)
      if (text) {
        textParts.push(text)
      }
    }

    return textParts.join(" ").trim()
  }

  return ""
}

function findNodesByTag(root: unknown, tagName: string): XmlNode[] {
  if (!root || typeof root !== "object") {
    return []
  }

  const node = root as XmlNode
  const results: XmlNode[] = []

  for (const [key, value] of Object.entries(node)) {
    if (key === tagName) {
      for (const entry of asArray(value as XmlNode | XmlNode[] | undefined)) {
        results.push(entry)
      }
    }

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const child of value) {
          results.push(...findNodesByTag(child, tagName))
        }
      } else {
        results.push(...findNodesByTag(value, tagName))
      }
    }
  }

  return results
}

function getNavType(node: XmlNode): string | undefined {
  const directType = node["@_epub:type"]
  if (typeof directType === "string" && directType.trim()) {
    return directType.trim()
  }

  const fallbackType = node["@_type"]
  if (typeof fallbackType === "string" && fallbackType.trim()) {
    return fallbackType.trim()
  }

  return undefined
}

function parseNavLi(
  node: XmlNode,
  navDocumentPath: string,
  idPrefix: string
): TocItem | null {
  const anchorNode =
    (node.a as XmlNode | undefined) ??
    (Array.isArray(node.a) ? (node.a[0] as XmlNode | undefined) : undefined)
  const spanNode =
    (node.span as XmlNode | undefined) ??
    (Array.isArray(node.span)
      ? (node.span[0] as XmlNode | undefined)
      : undefined)
  const labelSource = anchorNode ?? spanNode
  const label = readText(labelSource).trim()

  if (!label) {
    return null
  }

  const hrefValue =
    anchorNode && typeof anchorNode["@_href"] === "string"
      ? resolveResourcePath(navDocumentPath, anchorNode["@_href"])
      : ""

  const nestedOl =
    (node.ol as XmlNode | undefined) ??
    (Array.isArray(node.ol) ? (node.ol[0] as XmlNode | undefined) : undefined)
  const children = nestedOl
    ? parseNavOl(nestedOl, navDocumentPath, idPrefix)
    : []

  return {
    id: `${idPrefix}:${label}`,
    label,
    href: hrefValue,
    children
  }
}

function parseNavOl(
  node: XmlNode,
  navDocumentPath: string,
  idPrefix: string
): TocItem[] {
  const liNodes = asArray(node.li as XmlNode | XmlNode[] | undefined)

  return liNodes.flatMap((liNode, index) => {
    const tocItem = parseNavLi(liNode, navDocumentPath, `${idPrefix}.${index}`)
    return tocItem ? [tocItem] : []
  })
}

export function parseNavDocument(
  xml: string,
  navDocumentPath: string
): TocItem[] {
  const parsed = xmlParser.parse(xml) as XmlNode
  const navNodes = findNodesByTag(parsed, "nav")
  const tocNav =
    navNodes.find((node) => getNavType(node)?.split(/\s+/).includes("toc")) ??
    navNodes[0]

  if (!tocNav) {
    return []
  }

  const olNode =
    (tocNav.ol as XmlNode | undefined) ??
    (Array.isArray(tocNav.ol)
      ? (tocNav.ol[0] as XmlNode | undefined)
      : undefined)

  if (!olNode) {
    return []
  }

  return parseNavOl(olNode, navDocumentPath, "toc")
}
