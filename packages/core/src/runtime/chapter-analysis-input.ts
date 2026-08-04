import type { XhtmlDomDocument } from "../parser/xhtml-dom-parser"
import type { CssAstStyleSheet } from "../parser/css-ast-adapter"
import {
  getCssAllDeclarations,
  getCssDeclarationValueText
} from "../parser/css-ast-adapter"
import {
  getHtmlElementAttribute,
  getHtmlNodeChildren,
  getHtmlTagName,
  isHtmlElementNode,
  isHtmlTextNode,
  type HtmlDomElement,
  type HtmlDomNode
} from "../parser/html-dom-adapter"
import { parseInlineStyleAttribute } from "../parser/style-resolver"
import type {
  PreprocessedChapter,
  PreprocessedChapterNode
} from "./chapter-preprocess"

export type ChapterAnalysisInput = {
  href: string
  rootTagName?: string
  nodeCount: number
  elementCount: number
  textNodeCount: number
  maxDepth: number
  tagCounts: Record<string, number>
  styledElementCount: number
  inlineStyleDeclarationCount: number
  stylePropertyCounts: Record<string, number>
  stylePropertyValueCounts: Record<string, number>
  classTokenCount: number
  idAttributeCount: number
}

export function buildChapterAnalysisInput(input: {
  href: string
  document?: Pick<XhtmlDomDocument, "bodyElement" | "htmlElement">
  chapter?: PreprocessedChapter
  stylesheets?: CssAstStyleSheet[]
}): ChapterAnalysisInput {
  if (input.chapter) {
    return buildChapterAnalysisInputFromPreprocessedChapter(
      input.href,
      input.chapter,
      input.stylesheets
    )
  }

  const root = input.document?.bodyElement ?? input.document?.htmlElement
  if (!root) {
    return {
      href: input.href,
      nodeCount: 0,
      elementCount: 0,
      textNodeCount: 0,
      maxDepth: 0,
      tagCounts: {},
      styledElementCount: 0,
      inlineStyleDeclarationCount: 0,
      stylePropertyCounts: {},
      stylePropertyValueCounts: {},
      classTokenCount: 0,
      idAttributeCount: 0
    }
  }

  const analysis: ChapterAnalysisInput = {
    href: input.href,
    rootTagName: getHtmlTagName(root),
    nodeCount: 0,
    elementCount: 0,
    textNodeCount: 0,
    maxDepth: 0,
    tagCounts: {},
    styledElementCount: 0,
    inlineStyleDeclarationCount: 0,
    stylePropertyCounts: {},
    stylePropertyValueCounts: {},
    classTokenCount: 0,
    idAttributeCount: 0
  }

  for (const child of getHtmlNodeChildren(root)) {
    visitNode(child, 1, analysis)
  }

  collectStyleSheetDeclarations(input.stylesheets, analysis)

  return analysis
}

function buildChapterAnalysisInputFromPreprocessedChapter(
  href: string,
  chapter: PreprocessedChapter,
  stylesheets?: CssAstStyleSheet[]
): ChapterAnalysisInput {
  const analysis: ChapterAnalysisInput = {
    href,
    ...(chapter.rootTagName ? { rootTagName: chapter.rootTagName } : {}),
    nodeCount: 0,
    elementCount: 0,
    textNodeCount: 0,
    maxDepth: 0,
    tagCounts: {},
    styledElementCount: 0,
    inlineStyleDeclarationCount: 0,
    stylePropertyCounts: {},
    stylePropertyValueCounts: {},
    classTokenCount: 0,
    idAttributeCount: 0
  }

  for (const node of chapter.nodes) {
    visitPreprocessedNode(node, 1, analysis)
  }

  collectStyleSheetDeclarations(stylesheets, analysis)

  return analysis
}

function visitNode(
  node: HtmlDomNode,
  depth: number,
  analysis: ChapterAnalysisInput
): void {
  if (isHtmlTextNode(node)) {
    if (!node.data.trim()) {
      return
    }

    analysis.nodeCount += 1
    analysis.textNodeCount += 1
    analysis.maxDepth = Math.max(analysis.maxDepth, depth)
    return
  }

  if (!isHtmlElementNode(node)) {
    return
  }

  analysis.nodeCount += 1
  analysis.elementCount += 1
  analysis.maxDepth = Math.max(analysis.maxDepth, depth)

  const tagName = getHtmlTagName(node)
  analysis.tagCounts[tagName] = (analysis.tagCounts[tagName] ?? 0) + 1

  collectElementAttributes(node, analysis)

  for (const child of getHtmlNodeChildren(node)) {
    visitNode(child, depth + 1, analysis)
  }
}

function collectElementAttributes(
  node: HtmlDomElement,
  analysis: ChapterAnalysisInput
): void {
  const id = getHtmlElementAttribute(node, "id")
  if (id?.trim()) {
    analysis.idAttributeCount += 1
  }

  const className = getHtmlElementAttribute(node, "class")
  if (className?.trim()) {
    analysis.classTokenCount += className
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean).length
  }

  const inlineStyle = getHtmlElementAttribute(node, "style")
  if (!inlineStyle?.trim()) {
    return
  }

  const declarations = parseInlineStyleAttribute(inlineStyle)
  if (declarations.length === 0) {
    return
  }

  analysis.styledElementCount += 1
  analysis.inlineStyleDeclarationCount += declarations.length
  for (const declaration of declarations) {
    collectStyleDeclaration(declaration.property, declaration.value, analysis)
  }
}

function visitPreprocessedNode(
  node: PreprocessedChapterNode,
  depth: number,
  analysis: ChapterAnalysisInput
): void {
  if (node.kind === "text") {
    if (!node.text.trim()) {
      return
    }

    analysis.nodeCount += 1
    analysis.textNodeCount += 1
    analysis.maxDepth = Math.max(analysis.maxDepth, depth)
    return
  }

  analysis.nodeCount += 1
  analysis.elementCount += 1
  analysis.maxDepth = Math.max(analysis.maxDepth, depth)
  analysis.tagCounts[node.tagName] = (analysis.tagCounts[node.tagName] ?? 0) + 1

  const id = node.attributes.id
  if (id?.trim()) {
    analysis.idAttributeCount += 1
  }

  const className = node.attributes.class
  if (className?.trim()) {
    analysis.classTokenCount += className
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean).length
  }

  const inlineStyle = node.attributes.style
  if (inlineStyle?.trim()) {
    const declarations = parseInlineStyleAttribute(inlineStyle)
    if (declarations.length > 0) {
      analysis.styledElementCount += 1
      analysis.inlineStyleDeclarationCount += declarations.length
      for (const declaration of declarations) {
        collectStyleDeclaration(
          declaration.property,
          declaration.value,
          analysis
        )
      }
    }
  }

  for (const child of node.children) {
    visitPreprocessedNode(child, depth + 1, analysis)
  }
}

function collectStyleSheetDeclarations(
  stylesheets: CssAstStyleSheet[] | undefined,
  analysis: ChapterAnalysisInput
): void {
  for (const stylesheet of stylesheets ?? []) {
    for (const declaration of getCssAllDeclarations(stylesheet)) {
      const property = declaration.property.trim().toLowerCase()
      if (!property) {
        continue
      }

      collectStyleDeclaration(
        property,
        getCssDeclarationValueText(declaration),
        analysis
      )
    }
  }
}

function collectStyleDeclaration(
  property: string,
  value: string,
  analysis: ChapterAnalysisInput
): void {
  const normalizedProperty = property.trim().toLowerCase()
  const normalizedValue = normalizeStyleDeclarationValue(value)
  if (!normalizedProperty) {
    return
  }

  analysis.stylePropertyCounts[normalizedProperty] =
    (analysis.stylePropertyCounts[normalizedProperty] ?? 0) + 1

  if (!normalizedValue) {
    return
  }

  const valueKey = `${normalizedProperty}:${normalizedValue}`
  analysis.stylePropertyValueCounts[valueKey] =
    (analysis.stylePropertyValueCounts[valueKey] ?? 0) + 1
}

function normalizeStyleDeclarationValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}
