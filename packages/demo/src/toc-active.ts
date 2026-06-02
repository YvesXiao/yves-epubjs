import type { TocItem } from "@yves-epub/core"

export function findActiveTocId(
  items: TocItem[],
  href: string,
  previousActiveId: string | null = null
): string | null {
  const normalizedHref = normalizeHrefBase(href)
  if (!normalizedHref) {
    return null
  }

  const flatItems = flattenTocItems(items)
  if (previousActiveId) {
    const previousItem = flatItems.find((item) => item.id === previousActiveId)
    if (previousItem && normalizeHrefBase(previousItem.href) === normalizedHref) {
      return previousItem.id
    }
  }

  const exactMatch = flatItems.find((item) => normalizeHrefBase(item.href) === normalizedHref)
  return exactMatch?.id ?? null
}

function flattenTocItems(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenTocItems(item.children)])
}

function normalizeHrefBase(href: string): string {
  return (href.split("#", 1)[0] ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim()
    .toLowerCase()
}
