import { describe, expect, it } from "vitest"
import type { SectionDocument } from "../src/model/types"
import { LayoutEngine } from "../src/layout/layout-engine"
import { DisplayListBuilder } from "../src/renderer/display-list-builder"
import { buildReadingStyleProfile } from "../src/renderer/reading-style-profile"

const typography = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12
} as const

describe("canvas/dom style alignment", () => {
  it("does not inject a synthetic section title and keeps shared bottom padding", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/alignment.xhtml",
      title: "Synthetic Title Should Not Render",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Aligned paragraph." }]
        }
      ]
    }

    const layout = new LayoutEngine().layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 280,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )

    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 280,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography,
      activeBlockId: undefined
    })

    expect(
      displayList.ops.some((op) => op.blockId === "section-1::title")
    ).toBe(false)
    expect(displayList.height).toBeCloseTo(
      layout.blocks[0]!.estimatedHeight + 24,
      5
    )
  })

  it("uses paragraph and heading spacing from the shared profile in layout estimation", () => {
    const section: SectionDocument = {
      id: "section-spacing",
      href: "OPS/spacing.xhtml",
      title: "Spacing",
      anchors: {},
      blocks: [
        {
          id: "heading-1",
          kind: "heading",
          level: 1,
          inlines: [{ kind: "text", text: "Heading" }]
        },
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Paragraph" }]
        }
      ]
    }

    const layout = new LayoutEngine().layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 320,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )

    const headingBlock = layout.blocks[0]
    const textBlock = layout.blocks[1]
    const styleProfile = buildReadingStyleProfile({
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography
    })

    expect(headingBlock?.type).toBe("pretext")
    expect(textBlock?.type).toBe("pretext")
    expect(
      headingBlock?.type === "pretext" ? headingBlock.estimatedHeight : 0
    ).toBeCloseTo(
      (headingBlock?.type === "pretext"
        ? (headingBlock.lines[0]?.height ?? 0)
        : 0) + styleProfile.heading.marginBottom,
      1
    )
    expect(
      textBlock?.type === "pretext" ? textBlock.estimatedHeight : 0
    ).toBeCloseTo(
      (textBlock?.type === "pretext" ? (textBlock.lines[0]?.height ?? 0) : 0) +
        styleProfile.text.marginBottom,
      1
    )
  })

  it("uses shared code and table tokens while building draw ops", () => {
    const section: SectionDocument = {
      id: "section-native",
      href: "OPS/native.xhtml",
      title: "Native",
      anchors: {},
      blocks: [
        {
          id: "code-1",
          kind: "code",
          text: "const value = 1;"
        },
        {
          id: "table-1",
          kind: "table",
          rows: [
            {
              id: "table-row-1",
              cells: [
                {
                  id: "table-cell-1",
                  header: true,
                  blocks: [
                    {
                      id: "cell-1",
                      kind: "text",
                      inlines: [{ kind: "text", text: "Head" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    const layout = new LayoutEngine().layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 320,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )

    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 320,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography,
      activeBlockId: undefined
    })

    const codeBackground = displayList.ops.find(
      (op) => op.kind === "rect" && op.blockId === "code-1"
    )
    const tableCell = displayList.ops.find(
      (op) => op.kind === "rect" && op.blockId === "table-1"
    )

    expect(
      codeBackground && "color" in codeBackground ? codeBackground.color : ""
    ).toBe("#f4f4f5")
    expect(
      tableCell && "strokeColor" in tableCell ? tableCell.strokeColor : ""
    ).toBe("rgba(148, 163, 184, 0.35)")
  })
})
