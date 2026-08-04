import type {
  Book,
  PageSpreadPlacement,
  ReaderSpreadMode,
  ReadingDirection,
  ReadingMode,
  ReadingSpreadContext,
  RenditionSpread,
  SectionDocument
} from "../model/types"

export const SYNTHETIC_SPREAD_GAP_PX = 24

export function resolveReadingSpreadContext(input: {
  book: Book
  section: SectionDocument
  spineIndex: number
  mode: ReadingMode
  spreadMode: ReaderSpreadMode
  pageProgression: ReadingDirection
  containerWidth: number
  containerHeight: number
}): ReadingSpreadContext {
  const renditionLayout = input.section.renditionLayout ?? "reflowable"
  const renditionSpread =
    input.section.renditionSpread ??
    input.book.metadata.renditionSpread ??
    "auto"
  const pageSpreadPlacement =
    input.section.pageSpreadPlacement ??
    inferSyntheticPagePlacement({
      spineIndex: input.spineIndex,
      pageProgression: input.pageProgression
    })
  const syntheticSpreadAllowed =
    input.mode === "paginated" &&
    renditionLayout === "pre-paginated" &&
    input.spreadMode !== "none" &&
    renditionSpread !== "none"
  const syntheticSpreadActive =
    syntheticSpreadAllowed &&
    shouldActivateSyntheticSpread({
      spreadMode: input.spreadMode,
      renditionSpread,
      containerWidth: input.containerWidth,
      containerHeight: input.containerHeight
    })

  return {
    spineIndex: input.spineIndex,
    sectionId: input.section.id,
    sectionHref: input.section.href,
    spreadMode: input.spreadMode,
    renditionLayout,
    renditionSpread,
    pageSpreadPlacement,
    syntheticSpreadAllowed,
    syntheticSpreadActive,
    viewportSlotCount: syntheticSpreadActive ? 2 : 1
  }
}

export function resolveSyntheticSpreadViewportPartition(input: {
  spreadContext: ReadingSpreadContext
  containerWidth: number
  containerHeight: number
}): { width: number; height: number; gap: number } | null {
  if (!input.spreadContext.syntheticSpreadActive) {
    return null
  }

  const availableHeight = Math.max(120, Math.floor(input.containerHeight))
  if (input.spreadContext.pageSpreadPlacement === "center") {
    return {
      width: Math.max(120, Math.floor(input.containerWidth)),
      height: availableHeight,
      gap: SYNTHETIC_SPREAD_GAP_PX
    }
  }

  return {
    width: Math.max(
      120,
      Math.floor(
        (Math.max(120, input.containerWidth) - SYNTHETIC_SPREAD_GAP_PX) / 2
      )
    ),
    height: availableHeight,
    gap: SYNTHETIC_SPREAD_GAP_PX
  }
}

export function inferSyntheticPagePlacement(input: {
  spineIndex: number
  pageProgression: ReadingDirection
}): PageSpreadPlacement {
  const isRightPage = input.spineIndex % 2 === 0
  if (input.pageProgression === "rtl") {
    return isRightPage ? "left" : "right"
  }

  return isRightPage ? "right" : "left"
}

function shouldActivateSyntheticSpread(input: {
  spreadMode: ReaderSpreadMode
  renditionSpread: RenditionSpread
  containerWidth: number
  containerHeight: number
}): boolean {
  if (input.containerWidth <= 0 || input.containerHeight <= 0) {
    return false
  }

  if (input.spreadMode === "always") {
    return true
  }

  switch (input.renditionSpread) {
    case "both":
      return true
    case "landscape":
      return input.containerWidth >= input.containerHeight
    case "portrait":
      return input.containerHeight >= input.containerWidth
    case "none":
      return false
    case "auto":
    default:
      return input.containerWidth > input.containerHeight
  }
}
