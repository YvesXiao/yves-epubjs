import type {
  BlockNode,
  PublisherColorOverride,
  Rect,
  SectionDocument,
  TextAlign,
  Theme
} from "../model/types"
import type { ReadingStyleProfile } from "./reading-style-profile"

export type NativeBlockRenderStyle = {
  color: string
  backgroundColor?: string
  textAlign: TextAlign
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
}

export function resolveNativeBlockRenderStyle(input: {
  block: BlockNode
  theme: Theme
  styleProfile: ReadingStyleProfile
  publisherColorOverride?: PublisherColorOverride
}): NativeBlockRenderStyle {
  return {
    color:
      input.publisherColorOverride === "foreground"
        ? input.theme.color
        : (input.block.style?.color ?? input.theme.color),
    ...(input.block.style?.backgroundColor
      ? { backgroundColor: input.block.style.backgroundColor }
      : input.block.kind === "aside" || input.block.kind === "nav"
        ? { backgroundColor: input.styleProfile.aside.background }
        : {}),
    textAlign: input.block.style?.textAlign ?? "start",
    paddingTop: input.block.style?.paddingTop ?? 0,
    paddingBottom: input.block.style?.paddingBottom ?? 0,
    paddingLeft: input.block.style?.paddingLeft ?? 0,
    paddingRight: input.block.style?.paddingRight ?? 0
  }
}

export function insetNativeBlockRect(
  rect: Rect,
  style: NativeBlockRenderStyle
): Rect {
  return {
    x: rect.x + style.paddingLeft,
    y: rect.y + style.paddingTop,
    width: Math.max(40, rect.width - style.paddingLeft - style.paddingRight),
    height: Math.max(0, rect.height - style.paddingTop - style.paddingBottom)
  }
}

export function isCoverImageBlock(
  section: SectionDocument,
  block: BlockNode
): block is Extract<BlockNode, { kind: "image" }> {
  return (
    section.presentationRole === "cover" &&
    section.blocks.length === 1 &&
    block.kind === "image"
  )
}
