import { describe, expect, it } from "vitest"
import {
  LayoutEngine,
  type LayoutPretextBlock
} from "../src/layout/layout-engine"
import type { Book, SectionDocument } from "../src/model/types"
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"
import { DisplayListBuilder } from "../src/renderer/display-list-builder"
import type { ImageDrawOp, TextRunDrawOp } from "../src/renderer/draw-ops"
import { EpubReader } from "../src/runtime/reader"

const typography = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12
} as const

function createSection(): SectionDocument {
  return {
    id: "section-1",
    href: "OPS/chapter-1.xhtml",
    title: "Chapter 1",
    blocks: [
      {
        id: "heading-1",
        kind: "heading",
        level: 1,
        inlines: [{ kind: "text", text: "A Long Heading That Wraps" }]
      },
      {
        id: "text-1",
        kind: "text",
        inlines: [
          {
            kind: "text",
            text: "This paragraph is rendered through pretext. "
          },
          { kind: "strong", children: [{ kind: "text", text: "Bold text" }] },
          { kind: "text", text: " and " },
          {
            kind: "link",
            href: "#target",
            children: [{ kind: "text", text: "linked text" }]
          },
          { kind: "text", text: " should all participate in line layout." }
        ]
      }
    ],
    anchors: {}
  }
}

describe("pretext layout integration", () => {
  it("keeps compiled block caches scoped to each section when block ids repeat", () => {
    const engine = new LayoutEngine()
    const firstSection: SectionDocument = {
      id: "section-a",
      href: "OPS/section-a.xhtml",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "First section paragraph." }]
        }
      ]
    }
    const secondSection: SectionDocument = {
      id: "section-b",
      href: "OPS/section-b.xhtml",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Second section paragraph." }]
        }
      ]
    }

    const firstLayout = engine.layout(
      {
        section: firstSection,
        spineIndex: 0,
        viewportWidth: 320,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )
    const secondLayout = engine.layout(
      {
        section: secondSection,
        spineIndex: 1,
        viewportWidth: 320,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )

    const firstBlock = firstLayout.blocks[0]
    const secondBlock = secondLayout.blocks[0]
    expect(firstBlock?.type).toBe("pretext")
    expect(secondBlock?.type).toBe("pretext")
    expect(
      firstBlock?.type === "pretext" && collectRenderedLineText(firstBlock)
    ).toContain("First section paragraph.")
    expect(
      secondBlock?.type === "pretext" && collectRenderedLineText(secondBlock)
    ).toContain("Second section paragraph.")
  })

  it("lays out text-like blocks with pretext line data", () => {
    const engine = new LayoutEngine()
    const section = createSection()

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

    expect(layout.blocks[0]?.type).toBe("pretext")
    expect(layout.blocks[1]?.type).toBe("pretext")
    expect(
      layout.blocks[1]?.type === "pretext" && layout.blocks[1].lines.length
    ).toBeGreaterThan(1)
    expect(layout.locatorMap.get("text-1")).toEqual({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })
  })

  it("keeps paragraphs with line breaks and semantic inline nodes on the pretext path", () => {
    const engine = new LayoutEngine()
    const section: SectionDocument = {
      id: "section-inline-semantics",
      href: "OPS/inline-semantics.xhtml",
      title: "Inline Semantics",
      anchors: {},
      blocks: [
        {
          id: "text-inline-semantics",
          kind: "text",
          inlines: [
            { kind: "text", text: "Alpha " },
            { kind: "mark", children: [{ kind: "text", text: "beta" }] },
            { kind: "line-break" },
            {
              kind: "small",
              children: [{ kind: "text", text: "gamma " }]
            },
            {
              kind: "sup",
              children: [{ kind: "text", text: "1" }]
            }
          ]
        }
      ]
    }

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

    expect(layout.blocks[0]?.type).toBe("pretext")
    expect(
      layout.blocks[0]?.type === "pretext" && layout.blocks[0].lines.length
    ).toBeGreaterThanOrEqual(2)
  })

  it("keeps pretext text runs inside the section content box", () => {
    const engine = new LayoutEngine()
    const section: SectionDocument = {
      id: "section-pretext-width-boundary",
      href: "OPS/pretext-width-boundary.xhtml",
      title: "Width Boundary",
      anchors: {},
      blocks: [
        {
          id: "text-pretext-width-boundary",
          kind: "text",
          inlines: [
            {
              kind: "text",
              text: "每逢世界无烟日，医学界的专家总会说：“今天所有吸烟者都应该尝试戒烟！”大部分吸烟的人都清楚，这一天他们抽的烟比平时还多。吸烟者们并不喜欢被当成白痴对待，尤其讨厌无法理解他们为什么吸烟的人。"
            }
          ]
        }
      ]
    }

    const layout = engine.layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 672,
        viewportHeight: 600,
        typography,
        fontFamily: "serif"
      },
      "scroll"
    )

    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: layout.width,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography,
      activeBlockId: undefined
    })

    const textOps = displayList.ops.filter(
      (op): op is TextRunDrawOp =>
        op.kind === "text" && op.blockId === "text-pretext-width-boundary"
    )

    expect(textOps.length).toBeGreaterThan(1)
    expect(
      textOps.every((op) => op.x + op.width <= displayList.width + 0.5)
    ).toBe(true)
  })

  it("carries measured fragment widths through pretext layout output", () => {
    const engine = new LayoutEngine()
    const section = createSection()

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

    const paragraphBlock = layout.blocks[1]
    expect(paragraphBlock?.type).toBe("pretext")
    const firstTextFragment =
      paragraphBlock?.type === "pretext"
        ? paragraphBlock.lines
            .flatMap((line) => line.fragments)
            .find((fragment) => fragment.text.length > 0)
        : undefined

    expect(typeof firstTextFragment?.width).toBe("number")
    expect(firstTextFragment?.width ?? 0).toBeGreaterThan(0)
  })

  it("renders pretext-driven content with the canvas backend by default", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 640
    })
    document.body.appendChild(container)

    const reader = new EpubReader({ container })
    const section = createSection()
    const book: Book = {
      metadata: {
        title: "Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()

    expect(container.querySelector("canvas.epub-canvas-section")).toBeTruthy()
    const textRuns = Array.from(
      container.querySelectorAll(".epub-text-layer .epub-text-run")
    ).map((node) => node.textContent ?? "")
    expect(textRuns.length).toBeGreaterThan(1)
    expect(textRuns.some((text) => text.trim().length > 0)).toBe(true)
    expect(reader.getRenderMetrics().backend).toBe("canvas")
    expect(reader.getVisibleDrawBounds().length).toBeGreaterThan(1)
  })

  it("emits mark highlighting and superscript baseline offsets in pretext draw ops", () => {
    const section: SectionDocument = {
      id: "section-pretext-ops",
      href: "OPS/pretext-ops.xhtml",
      title: "Pretext Ops",
      anchors: {},
      blocks: [
        {
          id: "text-pretext-ops",
          kind: "text",
          inlines: [
            { kind: "text", text: "Alpha " },
            { kind: "mark", children: [{ kind: "text", text: "beta" }] },
            { kind: "text", text: " " },
            { kind: "sup", children: [{ kind: "text", text: "1" }] }
          ]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
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

    const alphaOp = displayList.ops.find(
      (op) =>
        op.kind === "text" &&
        op.blockId === "text-pretext-ops" &&
        op.text.includes("Alpha")
    )
    const markOp = displayList.ops.find(
      (op) =>
        op.kind === "text" &&
        op.blockId === "text-pretext-ops" &&
        op.text === "beta"
    )
    const supOp = displayList.ops.find(
      (op) =>
        op.kind === "text" &&
        op.blockId === "text-pretext-ops" &&
        op.text === "1"
    )

    expect(alphaOp && "y" in alphaOp ? alphaOp.y : -1).toBeGreaterThanOrEqual(0)
    expect(
      markOp && "highlightColor" in markOp ? markOp.highlightColor : undefined
    ).toBe("rgba(250, 204, 21, 0.22)")
    expect(
      supOp && alphaOp && "y" in supOp && "y" in alphaOp ? supOp.y : 0
    ).toBeLessThan(alphaOp && "y" in alphaOp ? alphaOp.y : 0)
  })

  it("renders fallback block styles for pretext text blocks", () => {
    const section: SectionDocument = {
      id: "section-pretext-style",
      href: "OPS/pretext-style.xhtml",
      title: "Styled Pretext",
      anchors: {},
      blocks: [
        {
          id: "text-pretext-style",
          kind: "text",
          style: {
            color: "#884400",
            backgroundColor: "rgba(136, 68, 0, 0.08)",
            textAlign: "center",
            paddingTop: 6,
            paddingBottom: 4,
            paddingLeft: 12,
            paddingRight: 12
          },
          inlines: [{ kind: "text", text: "Centered fallback paragraph" }]
        }
      ]
    }

    const engine = new LayoutEngine()
    const layout = engine.layout(
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

    const blockBackground = displayList.ops.find(
      (op) =>
        op.kind === "rect" &&
        op.blockId === "text-pretext-style" &&
        op.color === "rgba(136, 68, 0, 0.08)"
    )
    const textOps = displayList.ops.filter(
      (op): op is TextRunDrawOp =>
        op.kind === "text" && op.blockId === "text-pretext-style"
    )

    expect(blockBackground).toBeTruthy()
    expect(textOps.length).toBeGreaterThan(0)
    expect(textOps.every((op) => op.color === "#884400")).toBe(true)
    expect(textOps[0]?.x ?? 0).toBeGreaterThan(20)
  })

  it("preserves measured pretext fragment widths in canvas draw ops", () => {
    const section: SectionDocument = {
      id: "section-pretext-fragment-width",
      href: "OPS/pretext-fragment-width.xhtml",
      title: "Measured Widths",
      anchors: {},
      blocks: []
    }

    const pretextBlock: LayoutPretextBlock = {
      type: "pretext",
      id: "text-pretext-fragment-width",
      kind: "text",
      lineHeight: 28,
      textAlign: "start",
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      lines: [
        {
          width: 250,
          height: 28,
          fragments: [
            {
              text: "在C#中，StringBuilder",
              font: '400 18px "Iowan Old Style", "Palatino Linotype", serif',
              gapBefore: 0,
              width: 200
            },
            {
              text: " tail",
              font: '400 18px "Iowan Old Style", "Palatino Linotype", serif',
              gapBefore: 0,
              width: 50
            }
          ]
        }
      ],
      estimatedHeight: 28
    }

    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 360,
      viewportHeight: 600,
      blocks: [pretextBlock],
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography,
      activeBlockId: undefined
    })

    const textOps = displayList.ops.filter(
      (op): op is TextRunDrawOp => op.kind === "text"
    )
    expect(textOps).toHaveLength(2)
    expect(textOps[0]?.width).toBe(200)
    expect(textOps[0]?.rect.width).toBe(200)
    expect(textOps[1]?.x).toBe((textOps[0]?.x ?? 0) + (textOps[0]?.width ?? 0))
    expect(textOps[1]?.width).toBe(50)
  })

  it("respects linked stylesheet inline image sizing and margins on the canvas path", () => {
    const section = parseXhtmlDocument(
      `<?xml version="1.0"?>
        <html>
          <body>
            <p>Alpha<img class="badge" src="OPS/badge.png" width="20" height="20" alt="Badge" />Omega</p>
          </body>
        </html>`,
      "OPS/inline-image.xhtml",
      [
        parseCssStyleSheet(`
          .badge {
            height: 1.1em;
            margin-left: 0.2em;
            margin-right: 0.3em;
            vertical-align: middle;
          }
        `)
      ]
    )

    const engine = new LayoutEngine()
    const layout = engine.layout(
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

    const textOps = displayList.ops.filter(
      (op): op is TextRunDrawOp => op.kind === "text" && op.blockId === "text-1"
    )
    const imageOp = displayList.ops.find(
      (op): op is ImageDrawOp => op.kind === "image" && op.blockId === "text-1"
    )
    const alphaOp = textOps.find((op) => op.text.includes("Alpha"))
    const omegaOp = textOps.find((op) => op.text.includes("Omega"))

    expect(imageOp).toBeTruthy()
    expect(imageOp!.rect.height).toBeCloseTo(17.6, 1)
    expect(imageOp!.rect.width).toBeCloseTo(17.6, 1)
    expect(imageOp!.rect.x).toBeGreaterThan(
      (alphaOp?.x ?? 0) + (alphaOp?.width ?? 0) + 3
    )
    expect(omegaOp?.x ?? 0).toBeGreaterThan(
      imageOp!.rect.x + imageOp!.rect.width + 4.5
    )
  })

  it("keeps linked inline images clickable on the canvas path", () => {
    const section: SectionDocument = {
      id: "section-linked-inline-image",
      href: "OPS/linked-inline-image.xhtml",
      title: "Linked Inline Image",
      anchors: {},
      blocks: [
        {
          id: "text-linked-inline-image",
          kind: "text",
          inlines: [
            { kind: "text", text: "Alpha" },
            {
              kind: "link",
              tagName: "a",
              className: "footnote",
              href: "OPS/linked-inline-image.xhtml#note-1",
              children: [
                {
                  kind: "image",
                  src: "OPS/images/note.png",
                  alt: "Note",
                  width: 18,
                  height: 18
                }
              ]
            },
            { kind: "text", text: "Omega" }
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
    const imageInteraction = displayList.interactions.find(
      (interaction) => interaction.kind === "image"
    )
    const linkInteraction = displayList.interactions.find(
      (interaction) =>
        interaction.kind === "link" &&
        interaction.href === "OPS/linked-inline-image.xhtml#note-1"
    )

    expect(imageInteraction).toBeTruthy()
    expect(linkInteraction).toBeTruthy()
    expect(linkInteraction?.rect).toEqual(imageInteraction?.rect)
  })

  it("renders paginated content to canvas", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createSection()
    const book: Book = {
      metadata: {
        title: "Canvas Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    expect(container.querySelector("canvas.epub-canvas-paginated")).toBeTruthy()
    expect(reader.getRenderMetrics().backend).toBe("canvas")
    expect(reader.getVisibleDrawBounds().length).toBeGreaterThan(0)
  })

  it("supports image hit testing in canvas mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })

    const section: SectionDocument = {
      id: "section-image",
      href: "OPS/image.xhtml",
      title: "Images",
      anchors: {},
      blocks: [
        {
          id: "image-1",
          kind: "image",
          src: "OPS/cover.jpg",
          alt: "Cover",
          width: 320,
          height: 240
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Images" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    const hit = reader.hitTest({
      x: 160,
      y: 120
    })

    expect(hit?.kind).toBe("image")
    expect(hit?.blockId).toBe("image-1")
  })

  it("tracks highlighted draw ops after a canvas search", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createSection()
    const book: Book = {
      metadata: { title: "Search Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()
    const results = await reader.search("linked text")

    expect(results).toHaveLength(1)
    expect(reader.getRenderMetrics().highlightedDrawOpCount).toBeGreaterThan(0)
  })

  it("maps locator to viewport in canvas mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createSection()
    const book: Book = {
      metadata: { title: "Map Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    const rects = reader.mapLocatorToViewport({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })

    expect(rects.length).toBeGreaterThan(0)
    expect(rects[0]?.height).toBeGreaterThan(0)
  })

  it("renders text-range annotation highlights in canvas mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createSection()
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: {
        title: "Canvas Highlights",
        identifier: "urn:test:canvas-highlights"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }
    ;(
      reader as unknown as { book: Book; sourceName: string | null }
    ).sourceName = "sample.epub"

    reader.setAnnotations([
      {
        id: "annotation-1",
        publicationId: "identifier:urn:test:canvas-highlights",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.2
        },
        textRange: {
          start: {
            blockId: "text-1",
            inlineOffset: 5
          },
          end: {
            blockId: "text-1",
            inlineOffset: 18
          }
        },
        quote: "paragraph is",
        color: "#3b82f6",
        createdAt: "2026-04-19T00:00:00.000Z",
        updatedAt: "2026-04-19T00:00:00.000Z"
      }
    ])

    await reader.render()

    expect(reader.getRenderMetrics().backend).toBe("canvas")
    expect(reader.getRenderMetrics().highlightedDrawOpCount).toBeGreaterThan(0)
  })

  it("maps viewport points back to locators in canvas mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createSection()
    const book: Book = {
      metadata: { title: "Map Back Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    const rects = reader.mapLocatorToViewport({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })
    const target = rects[0]
    expect(target).toBeTruthy()

    const locator = reader.mapViewportToLocator({
      x: (target?.x ?? 0) + 6,
      y: (target?.y ?? 0) + 6
    })

    expect(locator?.spineIndex).toBe(0)
    expect(locator?.blockId).toBe("text-1")
  })

  it("captures a precise block locator from the viewport center for mode switches", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })
    const repeatedText = Array.from({ length: 120 }, (_, index) => ({
      kind: "text" as const,
      text: `Paragraph ${index + 1} keeps the chapter tall for viewport anchor tests. `
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const book: Book = {
      metadata: { title: "Viewport Anchor Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
      captureModeSwitchLocator(): {
        blockId?: string
        spineIndex: number
      } | null
    }
    state.book = book
    await reader.render()

    container.scrollTop = 420

    const locator = state.captureModeSwitchLocator()

    expect(locator?.spineIndex).toBe(0)
    expect(locator?.blockId).toBe("text-1")
  })

  it("falls back to the current locator when the viewport center cannot be resolved", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })
    const section = createSection()
    const book: Book = {
      metadata: { title: "Fallback Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
      locator: {
        spineIndex: number
        progressInSection: number
        blockId?: string
      } | null
      captureModeSwitchLocator(): {
        blockId?: string
        spineIndex: number
        progressInSection: number
      } | null
    }
    state.book = book
    state.locator = {
      spineIndex: 0,
      progressInSection: 0.4,
      blockId: "fallback-block"
    }

    expect(state.captureModeSwitchLocator()).toEqual({
      spineIndex: 0,
      progressInSection: 0.4,
      blockId: "fallback-block"
    })
  })

  it("supports paginated navigation and page lookup", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })

    const repeatedText = Array.from({ length: 28 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()

    const firstPage = reader.getPaginationInfo()
    expect(firstPage.totalPages).toBeGreaterThan(1)
    expect(firstPage.currentPage).toBe(1)

    await reader.goToPage(firstPage.totalPages)
    expect(reader.getPaginationInfo().currentPage).toBe(firstPage.totalPages)

    await reader.prev()
    expect(reader.getPaginationInfo().currentPage).toBe(
      firstPage.totalPages - 1
    )
  })

  it("keeps pagination global across sections and resolves paginated locations correctly", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()

    const pagination = reader.getPaginationInfo()
    expect(pagination.totalPages).toBeGreaterThan(2)

    await reader.goToPage(pagination.totalPages)

    expect(reader.getPaginationInfo().currentPage).toBe(pagination.totalPages)
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(
      container.querySelector(
        'canvas.epub-canvas-paginated[data-section-id="section-2"]'
      )
    ).toBeTruthy()

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 1
    })

    expect(reader.getPaginationInfo().currentPage).toBe(pagination.totalPages)
    expect(
      container.querySelector(
        'canvas.epub-canvas-paginated[data-section-id="section-2"]'
      )
    ).toBeTruthy()
  })

  it("keeps total pages stable when navigating between sections", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 420
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()
    const firstTotal = reader.getPaginationInfo().totalPages

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    })
    const secondTotal = reader.getPaginationInfo().totalPages

    await reader.goToLocation({
      spineIndex: 0,
      progressInSection: 0
    })
    const thirdTotal = reader.getPaginationInfo().totalPages

    expect(secondTotal).toBe(firstTotal)
    expect(thirdTotal).toBe(firstTotal)
  })

  it("navigates toc items with fragment hrefs to the matching section", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 420
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {
        intro: "text-1"
      }
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2"
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [
        {
          id: "toc-1",
          label: "Intro",
          href: "OPS/chapter-1.xhtml#intro",
          children: []
        },
        {
          id: "toc-2",
          label: "Chapter 2",
          href: "OPS/chapter-2.xhtml",
          children: []
        }
      ],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()
    await reader.goToTocItem("toc-2")
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)

    await reader.goToTocItem("toc-1")
    expect(reader.getCurrentLocation()?.spineIndex).toBe(0)
  })

  it("uses toc fragment anchors to update the current page within the same section", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        },
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ],
      anchors: {
        later: "text-2"
      }
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [
        {
          id: "toc-later",
          label: "Later",
          href: "OPS/chapter-1.xhtml#later",
          children: []
        }
      ],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    await reader.goToTocItem("toc-later")
    expect(reader.getCurrentLocation()?.blockId).toBe("text-2")
    expect(reader.getCurrentLocation()?.progressInSection ?? 0).toBeGreaterThan(
      0
    )
    expect(reader.getPaginationInfo()).toEqual({
      currentPage: 1,
      totalPages: 1
    })
  })

  it("resolves toc fragment anchors declared on structural containers", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const sectionDocument = parseXhtmlDocument(
      `<?xml version="1.0"?>
      <html>
        <head><title>Chapter 1</title></head>
        <body>
          <div id="intro">
            <h1>Intro</h1>
          </div>
          <p>${"Intro paragraph ".repeat(24)}</p>
          <section id="later">
            <h2>Later</h2>
            <p>${"Later paragraph ".repeat(40)}</p>
          </section>
        </body>
      </html>`,
      "OPS/chapter-1.xhtml"
    )
    const section: SectionDocument = {
      ...sectionDocument,
      id: "section-1"
    }

    const book: Book = {
      metadata: {
        title: "Container Anchor Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [
        {
          id: "toc-later",
          label: "Later",
          href: "OPS/chapter-1.xhtml#later",
          children: []
        }
      ],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()
    await reader.goToTocItem("toc-later")

    expect(reader.getCurrentLocation()?.blockId).toBe(section.anchors.later)
    expect(reader.getCurrentLocation()?.spineIndex).toBe(0)
  })

  it("resolves toc fragment anchors declared as standalone markers inside the same section", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const sectionDocument = parseXhtmlDocument(
      `<?xml version="1.0"?>
      <html>
        <head><title>Combined Chapters</title></head>
        <body>
          <a id="chapter-1"></a>
          <h1>Chapter 1</h1>
          <p>${"Chapter one paragraph ".repeat(24)}</p>
          <a id="chapter-4"></a>
          <a name="chapter-4-name"></a>
          <h1>Chapter 4</h1>
          <p>${"Chapter four paragraph ".repeat(40)}</p>
        </body>
      </html>`,
      "OPS/text00011.html"
    )
    const section: SectionDocument = {
      ...sectionDocument,
      id: "section-1"
    }

    const book: Book = {
      metadata: {
        title: "Combined Chapter Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [
        {
          id: "toc-chapter-4",
          label: "Chapter 4",
          href: "OPS/text00011.html#chapter-4",
          children: []
        }
      ],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book

    await reader.render()
    await reader.goToTocItem("toc-chapter-4")

    expect(reader.getCurrentLocation()?.blockId).toBe(
      section.anchors["chapter-4"]
    )
    expect(reader.getCurrentLocation()?.blockId).toBe(
      section.anchors["chapter-4-name"]
    )
  })

  it("keeps canvas scroll toc jumps aligned with the real section offsets", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 0
          }
          if (sectionId === "section-2") {
            return 520
          }
          if (sectionId === "section-3") {
            return 1040
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1" || sectionId === "section-2") {
            return 520
          }
          if (sectionId === "section-3") {
            return 560
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 260
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 180
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 0
      })
      document.body.appendChild(container)

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const repeatedText = Array.from({ length: 20 }, () => ({
        kind: "text" as const,
        text: "This is a long paragraph designed to spill across multiple pages. "
      }))
      const firstSection: SectionDocument = {
        ...createSection(),
        id: "section-1",
        href: "OPS/chapter-1.xhtml",
        title: "Chapter 1",
        blocks: [
          {
            id: "text-1a",
            kind: "text",
            inlines: repeatedText
          }
        ]
      }
      const secondSection: SectionDocument = {
        ...createSection(),
        id: "section-2",
        href: "OPS/chapter-2.xhtml",
        title: "Chapter 2",
        blocks: [
          {
            id: "text-2a",
            kind: "text",
            inlines: repeatedText
          }
        ]
      }
      const thirdSection: SectionDocument = {
        ...createSection(),
        id: "section-3",
        href: "OPS/chapter-3.xhtml",
        title: "Chapter 3",
        blocks: [
          {
            id: "text-3a",
            kind: "text",
            inlines: repeatedText
          },
          {
            id: "text-3b",
            kind: "text",
            inlines: repeatedText
          }
        ],
        anchors: {
          later: "text-3b"
        }
      }

      const book: Book = {
        metadata: {
          title: "Canvas TOC Demo"
        },
        manifest: [],
        spine: [
          { idref: "item-1", href: firstSection.href, linear: true },
          { idref: "item-2", href: secondSection.href, linear: true },
          { idref: "item-3", href: thirdSection.href, linear: true }
        ],
        toc: [
          {
            id: "toc-later",
            label: "Later",
            href: "OPS/chapter-3.xhtml#later",
            children: []
          }
        ],
        sections: [firstSection, secondSection, thirdSection]
      }

      ;(reader as unknown as { book: Book }).book = book
      await reader.render()
      await reader.goToTocItem("toc-later")

      expect(reader.getCurrentLocation()?.spineIndex).toBe(2)
      expect(reader.getCurrentLocation()?.blockId).toBe("text-3b")
      expect(container.scrollTop).toBeGreaterThan(900)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("uses section numbers for jumps in scroll mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()

    const lastPage = reader.getPaginationInfo().totalPages
    expect(lastPage).toBe(2)
    await reader.goToPage(lastPage)

    expect(reader.getPaginationInfo().currentPage).toBe(lastPage)
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(
      container.querySelector(
        'article[data-section-id="section-2"] canvas.epub-canvas-section'
      )
    ).toBeTruthy()
  })

  it("renders all sections into a continuous document in scroll mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1"
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2"
    }

    const book: Book = {
      metadata: {
        title: "Continuous Demo"
      },
      manifest: [],
      spine: [
        { idref: "item-1", href: firstSection.href, linear: true },
        { idref: "item-2", href: secondSection.href, linear: true }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    expect(container.querySelectorAll("[data-section-id]").length).toBe(2)
    expect(
      container.querySelector(
        'article[data-section-id="section-1"] canvas.epub-canvas-section'
      )
    ).toBeTruthy()
    expect(
      container.querySelector(
        'article[data-section-id="section-2"] canvas.epub-canvas-section'
      )
    ).toBeTruthy()
  })

  it("window-renders nearby sections in scroll mode instead of rendering the whole book body at once", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const sections: SectionDocument[] = Array.from(
      { length: 6 },
      (_, index) => ({
        ...createSection(),
        id: `section-${index + 1}`,
        href: `OPS/chapter-${index + 1}.xhtml`,
        title: `Chapter ${index + 1}`
      })
    )

    const book: Book = {
      metadata: {
        title: "Windowed Demo"
      },
      manifest: [],
      spine: sections.map((section, index) => ({
        idref: `item-${index + 1}`,
        href: section.href,
        linear: true
      })),
      toc: [],
      sections
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    expect(container.querySelectorAll("[data-section-id]").length).toBe(6)
    expect(
      container.querySelectorAll(".epub-section-header h2").length
    ).toBeLessThan(6)
    expect(
      container.querySelectorAll(".epub-section-virtual").length
    ).toBeGreaterThan(0)
  })

  it("renders long scroll sections into viewport-sized canvas slices and preloads adjacent slices", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 80 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to keep the section much taller than the viewport. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Sliced Scroll Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    const wrapper = container.querySelector<HTMLElement>(
      'article[data-section-id="section-1"]'
    )
    const canvases =
      wrapper?.querySelectorAll<HTMLCanvasElement>(
        "canvas.epub-canvas-section"
      ) ?? []
    const canvas = canvases[0]
    const wrapperHeight = Number.parseFloat(wrapper?.style.height ?? "0")
    const canvasHeight = Number.parseFloat(canvas?.style.height ?? "0")

    expect(wrapperHeight).toBeGreaterThan(container.clientHeight * 2)
    expect(canvases.length).toBeGreaterThan(1)
    expect(canvasHeight).toBeGreaterThan(0)
    expect(canvasHeight).toBeLessThan(wrapperHeight)
    expect(reader.getRenderMetrics().totalCanvasHeight).toBeGreaterThan(
      canvasHeight
    )
    expect(reader.getRenderMetrics().totalCanvasHeight).toBeLessThan(
      wrapperHeight
    )
  })

  it("refreshes the rendered slice while scrolling within the same long section", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 100 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to keep the section much taller than the viewport. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Slice Refresh Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
      syncPositionFromScroll(emitEvent: boolean): boolean
      refreshScrollSlicesIfNeeded(): boolean
    }
    state.book = book
    await reader.render()

    const beforeTops = Array.from(
      container.querySelectorAll<HTMLCanvasElement>(
        "canvas.epub-canvas-section"
      )
    ).map((canvas) => Number.parseFloat(canvas.style.top ?? "0"))
    const beforeMaxTop = Math.max(...beforeTops)

    container.scrollTop = 520
    state.syncPositionFromScroll(false)
    const refreshed = state.refreshScrollSlicesIfNeeded()

    const afterTops = Array.from(
      container.querySelectorAll<HTMLCanvasElement>(
        "canvas.epub-canvas-section"
      )
    ).map((canvas) => Number.parseFloat(canvas.style.top ?? "0"))
    const afterMaxTop = Math.max(...afterTops)

    expect(refreshed).toBe(true)
    expect(afterMaxTop).toBeGreaterThan(beforeMaxTop)
  })

  it("reuses existing canvas elements when scroll slice windows refresh", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 100 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to keep the section much taller than the viewport. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Slice Reuse Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
      syncPositionFromScroll(emitEvent: boolean): boolean
      refreshScrollSlicesIfNeeded(): boolean
    }
    state.book = book
    await reader.render()

    const beforeCanvases = Array.from(
      container.querySelectorAll<HTMLCanvasElement>(
        "canvas.epub-canvas-section"
      )
    )
    const beforeCanvasByIndex = new Map(
      beforeCanvases.map((canvas) => [canvas.dataset.sliceIndex ?? "", canvas])
    )

    container.scrollTop = 520
    state.syncPositionFromScroll(false)
    const refreshed = state.refreshScrollSlicesIfNeeded()

    const afterCanvases = Array.from(
      container.querySelectorAll<HTMLCanvasElement>(
        "canvas.epub-canvas-section"
      )
    )
    const reusedCount = afterCanvases.filter((canvas) => {
      const sliceIndex = canvas.dataset.sliceIndex ?? ""
      return beforeCanvasByIndex.get(sliceIndex) === canvas
    }).length

    expect(refreshed).toBe(true)
    expect(reusedCount).toBeGreaterThanOrEqual(beforeCanvases.length)
  })

  it("does not force scrollTop back while refreshing a slice during upward scrolling", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 100 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to keep the section much taller than the viewport. "
    }))
    const section: SectionDocument = {
      ...createSection(),
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Slice Upward Demo" },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: section.href,
          linear: true
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      book: Book
      syncPositionFromScroll(emitEvent: boolean): boolean
      refreshScrollSlicesIfNeeded(): boolean
    }
    state.book = book
    await reader.render()

    container.scrollTop = 900
    state.syncPositionFromScroll(false)
    state.refreshScrollSlicesIfNeeded()

    container.scrollTop = 300
    state.syncPositionFromScroll(false)
    const refreshed = state.refreshScrollSlicesIfNeeded()

    expect(refreshed).toBe(true)
    expect(container.scrollTop).toBe(300)
  })

  it("does not recentre the scroll window while the current section stays inside it", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 520
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const sections: SectionDocument[] = Array.from(
      { length: 4 },
      (_, index) => ({
        ...createSection(),
        id: `section-${index + 1}`,
        href: `OPS/chapter-${index + 1}.xhtml`,
        title: `Chapter ${index + 1}`
      })
    )

    const book: Book = {
      metadata: { title: "Stable Window Demo" },
      manifest: [],
      spine: sections.map((section, index) => ({
        idref: `item-${index + 1}`,
        href: section.href,
        linear: true
      })),
      toc: [],
      sections
    }

    const state = reader as unknown as {
      book: Book
      currentSectionIndex: number
      scrollWindowStart: number
      scrollWindowEnd: number
      refreshScrollWindowIfNeeded(): boolean
    }
    state.book = book
    state.currentSectionIndex = 1
    state.scrollWindowStart = 0
    state.scrollWindowEnd = 2

    const refreshed = state.refreshScrollWindowIfNeeded()

    expect(refreshed).toBe(false)
    expect(state.scrollWindowStart).toBe(0)
    expect(state.scrollWindowEnd).toBe(2)
    expect(container.scrollTop).toBe(520)
  })

  it("keeps the viewport anchored when the scroll window shifts across later chapters", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    const beforeOffsets = new Map<string, { top: number; height: number }>([
      ["section-1", { top: 0, height: 400 }],
      ["section-2", { top: 400, height: 400 }],
      ["section-3", { top: 800, height: 400 }],
      ["section-4", { top: 1200, height: 400 }],
      ["section-5", { top: 1600, height: 400 }],
      ["section-6", { top: 2000, height: 400 }]
    ])
    const afterOffsets = new Map<string, { top: number; height: number }>([
      ["section-1", { top: 0, height: 2000 }],
      ["section-2", { top: 2000, height: 400 }],
      ["section-3", { top: 2400, height: 400 }],
      ["section-4", { top: 2800, height: 400 }],
      ["section-5", { top: 3200, height: 400 }],
      ["section-6", { top: 3600, height: 400 }]
    ])
    let currentOffsets = beforeOffsets

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return currentOffsets.get(sectionId)?.top ?? 0
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return currentOffsets.get(sectionId)?.height ?? 0
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 260
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 180
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 0
      })
      document.body.appendChild(container)

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const sections: SectionDocument[] = Array.from(
        { length: 6 },
        (_, index) => ({
          ...createSection(),
          id: `section-${index + 1}`,
          href: `OPS/chapter-${index + 1}.xhtml`,
          title: `Chapter ${index + 1}`
        })
      )

      const book: Book = {
        metadata: { title: "Window Anchor Demo" },
        manifest: [],
        spine: sections.map((section, index) => ({
          idref: `item-${index + 1}`,
          href: section.href,
          linear: true
        })),
        toc: [],
        sections
      }

      const state = reader as unknown as {
        book: Book
        locator: { spineIndex: number; progressInSection: number }
        currentSectionIndex: number
        scrollWindowStart: number
        scrollWindowEnd: number
        renderScrollableCanvas: (renderVersion: number) => void
        syncPositionFromScroll: (emitEvent: boolean) => boolean
        refreshScrollWindowIfNeeded: () => boolean
      }
      state.book = book
      state.currentSectionIndex = 3
      state.locator = {
        spineIndex: 3,
        progressInSection: 0
      }

      await reader.render()

      container.scrollTop = 1700
      state.currentSectionIndex = 4
      state.locator = {
        spineIndex: 4,
        progressInSection: 0
      }
      state.scrollWindowStart = 1
      state.scrollWindowEnd = 3

      const originalRenderScrollableCanvas =
        state.renderScrollableCanvas.bind(reader)
      state.renderScrollableCanvas = (renderVersion: number) => {
        currentOffsets = afterOffsets
        originalRenderScrollableCanvas(renderVersion)
      }

      const refreshed = state.refreshScrollWindowIfNeeded()

      expect(refreshed).toBe(true)
      expect(container.scrollTop).toBe(3300)
      expect(reader.getCurrentLocation()?.spineIndex).toBe(4)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("moves by section with next and prev in scroll mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()

    expect(reader.getPaginationInfo().currentPage).toBe(1)
    await reader.next()
    expect(reader.getPaginationInfo().currentPage).toBe(2)
    await reader.prev()
    expect(reader.getPaginationInfo().currentPage).toBe(1)
  })

  it("keeps the current section stable after typography changes in scroll mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }

    const book: Book = {
      metadata: {
        title: "Paged Demo"
      },
      manifest: [],
      spine: [
        {
          idref: "item-1",
          href: firstSection.href,
          linear: true
        },
        {
          idref: "item-2",
          href: secondSection.href,
          linear: true
        }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    const state = reader as unknown as {
      book: Book
    }
    state.book = book

    await reader.render()
    await reader.goToPage(2)

    const before = reader.getPaginationInfo()
    expect(before).toEqual({
      currentPage: 2,
      totalPages: 2
    })

    await reader.setTypography({ fontSize: 24 })

    const after = reader.getPaginationInfo()
    expect(after).toEqual(before)
  })

  it("updates current section when scroll position changes in scroll mode", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 260
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 180
    })
    document.body.appendChild(container)

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    const repeatedText = Array.from({ length: 24 }, () => ({
      kind: "text" as const,
      text: "This is a long paragraph designed to spill across multiple pages. "
    }))
    const firstSection: SectionDocument = {
      ...createSection(),
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [{ id: "text-1", kind: "text", inlines: repeatedText }]
    }
    const secondSection: SectionDocument = {
      ...createSection(),
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [{ id: "text-2", kind: "text", inlines: repeatedText }]
    }

    const book: Book = {
      metadata: { title: "Paged Demo" },
      manifest: [],
      spine: [
        { idref: "item-1", href: firstSection.href, linear: true },
        { idref: "item-2", href: secondSection.href, linear: true }
      ],
      toc: [],
      sections: [firstSection, secondSection]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()

    const sectionElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-section-id]")
    )
    Object.defineProperty(sectionElements[0]!, "offsetTop", {
      configurable: true,
      value: 0
    })
    Object.defineProperty(sectionElements[0]!, "offsetHeight", {
      configurable: true,
      value: 360
    })
    Object.defineProperty(sectionElements[1]!, "offsetTop", {
      configurable: true,
      value: 360
    })
    Object.defineProperty(sectionElements[1]!, "offsetHeight", {
      configurable: true,
      value: 360
    })

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 420
    })
    ;(
      reader as unknown as {
        syncPositionFromScroll(emitEvent: boolean): boolean
      }
    ).syncPositionFromScroll(true)

    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(reader.getPaginationInfo().currentPage).toBe(2)
  })

  it("preserves the current scroll section during passive rerenders in scroll mode", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 0
          }
          if (sectionId === "section-2") {
            return 360
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1" || sectionId === "section-2") {
            return 360
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 260
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 180
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 0
      })
      document.body.appendChild(container)

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const repeatedText = Array.from({ length: 24 }, () => ({
        kind: "text" as const,
        text: "This is a long paragraph designed to spill across multiple pages. "
      }))
      const firstSection: SectionDocument = {
        ...createSection(),
        id: "section-1",
        href: "OPS/chapter-1.xhtml",
        title: "Chapter 1",
        blocks: [{ id: "text-1", kind: "text", inlines: repeatedText }]
      }
      const secondSection: SectionDocument = {
        ...createSection(),
        id: "section-2",
        href: "OPS/chapter-2.xhtml",
        title: "Chapter 2",
        blocks: [{ id: "text-2", kind: "text", inlines: repeatedText }]
      }

      const book: Book = {
        metadata: { title: "Scroll Preserve Demo" },
        manifest: [],
        spine: [
          { idref: "item-1", href: firstSection.href, linear: true },
          { idref: "item-2", href: secondSection.href, linear: true }
        ],
        toc: [],
        sections: [firstSection, secondSection]
      }

      ;(reader as unknown as { book: Book }).book = book
      await reader.render()

      container.scrollTop = 420
      await reader.setTheme({
        background: "#f7f1e3"
      })

      expect(container.scrollTop).toBe(420)
      expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("captures scroll anchors from the actual scroll position instead of a stale current section", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 0
          }
          if (sectionId === "section-2") {
            return 360
          }
          if (sectionId === "section-3") {
            return 720
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (
            sectionId === "section-1" ||
            sectionId === "section-2" ||
            sectionId === "section-3"
          ) {
            return 360
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 260
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 180
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 540
      })
      document.body.appendChild(container)

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const repeatedText = Array.from({ length: 16 }, () => ({
        kind: "text" as const,
        text: "This is a long paragraph designed to spill across multiple pages. "
      }))
      const sections: SectionDocument[] = Array.from(
        { length: 3 },
        (_, index) => ({
          ...createSection(),
          id: `section-${index + 1}`,
          href: `OPS/chapter-${index + 1}.xhtml`,
          title: `Chapter ${index + 1}`,
          blocks: [
            { id: `text-${index + 1}`, kind: "text", inlines: repeatedText }
          ]
        })
      )

      const book: Book = {
        metadata: { title: "Scroll Anchor Demo" },
        manifest: [],
        spine: sections.map((section, index) => ({
          idref: `item-${index + 1}`,
          href: section.href,
          linear: true
        })),
        toc: [],
        sections
      }

      ;(
        reader as unknown as {
          book: Book
          currentSectionIndex: number
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).book = book
      await reader.render()
      container.scrollTop = 540
      ;(
        reader as unknown as {
          currentSectionIndex: number
        }
      ).currentSectionIndex = 0

      const anchor = (
        reader as unknown as {
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).captureScrollAnchor()

      expect(anchor.sectionId).toBe("section-2")
      expect(anchor.offsetWithinSection).toBe(180)
      expect(anchor.fallbackScrollTop).toBe(540)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("prefers rendered section geometry over stale global section estimates when capturing scroll anchors", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 0
          }
          if (sectionId === "section-2") {
            return 420
          }
          if (sectionId === "section-3") {
            return 980
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 420
          }
          if (sectionId === "section-2") {
            return 560
          }
          if (sectionId === "section-3") {
            return 560
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 260
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 180
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 700
      })
      document.body.appendChild(container)

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const repeatedText = Array.from({ length: 12 }, () => ({
        kind: "text" as const,
        text: "This is a long paragraph designed to spill across multiple pages. "
      }))
      const sections: SectionDocument[] = Array.from(
        { length: 3 },
        (_, index) => ({
          ...createSection(),
          id: `section-${index + 1}`,
          href: `OPS/chapter-${index + 1}.xhtml`,
          title: `Chapter ${index + 1}`,
          blocks: [
            { id: `text-${index + 1}`, kind: "text", inlines: repeatedText }
          ]
        })
      )

      const book: Book = {
        metadata: { title: "Rendered Geometry Demo" },
        manifest: [],
        spine: sections.map((section, index) => ({
          idref: `item-${index + 1}`,
          href: section.href,
          linear: true
        })),
        toc: [],
        sections
      }

      ;(
        reader as unknown as {
          book: Book
          sectionEstimatedHeights: number[]
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).book = book
      ;(
        reader as unknown as {
          sectionEstimatedHeights: number[]
        }
      ).sectionEstimatedHeights = [1200, 120, 120]
      await reader.render()
      container.scrollTop = 700

      const anchor = (
        reader as unknown as {
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).captureScrollAnchor()

      expect(anchor.sectionId).toBe("section-2")
      expect(anchor.offsetWithinSection).toBe(280)
      expect(anchor.fallbackScrollTop).toBe(700)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("uses rendered wrapper geometry when syncing scroll position across padded dom image pages", () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 215
          }
          if (sectionId === "section-2") {
            return 897
          }
          if (sectionId === "section-3") {
            return 1556
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 682
          }
          if (sectionId === "section-2") {
            return 659
          }
          if (sectionId === "section-3") {
            return 2142
          }
          const parentSectionId = this.parentElement?.dataset?.sectionId
          if (
            parentSectionId === "section-1" ||
            parentSectionId === "section-2"
          ) {
            return parentSectionId === "section-1" ? 682 : 659
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() {
          const parentSectionId = this.parentElement?.dataset?.sectionId
          if (
            parentSectionId === "section-1" ||
            parentSectionId === "section-2"
          ) {
            return parentSectionId === "section-1" ? 682 : 659
          }
          return originalScrollHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 320
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 473
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 1197
      })
      document.body.appendChild(container)

      container.innerHTML = `
        <article data-section-id="section-1" class="epub-section epub-section-dom">
          <div class="epub-dom-section epub-dom-section-cover"></div>
        </article>
        <article data-section-id="section-2" class="epub-section epub-section-dom">
          <div class="epub-dom-section epub-dom-section-image-page"></div>
        </article>
        <article data-section-id="section-3" class="epub-section epub-section-canvas"></article>
      `

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      ;(
        reader as unknown as {
          book: Book
          currentSectionIndex: number
          locator: { spineIndex: number; progressInSection: number } | null
          syncPositionFromScroll(emitEvent: boolean): boolean
        }
      ).book = {
        metadata: { title: "Padded DOM Image Page" },
        manifest: [],
        spine: [
          { idref: "item-1", href: "OPS/cover.xhtml", linear: true },
          { idref: "item-2", href: "OPS/title.xhtml", linear: true },
          { idref: "item-3", href: "OPS/chapter.xhtml", linear: true }
        ],
        toc: [],
        sections: [
          {
            id: "section-1",
            href: "OPS/cover.xhtml",
            presentationRole: "cover",
            anchors: {},
            blocks: []
          },
          {
            id: "section-2",
            href: "OPS/title.xhtml",
            presentationRole: "image-page",
            anchors: {},
            blocks: []
          },
          {
            id: "section-3",
            href: "OPS/chapter.xhtml",
            anchors: {},
            blocks: []
          }
        ]
      }

      const state = reader as unknown as {
        currentSectionIndex: number
        locator: { spineIndex: number; progressInSection: number } | null
        syncPositionFromScroll(emitEvent: boolean): boolean
      }

      state.syncPositionFromScroll(false)

      expect(state.currentSectionIndex).toBe(1)
      expect(state.locator?.spineIndex).toBe(1)
      expect(state.locator?.progressInSection).toBeGreaterThan(0.8)
      expect(state.locator?.progressInSection).toBeLessThan(0.82)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollHeight",
          originalScrollHeight
        )
      }
    }
  })

  it("ignores virtual section placeholders when capturing preserve anchors", () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId === "section-1") {
            return 0
          }
          if (sectionId === "section-2") {
            return 360
          }
          if (sectionId === "section-3") {
            return 720
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (
            sectionId === "section-1" ||
            sectionId === "section-2" ||
            sectionId === "section-3"
          ) {
            return 360
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 780
      })

      for (let index = 1; index <= 3; index += 1) {
        const wrapper = document.createElement("article")
        wrapper.className = "epub-section epub-section-virtual"
        wrapper.dataset.sectionId = `section-${index}`
        container.appendChild(wrapper)
      }

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      const sections: SectionDocument[] = Array.from(
        { length: 3 },
        (_, index) => ({
          ...createSection(),
          id: `section-${index + 1}`,
          href: `OPS/chapter-${index + 1}.xhtml`,
          title: `Chapter ${index + 1}`
        })
      )

      ;(
        reader as unknown as {
          book: Book
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).book = {
        metadata: { title: "Virtual Placeholder Demo" },
        manifest: [],
        spine: sections.map((section, index) => ({
          idref: `item-${index + 1}`,
          href: section.href,
          linear: true
        })),
        toc: [],
        sections
      }

      const anchor = (
        reader as unknown as {
          captureScrollAnchor(): {
            sectionId: string
            offsetWithinSection: number
            fallbackScrollTop: number
          }
        }
      ).captureScrollAnchor()

      expect(anchor.sectionId).toBe("")
      expect(anchor.offsetWithinSection).toBe(0)
      expect(anchor.fallbackScrollTop).toBe(780)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
    }
  })

  it("preserves scroll offsets when refreshing scroll slices", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 28207
    })
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 18
    })

    const reader = new EpubReader({
      container,
      mode: "scroll"
    })

    ;(
      reader as unknown as {
        renderScrollableCanvas(renderVersion: number): void
        renderVersion: number
        rerenderScrollSlicesPreservingScrollTop(): void
      }
    ).renderScrollableCanvas = () => {
      container.scrollTop = 0
      container.scrollLeft = 0
    }
    ;(
      reader as unknown as {
        rerenderScrollSlicesPreservingScrollTop(): void
      }
    ).rerenderScrollSlicesPreservingScrollTop()

    expect(container.scrollTop).toBe(28207)
    expect(container.scrollLeft).toBe(18)
  })

  it("restores the same anchored position when refreshing a dom image-page slice", () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight"
    )

    const sectionMetrics = new Map<string, { top: number; height: number }>([
      ["section-1", { top: 0, height: 180 }],
      ["section-2", { top: 180, height: 960 }]
    ])

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return sectionMetrics.get(sectionId)?.top ?? 0
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return sectionMetrics.get(sectionId)?.height ?? 0
          }
          const parentSectionId = this.parentElement?.dataset?.sectionId
          if (parentSectionId && this.classList.contains("epub-dom-section")) {
            return sectionMetrics.get(parentSectionId)?.height ?? 0
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() {
          const parentSectionId = this.parentElement?.dataset?.sectionId
          if (parentSectionId && this.classList.contains("epub-dom-section")) {
            return sectionMetrics.get(parentSectionId)?.height ?? 0
          }
          return originalScrollHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 260
      })
      Object.defineProperty(container, "scrollLeft", {
        configurable: true,
        writable: true,
        value: 12
      })
      document.body.appendChild(container)

      container.innerHTML = `
        <article data-section-id="section-1" class="epub-section epub-section-canvas"></article>
        <article data-section-id="section-2" class="epub-section epub-section-dom">
          <div class="epub-dom-section"></div>
        </article>
      `

      const reader = new EpubReader({
        container,
        mode: "scroll"
      })

      ;(
        reader as unknown as {
          book: Book
          renderScrollableCanvas(renderVersion: number): void
          renderVersion: number
          rerenderScrollSlicesPreservingScrollTop(): void
        }
      ).book = {
        metadata: { title: "Anchored DOM Image Page" },
        manifest: [],
        spine: [
          { idref: "item-1", href: "OPS/one.xhtml", linear: true },
          { idref: "item-2", href: "OPS/two.xhtml", linear: true }
        ],
        toc: [],
        sections: [
          {
            id: "section-1",
            href: "OPS/one.xhtml",
            anchors: {},
            blocks: []
          },
          {
            id: "section-2",
            href: "OPS/two.xhtml",
            presentationRole: "image-page",
            anchors: {},
            blocks: []
          }
        ]
      }
      ;(
        reader as unknown as {
          renderScrollableCanvas(renderVersion: number): void
          renderVersion: number
        }
      ).renderScrollableCanvas = () => {
        sectionMetrics.set("section-1", { top: 0, height: 220 })
        sectionMetrics.set("section-2", { top: 220, height: 960 })
        container.scrollTop = 0
        container.scrollLeft = 0
      }
      ;(
        reader as unknown as {
          rerenderScrollSlicesPreservingScrollTop(): void
        }
      ).rerenderScrollSlicesPreservingScrollTop()

      expect(container.scrollTop).toBe(300)
      expect(container.scrollLeft).toBe(12)
    } finally {
      if (originalOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          originalOffsetTop
        )
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight
        )
      }
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollHeight",
          originalScrollHeight
        )
      }
    }
  })
})

function collectRenderedLineText(block: LayoutPretextBlock): string {
  return block.lines
    .flatMap((line) => line.fragments)
    .map((fragment) => fragment.text)
    .join("")
}
