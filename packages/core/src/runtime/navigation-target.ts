import type {
  Book,
  Locator,
  SectionDocument,
  TocTarget,
  TocItem
} from "../model/types"
import {
  estimateSectionProgressForBlock,
  findBlockIdForAnchor,
  normalizeLocator,
  resolveSectionIndexForLocator
} from "./locator"

export function createBlockLocator(input: {
  section: SectionDocument
  spineIndex: number
  blockId: string
  anchorId?: string
}): Locator {
  return normalizeLocator({
    spineIndex: input.spineIndex,
    blockId: input.blockId,
    progressInSection: estimateSectionProgressForBlock(
      input.section,
      input.blockId
    ),
    ...(input.anchorId ? { anchorId: input.anchorId } : {})
  })
}

export function resolveBookHrefLocator(input: {
  book: Book
  currentSectionIndex: number
  href: string
}): Locator | null {
  const [targetHref, targetAnchor] = splitHrefFragment(input.href)
  const targetIndex = targetHref.trim()
    ? resolveSectionIndexForLocator(input.book, { href: targetHref })
    : input.currentSectionIndex

  if (targetIndex < 0) {
    return null
  }

  const section = input.book.sections[targetIndex]
  if (!section) {
    return null
  }

  const blockId = targetAnchor
    ? findBlockIdForAnchor(section, targetAnchor)
    : undefined
  if (blockId) {
    return createBlockLocator({
      section,
      spineIndex: targetIndex,
      blockId,
      ...(targetAnchor ? { anchorId: targetAnchor } : {})
    })
  }

  return normalizeLocator({
    spineIndex: targetIndex,
    progressInSection: 0,
    ...(targetAnchor ? { anchorId: targetAnchor } : {})
  })
}

export function findRenderedAnchorTarget(
  sectionElement: HTMLElement,
  anchorId: string
): HTMLElement | null {
  const normalizedAnchor = anchorId.trim()
  if (!normalizedAnchor) {
    return null
  }

  const selectorValue = escapeAttributeSelectorValue(normalizedAnchor)
  return (
    sectionElement.querySelector<HTMLElement>(`[id="${selectorValue}"]`) ??
    sectionElement.querySelector<HTMLElement>(`a[name="${selectorValue}"]`)
  )
}

export function flattenTocTargets(book: Book): TocTarget[] {
  return flattenTocItems({
    book,
    items: book.toc,
    depth: 0
  })
}

function splitHrefFragment(href: string): [string, string | null] {
  const [baseHref, fragment] = href.split("#", 2)
  return [baseHref ?? href, fragment ?? null]
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}

function flattenTocItems(input: {
  book: Book
  items: TocItem[]
  depth: number
  parentId?: string
}): TocTarget[] {
  const targets: TocTarget[] = []

  for (const item of input.items) {
    const locator = resolveBookHrefLocator({
      book: input.book,
      currentSectionIndex: 0,
      href: item.href
    })
    if (locator) {
      targets.push({
        id: item.id,
        label: item.label,
        href: item.href,
        depth: input.depth,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        locator
      })
    }

    targets.push(
      ...flattenTocItems({
        book: input.book,
        items: item.children,
        depth: input.depth + 1,
        parentId: item.id
      })
    )
  }

  return targets
}
