import type { InlineNode, SectionDocument } from "../model/types"

export type ImageRenderCategory = "inline" | "block" | "presentation" | "fxl"

export type ImageSemanticAttributes = {
  tagName?: string | undefined
  className?: string | undefined
  role?: string | undefined
  epubType?: string | undefined
}

const INLINE_CONTEXT_TAGS = new Set(["sup", "sub", "small"])
const INLINE_CLASS_TOKENS = new Set(["footnote", "noteref"])

export function classifySectionImageRenderCategory(
  section: Pick<SectionDocument, "presentationRole" | "renditionLayout">
): ImageRenderCategory | null {
  if (
    section.presentationRole === "cover" ||
    section.presentationRole === "image-page"
  ) {
    return "presentation"
  }

  if (section.renditionLayout === "pre-paginated") {
    return "fxl"
  }

  return null
}

export function hasInlineImageSemantic(
  attributes: ImageSemanticAttributes
): boolean {
  const tagName = attributes.tagName?.trim().toLowerCase()
  if (tagName && INLINE_CONTEXT_TAGS.has(tagName)) {
    return true
  }

  const role = attributes.role?.trim().toLowerCase()
  if (role === "doc-noteref") {
    return true
  }

  if (hasToken(attributes.epubType, "noteref")) {
    return true
  }

  return getClassTokens(attributes.className).some((token) =>
    INLINE_CLASS_TOKENS.has(token)
  )
}

export function hasInlineImageAncestorSemantic(element: Element): boolean {
  let current = element.parentElement
  while (current) {
    if (
      hasInlineImageSemantic({
        tagName: current.tagName,
        className: current.getAttribute("class") ?? undefined,
        role: current.getAttribute("role") ?? undefined,
        epubType:
          current.getAttribute("epub:type") ??
          current.getAttribute("type") ??
          undefined
      })
    ) {
      return true
    }

    if (isBlockBoundary(current)) {
      return false
    }

    current = current.parentElement
  }

  return false
}

export function isDomInlineImageElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== "img" && tagName !== "image") {
    return false
  }

  if (hasInlineImageAncestorSemantic(element)) {
    return true
  }

  const parent = element.parentElement
  if (!parent || isPotentialStandaloneImageParent(parent)) {
    return false
  }

  return hasMeaningfulTextSibling(element)
}

export function isInlineImageNode(
  inline: InlineNode,
  ancestors: ImageSemanticAttributes[] = []
): boolean {
  if (inline.kind !== "image") {
    return false
  }

  return ancestors.some(hasInlineImageSemantic)
}

export function collectInlineImageNodeCategories(
  inlines: InlineNode[],
  ancestors: ImageSemanticAttributes[] = []
): Array<{ src: string; category: "inline" | "block" }> {
  const categories: Array<{ src: string; category: "inline" | "block" }> = []
  for (const inline of inlines) {
    if (inline.kind === "image") {
      categories.push({
        src: inline.src,
        category: isInlineImageNode(inline, ancestors) ? "inline" : "block"
      })
      continue
    }

    if ("children" in inline) {
      categories.push(
        ...collectInlineImageNodeCategories(inline.children, [
          ...ancestors,
          {
            tagName: inline.tagName,
            className: inline.className,
            role: inline.role,
            epubType: inline.epubType
          }
        ])
      )
    }
  }

  return categories
}

function hasToken(value: string | undefined, expected: string): boolean {
  return (value ?? "")
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .includes(expected)
}

function getClassTokens(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function isBlockBoundary(element: Element): boolean {
  return ["p", "div", "section", "article", "main", "figure", "body"].includes(
    element.tagName.toLowerCase()
  )
}

function isPotentialStandaloneImageParent(element: Element): boolean {
  return ["figure", "picture", "svg"].includes(element.tagName.toLowerCase())
}

function hasMeaningfulTextSibling(element: Element): boolean {
  const parent = element.parentNode
  if (!parent) {
    return false
  }

  const siblings = Array.from(parent.childNodes)
  const index = siblings.indexOf(element)
  const hasTextBefore = siblings
    .slice(0, index)
    .some((node) => (node.textContent ?? "").trim().length > 0)
  const hasTextAfter = siblings
    .slice(index + 1)
    .some((node) => (node.textContent ?? "").trim().length > 0)

  return hasTextBefore || hasTextAfter
}
