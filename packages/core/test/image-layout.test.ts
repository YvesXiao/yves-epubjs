import { describe, expect, it } from "vitest"
import { LayoutEngine } from "../src/layout/layout-engine"
import type { ImageDrawOp, TextRunDrawOp } from "../src/renderer/draw-ops"
import { DisplayListBuilder } from "../src/renderer/display-list-builder"
import { resolveImageLayout } from "../src/utils/image-layout"
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

describe("image layout strategy", () => {
  it("keeps small images at their intrinsic width instead of stretching to fill the column", () => {
    const layout = resolveImageLayout({
      availableWidth: 480,
      viewportHeight: 720,
      intrinsicWidth: 120,
      intrinsicHeight: 90
    })

    expect(layout.width).toBe(120)
    expect(layout.height).toBe(90)
  })

  it("caps oversized content images to the content width instead of using heuristic width buckets", () => {
    const wide = resolveImageLayout({
      availableWidth: 480,
      viewportHeight: 720,
      intrinsicWidth: 1600,
      intrinsicHeight: 900
    })
    const regular = resolveImageLayout({
      availableWidth: 480,
      viewportHeight: 720,
      intrinsicWidth: 1000,
      intrinsicHeight: 1000
    })

    expect(wide.width).toBe(480)
    expect(regular.width).toBe(480)
  })

  it("caps tall portrait images against the viewport height", () => {
    const layout = resolveImageLayout({
      availableWidth: 480,
      viewportHeight: 400,
      intrinsicWidth: 600,
      intrinsicHeight: 1800
    })

    expect(layout.height).toBeLessThanOrEqual(400 * 0.78)
    expect(layout.width).toBeLessThan(480 * 0.9)
  })

  it("allows cover images to fill the available width", () => {
    const layout = resolveImageLayout({
      availableWidth: 480,
      viewportHeight: 720,
      intrinsicWidth: 600,
      intrinsicHeight: 900,
      fillWidth: true
    })

    expect(layout.width).toBe(480)
    expect(layout.xOffset).toBe(0)
    expect(layout.height).toBe(720)
  })

  it("uses the same geometry for block height estimation and canvas image rects", () => {
    const section: SectionDocument = {
      id: "section-image",
      href: "OPS/image.xhtml",
      anchors: {},
      blocks: [
        {
          id: "image-1",
          kind: "image",
          src: "OPS/image.jpg",
          alt: "Inline image",
          width: 120,
          height: 90
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 400,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const builder = new DisplayListBuilder()
    const displayList = builder.buildSection({
      section,
      width: 400,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })
    const imageOp = displayList.ops.find(
      (op): op is ImageDrawOp => op.kind === "image"
    )

    expect(layout.blocks[0]?.estimatedHeight).toBe(106)
    expect(imageOp).toBeTruthy()
    expect(imageOp?.rect).toEqual({
      x: 140,
      y: 8,
      width: 120,
      height: 90
    })
    expect(displayList.height).toBe(130)
  })

  it("uses resolved resource intrinsic sizes when block metadata is missing", () => {
    const section: SectionDocument = {
      id: "section-image-metadata",
      href: "OPS/image.xhtml",
      anchors: {},
      blocks: [
        {
          id: "image-1",
          kind: "image",
          src: "OPS/image.jpg",
          alt: "Inline image"
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 400,
        viewportHeight: 600,
        typography,
        fontFamily: "serif",
        resolveImageIntrinsicSize: () => ({
          width: 120,
          height: 90
        })
      },
      "scroll"
    )
    const builder = new DisplayListBuilder()
    const displayList = builder.buildSection({
      section,
      width: layout.width,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme,
      typography,
      locatorMap: layout.locatorMap,
      resolveImageIntrinsicSize: () => ({
        width: 120,
        height: 90
      }),
      activeBlockId: undefined
    })
    const imageOp = displayList.ops.find(
      (op): op is ImageDrawOp => op.kind === "image"
    )

    expect(layout.blocks[0]?.estimatedHeight).toBe(106)
    expect(imageOp?.rect).toEqual({
      x: 140,
      y: 8,
      width: 120,
      height: 90
    })
  })

  it("keeps code block indentation and wraps long lines consistently", () => {
    const section: SectionDocument = {
      id: "section-code",
      href: "OPS/code.xhtml",
      anchors: {},
      blocks: [
        {
          id: "code-1",
          kind: "code",
          text: "  const answer = 42\nveryLongIdentifierNameThatNeedsWrapping()"
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 220,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const builder = new DisplayListBuilder()
    const displayList = builder.buildSection({
      section,
      width: 220,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme,
      typography,
      activeBlockId: undefined
    })

    const codeTextOps = displayList.ops.filter(
      (op): op is TextRunDrawOp => op.kind === "text" && op.blockId === "code-1"
    )

    expect(layout.blocks[0]?.estimatedHeight).toBeGreaterThan(70)
    expect(codeTextOps.length).toBeGreaterThanOrEqual(3)
    expect(codeTextOps[0]?.text.startsWith("  ")).toBe(true)
    expect(codeTextOps.map((op) => op.text).join("")).toContain(
      "veryLongIdentifierNameThatNeedsWrapping()"
    )
  })

  it("keeps inline images on the pretext canvas path", () => {
    const section: SectionDocument = {
      id: "section-inline-image",
      href: "OPS/inline-image.xhtml",
      anchors: {},
      blocks: [
        {
          id: "text-inline-image",
          kind: "text",
          inlines: [
            { kind: "text", text: "Before " },
            {
              kind: "image",
              src: "OPS/images/icon.png",
              alt: "icon",
              width: 20,
              height: 20
            },
            { kind: "text", text: " after" }
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
      resolveImageLoaded: () => true,
      activeBlockId: undefined
    })
    const inlineImageOp = displayList.ops.find(
      (op): op is ImageDrawOp =>
        op.kind === "image" && op.blockId === "text-inline-image"
    )

    expect(layout.blocks[0]?.type).toBe("pretext")
    expect(inlineImageOp).toBeTruthy()
    expect(inlineImageOp?.rect.width).toBe(20)
    expect(inlineImageOp?.rect.height).toBe(20)
  })

  it("recomputes inline image geometry when resource intrinsic sizes become available", () => {
    const section: SectionDocument = {
      id: "section-inline-image-resource",
      href: "OPS/inline-image-resource.xhtml",
      anchors: {},
      blocks: [
        {
          id: "text-inline-image-resource",
          kind: "text",
          style: {
            textAlign: "center"
          },
          inlines: [
            {
              kind: "image",
              src: "OPS/images/header.jpg",
              alt: "Header"
            }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const firstLayout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 720,
        viewportHeight: 800,
        typography,
        fontFamily: "serif",
        resolveImageIntrinsicSize: () => undefined
      },
      "scroll"
    )
    const secondLayout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 720,
        viewportHeight: 800,
        typography,
        fontFamily: "serif",
        resolveImageIntrinsicSize: () => ({
          width: 441,
          height: 177
        })
      },
      "scroll"
    )

    const firstImage =
      firstLayout.blocks[0]?.type === "pretext"
        ? firstLayout.blocks[0].lines[0]?.fragments[0]?.image
        : undefined
    const secondImage =
      secondLayout.blocks[0]?.type === "pretext"
        ? secondLayout.blocks[0].lines[0]?.fragments[0]?.image
        : undefined

    expect(firstImage?.width ?? 0).toBeLessThan(40)
    expect(secondImage?.width).toBe(441)
    expect(secondImage?.height).toBe(177)
    expect(
      (secondImage?.width ?? 0) - (firstImage?.width ?? 0)
    ).toBeGreaterThan(300)
  })

  it("reserves full block height for centered legacy image paragraphs", () => {
    const section: SectionDocument = {
      id: "section-legacy-image-paragraph",
      href: "OPS/text00000.xhtml",
      presentationRole: "cover",
      anchors: {},
      blocks: [
        {
          id: "legacy-image-paragraph",
          kind: "text",
          style: {
            textAlign: "center"
          },
          inlines: [
            {
              kind: "image",
              src: "OPS/Image00122.jpg",
              alt: "STAR",
              width: 644,
              height: 219
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
        viewportWidth: 720,
        viewportHeight: 800,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 720,
      viewportHeight: 800,
      blocks: layout.blocks,
      theme,
      typography,
      resolveImageLoaded: () => true,
      activeBlockId: undefined
    })

    const imageOp = displayList.ops.find(
      (op): op is ImageDrawOp =>
        op.kind === "image" && op.blockId === "legacy-image-paragraph"
    )
    expect(layout.blocks[0]?.type).toBe("pretext")
    expect(imageOp?.rect.width ?? 0).toBeGreaterThanOrEqual(704)
    expect(layout.blocks[0]?.estimatedHeight ?? 0).toBeGreaterThanOrEqual(260)
    expect(imageOp).toBeTruthy()
    expect(imageOp?.rect.x ?? 99).toBeLessThanOrEqual(8)
  })
})
