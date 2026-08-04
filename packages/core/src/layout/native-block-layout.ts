import type {
  BlockNode,
  FigureBlock,
  ListBlock,
  TableBlock,
  TypographyOptions
} from "../model/types"
import { buildReadingStyleProfile } from "../renderer/reading-style-profile"
import { extractBlockText } from "../utils/block-text"
import type { IntrinsicImageSize } from "../utils/image-intrinsic-size"
import { resolveImageLayout } from "../utils/image-layout"
import { countWrappedPreformattedLines } from "../utils/preformatted-text"
import { estimateWrappedTextHeight } from "../utils/text-wrap"
import type { LayoutInput } from "./layout-engine"

const DEFAULT_ALIGNMENT_THEME = {
  color: "#1f2328",
  background: "#fffdf7"
} as const

export function estimateNativeBlockHeight(
  block: BlockNode,
  input: LayoutInput
): number {
  const typography = input.typography
  const styleProfile = buildReadingStyleProfile({
    theme: DEFAULT_ALIGNMENT_THEME,
    typography
  })
  const baseLineHeight = styleProfile.text.lineHeight
  const contentWidth = Math.max(
    40,
    Math.floor(input.viewportWidth) - styleProfile.section.sidePadding * 2
  )

  switch (block.kind) {
    case "image": {
      return resolveImageLayout({
        availableWidth: Math.max(1, contentWidth),
        viewportHeight: input.viewportHeight,
        ...resolveImageIntrinsicSize(block, input.resolveImageIntrinsicSize),
        fillWidth: isCoverImageBlock(
          input.section.blocks.length,
          input.section.presentationRole,
          block
        )
      }).blockHeight
    }
    case "code": {
      const codeFont = `400 ${styleProfile.code.fontSize}px ${styleProfile.code.fontFamily}`
      const codeWidth = Math.max(
        40,
        contentWidth -
          styleProfile.code.blockPaddingX * 2 -
          (block.style?.paddingLeft ?? 0) -
          (block.style?.paddingRight ?? 0)
      )
      const lineCount = Math.max(
        1,
        countWrappedPreformattedLines(block.text, codeWidth, codeFont)
      )
      return (
        lineCount * styleProfile.code.lineHeight +
        styleProfile.code.blockPaddingY * 2 +
        (block.style?.paddingTop ?? 0) +
        (block.style?.paddingBottom ?? 0)
      )
    }
    case "quote":
      return Math.max(
        baseLineHeight * 2,
        estimateWrappedTextHeight(
          extractBlockText(block),
          Math.max(
            40,
            contentWidth -
              styleProfile.quote.accentGap -
              styleProfile.quote.accentWidth
          ),
          `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`,
          baseLineHeight
        ) + styleProfile.text.marginBottom
      )
    case "list":
      return Math.max(
        baseLineHeight * 2,
        estimateListBlockHeight(
          block,
          input.viewportWidth,
          typography,
          styleProfile
        )
      )
    case "table":
      return Math.max(
        baseLineHeight * 3,
        estimateTableBlockHeight(
          block,
          input.viewportWidth,
          typography,
          styleProfile
        )
      )
    case "figure":
      return Math.max(
        baseLineHeight * 3,
        estimateFigureBlockHeight(
          block,
          input.viewportWidth,
          input.viewportHeight,
          typography,
          styleProfile,
          input.resolveImageIntrinsicSize
        )
      )
    case "aside":
    case "nav":
      return Math.max(
        baseLineHeight * 2,
        estimateWrappedTextHeight(
          extractBlockText(block),
          Math.max(
            40,
            contentWidth -
              styleProfile.aside.accentGap -
              styleProfile.aside.accentWidth
          ),
          `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`,
          baseLineHeight
        ) + styleProfile.text.marginBottom
      )
    case "definition-list":
      return Math.max(
        baseLineHeight * 2,
        estimateWrappedTextHeight(
          extractBlockText(block),
          contentWidth,
          `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`,
          baseLineHeight
        ) + styleProfile.text.marginBottom
      )
    case "thematic-break":
      return styleProfile.thematicBreak.blockHeight
    case "heading":
    case "text":
    default:
      return baseLineHeight * 1.5
  }
}

function resolveImageIntrinsicSize(
  image: {
    width?: number
    height?: number
    style?: {
      width?: number
      height?: number
    }
    src?: string
  },
  resolveResourceIntrinsicSize?: (
    src: string
  ) => IntrinsicImageSize | null | undefined
): {
  intrinsicWidth?: number
  intrinsicHeight?: number
} {
  const resolvedSize =
    image.src && resolveResourceIntrinsicSize
      ? resolveResourceIntrinsicSize(image.src)
      : undefined
  const width = image.style?.width ?? image.width ?? resolvedSize?.width
  const height = image.style?.height ?? image.height ?? resolvedSize?.height

  return {
    ...(typeof width === "number" && width > 0
      ? { intrinsicWidth: width }
      : {}),
    ...(typeof height === "number" && height > 0
      ? { intrinsicHeight: height }
      : {})
  }
}

function estimateListBlockHeight(
  block: ListBlock,
  viewportWidth: number,
  typography: TypographyOptions,
  styleProfile: ReturnType<typeof buildReadingStyleProfile>
): number {
  const font = `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const lineHeight = Math.max(typography.fontSize * 1.45, 18)
  const contentWidth = Math.max(
    40,
    Math.floor(viewportWidth) - styleProfile.section.sidePadding * 2
  )
  const estimateRecursive = (list: ListBlock, depth: number): number => {
    let total = 0
    for (const item of list.items) {
      const textBlocks = item.blocks.filter((child) => child.kind !== "list")
      const itemText = textBlocks
        .map(extractBlockText)
        .filter(Boolean)
        .join(" ")
      const textWidth = Math.max(
        40,
        contentWidth -
          depth * styleProfile.list.indent -
          styleProfile.list.markerGap
      )
      total +=
        estimateWrappedTextHeight(
          itemText || " ",
          textWidth,
          font,
          lineHeight
        ) + styleProfile.list.itemGap
      for (const child of item.blocks) {
        if (child.kind === "list") {
          total += estimateRecursive(child, depth + 1)
        }
      }
    }
    return total
  }

  return estimateRecursive(block, 0) + styleProfile.text.marginBottom
}

function estimateTableBlockHeight(
  block: TableBlock,
  viewportWidth: number,
  typography: TypographyOptions,
  styleProfile: ReturnType<typeof buildReadingStyleProfile>
): number {
  const contentWidth = Math.max(
    40,
    Math.floor(viewportWidth) - styleProfile.section.sidePadding * 2
  )
  const captionFont = `italic 400 ${styleProfile.caption.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const cellFont = `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const headerFont = `700 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const lineHeight = Math.max(typography.fontSize * 1.45, 18)
  const padding = styleProfile.table.cellPadding
  let total = styleProfile.text.marginBottom

  if (block.caption?.length) {
    total +=
      styleProfile.caption.marginTop +
      estimateWrappedTextHeight(
        block.caption.map(extractBlockText).filter(Boolean).join(" "),
        contentWidth,
        captionFont,
        styleProfile.caption.lineHeight
      ) +
      styleProfile.text.marginBottom
  }

  const columnCount = Math.max(
    1,
    ...block.rows.map((row) =>
      row.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)
    )
  )
  const columnWidth = contentWidth / columnCount
  for (const row of block.rows) {
    let rowHeight = lineHeight + padding * 2
    for (const cell of row.cells) {
      const font = cell.header ? headerFont : cellFont
      const cellWidth = Math.max(
        32,
        columnWidth * Math.max(1, cell.colSpan ?? 1) - padding * 2
      )
      const text = cell.blocks.map(extractBlockText).filter(Boolean).join(" ")
      rowHeight = Math.max(
        rowHeight,
        estimateWrappedTextHeight(text || " ", cellWidth, font, lineHeight) +
          padding * 2
      )
    }
    total += rowHeight
  }

  return total + styleProfile.text.marginBottom
}

function estimateFigureBlockHeight(
  block: FigureBlock,
  viewportWidth: number,
  viewportHeight: number,
  typography: TypographyOptions,
  styleProfile: ReturnType<typeof buildReadingStyleProfile>,
  resolveResourceIntrinsicSize?: (
    src: string
  ) => IntrinsicImageSize | null | undefined
): number {
  const contentWidth = Math.max(
    40,
    Math.floor(viewportWidth) - styleProfile.section.sidePadding * 2
  )
  const bodyFont = `400 ${typography.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const captionFont = `italic 400 ${styleProfile.caption.fontSize}px "Iowan Old Style", "Palatino Linotype", serif`
  const lineHeight = Math.max(typography.fontSize * 1.45, 18)
  let total = styleProfile.text.marginBottom

  for (const child of block.blocks) {
    if (child.kind === "image") {
      total +=
        resolveImageLayout({
          availableWidth: contentWidth,
          viewportHeight,
          ...resolveImageIntrinsicSize(child, resolveResourceIntrinsicSize)
        }).height + styleProfile.media.blockSpacing
      continue
    }

    const text = extractBlockText(child)
    if (text) {
      total +=
        estimateWrappedTextHeight(text, contentWidth, bodyFont, lineHeight) +
        Math.max(8, Math.round(styleProfile.media.blockSpacing * 0.8))
    }
  }

  if (block.caption?.length) {
    total +=
      styleProfile.caption.marginTop +
      estimateWrappedTextHeight(
        block.caption.map(extractBlockText).filter(Boolean).join(" "),
        Math.max(40, contentWidth - 24),
        captionFont,
        styleProfile.caption.lineHeight
      )
  }

  return total + styleProfile.media.blockSpacing
}

function isCoverImageBlock(
  sectionBlockCount: number,
  presentationRole: string | undefined,
  block: BlockNode
): block is Extract<BlockNode, { kind: "image" }> {
  return (
    presentationRole === "cover" &&
    sectionBlockCount === 1 &&
    block.kind === "image"
  )
}
