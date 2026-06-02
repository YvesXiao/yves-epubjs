import type { AnnotationViewportSnapshot, EpubReader, VisibleDrawBounds } from "@yves-epub/core"

export type ReaderDecorationOverlay = {
  id: string
  label: string
  style: "search-hit" | "annotation"
  rects: VisibleDrawBounds
  visible: boolean
}

export function buildSearchOverlays(reader: EpubReader): ReaderDecorationOverlay[] {
  return reader.getDecorations("search-results").map((decoration) => {
    const rects = reader.mapLocatorToViewport(decoration.locator)
    return {
      id: decoration.id,
      label: decoration.locator.blockId ?? decoration.locator.anchorId ?? "search-hit",
      style: "search-hit",
      rects,
      visible: rects.length > 0
    }
  })
}

export function buildAnnotationOverlays(reader: EpubReader): AnnotationViewportSnapshot[] {
  return reader
    .getAnnotationViewportSnapshots()
    .filter((overlay) => Boolean(overlay.annotation.note?.trim()))
}
