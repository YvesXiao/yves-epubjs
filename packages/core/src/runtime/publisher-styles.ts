import type { BlockNode, InlineNode, SectionDocument } from "../model/types"
import type { PreprocessedChapterNode } from "./chapter-preprocess"

export function stripPublisherStylesFromSection(
  section: SectionDocument
): SectionDocument {
  return {
    ...section,
    anchors: { ...section.anchors },
    blocks: section.blocks.map(stripBlockPublisherStyles)
  }
}

export function stripPublisherStylesFromPreprocessedNodes(
  nodes: PreprocessedChapterNode[]
): PreprocessedChapterNode[] {
  const sanitized: PreprocessedChapterNode[] = []

  for (const node of nodes) {
    const nextNode = stripPreprocessedNodePublisherStyles(node)
    if (nextNode) {
      sanitized.push(nextNode)
    }
  }

  return sanitized
}

function stripBlockPublisherStyles(block: BlockNode): BlockNode {
  const base = {
    id: block.id,
    kind: block.kind,
    ...cloneNodeAttributes(block)
  }

  switch (block.kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        inlines: block.inlines.map(stripInlinePublisherStyles)
      }
    case "heading":
      return {
        ...base,
        kind: "heading",
        level: block.level,
        inlines: block.inlines.map(stripInlinePublisherStyles)
      }
    case "image":
      return {
        ...base,
        kind: "image",
        src: block.src,
        ...(block.alt ? { alt: block.alt } : {}),
        ...(block.title ? { title: block.title } : {}),
        ...(block.width ? { width: block.width } : {}),
        ...(block.height ? { height: block.height } : {})
      }
    case "quote":
      return {
        ...base,
        kind: "quote",
        blocks: block.blocks.map(stripBlockPublisherStyles),
        ...(block.attribution ? { attribution: block.attribution } : {})
      }
    case "code":
      return {
        ...base,
        kind: "code",
        text: block.text,
        ...(block.language ? { language: block.language } : {})
      }
    case "list":
      return {
        ...base,
        kind: "list",
        ordered: block.ordered,
        ...(block.start !== undefined ? { start: block.start } : {}),
        items: block.items.map((item) => ({
          id: item.id,
          blocks: item.blocks.map(stripBlockPublisherStyles)
        }))
      }
    case "table":
      return {
        ...base,
        kind: "table",
        rows: block.rows.map((row) => ({
          id: row.id,
          cells: row.cells.map((cell) => ({
            id: cell.id,
            blocks: cell.blocks.map(stripBlockPublisherStyles),
            ...(cell.colSpan !== undefined ? { colSpan: cell.colSpan } : {}),
            ...(cell.rowSpan !== undefined ? { rowSpan: cell.rowSpan } : {}),
            ...(cell.header !== undefined ? { header: cell.header } : {})
          }))
        })),
        ...(block.caption
          ? { caption: block.caption.map(stripBlockPublisherStyles) }
          : {})
      }
    case "figure":
      return {
        ...base,
        kind: "figure",
        blocks: block.blocks.map(stripBlockPublisherStyles),
        ...(block.caption
          ? { caption: block.caption.map(stripBlockPublisherStyles) }
          : {})
      }
    case "aside":
      return {
        ...base,
        kind: "aside",
        blocks: block.blocks.map(stripBlockPublisherStyles)
      }
    case "nav":
      return {
        ...base,
        kind: "nav",
        blocks: block.blocks.map(stripBlockPublisherStyles)
      }
    case "definition-list":
      return {
        ...base,
        kind: "definition-list",
        items: block.items.map((item) => ({
          id: item.id,
          term: item.term.map(stripBlockPublisherStyles),
          descriptions: item.descriptions.map((description) =>
            description.map(stripBlockPublisherStyles)
          )
        }))
      }
    case "thematic-break":
      return {
        ...base,
        kind: "thematic-break"
      }
  }
}

function stripInlinePublisherStyles(inline: InlineNode): InlineNode {
  const base = cloneNodeAttributes(inline)

  switch (inline.kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        text: inline.text
      }
    case "span":
    case "emphasis":
    case "strong":
    case "sub":
    case "sup":
    case "small":
    case "mark":
    case "del":
    case "ins":
      return {
        ...base,
        kind: inline.kind,
        children: inline.children.map(stripInlinePublisherStyles)
      }
    case "code":
      return {
        ...base,
        kind: "code",
        text: inline.text
      }
    case "link":
      return {
        ...base,
        kind: "link",
        href: inline.href,
        children: inline.children.map(stripInlinePublisherStyles),
        ...(inline.title ? { title: inline.title } : {})
      }
    case "image":
      return {
        ...base,
        kind: "image",
        src: inline.src,
        ...(inline.alt ? { alt: inline.alt } : {}),
        ...(inline.title ? { title: inline.title } : {}),
        ...(inline.width ? { width: inline.width } : {}),
        ...(inline.height ? { height: inline.height } : {})
      }
    case "line-break":
      return {
        ...base,
        kind: "line-break"
      }
  }
}

function stripPreprocessedNodePublisherStyles(
  node: PreprocessedChapterNode
): PreprocessedChapterNode | null {
  if (node.kind === "text") {
    return node
  }

  if (node.tagName === "style") {
    return null
  }

  if (
    node.tagName === "link" &&
    node.attributes.rel?.split(/\s+/).includes("stylesheet")
  ) {
    return null
  }

  const attributes = Object.fromEntries(
    Object.entries(node.attributes).filter(([name]) => name !== "style")
  )
  const children = stripPublisherStylesFromPreprocessedNodes(node.children)

  return {
    kind: "element",
    tagName: node.tagName,
    attributes,
    children
  }
}

function cloneNodeAttributes(input: {
  tagName?: string
  className?: string
  lang?: string
  dir?: string
}): {
  tagName?: string
  className?: string
  lang?: string
  dir?: string
} {
  return {
    ...(input.tagName ? { tagName: input.tagName } : {}),
    ...(input.className ? { className: input.className } : {}),
    ...(input.lang ? { lang: input.lang } : {}),
    ...(input.dir ? { dir: input.dir } : {})
  }
}
