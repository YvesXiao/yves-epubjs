import type {
  Locator,
  Point,
  ReadingMode,
  Rect,
  TextRangeSelector,
  SectionDocument
} from "../model/types"
import { normalizeLocator } from "./locator"
import { findRenderedAnchorTarget } from "./navigation-target"

type DomLocatorViewportInput = {
  container: HTMLElement
  mode: ReadingMode
  sectionElement: HTMLElement
  locator: Locator
  sectionTop: number
  sectionHeight: number
}

type DomPointLocatorInput = {
  container: HTMLElement
  sectionElement: HTMLElement
  section: SectionDocument
  spineIndex: number
  point: Point
}

type DomTextRangeViewportInput = {
  container: HTMLElement
  mode: ReadingMode
  sectionElement: HTMLElement
  textRange: TextRangeSelector
}

export type DomPointHitTarget = {
  target: HTMLElement
  rect: Rect
}

export function mapDomLocatorToViewport(
  input: DomLocatorViewportInput
): Rect[] {
  const target =
    findRenderedAnchorTarget(
      input.sectionElement,
      input.locator.anchorId ?? ""
    ) ?? findRenderedBlockTarget(input.sectionElement, input.locator.blockId)

  if (target) {
    return [
      measureElementRectWithinContainer(input.container, target, input.mode)
    ]
  }

  return [
    createProgressRect({
      container: input.container,
      sectionElement: input.sectionElement,
      mode: input.mode,
      sectionTop: input.sectionTop,
      sectionHeight: input.sectionHeight,
      progressInSection: input.locator.progressInSection ?? 0
    })
  ]
}

export function mapDomTextRangeToViewport(
  input: DomTextRangeViewportInput
): Rect[] {
  const startElement = findRenderedBlockTarget(
    input.sectionElement,
    input.textRange.start.blockId
  )
  const endElement = findRenderedBlockTarget(
    input.sectionElement,
    input.textRange.end.blockId
  )
  if (!startElement || !endElement) {
    return []
  }

  const startPosition = resolveTextNodePosition(
    startElement,
    input.textRange.start.inlineOffset
  )
  const endPosition = resolveTextNodePosition(
    endElement,
    input.textRange.end.inlineOffset
  )
  if (!startPosition || !endPosition) {
    return []
  }

  const range = document.createRange()
  range.setStart(startPosition.node, startPosition.offset)
  range.setEnd(endPosition.node, endPosition.offset)
  const containerRect = input.container.getBoundingClientRect()
  const clientRects =
    typeof range.getClientRects === "function"
      ? Array.from(range.getClientRects())
      : []

  return clientRects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: rect.left - containerRect.left + input.container.scrollLeft,
      y:
        input.mode === "scroll"
          ? rect.top - containerRect.top + input.container.scrollTop
          : rect.top - containerRect.top,
      width: rect.width,
      height: rect.height
    }))
}

export function mapDomPointToLocator(input: DomPointLocatorInput): Locator {
  const sectionRoot = getDomSectionRoot(input.sectionElement)
  const sectionHeight = getDomSectionHeight(input.sectionElement)
  const containerRect = input.container.getBoundingClientRect()
  const sectionRect = sectionRoot.getBoundingClientRect()
  const sectionTopInViewport = sectionRect.top - containerRect.top
  const clickY = input.point.y - sectionTopInViewport
  const progress = clampProgress(clickY / Math.max(1, sectionHeight))
  const target =
    findDomTargetContainingPoint({
      container: input.container,
      sectionElement: input.sectionElement,
      point: input.point
    }) ??
    findDomBlockTargetContainingPoint({
      container: input.container,
      sectionElement: input.sectionElement,
      point: input.point
    })

  if (!target) {
    return normalizeLocator({
      spineIndex: input.spineIndex,
      progressInSection: progress
    })
  }

  const anchorId = resolveAnchorIdForElement(input.section, target)
  const blockId = resolveBlockIdForElement(input.section, target, sectionRoot)

  return normalizeLocator({
    spineIndex: input.spineIndex,
    progressInSection: progress,
    ...(anchorId ? { anchorId } : {}),
    ...(blockId ? { blockId } : {})
  })
}

export function findDomHitTargetAtPoint(input: {
  container: HTMLElement
  sectionElement: HTMLElement
  point: Point
}): DomPointHitTarget | null {
  const sectionRoot = getDomSectionRoot(input.sectionElement)
  const candidates = collectDomHitTargets(sectionRoot)
  if (candidates.length === 0) {
    return null
  }

  const containerRect = input.container.getBoundingClientRect()
  const pointX = input.point.x
  const pointY = input.point.y
  const matching = candidates
    .map((candidate) => ({
      target: candidate,
      rect: candidate.getBoundingClientRect()
    }))
    .filter(({ rect }) => {
      const localRect = {
        left: rect.left - containerRect.left,
        right: rect.right - containerRect.left,
        top: rect.top - containerRect.top,
        bottom: rect.bottom - containerRect.top
      }

      return (
        pointX >= localRect.left &&
        pointX <= localRect.right &&
        pointY >= localRect.top &&
        pointY <= localRect.bottom
      )
    })

  if (matching.length === 0) {
    return null
  }

  matching.sort((left, right) => {
    const leftArea = left.rect.width * left.rect.height
    const rightArea = right.rect.width * right.rect.height
    return leftArea - rightArea
  })

  const matched = matching[0]
  return matched
    ? {
        target: matched.target,
        rect: measureElementRectWithinContainer(
          input.container,
          matched.target,
          "paginated"
        )
      }
    : null
}

function createProgressRect(input: {
  container: HTMLElement
  sectionElement: HTMLElement
  mode: ReadingMode
  sectionTop: number
  sectionHeight: number
  progressInSection: number
}): Rect {
  const sectionRoot = getDomSectionRoot(input.sectionElement)
  const containerRect = input.container.getBoundingClientRect()
  const sectionRect = sectionRoot.getBoundingClientRect()
  const progress = clampProgress(input.progressInSection)

  return {
    x: sectionRect.left - containerRect.left + input.container.scrollLeft,
    y:
      input.mode === "scroll"
        ? input.sectionTop + input.sectionHeight * progress
        : sectionRect.top - containerRect.top + input.sectionHeight * progress,
    width: Math.max(1, sectionRect.width),
    height: 1
  }
}

function findRenderedBlockTarget(
  sectionElement: HTMLElement,
  blockId: string | undefined
): HTMLElement | null {
  const normalizedBlockId = blockId?.trim()
  if (!normalizedBlockId) {
    return null
  }

  const selectorValue = escapeAttributeSelectorValue(normalizedBlockId)
  return (
    sectionElement.querySelector<HTMLElement>(`[id="${selectorValue}"]`) ??
    sectionElement.querySelector<HTMLElement>(
      `[data-reader-block-id="${selectorValue}"]`
    ) ??
    null
  )
}

function measureElementRectWithinContainer(
  container: HTMLElement,
  element: HTMLElement,
  mode: ReadingMode
): Rect {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()

  return {
    x: elementRect.left - containerRect.left + container.scrollLeft,
    y:
      mode === "scroll"
        ? elementRect.top - containerRect.top + container.scrollTop
        : elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height
  }
}

function resolveTextNodePosition(
  root: HTMLElement,
  inlineOffset: number
): {
  node: Text
  offset: number
} | null {
  const textNodes = collectTextNodes(root)
  if (textNodes.length === 0) {
    return null
  }

  let remaining = Math.max(0, Math.trunc(inlineOffset))
  for (const textNode of textNodes) {
    const length = textNode.textContent?.length ?? 0
    if (remaining <= length) {
      return {
        node: textNode,
        offset: remaining
      }
    }
    remaining -= length
  }

  const last = textNodes.at(-1)
  return last
    ? {
        node: last,
        offset: last.textContent?.length ?? 0
      }
    : null
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text) {
      nodes.push(current)
    }
    current = walker.nextNode()
  }
  return nodes
}

function findDomTargetContainingPoint(input: {
  container: HTMLElement
  sectionElement: HTMLElement
  point: Point
}): HTMLElement | null {
  const sectionRoot = getDomSectionRoot(input.sectionElement)
  return findSmallestElementContainingPoint({
    container: input.container,
    candidates: collectDomGeometryTargets(sectionRoot),
    point: input.point
  })
}

function findDomBlockTargetContainingPoint(input: {
  container: HTMLElement
  sectionElement: HTMLElement
  point: Point
}): HTMLElement | null {
  const sectionRoot = getDomSectionRoot(input.sectionElement)
  return findSmallestElementContainingPoint({
    container: input.container,
    candidates: collectDomBlockTargets(sectionRoot),
    point: input.point
  })
}

function findSmallestElementContainingPoint(input: {
  container: HTMLElement
  candidates: HTMLElement[]
  point: Point
}): HTMLElement | null {
  const candidates = input.candidates
  if (candidates.length === 0) {
    return null
  }

  const containerRect = input.container.getBoundingClientRect()
  const pointX = input.point.x
  const pointY = input.point.y

  const matching = candidates.filter((candidate) => {
    const rect = candidate.getBoundingClientRect()
    const localRect = {
      left: rect.left - containerRect.left,
      right: rect.right - containerRect.left,
      top: rect.top - containerRect.top,
      bottom: rect.bottom - containerRect.top
    }

    return (
      pointX >= localRect.left &&
      pointX <= localRect.right &&
      pointY >= localRect.top &&
      pointY <= localRect.bottom
    )
  })

  if (matching.length === 0) {
    return null
  }

  matching.sort((left, right) => {
    const leftRect = left.getBoundingClientRect()
    const rightRect = right.getBoundingClientRect()
    const leftArea = leftRect.width * leftRect.height
    const rightArea = rightRect.width * rightRect.height
    return leftArea - rightArea
  })

  return matching[0] ?? null
}

function collectDomGeometryTargets(sectionRoot: HTMLElement): HTMLElement[] {
  const targets = sectionRoot.querySelectorAll<HTMLElement>(
    "[id], [data-reader-block-id], a[name]"
  )
  const elements = Array.from(targets)

  if (sectionRoot.id || sectionRoot.getAttribute("name")) {
    elements.unshift(sectionRoot)
  }

  return elements
}

function collectDomHitTargets(sectionRoot: HTMLElement): HTMLElement[] {
  const targets = sectionRoot.querySelectorAll<HTMLElement>(
    "a[href], img, image, [id], [data-reader-block-id], [name]"
  )
  const elements = Array.from(targets)

  if (sectionRoot.id || sectionRoot.getAttribute("name")) {
    elements.unshift(sectionRoot)
  }

  return elements
}

function collectDomBlockTargets(sectionRoot: HTMLElement): HTMLElement[] {
  const targets = sectionRoot.querySelectorAll<HTMLElement>(
    [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "figure",
      "aside",
      "nav",
      "hr",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "table",
      "tr",
      "th",
      "td",
      "img",
      "image"
    ].join(", ")
  )

  return Array.from(targets)
}

function resolveAnchorIdForElement(
  section: SectionDocument,
  element: HTMLElement
): string | undefined {
  const elementId = element.id.trim()
  if (elementId && section.anchors[elementId]) {
    return elementId
  }

  const namedAnchor = element.getAttribute("name")?.trim()
  if (namedAnchor && section.anchors[namedAnchor]) {
    return namedAnchor
  }

  if (elementId) {
    const resolvedAnchor = Object.entries(section.anchors).find(
      ([, blockId]) => blockId === elementId
    )?.[0]
    if (resolvedAnchor) {
      return resolvedAnchor
    }
  }

  const nearbyAnchor = resolveNearbyAnchorIdForElement(section, element)
  if (nearbyAnchor) {
    return nearbyAnchor
  }

  return undefined
}

function resolveBlockIdForElement(
  section: SectionDocument,
  element: HTMLElement,
  sectionRoot: HTMLElement
): string | undefined {
  const identifiedTarget = element.closest<HTMLElement>(
    "[id], [data-reader-block-id]"
  )
  const blockId =
    identifiedTarget?.dataset.readerBlockId?.trim() ||
    identifiedTarget?.id?.trim()
  if (blockId) {
    return blockId
  }

  const namedAnchor = element.getAttribute("name")?.trim()
  if (namedAnchor) {
    return section.anchors[namedAnchor]
  }

  const nearbyAnchor = resolveNearbyAnchorIdForElement(section, element)
  if (nearbyAnchor) {
    return section.anchors[nearbyAnchor]
  }

  if (sectionRoot.id.trim()) {
    return sectionRoot.id.trim()
  }

  return undefined
}

function resolveNearbyAnchorIdForElement(
  section: SectionDocument,
  element: HTMLElement
): string | undefined {
  const directDescendantAnchor =
    element.querySelector<HTMLElement>("[id], [name]")
  const directDescendantAnchorId = resolveKnownAnchorId(
    section,
    directDescendantAnchor
  )
  if (directDescendantAnchorId) {
    return directDescendantAnchorId
  }

  let sibling: ChildNode | null = element.previousSibling
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()) {
      sibling = sibling.previousSibling
      continue
    }

    if (sibling instanceof HTMLElement) {
      const siblingAnchor = resolveKnownAnchorId(section, sibling)
      if (siblingAnchor) {
        return siblingAnchor
      }

      const descendantAnchor = Array.from(
        sibling.querySelectorAll<HTMLElement>("[id], [name]")
      )
        .reverse()
        .map((candidate) => resolveKnownAnchorId(section, candidate))
        .find((anchorId): anchorId is string => Boolean(anchorId))
      if (descendantAnchor) {
        return descendantAnchor
      }

      if (sibling.textContent?.trim()) {
        return undefined
      }
    } else if (sibling.textContent?.trim()) {
      return undefined
    }

    sibling = sibling.previousSibling
  }

  return undefined
}

function resolveKnownAnchorId(
  section: SectionDocument,
  element: HTMLElement | null
): string | undefined {
  if (!element) {
    return undefined
  }

  const elementId = element.id.trim()
  if (elementId && section.anchors[elementId]) {
    return elementId
  }

  const namedAnchor = element.getAttribute("name")?.trim()
  if (namedAnchor && section.anchors[namedAnchor]) {
    return namedAnchor
  }

  return undefined
}

function getDomSectionRoot(sectionElement: HTMLElement): HTMLElement {
  return (
    sectionElement.querySelector<HTMLElement>(".epub-dom-section") ??
    sectionElement
  )
}

function getDomSectionHeight(sectionElement: HTMLElement): number {
  const sectionRoot = getDomSectionRoot(sectionElement)
  return Math.max(
    sectionRoot.scrollHeight || 0,
    sectionRoot.offsetHeight || 0,
    sectionElement.offsetHeight || 0,
    1
  )
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(value, 1))
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
