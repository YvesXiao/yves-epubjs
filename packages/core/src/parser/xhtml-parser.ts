import {
  normalizeResourcePath,
  resolveResourcePath
} from "../container/resource-path"
import type {
  BlockNode,
  ImageBlock,
  InlineNode,
  ListItemBlock,
  SectionDocument,
  TableCell,
  TableRow
} from "../model/types"
import {
  getHtmlChildElements,
  getHtmlElementAttribute,
  getHtmlNodeChildren,
  getHtmlNodeTextContent,
  isHtmlElementNode,
  isHtmlTextNode,
  type HtmlDomElement,
  type HtmlDomNode
} from "./html-dom-adapter"
import { normalizePreformattedText } from "../utils/preformatted-text"
import type { CssAstStyleSheet } from "./css-ast-adapter"
import { resolveElementStyle, resolveElementTextStyle } from "./style-resolver"
import { parseXhtmlDomDocument } from "./xhtml-dom-parser"
import { classifyNavigationHref } from "../utils/url-boundary"

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

function getInlineNodeMetadata(
  node: HtmlDomElement,
  stylesheets: CssAstStyleSheet[]
): {
  tagName: string
  className?: string
  lang?: string
  dir?: string
  style?: ReturnType<typeof resolveElementTextStyle>
} {
  const metadata: {
    tagName: string
    className?: string
    role?: string
    epubType?: string
    lang?: string
    dir?: string
    style?: ReturnType<typeof resolveElementTextStyle>
  } = {
    tagName: node.name
  }
  const className = getHtmlElementAttribute(node, "class")
  const role = getHtmlElementAttribute(node, "role")
  const epubType =
    getHtmlElementAttribute(node, "epub:type") ??
    getHtmlElementAttribute(node, "type")
  const lang = getHtmlElementAttribute(node, "lang")
  const dir = getHtmlElementAttribute(node, "dir")

  if (className?.trim()) {
    metadata.className = className.trim()
  }
  if (role?.trim()) {
    metadata.role = role.trim()
  }
  if (epubType?.trim()) {
    metadata.epubType = epubType.trim()
  }
  if (lang?.trim()) {
    metadata.lang = lang.trim()
  }
  if (dir?.trim()) {
    metadata.dir = dir.trim()
  }
  const style = resolveElementTextStyle({
    element: node,
    stylesheets
  })
  if (Object.keys(style).length > 0) {
    metadata.style = style
  }

  return metadata
}

function getBlockNodeMetadata(
  node: HtmlDomElement,
  stylesheets: CssAstStyleSheet[]
): {
  tagName: string
  className?: string
  lang?: string
  dir?: string
  style?: ReturnType<typeof resolveElementStyle>
} {
  const metadata: {
    tagName: string
    className?: string
    role?: string
    epubType?: string
    lang?: string
    dir?: string
    style?: ReturnType<typeof resolveElementStyle>
  } = {
    tagName: node.name
  }
  const className = getHtmlElementAttribute(node, "class")
  const role = getHtmlElementAttribute(node, "role")
  const epubType =
    getHtmlElementAttribute(node, "epub:type") ??
    getHtmlElementAttribute(node, "type")
  const lang = getHtmlElementAttribute(node, "lang")
  const dir = getHtmlElementAttribute(node, "dir")

  if (className?.trim()) {
    metadata.className = className.trim()
  }
  if (role?.trim()) {
    metadata.role = role.trim()
  }
  if (epubType?.trim()) {
    metadata.epubType = epubType.trim()
  }
  if (lang?.trim()) {
    metadata.lang = lang.trim()
  }
  if (dir?.trim()) {
    metadata.dir = dir.trim()
  }
  const style = resolveElementStyle({
    element: node,
    stylesheets
  })
  if (Object.keys(style).length > 0) {
    metadata.style = style
  }

  return metadata
}

function parseInlineNodes(
  nodes: HtmlDomNode[],
  sectionHref: string,
  stylesheets: CssAstStyleSheet[]
): InlineNode[] {
  const inlines: InlineNode[] = []

  for (const node of nodes) {
    if (isHtmlTextNode(node)) {
      inlines.push(...createTextNode(node.data))
      continue
    }

    if (!isHtmlElementNode(node)) {
      continue
    }

    const childNodes = getHtmlNodeChildren(node)
    switch (node.name) {
      case "br":
        inlines.push({ kind: "line-break" })
        break
      case "span":
      case "sub":
      case "sup":
      case "small":
      case "mark":
      case "del":
      case "ins": {
        const semanticChildren = parseInlineNodes(
          childNodes,
          sectionHref,
          stylesheets
        )
        if (semanticChildren.length > 0) {
          inlines.push({
            kind: node.name,
            children: semanticChildren,
            ...getInlineNodeMetadata(node, stylesheets)
          } as InlineNode)
        }
        break
      }
      case "strong":
      case "b":
        inlines.push({
          kind: "strong",
          children: parseInlineNodes(childNodes, sectionHref, stylesheets),
          ...getInlineNodeMetadata(node, stylesheets)
        })
        break
      case "em":
      case "i":
        inlines.push({
          kind: "emphasis",
          children: parseInlineNodes(childNodes, sectionHref, stylesheets),
          ...getInlineNodeMetadata(node, stylesheets)
        })
        break
      case "code": {
        const text = parseInlineNodes(childNodes, sectionHref, stylesheets)
          .map((inline) => ("text" in inline ? inline.text : ""))
          .join("")
          .trim()
        if (text) {
          inlines.push({ kind: "code", text })
        }
        break
      }
      case "a": {
        const hrefAttribute = getHtmlElementAttribute(node, "href")
        const linkNode: InlineNode = {
          kind: "link",
          href: hrefAttribute
            ? resolveInlineLinkHref(sectionHref, hrefAttribute)
            : "",
          children: parseInlineNodes(childNodes, sectionHref, stylesheets),
          ...getInlineNodeMetadata(node, stylesheets)
        }
        const title = getHtmlElementAttribute(node, "title")
        if (title?.trim()) {
          linkNode.title = title.trim()
        }
        inlines.push(linkNode)
        break
      }
      case "img": {
        const src = getHtmlElementAttribute(node, "src")
        if (!src) {
          break
        }

        const imageNode: InlineNode = {
          kind: "image",
          src: resolveResourcePath(sectionHref, src),
          ...getInlineNodeMetadata(node, stylesheets)
        }
        const alt = getHtmlElementAttribute(node, "alt")
        const title = getHtmlElementAttribute(node, "title")
        if (alt?.trim()) {
          imageNode.alt = alt.trim()
        }
        if (title?.trim()) {
          imageNode.title = title.trim()
        }
        const width = getHtmlElementAttribute(node, "width")
        const height = getHtmlElementAttribute(node, "height")
        if (typeof width === "string") {
          const parsedWidth = Number(width)
          if (!Number.isNaN(parsedWidth)) {
            imageNode.width = parsedWidth
          }
        }
        if (typeof height === "string") {
          const parsedHeight = Number(height)
          if (!Number.isNaN(parsedHeight)) {
            imageNode.height = parsedHeight
          }
        }
        inlines.push(imageNode)
        break
      }
      default:
        {
          const fallbackChildren = parseInlineNodes(
            childNodes,
            sectionHref,
            stylesheets
          )
          if (fallbackChildren.length > 0) {
            inlines.push({
              kind: "span",
              children: fallbackChildren,
              ...getInlineNodeMetadata(node, stylesheets)
            })
          }
        }
        break
    }
  }

  return inlines
}

function resolveInlineLinkHref(sectionHref: string, href: string): string {
  const normalizedHref = href.trim()
  if (!normalizedHref) {
    return ""
  }

  const resolution = classifyNavigationHref(normalizedHref)
  if (resolution.kind !== "internal") {
    return normalizedHref
  }

  return resolveResourcePath(sectionHref, normalizedHref)
}

class XhtmlBlockParser {
  private blockCounter = 0
  private listItemCounter = 0
  private definitionItemCounter = 0
  private rowCounter = 0
  private cellCounter = 0
  private pendingAnchors: string[] = []
  readonly anchors: Record<string, string> = {}

  constructor(
    private readonly sectionHref: string,
    private readonly stylesheets: CssAstStyleSheet[] = []
  ) {}

  parseDocument(xml: string): SectionDocument {
    const domDocument = parseXhtmlDomDocument(xml)
    const blocks = domDocument.bodyElement
      ? this.parseChildBlocks(domDocument.bodyElement)
      : []

    const section: SectionDocument = {
      id: this.createBlockId("section"),
      href: this.sectionHref,
      blocks,
      anchors: this.anchors
    }

    if (domDocument.title) {
      section.title = domDocument.title
    }
    if (domDocument.lang) {
      section.lang = domDocument.lang
    }
    if (domDocument.dir) {
      section.dir = domDocument.dir
    }
    if (domDocument.viewport) {
      section.renditionViewport = domDocument.viewport
    }

    return section
  }

  private createBlockId(prefix: string): string {
    this.blockCounter += 1
    return `${prefix}-${this.blockCounter}`
  }

  private createListItemId(): string {
    this.listItemCounter += 1
    return `list-item-${this.listItemCounter}`
  }

  private createDefinitionItemId(): string {
    this.definitionItemCounter += 1
    return `definition-item-${this.definitionItemCounter}`
  }

  private createRowId(): string {
    this.rowCounter += 1
    return `table-row-${this.rowCounter}`
  }

  private createCellId(): string {
    this.cellCounter += 1
    return `table-cell-${this.cellCounter}`
  }

  private collectAnchorIds(node: HtmlDomElement): string[] {
    const anchorIds = [
      getHtmlElementAttribute(node, "id"),
      getHtmlElementAttribute(node, "name")
    ]
    return anchorIds.flatMap((value) =>
      typeof value === "string" && value.trim() ? [value.trim()] : []
    )
  }

  private registerAnchorIds(anchorIds: string[], blockId: string): void {
    for (const anchorId of anchorIds) {
      this.anchors[anchorId] = blockId
    }
  }

  private registerAnchor(node: HtmlDomElement, blockId: string): void {
    this.registerAnchorIds(this.collectAnchorIds(node), blockId)
  }

  private registerAnchorToFirstBlock(
    node: HtmlDomElement,
    blocks: BlockNode[]
  ): void {
    const firstBlockId = blocks[0]?.id
    if (!firstBlockId) {
      return
    }

    this.registerAnchor(node, firstBlockId)
  }

  private registerInlineAnchors(node: HtmlDomNode, blockId: string): void {
    if (!isHtmlElementNode(node)) {
      return
    }

    this.registerAnchor(node, blockId)
    for (const child of getHtmlNodeChildren(node)) {
      this.registerInlineAnchors(child, blockId)
    }
  }

  private queuePendingAnchors(node: HtmlDomElement): void {
    this.pendingAnchors.push(...this.collectAnchorIds(node))
  }

  private flushPendingAnchors(blocks: BlockNode[]): void {
    const firstBlockId = blocks[0]?.id
    if (!firstBlockId || this.pendingAnchors.length === 0) {
      return
    }

    this.registerAnchorIds(this.pendingAnchors, firstBlockId)
    this.pendingAnchors = []
  }

  private parseChildBlocks(node: HtmlDomElement): BlockNode[] {
    const blocks: BlockNode[] = []

    for (const child of getHtmlNodeChildren(node)) {
      if (!isHtmlElementNode(child)) {
        continue
      }

      const parsedBlocks = this.parseElement(child)
      if (parsedBlocks.length > 0) {
        this.flushPendingAnchors(parsedBlocks)
        blocks.push(...parsedBlocks)
        continue
      }

      if (
        this.collectAnchorIds(child).length > 0 &&
        !getHtmlNodeTextContent(child).trim()
      ) {
        this.queuePendingAnchors(child)
      }
    }

    return blocks
  }

  private parseElement(node: HtmlDomElement): BlockNode[] {
    if (
      node.name === "body" ||
      node.name === "section" ||
      node.name === "article" ||
      node.name === "div" ||
      node.name === "main"
    ) {
      const blocks = this.parseChildBlocks(node)
      this.registerAnchorToFirstBlock(node, blocks)
      return blocks
    }

    if (/^h[1-6]$/.test(node.name)) {
      const blockId = this.createBlockId("heading")
      this.registerInlineAnchors(node, blockId)
      return [
        {
          id: blockId,
          kind: "heading",
          level: Number(node.name[1]) as 1 | 2 | 3 | 4 | 5 | 6,
          inlines: parseInlineNodes(
            getHtmlNodeChildren(node),
            this.sectionHref,
            this.stylesheets
          ),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "p") {
      const blockId = this.createBlockId("text")
      this.registerInlineAnchors(node, blockId)
      return [
        {
          id: blockId,
          kind: "text",
          inlines: parseInlineNodes(
            getHtmlNodeChildren(node),
            this.sectionHref,
            this.stylesheets
          ),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "blockquote") {
      const blockId = this.createBlockId("quote")
      this.registerAnchor(node, blockId)
      return [
        {
          id: blockId,
          kind: "quote",
          blocks: this.parseChildBlocks(node),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "pre") {
      const blockId = this.createBlockId("code")
      this.registerInlineAnchors(node, blockId)
      const codeNode = getHtmlChildElements(node).find(
        (child) => child.name === "code"
      )
      const language =
        getHtmlElementAttribute(codeNode ?? node, "data-language") ??
        getHtmlElementAttribute(codeNode ?? node, "class")
      const codeBlock: BlockNode = {
        id: blockId,
        kind: "code",
        text: normalizePreformattedText(
          getHtmlNodeTextContent(codeNode ?? node)
        ),
        ...getBlockNodeMetadata(node, this.stylesheets)
      }

      if (language?.trim()) {
        codeBlock.language = language.trim()
      }

      return [codeBlock]
    }

    if (node.name === "img") {
      const imageBlock = this.parseImageBlock(node)
      return imageBlock ? [imageBlock] : []
    }

    if (node.name === "figure") {
      const blockId = this.createBlockId("figure")
      this.registerAnchor(node, blockId)
      const contentBlocks = getHtmlChildElements(node)
        .filter((child) => child.name !== "figcaption")
        .flatMap((child) => this.parseElement(child))
      const captionNode = getHtmlChildElements(node).find(
        (child) => child.name === "figcaption"
      )
      return [
        {
          id: blockId,
          kind: "figure",
          blocks: contentBlocks,
          ...getBlockNodeMetadata(node, this.stylesheets),
          ...(captionNode
            ? { caption: this.parseBlocksWithInlineFallback(captionNode) }
            : {})
        }
      ]
    }

    if (node.name === "aside") {
      const blockId = this.createBlockId("aside")
      this.registerAnchor(node, blockId)
      return [
        {
          id: blockId,
          kind: "aside",
          blocks: this.parseBlocksWithInlineFallback(node),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "nav") {
      const blockId = this.createBlockId("nav")
      this.registerAnchor(node, blockId)
      return [
        {
          id: blockId,
          kind: "nav",
          blocks: this.parseBlocksWithInlineFallback(node),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "hr") {
      const blockId = this.createBlockId("thematic-break")
      this.registerAnchor(node, blockId)
      return [
        {
          id: blockId,
          kind: "thematic-break",
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "ul" || node.name === "ol") {
      const blockId = this.createBlockId("list")
      this.registerAnchor(node, blockId)
      const itemNodes = getHtmlChildElements(node).filter(
        (child) => child.name === "li"
      )
      const items: ListItemBlock[] = itemNodes.map((itemNode) => ({
        id: this.createListItemId(),
        blocks: this.parseListItem(itemNode)
      }))

      const listBlock: BlockNode = {
        id: blockId,
        kind: "list",
        ordered: node.name === "ol",
        items,
        ...getBlockNodeMetadata(node, this.stylesheets)
      }

      const start = getHtmlElementAttribute(node, "start")
      if (node.name === "ol" && typeof start === "string") {
        const startNumber = Number(start)
        if (!Number.isNaN(startNumber)) {
          listBlock.start = startNumber
        }
      }

      return [listBlock]
    }

    if (node.name === "table") {
      const blockId = this.createBlockId("table")
      this.registerAnchor(node, blockId)
      const captionNode = getHtmlChildElements(node).find(
        (child) => child.name === "caption"
      )
      return [
        {
          id: blockId,
          kind: "table",
          rows: this.parseTableRows(node),
          ...getBlockNodeMetadata(node, this.stylesheets),
          ...(captionNode
            ? { caption: this.parseBlocksWithInlineFallback(captionNode) }
            : {})
        }
      ]
    }

    if (node.name === "dl") {
      const blockId = this.createBlockId("definition-list")
      this.registerAnchor(node, blockId)
      return [
        {
          id: blockId,
          kind: "definition-list",
          items: this.parseDefinitionListItems(node),
          ...getBlockNodeMetadata(node, this.stylesheets)
        }
      ]
    }

    if (node.name === "script" || node.name === "style") {
      return []
    }

    const fallbackBlocks = this.applyFallbackBlockMetadata(
      node,
      this.parseBlocksWithInlineFallback(node)
    )
    this.registerAnchorToFirstBlock(node, fallbackBlocks)
    return fallbackBlocks
  }

  private applyFallbackBlockMetadata(
    node: HtmlDomElement,
    blocks: BlockNode[]
  ): BlockNode[] {
    if (blocks.length !== 1) {
      return blocks
    }

    const block = blocks[0]
    if (!block || (block.kind !== "text" && block.kind !== "heading")) {
      return blocks
    }

    const metadata = getBlockNodeMetadata(node, this.stylesheets)
    const mergedStyle = {
      ...(metadata.style ?? {}),
      ...(block.style ?? {})
    }

    return [
      {
        ...metadata,
        ...block,
        ...(Object.keys(mergedStyle).length > 0 ? { style: mergedStyle } : {})
      }
    ]
  }

  private parseImageBlock(node: HtmlDomElement): ImageBlock | null {
    const src = getHtmlElementAttribute(node, "src")
    if (!src) {
      return null
    }

    const blockId = this.createBlockId("image")
    this.registerAnchor(node, blockId)
    const imageBlock: ImageBlock = {
      id: blockId,
      kind: "image",
      src: resolveResourcePath(this.sectionHref, src),
      ...getBlockNodeMetadata(node, this.stylesheets)
    }

    const alt = getHtmlElementAttribute(node, "alt")
    const title = getHtmlElementAttribute(node, "title")
    const width = getHtmlElementAttribute(node, "width")
    const height = getHtmlElementAttribute(node, "height")

    if (alt?.trim()) {
      imageBlock.alt = alt.trim()
    }
    if (title?.trim()) {
      imageBlock.title = title.trim()
    }
    if (typeof width === "string") {
      const parsedWidth = Number(width)
      if (!Number.isNaN(parsedWidth)) {
        imageBlock.width = parsedWidth
      }
    }
    if (typeof height === "string") {
      const parsedHeight = Number(height)
      if (!Number.isNaN(parsedHeight)) {
        imageBlock.height = parsedHeight
      }
    }

    return imageBlock
  }

  private parseListItem(node: HtmlDomElement): BlockNode[] {
    const blocks = this.parseChildBlocks(node)
    if (blocks.length > 0) {
      return blocks
    }

    const parsedInlines = parseInlineNodes(
      getHtmlNodeChildren(node),
      this.sectionHref,
      this.stylesheets
    )
    if (parsedInlines.length === 0) {
      return []
    }

    return [
      {
        id: this.createBlockId("text"),
        kind: "text",
        inlines: parsedInlines,
        ...getBlockNodeMetadata(node, this.stylesheets)
      }
    ]
  }

  private parseBlocksWithInlineFallback(node: HtmlDomElement): BlockNode[] {
    const blocks = this.parseChildBlocks(node)
    if (blocks.length > 0) {
      return blocks
    }

    const parsedInlines = parseInlineNodes(
      getHtmlNodeChildren(node),
      this.sectionHref,
      this.stylesheets
    )
    if (parsedInlines.length === 0) {
      return []
    }

    return [
      {
        id: this.createBlockId("text"),
        kind: "text",
        inlines: parsedInlines,
        ...getBlockNodeMetadata(node, this.stylesheets)
      }
    ]
  }

  private parseDefinitionListItems(node: HtmlDomElement) {
    const items: Array<{
      id: string
      term: BlockNode[]
      descriptions: BlockNode[][]
    }> = []
    let currentItem: (typeof items)[number] | null = null

    for (const child of getHtmlChildElements(node)) {
      if (child.name === "dt") {
        currentItem = {
          id: this.createDefinitionItemId(),
          term: this.parseBlocksWithInlineFallback(child),
          descriptions: []
        }
        items.push(currentItem)
        continue
      }

      if (child.name === "dd" && currentItem) {
        currentItem.descriptions.push(this.parseBlocksWithInlineFallback(child))
      }
    }

    return items
  }

  private parseTableRows(node: HtmlDomElement): TableRow[] {
    const rows: TableRow[] = []
    const rowContainers = getHtmlChildElements(node).filter(
      (child) =>
        child.name === "thead" ||
        child.name === "tbody" ||
        child.name === "tfoot" ||
        child.name === "tr"
    )

    for (const container of rowContainers) {
      if (container.name === "tr") {
        rows.push({
          id: this.createRowId(),
          cells: this.parseTableCells(container)
        })
        continue
      }

      for (const rowNode of getHtmlChildElements(container)) {
        if (rowNode.name !== "tr") {
          continue
        }

        rows.push({
          id: this.createRowId(),
          cells: this.parseTableCells(rowNode)
        })
      }
    }

    return rows
  }

  private parseTableCells(node: HtmlDomElement): TableCell[] {
    const cellNodes = getHtmlChildElements(node).filter(
      (child) => child.name === "th" || child.name === "td"
    )

    return cellNodes.map((cellNode) => {
      const blocks = this.parseChildBlocks(cellNode)
      const cell: TableCell = {
        id: this.createCellId(),
        blocks:
          blocks.length > 0
            ? blocks
            : [
                {
                  id: this.createBlockId("text"),
                  kind: "text",
                  inlines: parseInlineNodes(
                    getHtmlNodeChildren(cellNode),
                    this.sectionHref,
                    this.stylesheets
                  )
                }
              ]
      }

      if (cellNode.name === "th") {
        cell.header = true
      }

      const colSpan = getHtmlElementAttribute(cellNode, "colspan")
      const rowSpan = getHtmlElementAttribute(cellNode, "rowspan")
      if (typeof colSpan === "string") {
        const parsedColSpan = Number(colSpan)
        if (!Number.isNaN(parsedColSpan)) {
          cell.colSpan = parsedColSpan
        }
      }
      if (typeof rowSpan === "string") {
        const parsedRowSpan = Number(rowSpan)
        if (!Number.isNaN(parsedRowSpan)) {
          cell.rowSpan = parsedRowSpan
        }
      }

      return cell
    })
  }
}

export function parseXhtmlDocument(
  xml: string,
  sectionHref: string,
  stylesheets: CssAstStyleSheet[] = []
): SectionDocument {
  const parser = new XhtmlBlockParser(
    normalizeResourcePath(sectionHref),
    stylesheets
  )
  return parser.parseDocument(xml)
}
