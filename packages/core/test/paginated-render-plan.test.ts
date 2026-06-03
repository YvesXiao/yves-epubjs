import { describe, expect, it } from "vitest"
import type {
  LayoutPretextBlock,
  LayoutResult
} from "../src/layout/layout-engine"
import type { Locator, SectionDocument } from "../src/model/types"
import type { SectionDisplayList } from "../src/renderer/draw-ops"
import {
  buildPageDisplayList,
  buildPaginatedPages,
  type ReaderPage
} from "../src/runtime/paginated-render-plan"

describe("paginated render plan", () => {
  it("splits pretext content into multiple pages and updates section height", () => {
    const section = createSection("section-1", "OPS/one.xhtml")
    const layout = createLayout([
      {
        type: "pretext",
        id: "text-1",
        kind: "text",
        lineHeight: 20,
        textAlign: "start",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        lines: [
          { width: 100, height: 40, fragments: [] },
          { width: 100, height: 40, fragments: [] },
          { width: 100, height: 40, fragments: [] }
        ],
        estimatedHeight: 120
      } satisfies LayoutPretextBlock
    ])

    const plan = buildPaginatedPages({
      sections: [section],
      currentSectionIndex: 0,
      sectionLayout: layout,
      pageHeight: 80,
      getSectionLayout: () => layout
    })

    expect(plan.pages).toHaveLength(2)
    expect(plan.pages[0]?.blocks).toHaveLength(1)
    expect(plan.pages[1]?.blocks).toHaveLength(1)
    expect(plan.pages[0]?.pageNumberInSection).toBe(1)
    expect(plan.pages[1]?.pageNumberInSection).toBe(2)
    expect(plan.pages[0]?.totalPagesInSection).toBe(2)
    expect(plan.pages[1]?.totalPagesInSection).toBe(2)
    expect(plan.sectionEstimatedHeights).toEqual([160])
  })

  it("builds page display lists with page-relative progress locators", () => {
    const section = createSection("section-1", "OPS/one.xhtml")
    const page: ReaderPage = {
      pageNumber: 2,
      pageNumberInSection: 2,
      totalPagesInSection: 3,
      spineIndex: 0,
      sectionId: section.id,
      sectionHref: section.href,
      blocks: [
        {
          type: "native",
          block: {
            id: "block-1",
            kind: "image",
            src: "OPS/image.png"
          }
        }
      ]
    }

    const calls: Array<{
      blocks: Array<{ id: string }>
      locatorMap: Map<string, Locator>
    }> = []

    const displayList = buildPageDisplayList({
      page,
      section,
      width: 640,
      viewportHeight: 720,
      theme: {
        background: "#fff",
        color: "#111"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      highlightedBlockIds: new Set<string>(),
      underlinedBlockIds: new Set<string>(),
      activeBlockId: undefined,
      resolveImageLoaded: () => true,
      resolveImageUrl: (src) => src,
      estimateBlockHeight: () => 180,
      buildSectionDisplayList: (input) => {
        calls.push({
          blocks: input.blocks.map((block) => ({ id: block.id })),
          locatorMap: input.locatorMap
        })
        return {
          sectionId: input.section.id,
          sectionHref: input.section.href,
          width: input.width,
          height: 180,
          ops: [],
          interactions: []
        } satisfies SectionDisplayList
      }
    })

    expect(displayList.height).toBe(180)
    expect(calls[0]?.blocks).toEqual([{ id: "block-1" }])
    expect(calls[0]?.locatorMap.get("block-1")).toEqual({
      spineIndex: 0,
      blockId: "block-1",
      progressInSection: 0.5
    })
  })

  it("removes repeated top padding from continuation pages of sliced pretext blocks", () => {
    const section = createSection("section-1", "OPS/one.xhtml")
    const block = {
      type: "pretext",
      id: "text-1",
      kind: "text",
      lineHeight: 20,
      textAlign: "start",
      paddingTop: 20,
      paddingBottom: 10,
      paddingLeft: 0,
      paddingRight: 0,
      lines: [
        { width: 100, height: 40, fragments: [] },
        { width: 100, height: 40, fragments: [] },
        { width: 100, height: 40, fragments: [] }
      ],
      estimatedHeight: 150
    } satisfies LayoutPretextBlock
    const layout = createLayout([block])

    const plan = buildPaginatedPages({
      sections: [section],
      currentSectionIndex: 0,
      sectionLayout: layout,
      pageHeight: 100,
      getSectionLayout: () => layout
    })

    expect(plan.pages).toHaveLength(2)

    const firstPageCalls: Array<LayoutPretextBlock> = []
    buildPageDisplayList({
      page: plan.pages[0]!,
      section,
      width: 640,
      viewportHeight: 720,
      theme: {
        background: "#fff",
        color: "#111"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      highlightedBlockIds: new Set<string>(),
      underlinedBlockIds: new Set<string>(),
      activeBlockId: undefined,
      resolveImageLoaded: () => true,
      resolveImageUrl: (src) => src,
      estimateBlockHeight: () => 180,
      buildSectionDisplayList: (input) => {
        firstPageCalls.push(input.blocks[0] as LayoutPretextBlock)
        return {
          sectionId: input.section.id,
          sectionHref: input.section.href,
          width: input.width,
          height: 180,
          ops: [],
          interactions: []
        } satisfies SectionDisplayList
      }
    })

    const secondPageCalls: Array<LayoutPretextBlock> = []
    buildPageDisplayList({
      page: plan.pages[1]!,
      section,
      width: 640,
      viewportHeight: 720,
      theme: {
        background: "#fff",
        color: "#111"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      highlightedBlockIds: new Set<string>(),
      underlinedBlockIds: new Set<string>(),
      activeBlockId: undefined,
      resolveImageLoaded: () => true,
      resolveImageUrl: (src) => src,
      estimateBlockHeight: () => 180,
      buildSectionDisplayList: (input) => {
        secondPageCalls.push(input.blocks[0] as LayoutPretextBlock)
        return {
          sectionId: input.section.id,
          sectionHref: input.section.href,
          width: input.width,
          height: 180,
          ops: [],
          interactions: []
        } satisfies SectionDisplayList
      }
    })

    expect(firstPageCalls[0]).toMatchObject({
      paddingTop: 20,
      paddingBottom: 0,
      estimatedHeight: 100
    })
    expect(firstPageCalls[0]?.lines).toHaveLength(2)
    expect(secondPageCalls[0]).toMatchObject({
      paddingTop: 0,
      paddingBottom: 10,
      estimatedHeight: 50
    })
    expect(secondPageCalls[0]?.lines).toHaveLength(1)
  })

  it("moves image-bearing pretext lines to the next page when the remaining space is too small", () => {
    const section = createSection("section-1", "OPS/one.xhtml")
    const introBlock = {
      type: "pretext",
      id: "text-1",
      kind: "text",
      lineHeight: 20,
      textAlign: "start",
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      lines: [{ width: 100, height: 60, fragments: [] }],
      estimatedHeight: 60
    } satisfies LayoutPretextBlock
    const imageBlock = {
      type: "pretext",
      id: "text-2",
      kind: "text",
      lineHeight: 20,
      textAlign: "center",
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      lines: [
        {
          width: 80,
          height: 70,
          fragments: [
            {
              text: "",
              font: '400 18px "Iowan Old Style", serif',
              gapBefore: 0,
              image: {
                src: "OPS/image.png",
                width: 80,
                height: 70,
                marginLeft: 0,
                marginRight: 0
              }
            }
          ]
        },
        {
          width: 100,
          height: 20,
          fragments: [
            {
              text: "Caption",
              font: '400 18px "Iowan Old Style", serif',
              gapBefore: 0
            }
          ]
        }
      ],
      estimatedHeight: 90
    } satisfies LayoutPretextBlock
    const layout = createLayout([introBlock, imageBlock])

    const plan = buildPaginatedPages({
      sections: [section],
      currentSectionIndex: 0,
      sectionLayout: layout,
      pageHeight: 100,
      getSectionLayout: () => layout
    })

    expect(plan.pages).toHaveLength(2)
    expect(plan.pages[0]?.blocks).toHaveLength(1)
    expect(plan.pages[0]?.blocks[0]).toMatchObject({
      type: "pretext",
      block: {
        id: "text-1"
      }
    })
    expect(plan.pages[1]?.blocks).toHaveLength(1)
    expect(plan.pages[1]?.blocks[0]).toMatchObject({
      type: "pretext",
      block: {
        id: "text-2"
      },
      lineStart: 0,
      lineEnd: 2
    })
  })
})

function createSection(id: string, href: string): SectionDocument {
  return {
    id,
    href,
    blocks: [],
    anchors: {}
  }
}

function createLayout(blocks: LayoutResult["blocks"]): LayoutResult {
  return {
    mode: "paginated",
    width: 640,
    blocks,
    locatorMap: new Map([
      [
        blocks[0]!.id,
        {
          spineIndex: 0,
          blockId: blocks[0]!.id,
          progressInSection: 0
        }
      ]
    ])
  }
}
