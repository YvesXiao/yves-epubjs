import { XMLParser } from "fast-xml-parser"
import { resolveResourcePath } from "../container/resource-path"
import type {
  BookMetadata,
  FixedLayoutViewport,
  ManifestItem,
  PageSpreadPlacement,
  RenditionLayout,
  RenditionSpread,
  SpineItem
} from "../model/types"

type XmlNode = Record<string, unknown>

type OpfDocument = {
  package?: {
    metadata?: XmlNode
    manifest?: {
      item?: XmlNode | XmlNode[]
    }
    spine?: {
      itemref?: XmlNode | XmlNode[]
    }
    guide?: {
      reference?: XmlNode | XmlNode[]
    }
  }
}

export type ParsedOpf = {
  metadata: BookMetadata
  manifest: ManifestItem[]
  spine: SpineItem[]
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

function readTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined
  }

  if (typeof value === "number") {
    return String(value)
  }

  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"]
    return typeof text === "string" && text.trim() ? text.trim() : undefined
  }

  return undefined
}

function readFirstText(
  metadata: XmlNode | undefined,
  keys: string[]
): string | undefined {
  if (!metadata) {
    return undefined
  }

  for (const key of keys) {
    const value = metadata[key]

    if (Array.isArray(value)) {
      for (const entry of value) {
        const text = readTextValue(entry)
        if (text) {
          return text
        }
      }
      continue
    }

    const text = readTextValue(value)
    if (text) {
      return text
    }
  }

  return undefined
}

export function parseOpfDocument(
  xml: string,
  packageDocumentPath: string
): ParsedOpf {
  const parsed = xmlParser.parse(xml) as OpfDocument
  const packageNode = parsed.package
  const metadataNode = packageNode?.metadata
  const manifestNodes = asArray(packageNode?.manifest?.item)
  const spineNodes = asArray(packageNode?.spine?.itemref)
  const guideNodes = asArray(packageNode?.guide?.reference)

  const title =
    readFirstText(metadataNode, ["dc:title", "title"]) ?? "Untitled EPUB"
  const metadata: BookMetadata = { title }

  const language = readFirstText(metadataNode, ["dc:language", "language"])
  const identifier = readFirstText(metadataNode, [
    "dc:identifier",
    "identifier"
  ])
  const creator = readFirstText(metadataNode, ["dc:creator", "creator"])
  const publisher = readFirstText(metadataNode, ["dc:publisher", "publisher"])

  if (language) {
    metadata.language = language
  }
  if (identifier) {
    metadata.identifier = identifier
  }
  if (creator) {
    metadata.creator = creator
  }
  if (publisher) {
    metadata.publisher = publisher
  }
  const renditionLayout = resolveMetadataRenditionLayout(metadataNode)
  const renditionViewport = resolveMetadataRenditionViewport(metadataNode)
  const renditionSpread = resolveMetadataRenditionSpread(metadataNode)
  if (renditionLayout) {
    metadata.renditionLayout = renditionLayout
  }
  if (renditionViewport) {
    metadata.renditionViewport = renditionViewport
  }
  if (renditionSpread) {
    metadata.renditionSpread = renditionSpread
  }

  const manifest = manifestNodes.flatMap((item) => {
    const id = typeof item["@_id"] === "string" ? item["@_id"] : undefined
    const href = typeof item["@_href"] === "string" ? item["@_href"] : undefined
    const mediaType =
      typeof item["@_media-type"] === "string"
        ? item["@_media-type"]
        : undefined

    if (!id || !href || !mediaType) {
      return []
    }

    const manifestItem: ManifestItem = {
      id,
      href: resolveResourcePath(packageDocumentPath, href),
      mediaType
    }

    if (
      typeof item["@_properties"] === "string" &&
      item["@_properties"].trim()
    ) {
      manifestItem.properties = item["@_properties"].trim()
    }

    return [manifestItem]
  })

  const manifestById = new Map(manifest.map((item) => [item.id, item]))
  const coverImageHref =
    manifest.find((item) =>
      item.properties?.split(/\s+/).includes("cover-image")
    )?.href ?? resolveLegacyCoverImageHref(metadataNode, manifestById)

  if (coverImageHref) {
    metadata.coverImageHref = coverImageHref
  }
  const startHref = resolveGuideStartHref(guideNodes, packageDocumentPath)
  if (startHref) {
    metadata.startHref = startHref
  }

  const spine = spineNodes.flatMap((item) => {
    const idref =
      typeof item["@_idref"] === "string" ? item["@_idref"] : undefined

    if (!idref) {
      return []
    }

    const manifestItem = manifestById.get(idref)
    if (!manifestItem) {
      return []
    }

    const spineItem: SpineItem = {
      idref,
      href: manifestItem.href,
      linear: item["@_linear"] !== "no",
      mediaType: manifestItem.mediaType
    }

    if (
      typeof item["@_properties"] === "string" &&
      item["@_properties"].trim()
    ) {
      spineItem.properties = item["@_properties"].trim()
    }
    const spineRenditionLayout = resolveSpineItemRenditionLayout(
      spineItem.properties
    )
    if (spineRenditionLayout) {
      spineItem.renditionLayout = spineRenditionLayout
    }
    const pageSpreadPlacement = resolveSpineItemPageSpreadPlacement(
      spineItem.properties
    )
    if (pageSpreadPlacement) {
      spineItem.pageSpreadPlacement = pageSpreadPlacement
    }

    return [spineItem]
  })

  return {
    metadata,
    manifest,
    spine
  }
}

function resolveGuideStartHref(
  guideNodes: XmlNode[],
  packageDocumentPath: string
): string | undefined {
  for (const reference of guideNodes) {
    const type =
      typeof reference["@_type"] === "string"
        ? reference["@_type"].trim().toLowerCase()
        : ""
    if (type !== "text") {
      continue
    }

    const href =
      typeof reference["@_href"] === "string" ? reference["@_href"].trim() : ""
    if (!href) {
      continue
    }

    return resolveResourcePath(packageDocumentPath, href)
  }

  return undefined
}

function resolveMetadataRenditionLayout(
  metadataNode: XmlNode | undefined
): RenditionLayout | undefined {
  return normalizeRenditionLayout(
    resolveMetadataMetaPropertyValue(metadataNode, "rendition:layout")
  )
}

function resolveMetadataRenditionViewport(
  metadataNode: XmlNode | undefined
): FixedLayoutViewport | undefined {
  const content = resolveMetadataMetaPropertyValue(
    metadataNode,
    "rendition:viewport"
  )
  return content ? parseViewportMetaContent(content) : undefined
}

function resolveMetadataRenditionSpread(
  metadataNode: XmlNode | undefined
): RenditionSpread | undefined {
  return normalizeRenditionSpread(
    resolveMetadataMetaPropertyValue(metadataNode, "rendition:spread")
  )
}

function resolveMetadataMetaPropertyValue(
  metadataNode: XmlNode | undefined,
  propertyName: string
): string | undefined {
  if (!metadataNode) {
    return undefined
  }

  const metaEntries = asArray(metadataNode.meta)
  for (const entry of metaEntries) {
    if (!entry || typeof entry !== "object") {
      continue
    }

    const metaEntry = entry as XmlNode
    const property =
      typeof metaEntry["@_property"] === "string"
        ? metaEntry["@_property"].trim()
        : ""
    if (property !== propertyName) {
      continue
    }

    const content =
      typeof metaEntry["@_content"] === "string"
        ? metaEntry["@_content"].trim()
        : ""
    if (content) {
      return content
    }

    return readTextValue(metaEntry)
  }

  return undefined
}

function resolveSpineItemRenditionLayout(
  properties: string | undefined
): RenditionLayout | undefined {
  if (!properties) {
    return undefined
  }

  const tokens = properties
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (
    tokens.includes("rendition:layout-pre-paginated") ||
    tokens.includes("layout-pre-paginated")
  ) {
    return "pre-paginated"
  }
  if (
    tokens.includes("rendition:layout-reflowable") ||
    tokens.includes("layout-reflowable")
  ) {
    return "reflowable"
  }

  return undefined
}

function resolveSpineItemPageSpreadPlacement(
  properties: string | undefined
): PageSpreadPlacement | undefined {
  if (!properties) {
    return undefined
  }

  const tokens = properties
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.includes("page-spread-left")) {
    return "left"
  }
  if (tokens.includes("page-spread-right")) {
    return "right"
  }
  if (tokens.includes("page-spread-center")) {
    return "center"
  }

  return undefined
}

function normalizeRenditionLayout(
  value: string | undefined
): RenditionLayout | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "pre-paginated" || normalized === "reflowable") {
    return normalized
  }

  return undefined
}

function normalizeRenditionSpread(
  value: string | undefined
): RenditionSpread | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (
    normalized === "auto" ||
    normalized === "none" ||
    normalized === "landscape" ||
    normalized === "portrait" ||
    normalized === "both"
  ) {
    return normalized
  }

  return undefined
}

function parseViewportMetaContent(
  content: string
): FixedLayoutViewport | undefined {
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

function resolveLegacyCoverImageHref(
  metadataNode: XmlNode | undefined,
  manifestById: Map<string, ManifestItem>
): string | undefined {
  if (!metadataNode) {
    return undefined
  }

  const metaEntries = asArray(metadataNode.meta)
  for (const entry of metaEntries) {
    if (!entry || typeof entry !== "object") {
      continue
    }

    const metaEntry = entry as XmlNode

    const name =
      typeof metaEntry["@_name"] === "string"
        ? metaEntry["@_name"].trim().toLowerCase()
        : ""
    const content =
      typeof metaEntry["@_content"] === "string"
        ? metaEntry["@_content"].trim()
        : ""
    if (name !== "cover" || !content) {
      continue
    }

    return manifestById.get(content)?.href
  }

  return undefined
}
