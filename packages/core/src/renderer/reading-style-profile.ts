import type {
  ReaderBaselineStyleProfile,
  TextAlign,
  Theme,
  TypographyOptions
} from "../model/types"

export const DEFAULT_READER_BASELINE_STYLE_PROFILE: ReaderBaselineStyleProfile =
  "default-reflowable"

export type ReadingStyleProfile = {
  name: ReaderBaselineStyleProfile
  section: {
    sidePadding: number
    bottomPadding: number
  }
  text: {
    lineHeight: number
    marginBottom: number
    textAlign: TextAlign
    color: string
    letterSpacing: number
    wordSpacing: number
  }
  heading: {
    lineHeight: number
    marginBottom: number
    scale: Record<1 | 2 | 3 | 4 | 5 | 6, number>
    color: string
  }
  link: {
    color: string
  }
  caption: {
    color: string
    fontSize: number
    lineHeight: number
    marginTop: number
    insetX: number
  }
  code: {
    fontFamily: string
    fontSize: number
    lineHeight: number
    blockPaddingX: number
    blockPaddingY: number
    blockRadius: number
    blockBackground: string
    color: string
    inlinePaddingX: number
    inlinePaddingY: number
    inlineRadius: number
    inlineBackground: string
    inlineColor: string
  }
  quote: {
    accentWidth: number
    accentGap: number
    accentColor: string
    contentInsetY: number
  }
  aside: {
    accentWidth: number
    accentGap: number
    accentColor: string
    background: string
    contentInsetY: number
  }
  list: {
    indent: number
    markerGap: number
    itemGap: number
  }
  table: {
    borderColor: string
    borderWidth: number
    cellPadding: number
  }
  media: {
    blockSpacing: number
  }
  thematicBreak: {
    blockHeight: number
    lineWidth: number
    color: string
  }
  highlight: {
    search: string
    active: string
    mark: string
  }
}

export function buildReadingStyleProfile(input: {
  theme: Theme
  typography: TypographyOptions
}): ReadingStyleProfile {
  const darkTheme = isDarkColor(input.theme.background)
  const paragraphSpacing = input.typography.paragraphSpacing
  const headingMarginBottom = Math.max(12, Math.round(paragraphSpacing * 0.9))
  const textLineHeight = input.typography.fontSize * input.typography.lineHeight
  const codeFontSize = Math.max(13, input.typography.fontSize - 1)
  const captionFontSize = Math.max(14, input.typography.fontSize - 1)
  const captionLineHeight = Math.max(captionFontSize * 1.45, 18)

  return {
    name: DEFAULT_READER_BASELINE_STYLE_PROFILE,
    section: {
      sidePadding: 8,
      bottomPadding: 24
    },
    text: {
      lineHeight: textLineHeight,
      marginBottom: paragraphSpacing,
      textAlign: "start",
      color: input.theme.color,
      letterSpacing: input.typography.letterSpacing ?? 0,
      wordSpacing: input.typography.wordSpacing ?? 0
    },
    heading: {
      lineHeight: Math.max(input.typography.fontSize * 1.25, textLineHeight),
      marginBottom: headingMarginBottom,
      scale: {
        1: 2,
        2: 1.7,
        3: 1.45,
        4: 1.25,
        5: 1.1,
        6: 1
      },
      color: input.theme.color
    },
    link: {
      color: "#1b4b72"
    },
    caption: {
      color: darkTheme ? "#cbd5e1" : "#475569",
      fontSize: captionFontSize,
      lineHeight: captionLineHeight,
      marginTop: Math.max(8, Math.round(paragraphSpacing * 0.66)),
      insetX: 12
    },
    code: {
      fontFamily: '"SFMono-Regular", "SF Mono", Consolas, monospace',
      fontSize: codeFontSize,
      lineHeight: Math.max(codeFontSize * 1.45, 18),
      blockPaddingX: 12,
      blockPaddingY: 12,
      blockRadius: 12,
      blockBackground: darkTheme ? "#0b1220" : "#f4f4f5",
      color: darkTheme ? "#e6edf7" : input.theme.color,
      inlinePaddingX: 5,
      inlinePaddingY: 1,
      inlineRadius: 4,
      inlineBackground: darkTheme
        ? "rgba(148, 163, 184, 0.16)"
        : "rgba(15, 23, 42, 0.06)",
      inlineColor: darkTheme ? "#f8fafc" : "#0f172a"
    },
    quote: {
      accentWidth: 4,
      accentGap: 16,
      accentColor: "rgba(37, 99, 235, 0.2)",
      contentInsetY: 0
    },
    aside: {
      accentWidth: 4,
      accentGap: 16,
      accentColor: "rgba(59, 123, 163, 0.42)",
      background: "rgba(59, 123, 163, 0.08)",
      contentInsetY: 8
    },
    list: {
      indent: 18,
      markerGap: 18,
      itemGap: 6
    },
    table: {
      borderColor: "rgba(148, 163, 184, 0.35)",
      borderWidth: 1,
      cellPadding: 10
    },
    media: {
      blockSpacing: 10
    },
    thematicBreak: {
      blockHeight: 28,
      lineWidth: 1.5,
      color: "rgba(148, 163, 184, 0.8)"
    },
    highlight: {
      search: "rgba(250, 204, 21, 0.28)",
      active: "rgba(245, 158, 11, 0.18)",
      mark: "rgba(250, 204, 21, 0.22)"
    }
  }
}

export function buildReadingStyleCssVariables(
  profile: ReadingStyleProfile
): Record<string, string> {
  return {
    "--reader-side-padding": `${profile.section.sidePadding}px`,
    "--reader-bottom-padding": `${profile.section.bottomPadding}px`,
    "--reader-paragraph-spacing": `${profile.text.marginBottom}px`,
    "--reader-letter-spacing": `${profile.text.letterSpacing}px`,
    "--reader-word-spacing": `${profile.text.wordSpacing}px`,
    "--reader-heading-spacing": `${profile.heading.marginBottom}px`,
    "--reader-link-color": profile.link.color,
    "--reader-caption-color": profile.caption.color,
    "--reader-caption-font-size": `${profile.caption.fontSize}px`,
    "--reader-caption-line-height": `${profile.caption.lineHeight}px`,
    "--reader-caption-margin-top": `${profile.caption.marginTop}px`,
    "--reader-code-bg": profile.code.blockBackground,
    "--reader-code-color": profile.code.color,
    "--reader-inline-code-bg": profile.code.inlineBackground,
    "--reader-inline-code-color": profile.code.inlineColor,
    "--reader-mark-bg": profile.highlight.mark,
    "--reader-quote-accent-width": `${profile.quote.accentWidth}px`,
    "--reader-quote-accent-gap": `${profile.quote.accentGap}px`,
    "--reader-quote-accent-color": profile.quote.accentColor,
    "--reader-aside-bg": profile.aside.background,
    "--reader-table-border-color": profile.table.borderColor,
    "--reader-table-cell-padding": `${profile.table.cellPadding}px`,
    "--reader-media-block-spacing": `${profile.media.blockSpacing}px`,
    "--reader-rule-color": profile.thematicBreak.color,
    "--reader-rule-width": `${profile.thematicBreak.lineWidth}px`
  }
}

function isDarkColor(color: string): boolean {
  const normalized = color.trim().toLowerCase()
  if (!normalized.startsWith("#")) {
    return false
  }

  const hex = normalized.slice(1)
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex.length === 6
        ? hex
        : null
  if (!expanded) {
    return false
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance < 128
}
