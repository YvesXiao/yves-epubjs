import type { Locator } from "../model/types"

export const SUPPORTED_DOM_INTERACTIONS = [
  "link",
  "anchored-fragment",
  "chapter-progress"
] as const

export type SupportedDomInteraction =
  (typeof SUPPORTED_DOM_INTERACTIONS)[number]

export type DomClickInteraction =
  | {
      kind: "link"
      interaction: "link"
      href: string
    }
  | {
      kind: "locator"
      interaction: "anchored-fragment" | "chapter-progress"
      locator: Locator
    }

export function resolveDomClickInteraction(input: {
  target: HTMLElement
  resolveLocator: () => Locator | null
}): DomClickInteraction | null {
  const link = input.target.closest("a[href]")
  if (link instanceof HTMLAnchorElement) {
    const href = link.getAttribute("href")?.trim()
    if (!href) {
      return null
    }

    return {
      kind: "link",
      interaction: "link",
      href
    }
  }

  const locator = input.resolveLocator()
  if (!locator) {
    return null
  }

  return {
    kind: "locator",
    interaction:
      locator.anchorId || locator.blockId
        ? "anchored-fragment"
        : "chapter-progress",
    locator
  }
}
