import { describe, expect, it } from "vitest"
import type { SectionDocument } from "../src/model/types"
import type {
  InteractionRegion,
  SectionDisplayList
} from "../src/renderer/draw-ops"
import { ReaderScrollPositionService } from "../src/runtime/reader-scroll-position-service"

describe("ReaderScrollPositionService", () => {
  it("captures and resolves scroll anchors against rendered sections", () => {
    const service = new ReaderScrollPositionService()
    const container = document.createElement("div")
    setScrollTop(container, 260)
    container.append(
      createArticle("section-1", 0, 200),
      createArticle("section-2", 200, 400)
    )

    const anchor = service.captureScrollAnchor({ container })

    expect(anchor).toEqual({
      sectionId: "section-2",
      offsetWithinSection: 60,
      fallbackScrollTop: 260
    })
    expect(
      service.resolveScrollTopForAnchor({
        anchor,
        currentScrollTop: 0,
        getSectionTop: (sectionId) => (sectionId === "section-2" ? 500 : 0)
      })
    ).toBe(560)
  })

  it("finds sections by rendered offsets and estimated heights", () => {
    const service = new ReaderScrollPositionService()
    const container = document.createElement("div")
    container.append(
      createArticle("section-1", 0, 200),
      createArticle("section-2", 250, 300)
    )
    const sections = createSections()

    expect(
      service.findSectionIndexForOffset({
        container,
        sections,
        offset: 220,
        getSectionHeight: () => 1000
      })
    ).toBe(0)
    expect(
      service.findSectionIndexForOffset({
        container: document.createElement("div"),
        sections,
        offset: 1200,
        getSectionHeight: (sectionId) =>
          sectionId === "section-1" ? 1000 : 500
      })
    ).toBe(1)
  })

  it("finds the current section when the viewport lands on a virtual placeholder", () => {
    const service = new ReaderScrollPositionService()
    const container = document.createElement("div")
    container.append(
      createArticle("section-1", 0, 300),
      createArticle("section-2", 300, 900, "epub-section-virtual"),
      createArticle("section-3", 1200, 300)
    )
    const sections = [
      ...createSections(),
      { id: "section-3", href: "section-3.xhtml", anchors: {}, blocks: [] }
    ]

    expect(
      service.findSectionIndexForOffset({
        container,
        sections,
        offset: 640,
        getSectionHeight: () => 1000
      })
    ).toBe(1)
  })

  it("resolves scroll windows and offsets visible render geometry", () => {
    const service = new ReaderScrollPositionService()
    const sections = [
      {
        sectionId: "section-2",
        interactions: [createInteraction(8)]
      }
    ]
    const displayList = createDisplayList()

    expect(
      service.resolveScrollWindowBounds({
        currentSectionIndex: 3,
        sectionCount: 8,
        radius: 2
      })
    ).toEqual({ start: 1, end: 5 })
    expect(
      service.shouldRefreshScrollWindow({
        currentSectionIndex: 3,
        sectionCount: 8,
        radius: 2,
        scrollWindowStart: 1,
        scrollWindowEnd: 5
      })
    ).toBeNull()
    expect(
      service.offsetInteractionRegionsForScroll({
        sections,
        getSectionTop: () => 100
      })[0]?.rect.y
    ).toBe(108)
    expect(
      service.collectVisibleBoundsForScroll({
        sectionsToRender: [
          {
            sectionId: "section-2",
            displayList,
            renderWindows: [{ top: 20, height: 80 }]
          }
        ],
        getSectionTop: () => 100
      })
    ).toEqual([{ x: 0, y: 130, width: 20, height: 10 }])
  })
})

function createSections(): SectionDocument[] {
  return [
    { id: "section-1", href: "section-1.xhtml", anchors: {}, blocks: [] },
    { id: "section-2", href: "section-2.xhtml", anchors: {}, blocks: [] }
  ]
}

function createArticle(
  sectionId: string,
  offsetTop: number,
  offsetHeight: number,
  className = ""
): HTMLElement {
  const article = document.createElement("article")
  article.dataset.sectionId = sectionId
  article.className = className
  Object.defineProperty(article, "offsetTop", {
    configurable: true,
    value: offsetTop
  })
  Object.defineProperty(article, "offsetHeight", {
    configurable: true,
    value: offsetHeight
  })
  return article
}

function setScrollTop(element: HTMLElement, value: number): void {
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    writable: true,
    value
  })
}

function createInteraction(y: number): InteractionRegion {
  return {
    kind: "block",
    rect: { x: 0, y, width: 10, height: 10 },
    sectionId: "section-2",
    blockId: "block-1",
    locator: undefined,
    text: undefined
  }
}

function createDisplayList(): SectionDisplayList {
  return {
    sectionId: "section-2",
    sectionHref: "section-2.xhtml",
    width: 100,
    height: 200,
    interactions: [],
    ops: [
      {
        kind: "rect",
        sectionId: "section-2",
        sectionHref: "section-2.xhtml",
        blockId: "block-1",
        locator: undefined,
        rect: { x: 0, y: 30, width: 20, height: 10 },
        color: "#000"
      },
      {
        kind: "rect",
        sectionId: "section-2",
        sectionHref: "section-2.xhtml",
        blockId: "block-2",
        locator: undefined,
        rect: { x: 0, y: 150, width: 20, height: 10 },
        color: "#000"
      }
    ]
  }
}
