import type { BlockNode, InlineNode } from "../model/types"

export function extractInlineText(inline: InlineNode): string {
  switch (inline.kind) {
    case "text":
    case "code":
      return inline.text
    case "span":
    case "sub":
    case "sup":
    case "small":
    case "mark":
    case "del":
    case "ins":
    case "emphasis":
    case "strong":
    case "link":
      return inline.children.map(extractInlineText).join("")
    case "line-break":
      return "\n"
    case "image":
      return inline.alt ?? ""
    default:
      return ""
  }
}

export function extractBlockText(block: BlockNode): string {
  switch (block.kind) {
    case "heading":
    case "text":
      return block.inlines.map(extractInlineText).join("")
    case "quote":
      return block.blocks.map(extractBlockText).join(" ")
    case "figure":
      return [
        block.blocks.map(extractBlockText).join(" "),
        block.caption?.map(extractBlockText).join(" ") ?? ""
      ]
        .filter(Boolean)
        .join(" ")
    case "aside":
    case "nav":
      return block.blocks.map(extractBlockText).join(" ")
    case "code":
      return block.text
    case "image":
      return block.alt ?? ""
    case "list":
      return block.items
        .flatMap((item) => item.blocks.map(extractBlockText))
        .join(" ")
    case "table":
      return [
        block.caption?.map(extractBlockText).join(" ") ?? "",
        block.rows
          .flatMap((row) =>
            row.cells.flatMap((cell) => cell.blocks.map(extractBlockText))
          )
          .join(" ")
      ]
        .filter(Boolean)
        .join(" ")
    case "definition-list":
      return block.items
        .flatMap((item) => [
          ...item.term.map(extractBlockText),
          ...item.descriptions.flatMap((description) =>
            description.map(extractBlockText)
          )
        ])
        .join(" ")
    case "thematic-break":
      return ""
    default:
      return ""
  }
}
