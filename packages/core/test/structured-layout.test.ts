import { describe, expect, it } from "vitest"
import { LayoutEngine } from "../src/layout/layout-engine"
import { DisplayListBuilder } from "../src/renderer/display-list-builder"
import type {
  ImageDrawOp,
  RectDrawOp,
  TextRunDrawOp
} from "../src/renderer/draw-ops"
import type { SectionDocument } from "../src/model/types"

const typography = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12
} as const

const theme = {
  color: "#1f2328",
  background: "#fffdf7"
} as const

describe("structured native block layout", () => {
  it("renders list markers with nested indentation", () => {
    const section: SectionDocument = {
      id: "section-list",
      href: "OPS/list.xhtml",
      anchors: {},
      blocks: [
        {
          id: "list-1",
          kind: "list",
          ordered: true,
          start: 3,
          items: [
            {
              id: "item-1",
              blocks: [
                {
                  id: "text-1",
                  kind: "text",
                  inlines: [{ kind: "text", text: "Top level item" }]
                },
                {
                  id: "list-1-1",
                  kind: "list",
                  ordered: false,
                  items: [
                    {
                      id: "item-1-1",
                      blocks: [
                        {
                          id: "text-1-1",
                          kind: "text",
                          inlines: [{ kind: "text", text: "Nested item" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 260,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 260,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const markerOps = displayList.ops.filter(
      (op): op is TextRunDrawOp =>
        op.kind === "text" &&
        op.blockId === "list-1" &&
        (op.text === "3." || op.text === "\u2022")
    )

    expect(markerOps).toHaveLength(2)
    expect(markerOps[1]!.x).toBeGreaterThan(markerOps[0]!.x)
  })

  it("renders figure images and captions as stacked content", () => {
    const section: SectionDocument = {
      id: "section-figure",
      href: "OPS/figure.xhtml",
      anchors: {},
      blocks: [
        {
          id: "figure-1",
          kind: "figure",
          blocks: [
            {
              id: "image-1",
              kind: "image",
              src: "OPS/images/figure.png",
              alt: "Figure image",
              width: 320,
              height: 180
            }
          ],
          caption: [
            {
              id: "caption-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Figure 1. Sample caption" }]
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 300,
        viewportHeight: 640,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 300,
      viewportHeight: 640,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const imageOp = displayList.ops.find(
      (op): op is ImageDrawOp =>
        op.kind === "image" && op.blockId === "figure-1"
    )
    const captionOp = displayList.ops.find(
      (op): op is TextRunDrawOp =>
        op.kind === "text" &&
        op.blockId === "figure-1" &&
        op.text.includes("Figure 1. Sample caption")
    )

    expect(layout.blocks[0]?.estimatedHeight).toBeGreaterThan(180)
    expect(imageOp).toBeTruthy()
    expect(captionOp).toBeTruthy()
    expect(captionOp!.y).toBeGreaterThan(imageOp!.rect.y + imageOp!.rect.height)
  })

  it("renders table cells as bordered grid rectangles", () => {
    const section: SectionDocument = {
      id: "section-table",
      href: "OPS/table.xhtml",
      anchors: {},
      blocks: [
        {
          id: "table-1",
          kind: "table",
          caption: [
            {
              id: "caption-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Scores" }]
            }
          ],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  header: true,
                  blocks: [
                    {
                      id: "cell-text-1",
                      kind: "text",
                      inlines: [{ kind: "text", text: "Name" }]
                    }
                  ]
                },
                {
                  id: "cell-2",
                  header: true,
                  blocks: [
                    {
                      id: "cell-text-2",
                      kind: "text",
                      inlines: [{ kind: "text", text: "Score" }]
                    }
                  ]
                }
              ]
            },
            {
              id: "row-2",
              cells: [
                {
                  id: "cell-3",
                  blocks: [
                    {
                      id: "cell-text-3",
                      kind: "text",
                      inlines: [{ kind: "text", text: "Alice" }]
                    }
                  ]
                },
                {
                  id: "cell-4",
                  blocks: [
                    {
                      id: "cell-text-4",
                      kind: "text",
                      inlines: [{ kind: "text", text: "98" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 320,
        viewportHeight: 640,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 320,
      viewportHeight: 640,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const cellRects = displayList.ops.filter(
      (op): op is RectDrawOp =>
        op.kind === "rect" &&
        op.blockId === "table-1" &&
        op.strokeColor === "rgba(148, 163, 184, 0.35)"
    )

    expect(layout.blocks[0]?.estimatedHeight).toBeGreaterThan(100)
    expect(cellRects).toHaveLength(4)
  })

  it("renders aside blocks with a note panel treatment", () => {
    const section: SectionDocument = {
      id: "section-aside",
      href: "OPS/aside.xhtml",
      anchors: {},
      blocks: [
        {
          id: "aside-1",
          kind: "aside",
          blocks: [
            {
              id: "aside-text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Important note content" }]
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 300,
        viewportHeight: 640,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 300,
      viewportHeight: 640,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const asidePanel = displayList.ops.find(
      (op): op is RectDrawOp =>
        op.kind === "rect" &&
        op.blockId === "aside-1" &&
        op.color === "rgba(59, 123, 163, 0.08)"
    )
    const asideText = displayList.ops.find(
      (op): op is TextRunDrawOp =>
        op.kind === "text" &&
        op.blockId === "aside-1" &&
        op.text.includes("Important note content")
    )

    expect(asidePanel).toBeTruthy()
    expect(asideText).toBeTruthy()
    expect(asideText!.x).toBeGreaterThan(asidePanel!.rect.x)
  })

  it("applies fallback styles to native quote blocks", () => {
    const section: SectionDocument = {
      id: "section-quote-style",
      href: "OPS/quote-style.xhtml",
      anchors: {},
      blocks: [
        {
          id: "quote-1",
          kind: "quote",
          style: {
            color: "#663300",
            backgroundColor: "rgba(102, 51, 0, 0.08)",
            textAlign: "center",
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 16,
            paddingRight: 16
          },
          blocks: [
            {
              id: "quote-text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Centered quote fallback" }]
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 300,
        viewportHeight: 640,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 300,
      viewportHeight: 640,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const background = displayList.ops.find(
      (op): op is RectDrawOp =>
        op.kind === "rect" &&
        op.blockId === "quote-1" &&
        op.color === "rgba(102, 51, 0, 0.08)"
    )
    const quoteText = displayList.ops.find(
      (op): op is TextRunDrawOp =>
        op.kind === "text" &&
        op.blockId === "quote-1" &&
        op.text.includes("Centered quote fallback")
    )

    expect(background).toBeTruthy()
    expect(quoteText).toBeTruthy()
    expect(quoteText!.color).toBe("#663300")
    expect(quoteText!.x).toBeGreaterThan(background!.rect.x + 34)
  })
})
