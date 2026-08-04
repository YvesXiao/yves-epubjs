import { XMLParser } from "fast-xml-parser"
import { resolveResourcePath } from "../container/resource-path"
import type { TocItem } from "../model/types"

type XmlNode = Record<string, unknown>

type NcxDocument = {
  ncx?: {
    navMap?: {
      navPoint?: XmlNode | XmlNode[]
    }
  }
}

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function readNestedText(node: unknown): string {
  if (typeof node === "string") {
    return node.trim()
  }

  if (Array.isArray(node)) {
    return node.map(readNestedText).filter(Boolean).join(" ").trim()
  }

  if (node && typeof node === "object") {
    const textParts: string[] = []
    for (const [key, value] of Object.entries(node as XmlNode)) {
      if (key.startsWith("@_")) {
        continue
      }

      const text = readNestedText(value)
      if (text) {
        textParts.push(text)
      }
    }

    return textParts.join(" ").trim()
  }

  return ""
}

function parseNavPoint(
  node: XmlNode,
  ncxDocumentPath: string,
  fallbackId: string
): TocItem | null {
  const label = readNestedText(node.navLabel).trim()
  const src =
    node.content && typeof node.content === "object"
      ? (node.content as XmlNode)["@_src"]
      : undefined

  if (!label || typeof src !== "string" || !src.trim()) {
    return null
  }

  const id =
    (typeof node["@_id"] === "string" && node["@_id"].trim()) || fallbackId
  const childNodes = asArray(node.navPoint as XmlNode | XmlNode[] | undefined)
  const children = childNodes.flatMap((childNode, index) => {
    const item = parseNavPoint(childNode, ncxDocumentPath, `${id}.${index}`)
    return item ? [item] : []
  })

  return {
    id,
    label,
    href: resolveResourcePath(ncxDocumentPath, src),
    children
  }
}

export function parseNcxDocument(
  xml: string,
  ncxDocumentPath: string
): TocItem[] {
  const parsed = xmlParser.parse(xml) as NcxDocument
  const navPoints = asArray(parsed.ncx?.navMap?.navPoint)

  return navPoints.flatMap((navPoint, index) => {
    const item = parseNavPoint(navPoint, ncxDocumentPath, `ncx.${index}`)
    return item ? [item] : []
  })
}
