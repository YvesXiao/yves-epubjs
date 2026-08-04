import {
  prepareRichInline,
  type PreparedRichInline,
  type RichInlineItem,
  type RichInlineLine
} from "@chenglou/pretext/rich-inline"
import type {
  BlockNode,
  HeadingBlock,
  InlineNode,
  Locator,
  ReadingMode,
  SectionDocument,
  TextAlign,
  TextBlock,
  TypographyOptions
} from "../model/types"
import { normalizeLocator } from "../model/locator-domain"
import { buildReadingStyleProfile } from "../renderer/reading-style-profile"
import type { IntrinsicImageSize } from "../utils/image-intrinsic-size"
import { extractFontSize } from "../utils/text-wrap"
import { estimateNativeBlockHeight } from "./native-block-layout"
import {
  layoutTextLikeBlock as layoutPretextTextBlock,
  type CompiledTextBlock
} from "./text-block-layout"

export type LayoutInlineFragment = {
  text: string
  font: string
  gapBefore: number
  width?: number
  color?: string
  backgroundColor?: string
  image?: {
    src: string
    alt?: string
    title?: string
    width: number
    height: number
    marginLeft: number
    marginRight: number
  }
  href?: string
  title?: string
  code?: boolean
  mark?: boolean
  baselineShift?: number
}

export type LayoutTextLine = {
  width: number
  height: number
  fragments: LayoutInlineFragment[]
}

export type LayoutPretextBlock = {
  type: "pretext"
  id: string
  kind: "text" | "heading"
  level?: 1 | 2 | 3 | 4 | 5 | 6
  textOffsetBase?: number
  lineHeight: number
  textAlign: TextAlign
  color?: string
  backgroundColor?: string
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
  lines: LayoutTextLine[]
  estimatedHeight: number
}

export type LayoutNativeBlock = {
  type: "native"
  id: string
  block: BlockNode
  estimatedHeight: number
}

export type LayoutBlock = LayoutPretextBlock | LayoutNativeBlock

export type LayoutResult = {
  mode: ReadingMode
  width: number
  blocks: LayoutBlock[]
  locatorMap: Map<string, Locator>
}

export type LayoutInput = {
  section: SectionDocument
  spineIndex: number
  viewportWidth: number
  viewportHeight: number
  typography: TypographyOptions
  fontFamily: string
  resolveImageIntrinsicSize?: (
    src: string
  ) => IntrinsicImageSize | null | undefined
}

type InlineStyleState = {
  fontFamily?: string
  fontStyle?: "normal" | "italic"
  fontWeight?: string
  href?: string
  title?: string
  code?: boolean
  fontScale?: number
  mark?: boolean
  verticalAlign?: "sub" | "sup"
  color?: string
  backgroundColor?: string
}

type RichInlineSource = LayoutInlineFragment

type CompiledSegment = {
  prepared: PreparedRichInline
  sources: RichInlineSource[]
}

type CompiledBlock = CompiledTextBlock

const DEFAULT_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", serif'
const DEFAULT_ALIGNMENT_THEME = {
  color: "#1f2328",
  background: "#fffdf7"
} as const

export class LayoutEngine {
  private readonly compiledBlocks = new Map<string, CompiledBlock>()

  clearCache(): void {
    this.compiledBlocks.clear()
  }

  layout(input: LayoutInput, mode: ReadingMode): LayoutResult {
    const width = Math.max(120, Math.floor(input.viewportWidth))
    const blocks: LayoutBlock[] = []
    const locatorMap = new Map<string, Locator>()

    for (const block of input.section.blocks) {
      locatorMap.set(
        block.id,
        normalizeLocator({
          spineIndex: input.spineIndex,
          blockId: block.id,
          progressInSection: 0
        })
      )

      const pretextBlock = this.layoutTextLikeBlock(block, input, width)
      if (pretextBlock) {
        blocks.push(pretextBlock)
        continue
      }

      blocks.push({
        type: "native",
        id: block.id,
        block,
        estimatedHeight: estimateNativeBlockHeight(block, input)
      })
    }

    return {
      mode,
      width,
      blocks,
      locatorMap
    }
  }

  private layoutTextLikeBlock(
    block: BlockNode,
    input: LayoutInput,
    width: number
  ): LayoutPretextBlock | null {
    if (block.kind !== "text" && block.kind !== "heading") {
      return null
    }

    return layoutPretextTextBlock(block, input, width, {
      getCompiledBlock: (candidate, layoutInput) =>
        this.getCompiledBlock(candidate, layoutInput),
      materializeLine: (sources, line, defaultLineHeight) =>
        this.materializeLine(sources, line, defaultLineHeight),
      createSourceFragment: (text, options, gapBefore) =>
        this.createSourceFragment(text, options, gapBefore),
      buildFont: (fontFamily, fontSize, state) =>
        this.buildFont(fontFamily, fontSize, state),
      estimatePretextHeight: (lines, marginBottom) =>
        this.estimatePretextHeight(lines, marginBottom),
      getCoverImageInline: (candidate, section) =>
        this.getCoverImageInline(candidate, section)
    })
  }

  private materializeLine(
    sources: RichInlineSource[],
    line: RichInlineLine,
    defaultLineHeight: number
  ): LayoutTextLine {
    const height = line.fragments.reduce((maxHeight, fragment) => {
      const options = sourceToFragmentOptions(sources[fragment.itemIndex])
      if (options.image) {
        return Math.max(maxHeight, options.image.height)
      }

      return Math.max(maxHeight, extractFontSize(options.font) * 1.45)
    }, defaultLineHeight)

    return {
      width: line.width,
      height,
      fragments: line.fragments.map((fragment) => {
        const options = sourceToFragmentOptions(sources[fragment.itemIndex])
        return this.createSourceFragment(
          options.image ? "" : fragment.text,
          options.image
            ? options
            : {
                ...options,
                width: Math.max(0, fragment.occupiedWidth)
              },
          fragment.gapBefore
        )
      })
    }
  }

  private getCompiledBlock(
    block: TextBlock | HeadingBlock,
    input: LayoutInput
  ): CompiledBlock | null {
    if (this.containsUnsupportedInline(block.inlines)) {
      return null
    }

    const key = this.getBlockCacheKey(block, input)
    const cached = this.compiledBlocks.get(key)
    if (cached) {
      return cached
    }

    const styleProfile = buildReadingStyleProfile({
      theme: DEFAULT_ALIGNMENT_THEME,
      typography: input.typography
    })
    const baseFontSize =
      block.kind === "heading"
        ? (block.style?.fontSize ??
          input.typography.fontSize * styleProfile.heading.scale[block.level])
        : (block.style?.fontSize ?? input.typography.fontSize)
    const lineHeight =
      block.style?.lineHeight ??
      (block.kind === "heading"
        ? Math.max(baseFontSize * 1.25, styleProfile.text.lineHeight)
        : styleProfile.text.lineHeight)

    const segments = this.compileInlineSegments(
      block.inlines,
      {
        fontFamily: input.fontFamily,
        fontSize: baseFontSize
      },
      {
        ...(block.style?.fontFamily
          ? { fontFamily: block.style.fontFamily }
          : {}),
        ...(block.style?.fontStyle ? { fontStyle: block.style.fontStyle } : {}),
        ...(block.style?.fontWeight
          ? { fontWeight: block.style.fontWeight }
          : {}),
        ...(block.style?.color ? { color: block.style.color } : {}),
        ...(block.style?.backgroundColor
          ? { backgroundColor: block.style.backgroundColor }
          : {})
      },
      input.resolveImageIntrinsicSize
    )

    const compiled = {
      segments,
      lineHeight,
      textAlign: block.style?.textAlign ?? "start"
    } satisfies CompiledBlock

    this.compiledBlocks.set(key, compiled)
    return compiled
  }

  private compileInlineSegments(
    inlines: InlineNode[],
    typography: {
      fontFamily: string
      fontSize: number
    },
    state: InlineStyleState,
    resolveResourceIntrinsicSize?: (
      src: string
    ) => IntrinsicImageSize | null | undefined
  ): CompiledSegment[] {
    const segments: CompiledSegment[] = []
    const items: RichInlineItem[] = []
    const sources: RichInlineSource[] = []

    const flushSegment = (): void => {
      if (items.length === 0) {
        segments.push({
          prepared: prepareRichInline([
            {
              text: "",
              font: this.buildFont(
                typography.fontFamily,
                typography.fontSize,
                state
              )
            }
          ]),
          sources: [
            this.createSourceFragment(
              "",
              {
                font: this.buildFont(
                  typography.fontFamily,
                  typography.fontSize,
                  state
                )
              },
              0
            )
          ]
        })
      } else {
        segments.push({
          prepared: prepareRichInline([...items]),
          sources: [...sources]
        })
      }

      items.length = 0
      sources.length = 0
    }

    this.collectRichInlineItems(
      inlines,
      typography,
      state,
      resolveResourceIntrinsicSize,
      items,
      sources,
      flushSegment
    )

    if (segments.length === 0 || items.length > 0 || sources.length > 0) {
      flushSegment()
    }

    return segments
  }

  private collectRichInlineItems(
    inlines: InlineNode[],
    typography: {
      fontFamily: string
      fontSize: number
    },
    state: InlineStyleState,
    resolveResourceIntrinsicSize:
      | ((src: string) => IntrinsicImageSize | null | undefined)
      | undefined,
    items: RichInlineItem[],
    sources: RichInlineSource[],
    breakLine: () => void
  ): void {
    for (const inline of inlines) {
      switch (inline.kind) {
        case "text": {
          if (!inline.text) {
            continue
          }

          const effectiveFontSize = typography.fontSize * (state.fontScale ?? 1)
          const font = this.buildFont(
            typography.fontFamily,
            effectiveFontSize,
            state
          )
          items.push({
            text: inline.text,
            font
          })
          sources.push(
            this.createSourceFragment(
              inline.text,
              {
                font,
                ...(state.href ? { href: state.href } : {}),
                ...(state.title ? { title: state.title } : {}),
                ...(state.code ? { code: true } : {}),
                ...(state.mark ? { mark: true } : {}),
                ...(state.color ? { color: state.color } : {}),
                ...(state.backgroundColor
                  ? { backgroundColor: state.backgroundColor }
                  : {}),
                ...(state.verticalAlign
                  ? {
                      baselineShift:
                        effectiveFontSize *
                        (state.verticalAlign === "sup" ? -0.28 : 0.18)
                    }
                  : {})
              },
              0
            )
          )
          break
        }
        case "emphasis":
        case "span":
        case "del":
        case "ins":
        case "sub":
        case "sup":
        case "small":
        case "mark":
          this.collectRichInlineItems(
            inline.children,
            typography,
            {
              ...state,
              ...(inline.kind === "emphasis"
                ? { fontStyle: "italic" as const }
                : {}),
              ...(inline.kind === "small"
                ? { fontScale: (state.fontScale ?? 1) * 0.85 }
                : {}),
              ...(inline.kind === "sub" || inline.kind === "sup"
                ? { fontScale: (state.fontScale ?? 1) * 0.83 }
                : {}),
              ...(inline.kind === "mark" ? { mark: true } : {}),
              ...(inline.style?.fontFamily
                ? { fontFamily: inline.style.fontFamily }
                : {}),
              ...(inline.style?.fontStyle
                ? { fontStyle: inline.style.fontStyle }
                : {}),
              ...(inline.style?.fontWeight
                ? { fontWeight: inline.style.fontWeight }
                : {}),
              ...(inline.style?.color ? { color: inline.style.color } : {}),
              ...(inline.style?.backgroundColor
                ? { backgroundColor: inline.style.backgroundColor }
                : {}),
              ...(inline.kind === "sub"
                ? { verticalAlign: "sub" as const }
                : inline.kind === "sup"
                  ? { verticalAlign: "sup" as const }
                  : {})
            },
            resolveResourceIntrinsicSize,
            items,
            sources,
            breakLine
          )
          break
        case "strong":
          this.collectRichInlineItems(
            inline.children,
            typography,
            {
              ...state,
              ...(inline.style?.fontFamily
                ? { fontFamily: inline.style.fontFamily }
                : {}),
              fontWeight: inline.style?.fontWeight ?? "700",
              ...(inline.style?.color ? { color: inline.style.color } : {}),
              ...(inline.style?.backgroundColor
                ? { backgroundColor: inline.style.backgroundColor }
                : {})
            },
            resolveResourceIntrinsicSize,
            items,
            sources,
            breakLine
          )
          break
        case "link":
          this.collectRichInlineItems(
            inline.children,
            typography,
            {
              ...state,
              href: inline.href,
              ...(inline.title ? { title: inline.title } : {})
            },
            resolveResourceIntrinsicSize,
            items,
            sources,
            breakLine
          )
          break
        case "code": {
          const font = this.buildFont(
            '"SFMono-Regular", "SF Mono", Consolas, monospace',
            typography.fontSize * (state.fontScale ?? 1) * 0.94,
            {
              ...state,
              code: true
            }
          )
          items.push({
            text: inline.text,
            font,
            break: "never"
          })
          sources.push(
            this.createSourceFragment(
              inline.text,
              {
                font,
                code: true,
                ...(state.mark ? { mark: true } : {}),
                ...(state.color ? { color: state.color } : {}),
                ...(state.backgroundColor
                  ? { backgroundColor: state.backgroundColor }
                  : {}),
                ...(state.verticalAlign
                  ? {
                      baselineShift:
                        typography.fontSize *
                        (state.verticalAlign === "sup" ? -0.28 : 0.18)
                    }
                  : {})
              },
              0
            )
          )
          break
        }
        case "line-break":
          breakLine()
          break
        case "image":
          {
            const effectiveFontSize =
              typography.fontSize * (state.fontScale ?? 1)
            const imageMetrics = resolveInlineImageMetrics(
              inline,
              Math.max(14, effectiveFontSize * 1.05),
              resolveResourceIntrinsicSize
            )
            const font = this.buildFont(
              typography.fontFamily,
              effectiveFontSize,
              state
            )
            items.push({
              text: "\uFFFC",
              font,
              break: "never",
              extraWidth: Math.max(
                0,
                imageMetrics.marginLeft +
                  imageMetrics.width +
                  imageMetrics.marginRight -
                  effectiveFontSize * 0.56
              )
            })
            sources.push(
              this.createSourceFragment(
                "",
                {
                  font,
                  ...(state.href ? { href: state.href } : {}),
                  ...(state.title ? { title: state.title } : {}),
                  image: {
                    src: inline.src,
                    ...(inline.alt ? { alt: inline.alt } : {}),
                    ...(inline.title ? { title: inline.title } : {}),
                    width: imageMetrics.width,
                    height: imageMetrics.height,
                    marginLeft: imageMetrics.marginLeft,
                    marginRight: imageMetrics.marginRight
                  },
                  ...resolveInlineImageBaselineShift(
                    effectiveFontSize,
                    inline.style?.verticalAlign ?? state.verticalAlign
                  )
                },
                0
              )
            )
          }
          break
        default:
          break
      }
    }
  }

  private buildFont(
    fontFamily: string,
    fontSize: number,
    state: InlineStyleState
  ): string {
    const style = state.fontStyle ?? "normal"
    const weight = state.fontWeight ?? "400"
    return `${style} ${weight} ${fontSize}px ${state.fontFamily ?? fontFamily}`
  }

  private getBlockCacheKey(
    block: TextBlock | HeadingBlock,
    input: LayoutInput
  ): string {
    const kindSuffix = block.kind === "heading" ? `:h${block.level}` : ":p"
    return [
      input.section.href,
      input.section.id,
      block.id,
      kindSuffix,
      input.fontFamily,
      input.typography.fontSize,
      input.typography.lineHeight,
      block.style?.fontSize ?? "",
      block.style?.lineHeight ?? "",
      block.style?.fontFamily ?? "",
      block.style?.fontStyle ?? "",
      block.style?.fontWeight ?? "",
      block.style?.textAlign ?? "",
      block.style?.color ?? "",
      block.style?.backgroundColor ?? "",
      block.style?.paddingLeft ?? "",
      block.style?.paddingRight ?? "",
      block.style?.paddingTop ?? "",
      block.style?.paddingBottom ?? "",
      this.buildInlineImageCacheSignature(
        block.inlines,
        input.resolveImageIntrinsicSize
      )
    ].join("|")
  }

  private buildInlineImageCacheSignature(
    inlines: InlineNode[],
    resolveResourceIntrinsicSize?: (
      src: string
    ) => IntrinsicImageSize | null | undefined
  ): string {
    const signatures: string[] = []
    this.collectInlineImageCacheSignatures(
      inlines,
      resolveResourceIntrinsicSize,
      signatures
    )
    return signatures.join(",")
  }

  private collectInlineImageCacheSignatures(
    inlines: InlineNode[],
    resolveResourceIntrinsicSize:
      | ((src: string) => IntrinsicImageSize | null | undefined)
      | undefined,
    signatures: string[]
  ): void {
    for (const inline of inlines) {
      switch (inline.kind) {
        case "image": {
          const resolved = resolveImageIntrinsicSize(
            inline,
            resolveResourceIntrinsicSize
          )
          const width =
            typeof resolved.intrinsicWidth === "number"
              ? resolved.intrinsicWidth
              : "?"
          const height =
            typeof resolved.intrinsicHeight === "number"
              ? resolved.intrinsicHeight
              : "?"
          signatures.push(`${inline.src}:${width}x${height}`)
          break
        }
        case "emphasis":
        case "span":
        case "sub":
        case "sup":
        case "small":
        case "mark":
        case "del":
        case "ins":
        case "strong":
        case "link":
          this.collectInlineImageCacheSignatures(
            inline.children,
            resolveResourceIntrinsicSize,
            signatures
          )
          break
        default:
          break
      }
    }
  }

  private containsUnsupportedInline(inlines: InlineNode[]): boolean {
    for (const inline of inlines) {
      switch (inline.kind) {
        case "image":
          break
        case "line-break":
          break
        case "emphasis":
        case "span":
        case "sub":
        case "sup":
        case "small":
        case "mark":
        case "del":
        case "ins":
        case "strong":
        case "link":
          if (this.containsUnsupportedInline(inline.children)) {
            return true
          }
          break
        default:
          break
      }
    }

    return false
  }

  private estimatePretextHeight(
    lines: LayoutTextLine[],
    marginBottom: number
  ): number {
    const contentHeight = lines.reduce((total, line) => total + line.height, 0)
    const minimumHeight = lines.reduce(
      (maxHeight, line) => Math.max(maxHeight, line.height),
      0
    )

    return Math.max(minimumHeight, contentHeight + marginBottom)
  }

  private createSourceFragment(
    text: string,
    options: {
      font: string
      width?: number
      color?: string
      backgroundColor?: string
      href?: string
      title?: string
      image?: {
        src: string
        alt?: string
        title?: string
        width: number
        height: number
        marginLeft: number
        marginRight: number
      }
      code?: boolean
      mark?: boolean
      baselineShift?: number
    },
    gapBefore: number
  ): LayoutInlineFragment {
    return {
      text,
      font: options.font,
      gapBefore,
      ...(typeof options.width === "number" ? { width: options.width } : {}),
      ...(options.color ? { color: options.color } : {}),
      ...(options.backgroundColor
        ? { backgroundColor: options.backgroundColor }
        : {}),
      ...(options.image ? { image: options.image } : {}),
      ...(options.href ? { href: options.href } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.code ? { code: true } : {}),
      ...(options.mark ? { mark: true } : {}),
      ...(typeof options.baselineShift === "number"
        ? { baselineShift: options.baselineShift }
        : {})
    }
  }

  private getCoverImageInline(
    block: TextBlock,
    section: SectionDocument
  ): Extract<InlineNode, { kind: "image" }> | undefined {
    if (section.presentationRole !== "cover" || section.blocks.length !== 1) {
      return undefined
    }

    if (block.inlines.length !== 1) {
      return undefined
    }

    const [inline] = block.inlines
    return inline?.kind === "image" ? inline : undefined
  }
}

function sourceToFragmentOptions(source: RichInlineSource | undefined): {
  font: string
  width?: number
  color?: string
  backgroundColor?: string
  href?: string
  title?: string
  image?: {
    src: string
    alt?: string
    title?: string
    width: number
    height: number
    marginLeft: number
    marginRight: number
  }
  code?: boolean
  mark?: boolean
  baselineShift?: number
} {
  if (!source) {
    return {
      font: `400 16px ${DEFAULT_FONT_FAMILY}`
    }
  }

  return {
    font: source.font,
    ...(typeof source.width === "number" ? { width: source.width } : {}),
    ...(source.color ? { color: source.color } : {}),
    ...(source.backgroundColor
      ? { backgroundColor: source.backgroundColor }
      : {}),
    ...(source.image ? { image: source.image } : {}),
    ...(source.href ? { href: source.href } : {}),
    ...(source.title ? { title: source.title } : {}),
    ...(source.code ? { code: true } : {}),
    ...(source.mark ? { mark: true } : {}),
    ...(typeof source.baselineShift === "number"
      ? { baselineShift: source.baselineShift }
      : {})
  }
}

function resolveInlineImageMetrics(
  inline: Extract<InlineNode, { kind: "image" }>,
  fallbackHeight: number,
  resolveResourceIntrinsicSize?: (
    src: string
  ) => IntrinsicImageSize | null | undefined
): {
  width: number
  height: number
  marginLeft: number
  marginRight: number
} {
  const resolvedSize =
    inline.src && resolveResourceIntrinsicSize
      ? resolveResourceIntrinsicSize(inline.src)
      : undefined
  const intrinsicWidth = inline.width ?? resolvedSize?.width
  const intrinsicHeight = inline.height ?? resolvedSize?.height
  const styledWidth = inline.style?.width
  const styledHeight = inline.style?.height
  const width = resolveInlineImageDimension({
    styledPrimary: styledWidth,
    styledSecondary: styledHeight,
    intrinsicPrimary: intrinsicWidth,
    intrinsicSecondary: intrinsicHeight,
    fallback: fallbackHeight
  })
  const height = resolveInlineImageDimension({
    styledPrimary: styledHeight,
    styledSecondary: styledWidth,
    intrinsicPrimary: intrinsicHeight,
    intrinsicSecondary: intrinsicWidth,
    fallback: fallbackHeight
  })

  return {
    width,
    height,
    marginLeft: Math.max(0, inline.style?.marginLeft ?? 0),
    marginRight: Math.max(0, inline.style?.marginRight ?? 0)
  }
}

function resolveInlineImageBaselineShift(
  fontSize: number,
  verticalAlign: "baseline" | "middle" | "sub" | "sup" | undefined
): { baselineShift?: number } {
  if (verticalAlign === "sup") {
    return { baselineShift: fontSize * -0.28 }
  }
  if (verticalAlign === "sub") {
    return { baselineShift: fontSize * 0.18 }
  }
  return {}
}

function resolveInlineImageDimension(input: {
  styledPrimary: number | undefined
  styledSecondary: number | undefined
  intrinsicPrimary: number | undefined
  intrinsicSecondary: number | undefined
  fallback: number
}): number {
  if (typeof input.styledPrimary === "number" && input.styledPrimary > 0) {
    return input.styledPrimary
  }

  if (
    typeof input.styledSecondary === "number" &&
    input.styledSecondary > 0 &&
    typeof input.intrinsicPrimary === "number" &&
    input.intrinsicPrimary > 0 &&
    typeof input.intrinsicSecondary === "number" &&
    input.intrinsicSecondary > 0
  ) {
    return (
      (input.styledSecondary * input.intrinsicPrimary) /
      input.intrinsicSecondary
    )
  }

  if (
    typeof input.intrinsicPrimary === "number" &&
    input.intrinsicPrimary > 0
  ) {
    return input.intrinsicPrimary
  }

  return input.fallback
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
