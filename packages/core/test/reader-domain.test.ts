import { describe, expect, it } from "vitest"
import { type BlockNode } from "../src/model/types"
import {
  collectBlockIdsInReadingOrder,
  normalizeTextRangeSelector,
  toTransparentHighlightColor
} from "../src/runtime/reader-domain"

describe("reader domain utilities", () => {
  it("normalizes reverse text ranges within the same block", () => {
    expect(
      normalizeTextRangeSelector({
        start: {
          blockId: " block-a ",
          inlineOffset: 9.8
        },
        end: {
          blockId: "block-a",
          inlineOffset: 2.1
        }
      })
    ).toEqual({
      start: {
        blockId: "block-a",
        inlineOffset: 2
      },
      end: {
        blockId: "block-a",
        inlineOffset: 9
      }
    })
  })

  it("converts hex highlight colors to translucent rgba", () => {
    expect(toTransparentHighlightColor("#abc")).toBe(
      "rgba(170, 187, 204, 0.18)"
    )
    expect(toTransparentHighlightColor("#123456")).toBe(
      "rgba(18, 52, 86, 0.18)"
    )
  })

  it("collects nested block ids in reading order", () => {
    const blocks: BlockNode[] = [
      {
        id: "p-1",
        kind: "text",
        inlines: []
      },
      {
        id: "list-1",
        kind: "list",
        ordered: false,
        items: [
          {
            id: "list-item-1",
            blocks: [
              {
                id: "li-text-1",
                kind: "text",
                inlines: []
              }
            ]
          }
        ]
      },
      {
        id: "table-1",
        kind: "table",
        rows: [
          {
            id: "row-1",
            cells: [
              {
                id: "cell-1",
                blocks: [
                  {
                    id: "cell-text-1",
                    kind: "text",
                    inlines: []
                  }
                ]
              }
            ]
          }
        ],
        caption: [
          {
            id: "caption-1",
            kind: "text",
            inlines: []
          }
        ]
      }
    ]

    expect(collectBlockIdsInReadingOrder(blocks)).toEqual([
      "p-1",
      "list-1",
      "list-item-1",
      "li-text-1",
      "table-1",
      "caption-1",
      "row-1",
      "cell-1",
      "cell-text-1"
    ])
  })
})
