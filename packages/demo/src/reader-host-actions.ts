export function openExternalLink(href: string): void {
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(href, "_blank", "noopener,noreferrer")
  }
}

export function readViewportOffset(container: HTMLElement): {
  x: number
  y: number
} {
  return {
    x: container.scrollLeft,
    y: container.scrollTop
  }
}
