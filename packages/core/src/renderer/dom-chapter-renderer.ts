import type {
  FixedLayoutViewport,
  PublisherColorOverride,
  RenditionLayout,
  Theme,
  TypographyOptions
} from "../model/types"
import type { PreprocessedChapterNode } from "../runtime/chapter-preprocess"
import { buildDomChapterNormalizationCss } from "./dom-chapter-style"
import {
  getDomPageViewportSelector,
  scopeDomStyleSheetCss
} from "./dom-style-scope"

export type DomChapterRenderInput = {
  sectionId: string
  sectionHref: string
  sectionLanguage?: string
  sectionDirection?: "ltr" | "rtl"
  renditionLayout?: RenditionLayout
  fixedLayoutViewport?: FixedLayoutViewport
  fixedLayoutScale?: number
  fixedLayoutRenderWidth?: number
  fixedLayoutRenderHeight?: number
  presentationRole?: "cover" | "image-page"
  presentationImageSrc?: string
  presentationImageAlt?: string
  contentViewportHeight?: number
  presentationViewportWidth?: number
  presentationViewportHeight?: number
  htmlAttributes?: Record<string, string>
  bodyAttributes?: Record<string, string>
  linkedStyleSheets?: Array<{
    href: string
    text: string
  }>
  nodes: PreprocessedChapterNode[]
  theme: Theme
  publisherColorOverride?: PublisherColorOverride
  typography: TypographyOptions
  fontFamily: string
  resolveAttributeValue?: (input: {
    tagName: string
    attributeName: string
    value: string
  }) => string
}

export type DomChapterMarkupOptions = {
  rootBackgroundTarget?: "section" | "page-viewport"
}

type DomStyleScopeOptions = {
  rootBackgroundSelector?: string
}

export class DomChapterRenderer {
  render(container: HTMLElement, input: DomChapterRenderInput): void {
    container.innerHTML = this.createMarkup(input)
  }

  clear(container: HTMLElement): void {
    container
      .querySelectorAll(
        ".epub-dom-section, style[data-epub-dom-normalization], style[data-epub-dom-source]"
      )
      .forEach((element) => element.remove())
  }

  createMarkup(
    input: DomChapterRenderInput,
    options: DomChapterMarkupOptions = {}
  ): string {
    if (
      (input.presentationRole === "cover" ||
        input.presentationRole === "image-page") &&
      input.presentationImageSrc
    ) {
      return this.createPresentationImageMarkup(input, options)
    }

    const styleScopeOptions = createDomStyleScopeOptions(options)

    return [
      ...serializeLinkedStyleSheets(input.linkedStyleSheets, styleScopeOptions),
      `<style data-epub-dom-normalization="true">${buildDomChapterNormalizationCss(
        {
          theme: input.theme,
          publisherColorOverride: input.publisherColorOverride ?? "none",
          typography: input.typography,
          fontFamily: input.fontFamily,
          ...(input.renditionLayout
            ? { renditionLayout: input.renditionLayout }
            : {}),
          ...(input.presentationRole
            ? { presentationRole: input.presentationRole }
            : {})
        }
      )}</style>`,
      serializeDomSectionStart(input, [
        ...(input.presentationRole === "cover"
          ? ["epub-dom-section-cover"]
          : []),
        ...(input.renditionLayout === "pre-paginated"
          ? ["epub-dom-section-fxl"]
          : [])
      ]),
      serializePreprocessedChapterNodes(
        input.nodes,
        input.resolveAttributeValue,
        styleScopeOptions
      ),
      "</div>"
    ].join("")
  }

  createPresentationImageMarkup(
    input: DomChapterRenderInput,
    options: DomChapterMarkupOptions = {}
  ): string {
    const imageAlt =
      input.presentationImageAlt ??
      (input.presentationRole === "cover" ? "Cover" : "")
    const presentationClass =
      input.presentationRole === "cover"
        ? "epub-dom-cover"
        : "epub-dom-image-page"

    const styleScopeOptions = createDomStyleScopeOptions(options)

    return [
      ...serializeLinkedStyleSheets(input.linkedStyleSheets, styleScopeOptions),
      `<style data-epub-dom-normalization="true">${buildDomChapterNormalizationCss(
        {
          theme: input.theme,
          publisherColorOverride: input.publisherColorOverride ?? "none",
          typography: input.typography,
          fontFamily: input.fontFamily,
          ...(input.renditionLayout
            ? { renditionLayout: input.renditionLayout }
            : {}),
          ...(input.presentationRole
            ? { presentationRole: input.presentationRole }
            : {})
        }
      )}</style>`,
      serializeDomSectionStart(input, [
        `epub-dom-section-${input.presentationRole}`,
        presentationClass,
        ...(input.renditionLayout === "pre-paginated"
          ? ["epub-dom-section-fxl"]
          : [])
      ]),
      `<img class="epub-dom-presentation-image" src="${escapeHtmlAttribute(input.presentationImageSrc ?? "")}" alt="${escapeHtmlAttribute(imageAlt)}">`,
      "</div>"
    ].join("")
  }
}

export function serializeDomPageViewportAttributes(
  input: DomChapterRenderInput,
  options: {
    pageHeight: number
    pageNumberInSection: number
  }
): string {
  const bodyAttributes = input.bodyAttributes ?? {}
  const htmlAttributes = input.htmlAttributes ?? {}
  const className = mergeClassNames(
    getDomPageViewportSelector().slice(1),
    htmlAttributes.class,
    bodyAttributes.class
  )
  const backgroundStyle = extractRootBackgroundStyleAttributes(
    htmlAttributes.style,
    bodyAttributes.style
  )
  const styleAttributes = [
    "position: relative",
    "overflow: hidden",
    `height: ${options.pageHeight}px`,
    ...(backgroundStyle ? [backgroundStyle] : [])
  ]

  return [
    ` class="${escapeHtmlAttribute(className)}"`,
    ` data-page-viewport="true"`,
    ` data-page-number-in-section="${escapeHtmlAttribute(String(options.pageNumberInSection))}"`,
    ` style="${escapeHtmlAttribute(styleAttributes.join("; "))}"`
  ].join("")
}

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
])

function serializePreprocessedChapterNodes(
  nodes: PreprocessedChapterNode[],
  resolveAttributeValue?: DomChapterRenderInput["resolveAttributeValue"],
  styleScopeOptions?: DomStyleScopeOptions
): string {
  return nodes
    .map((node) =>
      serializePreprocessedChapterNode(
        node,
        resolveAttributeValue,
        styleScopeOptions
      )
    )
    .join("")
}

function serializePreprocessedChapterNode(
  node: PreprocessedChapterNode,
  resolveAttributeValue?: DomChapterRenderInput["resolveAttributeValue"],
  styleScopeOptions?: DomStyleScopeOptions
): string {
  if (node.kind === "text") {
    return escapeHtmlText(node.text)
  }

  const nodeAttributes = shouldMarkMediaWrapper(node)
    ? {
        ...node.attributes,
        class: mergeClassNames(node.attributes.class, "epub-dom-media-wrapper")
      }
    : node.attributes
  const attributes = Object.entries(nodeAttributes)
    .flatMap(([name, value]) => {
      const resolvedValue = resolveAttributeValue
        ? resolveAttributeValue({
            tagName: node.tagName,
            attributeName: name,
            value
          })
        : value
      if (!resolvedValue.trim()) {
        return []
      }
      return [` ${name}="${escapeHtmlAttribute(resolvedValue)}"`]
    })
    .join("")

  if (VOID_HTML_TAGS.has(node.tagName)) {
    return `<${node.tagName}${attributes}>`
  }

  if (node.tagName === "style") {
    return serializeInlineStyleNode(node, attributes, styleScopeOptions)
  }

  return `<${node.tagName}${attributes}>${serializePreprocessedChapterNodes(
    node.children,
    resolveAttributeValue,
    styleScopeOptions
  )}</${node.tagName}>`
}

function shouldMarkMediaWrapper(node: PreprocessedChapterNode): boolean {
  if (node.kind === "text") {
    return false
  }

  const tagName = node.tagName.toLowerCase()
  if (tagName !== "div" && tagName !== "figure") {
    return false
  }

  return node.children.some(
    (child) =>
      child.kind !== "text" &&
      ["img", "svg", "object", "video", "canvas"].includes(
        child.tagName.toLowerCase()
      )
  )
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;")
}

function serializeLinkedStyleSheets(
  stylesheets: DomChapterRenderInput["linkedStyleSheets"],
  styleScopeOptions?: DomStyleScopeOptions
): string[] {
  return (stylesheets ?? []).map(
    (stylesheet) =>
      `<style data-epub-dom-source="${escapeHtmlAttribute(stylesheet.href)}">${escapeStyleTagText(scopeDomStyleSheetCss(stylesheet.text, undefined, styleScopeOptions))}</style>`
  )
}

function serializeDomSectionStart(
  input: DomChapterRenderInput,
  extraClassNames: string[]
): string {
  const bodyAttributes = input.bodyAttributes ?? {}
  const htmlAttributes = input.htmlAttributes ?? {}
  const className = mergeClassNames(
    "epub-dom-section",
    htmlAttributes.class,
    bodyAttributes.class,
    ...extraClassNames
  )
  const idAttribute = bodyAttributes.id ?? htmlAttributes.id

  return [
    `<div class="${escapeHtmlAttribute(className)}"`,
    idAttribute ? ` id="${escapeHtmlAttribute(idAttribute)}"` : "",
    ` data-section-id="${escapeHtmlAttribute(input.sectionId)}"`,
    ` data-section-href="${escapeHtmlAttribute(input.sectionHref)}"`,
    serializeSectionLanguageAttributes(input),
    serializeSectionLayoutAttributes(input),
    ">"
  ].join("")
}

function mergeClassNames(...values: Array<string | undefined>): string {
  const tokens = new Set<string>()
  for (const value of values) {
    for (const token of value?.split(/\s+/) ?? []) {
      if (token.trim()) {
        tokens.add(token.trim())
      }
    }
  }
  return Array.from(tokens).join(" ")
}

function mergeRootStyleAttributes(
  ...values: Array<string | undefined>
): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/;+$/g, ""))
    .join("; ")
}

function extractRootBackgroundStyleAttributes(
  ...values: Array<string | undefined>
): string {
  return values
    .flatMap((value) => splitCssDeclarations(value ?? ""))
    .filter(isBackgroundDeclaration)
    .join("; ")
}

function splitCssDeclarations(value: string): string[] {
  const declarations: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let parenDepth = 0

  for (const char of value) {
    if (quote) {
      current += char
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === "(") {
      parenDepth += 1
      current += char
      continue
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1)
      current += char
      continue
    }

    if (char === ";" && parenDepth === 0) {
      const declaration = current.trim()
      if (declaration) {
        declarations.push(declaration)
      }
      current = ""
      continue
    }

    current += char
  }

  const declaration = current.trim()
  if (declaration) {
    declarations.push(declaration)
  }

  return declarations
}

function isBackgroundDeclaration(declaration: string): boolean {
  const separatorIndex = declaration.indexOf(":")
  if (separatorIndex <= 0) {
    return false
  }

  const propertyName = declaration.slice(0, separatorIndex).trim().toLowerCase()
  return propertyName === "background" || propertyName.startsWith("background-")
}

function escapeStyleTagText(value: string): string {
  return value.replaceAll("</style", "<\\/style")
}

function serializeInlineStyleNode(
  node: Extract<PreprocessedChapterNode, { kind: "element" }>,
  attributes: string,
  styleScopeOptions?: DomStyleScopeOptions
): string {
  const styleText = node.children
    .map((child) => (child.kind === "text" ? child.text : ""))
    .join("")

  return `<style${attributes}>${escapeStyleTagText(scopeDomStyleSheetCss(styleText, undefined, styleScopeOptions))}</style>`
}

function serializeSectionLanguageAttributes(
  input: DomChapterRenderInput
): string {
  return [
    input.sectionLanguage
      ? ` lang="${escapeHtmlAttribute(input.sectionLanguage)}"`
      : "",
    input.sectionDirection
      ? ` dir="${escapeHtmlAttribute(input.sectionDirection)}"`
      : ""
  ].join("")
}

function serializeSectionLayoutAttributes(
  input: DomChapterRenderInput
): string {
  const styleAttributes: string[] = []
  const dataAttributes: string[] = []
  const rootStyle = mergeRootStyleAttributes(
    input.htmlAttributes?.style,
    input.bodyAttributes?.style
  )
  if (rootStyle) {
    styleAttributes.push(rootStyle)
  }

  if (input.renditionLayout === "pre-paginated" && input.fixedLayoutViewport) {
    dataAttributes.push(` data-rendition-layout="pre-paginated"`)
    dataAttributes.push(
      ` data-fxl-viewport-width="${escapeHtmlAttribute(String(input.fixedLayoutViewport.width))}"`
    )
    dataAttributes.push(
      ` data-fxl-viewport-height="${escapeHtmlAttribute(String(input.fixedLayoutViewport.height))}"`
    )
    styleAttributes.push(
      `--fxl-viewport-width: ${input.fixedLayoutViewport.width}px`
    )
    styleAttributes.push(
      `--fxl-viewport-height: ${input.fixedLayoutViewport.height}px`
    )

    if (typeof input.fixedLayoutRenderWidth === "number") {
      styleAttributes.push(
        `--fxl-render-width: ${input.fixedLayoutRenderWidth}px`
      )
    }
    if (typeof input.fixedLayoutRenderHeight === "number") {
      styleAttributes.push(
        `--fxl-render-height: ${input.fixedLayoutRenderHeight}px`
      )
    }
    if (typeof input.fixedLayoutScale === "number") {
      dataAttributes.push(
        ` data-fxl-scale="${escapeHtmlAttribute(input.fixedLayoutScale.toFixed(4))}"`
      )
      styleAttributes.push(`--fxl-scale: ${input.fixedLayoutScale}`)
    }
  }

  if (typeof input.presentationViewportWidth === "number") {
    dataAttributes.push(
      ` data-presentation-width="${escapeHtmlAttribute(String(input.presentationViewportWidth))}"`
    )
    styleAttributes.push(
      `--reader-presentation-width: ${input.presentationViewportWidth}px`
    )
  }
  if (typeof input.presentationViewportHeight === "number") {
    dataAttributes.push(
      ` data-presentation-height="${escapeHtmlAttribute(String(input.presentationViewportHeight))}"`
    )
    styleAttributes.push(
      `--reader-presentation-height: ${input.presentationViewportHeight}px`
    )
  }
  if (typeof input.contentViewportHeight === "number") {
    dataAttributes.push(
      ` data-content-height="${escapeHtmlAttribute(String(input.contentViewportHeight))}"`
    )
    styleAttributes.push(
      `--reader-content-viewport-height: ${input.contentViewportHeight}px`
    )
  }

  return [
    ...dataAttributes,
    styleAttributes.length > 0
      ? ` style="${escapeHtmlAttribute(styleAttributes.join("; "))}"`
      : ""
  ].join("")
}

function createDomStyleScopeOptions(
  options: DomChapterMarkupOptions
): DomStyleScopeOptions | undefined {
  if (options.rootBackgroundTarget !== "page-viewport") {
    return undefined
  }

  return {
    rootBackgroundSelector: getDomPageViewportSelector()
  }
}
