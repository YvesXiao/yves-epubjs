import {
  type ResourceContainer,
  ZipResourceContainer
} from "../container/resource-container"
import type { Book } from "../model/types"
import { parseContainerXml } from "./container-parser"
import { parseNavDocument } from "./nav-parser"
import { parseNcxDocument } from "./ncx-parser"
import { parseOpfDocument } from "./opf-parser"
import { parseSpineContentDocument } from "./spine-content-parser"
import {
  CssAstCache,
  loadChapterStyleSheets,
  type ParsedStyleSheetResource
} from "./css-resource-loader"
import type { BlockNode, InlineNode } from "../model/types"

export type BookParserInput = {
  sourceName?: string
  data: Uint8Array
}

export type BookParseResult = {
  book: Book
  resources: ResourceContainer
  sectionContents: Array<{
    href: string
    content: string
    linkedStyleSheets: ParsedStyleSheetResource[]
  }>
}

export class BookParser {
  async parseDetailed(input: BookParserInput): Promise<BookParseResult> {
    const container = await ZipResourceContainer.fromZip(input.data)
    const containerXml = await container.readText("META-INF/container.xml")
    const packageDocument = parseContainerXml(containerXml)
    const opfXml = await container.readText(packageDocument.fullPath)
    const opf = parseOpfDocument(opfXml, packageDocument.fullPath)
    const navManifestItem = opf.manifest.find((item) =>
      item.properties?.split(/\s+/).includes("nav")
    )
    const ncxManifestItem = opf.manifest.find(
      (item) => item.mediaType === "application/x-dtbncx+xml"
    )
    const toc = navManifestItem
      ? parseNavDocument(
          await container.readText(navManifestItem.href),
          navManifestItem.href
        )
      : ncxManifestItem
        ? parseNcxDocument(
            await container.readText(ncxManifestItem.href),
            ncxManifestItem.href
          )
        : []
    const stylesheetCache = new CssAstCache()
    const sectionContents = await Promise.all(
      opf.spine.map(async (spineItem, index) => {
        const sectionXml = await container.readText(spineItem.href)
        const linkedStyleSheets = await loadChapterStyleSheets({
          sectionHref: spineItem.href,
          sectionXml,
          manifest: opf.manifest,
          cache: stylesheetCache,
          readText: (href) => container.readText(href)
        })
        return {
          href: spineItem.href,
          content: sectionXml,
          linkedStyleSheets,
          index
        }
      })
    )
    const sections = sectionContents.map((entry) => {
      const spineItem = opf.spine[entry.index]
      if (!spineItem) {
        throw new Error(`Missing spine item at index ${entry.index}`)
      }

      const section = parseSpineContentDocument({
        href: spineItem.href,
        content: entry.content,
        stylesheets: entry.linkedStyleSheets.map(
          (stylesheet) => stylesheet.ast
        ),
        ...(spineItem.mediaType ? { mediaType: spineItem.mediaType } : {})
      })
      const renditionLayout =
        spineItem.renditionLayout ?? opf.metadata.renditionLayout
      return {
        ...section,
        id: `section-${entry.index + 1}`,
        ...(renditionLayout ? { renditionLayout } : {}),
        ...(opf.metadata.renditionSpread
          ? { renditionSpread: opf.metadata.renditionSpread }
          : {}),
        ...(spineItem.pageSpreadPlacement
          ? { pageSpreadPlacement: spineItem.pageSpreadPlacement }
          : {}),
        ...((section.renditionViewport ?? opf.metadata.renditionViewport)
          ? {
              renditionViewport:
                section.renditionViewport ?? opf.metadata.renditionViewport
            }
          : {})
      }
    })

    // Prefer the declared cover image when available. If metadata is incomplete,
    // fall back to the first section that is effectively a single image page.
    const coverSectionIndex = resolveCoverSectionIndex(
      sections,
      opf.metadata.coverImageHref
    )
    if (typeof coverSectionIndex === "number") {
      const section = sections[coverSectionIndex]
      if (section) {
        sections[coverSectionIndex] = {
          ...section,
          presentationRole: "cover"
        }
      }
    }

    // Mark remaining standalone image sections explicitly so downstream render
    // decisions can preserve their page-like presentation.
    sections.forEach((section, index) => {
      if (section.presentationRole || !isSingleImageSection(section.blocks)) {
        return
      }

      sections[index] = {
        ...section,
        presentationRole: "image-page"
      }
    })

    return {
      book: {
        metadata: opf.metadata,
        manifest: opf.manifest,
        spine: opf.spine,
        toc,
        sections
      },
      resources: container,
      sectionContents: sectionContents.map(
        ({ href, content, linkedStyleSheets }) => ({
          href,
          content,
          linkedStyleSheets
        })
      )
    }
  }

  async parse(input: BookParserInput): Promise<Book> {
    const result = await this.parseDetailed(input)
    return result.book
  }
}

function resolveCoverSectionIndex(
  sections: Book["sections"],
  coverImageHref: string | undefined
): number | undefined {
  if (coverImageHref) {
    const matchedIndex = sections.findIndex((section) =>
      sectionContainsImageHref(section.blocks, coverImageHref)
    )
    if (matchedIndex >= 0) {
      return matchedIndex
    }
  }

  const fallbackIndex = sections.findIndex((section) =>
    isSingleImageSection(section.blocks)
  )
  return fallbackIndex >= 0 ? fallbackIndex : undefined
}

function isSingleImageSection(blocks: BlockNode[]): boolean {
  if (blocks.length !== 1) {
    return false
  }

  const [block] = blocks
  if (!block) {
    return false
  }

  if (block.kind === "image") {
    return true
  }

  return (
    block.kind === "text" && getSingleImageInline(block.inlines) !== undefined
  )
}

function sectionContainsImageHref(blocks: BlockNode[], href: string): boolean {
  return blocks.some((block) => blockContainsImageHref(block, href))
}

function blockContainsImageHref(block: BlockNode, href: string): boolean {
  switch (block.kind) {
    case "image":
      return block.src === href
    case "text":
    case "heading":
      return block.inlines.some((inline) =>
        inlineContainsImageHref(inline, href)
      )
    case "quote":
    case "figure":
    case "aside":
    case "nav":
      return block.blocks.some((child) => blockContainsImageHref(child, href))
    case "list":
      return block.items.some((item) =>
        item.blocks.some((child) => blockContainsImageHref(child, href))
      )
    case "table":
      return block.rows.some((row) =>
        row.cells.some((cell) =>
          cell.blocks.some((child) => blockContainsImageHref(child, href))
        )
      )
    case "definition-list":
      return block.items.some(
        (item) =>
          item.term.some((child) => blockContainsImageHref(child, href)) ||
          item.descriptions.some((description) =>
            description.some((child) => blockContainsImageHref(child, href))
          )
      )
    default:
      return false
  }
}

function inlineContainsImageHref(inline: InlineNode, href: string): boolean {
  switch (inline.kind) {
    case "image":
      return inline.src === href
    case "span":
    case "emphasis":
    case "strong":
    case "sub":
    case "sup":
    case "small":
    case "mark":
    case "del":
    case "ins":
    case "link":
      return inline.children.some((child) =>
        inlineContainsImageHref(child, href)
      )
    default:
      return false
  }
}

function getSingleImageInline(inlines: InlineNode[]): InlineNode | undefined {
  if (inlines.length !== 1) {
    return undefined
  }

  return inlines[0]?.kind === "image" ? inlines[0] : undefined
}
