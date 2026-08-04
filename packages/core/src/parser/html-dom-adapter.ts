import { parseDocument } from "htmlparser2"
import {
  hasChildren,
  isTag,
  isText,
  type AnyNode,
  type ChildNode,
  type Document,
  type Element,
  type Text
} from "domhandler"

export type HtmlDomDocument = Document
export type HtmlDomNode = AnyNode
export type HtmlDomChildNode = ChildNode
export type HtmlDomElement = Element
export type HtmlDomTextNode = Text

export type ParseHtmlDocumentOptions = {
  xmlMode?: boolean
  withStartIndices?: boolean
  withEndIndices?: boolean
}

const DEFAULT_PARSE_OPTIONS = {
  xmlMode: true,
  decodeEntities: true,
  recognizeSelfClosing: true
} as const

export function parseHtmlDocument(
  source: string,
  options: ParseHtmlDocumentOptions = {}
): HtmlDomDocument {
  return parseDocument(source, {
    ...DEFAULT_PARSE_OPTIONS,
    xmlMode: options.xmlMode ?? DEFAULT_PARSE_OPTIONS.xmlMode,
    ...(options.withStartIndices ? { withStartIndices: true } : {}),
    ...(options.withEndIndices ? { withEndIndices: true } : {})
  })
}

export function isHtmlElementNode(node: HtmlDomNode): node is HtmlDomElement {
  return isTag(node)
}

export function isHtmlTextNode(node: HtmlDomNode): node is HtmlDomTextNode {
  return isText(node)
}

export function getHtmlNodeChildren(
  node: HtmlDomDocument | HtmlDomElement
): HtmlDomChildNode[] {
  return hasChildren(node) ? [...node.children] : []
}

export function getHtmlChildElements(
  node: HtmlDomDocument | HtmlDomElement
): HtmlDomElement[] {
  return getHtmlNodeChildren(node).filter(isHtmlElementNode)
}

export function getHtmlTagName(node: HtmlDomElement): string {
  return node.name
}

export function getHtmlElementAttribute(
  node: HtmlDomElement,
  attributeName: string
): string | undefined {
  const value = node.attribs[attributeName]
  return typeof value === "string" ? value : undefined
}

export function findHtmlElementsByTagName(
  root: HtmlDomDocument | HtmlDomElement,
  tagName: string
): HtmlDomElement[] {
  const matches: HtmlDomElement[] = []
  const targetTagName = tagName.trim()

  function visit(node: HtmlDomNode): void {
    if (isHtmlElementNode(node)) {
      if (getHtmlTagName(node) === targetTagName) {
        matches.push(node)
      }

      for (const child of node.children) {
        visit(child)
      }
      return
    }

    if (hasChildren(node)) {
      for (const child of node.children) {
        visit(child)
      }
    }
  }

  visit(root)
  return matches
}

export function getHtmlNodeTextContent(node: HtmlDomNode): string {
  if (isHtmlTextNode(node)) {
    return node.data
  }

  if (!hasChildren(node)) {
    return ""
  }

  return node.children.map((child) => getHtmlNodeTextContent(child)).join("")
}
