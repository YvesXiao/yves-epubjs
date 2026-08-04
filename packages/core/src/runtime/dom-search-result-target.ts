import type { SearchResult } from "../model/types"
import { normalizeSearchText } from "./search-results"

export function findRenderedSearchResultTarget(input: {
  sectionElement: HTMLElement
  result: SearchResult
}): HTMLElement | null {
  const sectionRoot = input.sectionElement.matches(".epub-dom-section")
    ? input.sectionElement
    : input.sectionElement.querySelector<HTMLElement>(".epub-dom-section")
  if (!sectionRoot) {
    return null
  }

  const matchText = normalizeSearchText(input.result.matchText ?? "")
  const excerptText = normalizeSearchText(
    stripSearchEllipsis(input.result.excerpt)
  )
  const targetProgress = clampProgress(
    input.result.locator.progressInSection ?? 0
  )
  const sectionRect = sectionRoot.getBoundingClientRect()
  const sectionHeight = Math.max(
    sectionRoot.scrollHeight || 0,
    sectionRoot.offsetHeight || 0,
    sectionRect.height || 0,
    1
  )

  const primaryMatches = collectMatchingElements(sectionRoot, matchText)
  const fallbackMatches =
    primaryMatches.length > 0
      ? primaryMatches
      : collectMatchingElements(sectionRoot, excerptText)
  if (fallbackMatches.length === 0) {
    return null
  }

  return (
    fallbackMatches.sort((left, right) =>
      compareSearchTargetCandidates({
        left,
        right,
        sectionRectTop: sectionRect.top,
        sectionHeight,
        targetProgress
      })
    )[0] ?? null
  )
}

function collectMatchingElements(
  sectionRoot: HTMLElement,
  needle: string
): HTMLElement[] {
  if (!needle) {
    return []
  }

  return Array.from(sectionRoot.querySelectorAll<HTMLElement>("*")).filter(
    (element) => {
      if (element.tagName === "STYLE" || element.tagName === "SCRIPT") {
        return false
      }

      return normalizeSearchText(element.textContent ?? "").includes(needle)
    }
  )
}

function compareSearchTargetCandidates(input: {
  left: HTMLElement
  right: HTMLElement
  sectionRectTop: number
  sectionHeight: number
  targetProgress: number
}): number {
  const leftProgressDistance = Math.abs(
    estimateElementProgress(
      input.left,
      input.sectionRectTop,
      input.sectionHeight
    ) - input.targetProgress
  )
  const rightProgressDistance = Math.abs(
    estimateElementProgress(
      input.right,
      input.sectionRectTop,
      input.sectionHeight
    ) - input.targetProgress
  )
  if (leftProgressDistance !== rightProgressDistance) {
    return leftProgressDistance - rightProgressDistance
  }

  const leftTextLength = normalizeSearchText(
    input.left.textContent ?? ""
  ).length
  const rightTextLength = normalizeSearchText(
    input.right.textContent ?? ""
  ).length
  if (leftTextLength !== rightTextLength) {
    return leftTextLength - rightTextLength
  }

  return getElementDepth(input.right) - getElementDepth(input.left)
}

function estimateElementProgress(
  element: HTMLElement,
  sectionRectTop: number,
  sectionHeight: number
): number {
  const rect = element.getBoundingClientRect()
  return clampProgress((rect.top - sectionRectTop) / Math.max(1, sectionHeight))
}

function getElementDepth(element: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = element
  while (current) {
    depth += 1
    current = current.parentElement
  }

  return depth
}

function stripSearchEllipsis(value: string): string {
  return value.replace(/^\.{3}/, "").replace(/\.{3}$/, "")
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(value, 1))
}
