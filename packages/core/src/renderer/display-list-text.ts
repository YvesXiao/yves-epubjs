import type {
  Locator,
  SectionDocument,
  TextAlign,
  Theme
} from "../model/types";
import type { LayoutPretextBlock } from "../layout/layout-engine";
import type {
  DrawOp,
  ImageDrawOp,
  InteractionRegion,
  RectDrawOp,
  TextRunDrawOp
} from "./draw-ops";
import type { ReadingStyleProfile } from "./reading-style-profile";
import { approximateTextWidth } from "../utils/text-wrap";

export type BlockHighlightRange = {
  start: number;
  end: number;
  color: string;
};

export function buildPretextBlockDisplay(input: {
  block: LayoutPretextBlock;
  section: SectionDocument;
  top: number;
  width: number;
  theme: Theme;
  styleProfile: ReadingStyleProfile;
  locator: Locator | undefined;
  resolveImageLoaded: ((src: string) => boolean) | undefined;
  resolveImageUrl: ((src: string) => string) | undefined;
  highlighted: boolean;
  highlightRanges: BlockHighlightRange[];
  underlined: boolean;
  underlineColor?: string;
  active: boolean;
}): {
  ops: DrawOp[];
  interactions: InteractionRegion[];
  height: number;
} {
  const ops: DrawOp[] = [];
  const interactions: InteractionRegion[] = [];
  const sidePadding = input.styleProfile.section.sidePadding;
  const blockRect = {
    x: sidePadding,
    y: input.top,
    width: input.width - sidePadding * 2,
    height: input.block.estimatedHeight
  };
  const contentRect = {
    x: blockRect.x + input.block.paddingLeft,
    y: blockRect.y + input.block.paddingTop,
    width: Math.max(
      40,
      blockRect.width - input.block.paddingLeft - input.block.paddingRight
    ),
    height: Math.max(
      0,
      blockRect.height - input.block.paddingTop - input.block.paddingBottom
    )
  };
  if (input.block.backgroundColor) {
    ops.push({
      kind: "rect",
      sectionId: input.section.id,
      sectionHref: input.section.href,
      blockId: input.block.id,
      locator: input.locator,
      rect: blockRect,
      color: input.block.backgroundColor,
      radius: 10
    } satisfies RectDrawOp);
  }
  if (input.highlighted || input.active) {
    ops.push({
      kind: "rect",
      sectionId: input.section.id,
      sectionHref: input.section.href,
      blockId: input.block.id,
      locator: input.locator,
      rect: {
        x: blockRect.x - 4,
        y: blockRect.y,
        width: blockRect.width + 8,
        height: blockRect.height
      },
      color: input.active
        ? "rgba(245, 158, 11, 0.16)"
        : "rgba(245, 158, 11, 0.08)",
      radius: 10
    } satisfies RectDrawOp);
  }
  interactions.push({
    kind: "block",
    rect: blockRect,
    sectionId: input.section.id,
    blockId: input.block.id,
    locator: input.locator,
    text: collectPretextText(input.block)
  });

  let lineTop = contentRect.y;
  let blockTextOffset = input.block.textOffsetBase ?? 0;
  input.block.lines.forEach((line) => {
    const lineWidth = Math.max(0, line.width);
    const startX = resolveLineStartX(
      input.block.textAlign,
      contentRect.x,
      contentRect.width,
      lineWidth
    );
    let cursorX = startX;
    const lineHeight = line.height;

    for (const fragment of line.fragments) {
      cursorX += fragment.gapBefore;
      const fragmentWidth = fragment.image
        ? fragment.image.marginLeft +
          fragment.image.width +
          fragment.image.marginRight
        : (fragment.width ??
          approximateTextWidth(fragment.text, fragment.font));
      const baselineShift = fragment.baselineShift ?? 0;
      if (fragment.image) {
        const imageRect = {
          x: cursorX + fragment.image.marginLeft,
          y:
            lineTop +
            Math.max(0, (lineHeight - fragment.image.height) * 0.5) +
            baselineShift,
          width: fragment.image.width,
          height: fragment.image.height
        };
        const renderSrc =
          input.resolveImageUrl?.(fragment.image.src) ?? fragment.image.src;
        ops.push({
          kind: "image",
          sectionId: input.section.id,
          sectionHref: input.section.href,
          blockId: input.block.id,
          locator: input.locator,
          rect: imageRect,
          src: renderSrc,
          alt: fragment.image.alt,
          loaded: Boolean(input.resolveImageLoaded?.(fragment.image.src)),
          background: "transparent"
        } satisfies ImageDrawOp);
        interactions.push({
          kind: "image",
          rect: imageRect,
          sectionId: input.section.id,
          blockId: input.block.id,
          src: renderSrc,
          alt: fragment.image.alt,
          locator: input.locator
        });
        if (fragment.href) {
          interactions.push({
            kind: "link",
            rect: imageRect,
            sectionId: input.section.id,
            blockId: input.block.id,
            href: fragment.href,
            locator: input.locator,
            text: fragment.image.alt
          });
        }
        cursorX += fragmentWidth;
        continue;
      }
      const rect = {
        x: cursorX,
        y: lineTop + baselineShift,
        width: fragmentWidth,
        height: lineHeight
      };
      const fragmentTextLength = Array.from(fragment.text).length;
      const highlightSegments = resolveLineHighlightSegments(
        input.highlightRanges,
        blockTextOffset,
        blockTextOffset + fragmentTextLength
      );
      ops.push({
        kind: "text",
        sectionId: input.section.id,
        sectionHref: input.section.href,
        blockId: input.block.id,
        locator: input.locator,
        rect,
        text: fragment.text,
        textStart: blockTextOffset,
        textEnd: blockTextOffset + fragmentTextLength,
        x: cursorX,
        y: lineTop + baselineShift,
        width: fragmentWidth,
        font: fragment.font,
        color: fragment.href
          ? input.styleProfile.link.color
          : (fragment.color ?? input.block.color ?? input.theme.color),
        backgroundColor: fragment.backgroundColor,
        highlightColor: input.highlighted
          ? input.styleProfile.highlight.search
          : input.active
            ? input.styleProfile.highlight.active
            : fragment.mark
              ? input.styleProfile.highlight.mark
              : undefined,
        ...(highlightSegments.length ? { highlightSegments } : {}),
        underline: Boolean(fragment.href) || input.underlined,
        ...(input.underlined && input.underlineColor
          ? { underlineColor: input.underlineColor }
          : {}),
        href: fragment.href
      } satisfies TextRunDrawOp);

      if (fragment.href) {
        interactions.push({
          kind: "link",
          rect,
          sectionId: input.section.id,
          blockId: input.block.id,
          href: fragment.href,
          locator: input.locator,
          text: fragment.text
        });
      }

      cursorX += fragmentWidth;
      blockTextOffset += fragmentTextLength;
    }

    lineTop += lineHeight;
  });

  return {
    ops,
    interactions,
    height: input.block.estimatedHeight
  };
}

function resolveLineStartX(
  textAlign: TextAlign,
  left: number,
  width: number,
  lineWidth: number
): number {
  if (textAlign === "center") {
    return left + Math.max(0, (width - lineWidth) / 2);
  }
  if (textAlign === "end") {
    return left + Math.max(0, width - lineWidth);
  }
  return left;
}

function collectPretextText(block: LayoutPretextBlock): string {
  return block.lines
    .flatMap((line) => line.fragments)
    .map((fragment) => fragment.text)
    .join("");
}

function resolveLineHighlightSegments(
  ranges: BlockHighlightRange[],
  lineStart: number,
  lineEnd: number
): Array<{ start: number; end: number; color: string }> {
  if (lineEnd <= lineStart || ranges.length === 0) {
    return [];
  }

  return ranges
    .map((range) => ({
      start: Math.max(0, range.start - lineStart),
      end: Math.min(lineEnd, range.end) - lineStart,
      color: range.color
    }))
    .filter((range) => range.end > range.start);
}
