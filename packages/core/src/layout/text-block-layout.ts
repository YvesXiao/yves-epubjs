import {
  materializeRichInlineLineRange,
  walkRichInlineLineRanges,
  type PreparedRichInline,
  type RichInlineLine,
  type RichInlineLineRange
} from "@chenglou/pretext/rich-inline"
import type {
  HeadingBlock,
  InlineNode,
  SectionDocument,
  TextAlign,
  TextBlock
} from "../model/types"
import { buildReadingStyleProfile } from "../renderer/reading-style-profile"
import type { IntrinsicImageSize } from "../utils/image-intrinsic-size"
import { resolveImageLayout } from "../utils/image-layout"
import type {
  LayoutInlineFragment,
  LayoutInput,
  LayoutPretextBlock,
  LayoutTextLine
} from "./layout-engine"

type RichInlineSource = LayoutInlineFragment

export type CompiledTextBlock = {
  segments: Array<{
    prepared: PreparedRichInline
    sources: RichInlineSource[]
  }>
  lineHeight: number
  textAlign: TextAlign
}

type FontStyleState = {
  fontFamily?: string
  fontStyle?: "normal" | "italic"
  fontWeight?: string
}

export type TextBlockLayoutDependencies = {
  getCompiledBlock: (
    block: TextBlock | HeadingBlock,
    input: LayoutInput
  ) => CompiledTextBlock | null
  materializeLine: (
    sources: RichInlineSource[],
    line: RichInlineLine,
    defaultLineHeight: number
  ) => LayoutTextLine
  createSourceFragment: (
    text: string,
    options: {
      font: string
      image?: {
        src: string
        alt?: string
        title?: string
        width: number
        height: number
        marginLeft: number
        marginRight: number
      }
    },
    gapBefore: number
  ) => LayoutInlineFragment
  buildFont: (
    fontFamily: string,
    fontSize: number,
    state: FontStyleState
  ) => string
  estimatePretextHeight: (
    lines: LayoutTextLine[],
    marginBottom: number
  ) => number
  getCoverImageInline: (
    block: TextBlock,
    section: SectionDocument
  ) => Extract<InlineNode, { kind: "image" }> | undefined
}

const DEFAULT_ALIGNMENT_THEME = {
  color: "#1f2328",
  background: "#fffdf7"
} as const

export function layoutTextLikeBlock(
  block: TextBlock | HeadingBlock,
  input: LayoutInput,
  width: number,
  dependencies: TextBlockLayoutDependencies
): LayoutPretextBlock | null {
  const compiled = dependencies.getCompiledBlock(block, input)
  if (!compiled) {
    return null
  }
  const styleProfile = buildReadingStyleProfile({
    theme: DEFAULT_ALIGNMENT_THEME,
    typography: input.typography
  })

  const sectionContentWidth = Math.max(
    40,
    width - styleProfile.section.sidePadding * 2
  )
  const paddingTop = block.style?.paddingTop ?? 0
  const paddingBottom = block.style?.paddingBottom ?? 0
  const paddingLeft = block.style?.paddingLeft ?? 0
  const paddingRight = block.style?.paddingRight ?? 0
  const contentWidth = Math.max(
    40,
    sectionContentWidth - paddingLeft - paddingRight
  )

  if (block.kind === "text") {
    const coverImage = dependencies.getCoverImageInline(block, input.section)
    if (coverImage) {
      const imageLayout = resolveImageLayout({
        availableWidth: contentWidth,
        viewportHeight: input.viewportHeight,
        ...resolveImageIntrinsicSize(
          coverImage,
          input.resolveImageIntrinsicSize
        ),
        fillWidth: true
      })
      const font = dependencies.buildFont(
        input.fontFamily,
        block.style?.fontSize ?? input.typography.fontSize,
        {
          ...(block.style?.fontFamily
            ? { fontFamily: block.style.fontFamily }
            : {}),
          ...(block.style?.fontStyle
            ? { fontStyle: block.style.fontStyle }
            : {}),
          ...(block.style?.fontWeight
            ? { fontWeight: block.style.fontWeight }
            : {})
        }
      )
      const marginBottom =
        block.style?.marginBottom ?? styleProfile.text.marginBottom
      const line: LayoutTextLine = {
        width: imageLayout.width,
        height: imageLayout.height,
        fragments: [
          dependencies.createSourceFragment(
            "",
            {
              font,
              image: {
                src: coverImage.src,
                ...(coverImage.alt ? { alt: coverImage.alt } : {}),
                ...(coverImage.title ? { title: coverImage.title } : {}),
                width: imageLayout.width,
                height: imageLayout.height,
                marginLeft: 0,
                marginRight: 0
              }
            },
            0
          )
        ]
      }

      return {
        type: "pretext",
        id: block.id,
        kind: block.kind,
        lineHeight: imageLayout.height,
        textAlign: "center",
        ...(block.style?.color ? { color: block.style.color } : {}),
        ...(block.style?.backgroundColor
          ? { backgroundColor: block.style.backgroundColor }
          : {}),
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        lines: [line],
        estimatedHeight:
          imageLayout.blockHeight + marginBottom + paddingTop + paddingBottom
      }
    }
  }

  const lines: LayoutTextLine[] = []
  for (const segment of compiled.segments) {
    const lineCountBefore = lines.length
    walkRichInlineLineRanges(
      segment.prepared,
      contentWidth,
      (range: RichInlineLineRange) => {
        const materialized = materializeRichInlineLineRange(
          segment.prepared,
          range
        )
        lines.push(
          dependencies.materializeLine(
            segment.sources,
            materialized,
            compiled.lineHeight
          )
        )
      }
    )

    if (lines.length === lineCountBefore) {
      lines.push({
        width: 0,
        height: compiled.lineHeight,
        fragments: []
      })
    }
  }

  if (lines.length === 0) {
    lines.push({
      width: 0,
      height: compiled.lineHeight,
      fragments: []
    })
  }

  if (block.kind === "heading") {
    const marginBottom =
      block.style?.marginBottom ?? styleProfile.heading.marginBottom
    return {
      type: "pretext",
      id: block.id,
      kind: block.kind,
      level: block.level,
      lineHeight: compiled.lineHeight,
      textAlign: compiled.textAlign,
      ...(block.style?.color ? { color: block.style.color } : {}),
      ...(block.style?.backgroundColor
        ? { backgroundColor: block.style.backgroundColor }
        : {}),
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      lines,
      estimatedHeight:
        dependencies.estimatePretextHeight(lines, marginBottom) +
        paddingTop +
        paddingBottom
    }
  }

  const marginBottom =
    block.style?.marginBottom ?? styleProfile.text.marginBottom
  return {
    type: "pretext",
    id: block.id,
    kind: block.kind,
    lineHeight: compiled.lineHeight,
    textAlign: compiled.textAlign,
    ...(block.style?.color ? { color: block.style.color } : {}),
    ...(block.style?.backgroundColor
      ? { backgroundColor: block.style.backgroundColor }
      : {}),
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    lines,
    estimatedHeight:
      dependencies.estimatePretextHeight(lines, marginBottom) +
      paddingTop +
      paddingBottom
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
