import { describe, expect, it } from "vitest"
import type { SectionDocument } from "../src/model/types"
import {
  ReaderDomPaginationService,
  collectPaginatedDomReadableLineBands,
  measurePaginatedDomPageOffsets
} from "../src/runtime/reader-dom-pagination-service"
import type { ReaderPage } from "../src/runtime/paginated-render-plan"

describe("ReaderDomPaginationService", () => {
  it("positions a paginated dom section inside its viewport", () => {
    const service = new ReaderDomPaginationService()
    const viewport = document.createElement("div")
    viewport.dataset.pageViewport = "true"
    const sectionElement = document.createElement("section")
    viewport.appendChild(sectionElement)
    setElementBox(sectionElement, {
      top: 0,
      height: 640,
      scrollHeight: 640,
      offsetHeight: 640
    })
    const pages: ReaderPage[] = [
      createPage(1, 1, 0),
      createPage(2, 2, 320)
    ]

    service.positionPaginatedDomSection({
      sectionElement,
      page: pages[1]!,
      pageHeight: 320,
      pages
    })

    expect(viewport.style.height).toBe("320px")
    expect(sectionElement.style.transform).toBe("translateY(-320px)")
    expect(sectionElement.style.position).toBe("relative")
  })

  it("syncs measured dom pages from rendered block positions", () => {
    const service = new ReaderDomPaginationService()
    const section = createSection()
    const container = document.createElement("div")
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    sectionElement.dataset.sectionId = section.id
    container.appendChild(sectionElement)
    setElementBox(sectionElement, {
      top: 0,
      height: 900,
      scrollHeight: 900,
      offsetHeight: 900
    })

    const first = document.createElement("p")
    first.dataset.readerBlockId = "text-1"
    first.textContent = "First"
    setElementBox(first, { top: 20, height: 20 })
    const second = document.createElement("p")
    second.dataset.readerBlockId = "text-2"
    second.textContent = "Second"
    setElementBox(second, { top: 650, height: 20 })
    sectionElement.append(first, second)

    const result = service.syncMeasuredPaginatedDomPages({
      container,
      section,
      currentSectionIndex: 0,
      currentPageNumber: 1,
      pages: [createPage(1, 1, 0)],
      pageHeight: 300,
      locator: null
    })

    expect(result?.pages).toHaveLength(3)
    expect(result?.pages[0]?.blocks.map((slice) => slice.block.id)).toEqual([
      "text-1"
    ])
    expect(result?.pages[2]?.blocks.map((slice) => slice.block.id)).toEqual([
      "text-2"
    ])
    expect(result?.sectionEstimatedHeight).toBe(900)
  })

  it("syncs media-only dom pages from standalone wrapper positions", () => {
    const service = new ReaderDomPaginationService()
    const section = createSection()
    const container = document.createElement("div")
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    sectionElement.dataset.sectionId = section.id
    container.appendChild(sectionElement)
    setElementBox(sectionElement, {
      top: 0,
      height: 3340,
      scrollHeight: 3340,
      offsetHeight: 3340
    })

    for (const top of [0, 1112, 2224]) {
      const media = document.createElement("div")
      media.className = "image-single epub-dom-media-wrapper"
      setElementBox(media, { top, height: 1112 })
      const image = document.createElement("img")
      setElementBox(image, { top: top + 152, height: 809 })
      media.append(image)
      sectionElement.append(media)
    }

    const result = service.syncMeasuredPaginatedDomPages({
      container,
      section,
      currentSectionIndex: 0,
      currentPageNumber: 2,
      pages: [
        createPage(1, 1, 0),
        createPage(2, 2, 1068),
        createPage(3, 3, 2136)
      ],
      pageHeight: 1112,
      locator: null
    })

    expect(result?.pages.map((page) => page.offsetInSection)).toEqual([
      0,
      1112,
      2224
    ])
    expect(result?.resolvedPage?.offsetInSection).toBe(1112)
  })

  it("keeps the current page when measured dom page counts change", () => {
    const service = new ReaderDomPaginationService()
    const section = createSection()
    const container = document.createElement("div")
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    sectionElement.dataset.sectionId = section.id
    container.appendChild(sectionElement)
    setElementBox(sectionElement, {
      top: 0,
      height: 920,
      scrollHeight: 920,
      offsetHeight: 920
    })

    const first = document.createElement("p")
    first.dataset.readerBlockId = "text-1"
    first.textContent = "First"
    setElementBox(first, { top: 32, height: 24 })
    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 240, height: 360 })
    const image = document.createElement("img")
    setElementBox(image, { top: 240, height: 340 })
    media.append(image)
    const second = document.createElement("p")
    second.dataset.readerBlockId = "text-2"
    second.textContent = "Second"
    setElementBox(second, { top: 640, height: 24 })
    sectionElement.append(first, media, second)

    const result = service.syncMeasuredPaginatedDomPages({
      container,
      section,
      currentSectionIndex: 0,
      currentPageNumber: 2,
      pages: [createPage(1, 1, 0), createPage(2, 2, 500)],
      pageHeight: 500,
      locator: {
        spineIndex: 0,
        progressInSection: 1
      }
    })

    expect(result?.resolvedPage?.pageNumber).toBe(2)
    expect(result?.resolvedPage?.offsetInSection).toBe(240)
  })

  it("moves to a standalone media start when the previous page exposed it", () => {
    const service = new ReaderDomPaginationService()
    const section = createSection()
    const container = document.createElement("div")
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    sectionElement.dataset.sectionId = section.id
    container.appendChild(sectionElement)
    setElementBox(sectionElement, {
      top: 0,
      height: 1800,
      scrollHeight: 1800,
      offsetHeight: 1800
    })

    const first = document.createElement("p")
    first.dataset.readerBlockId = "text-1"
    first.textContent = "First"
    setElementBox(first, { top: 24, height: 24 })
    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 620, height: 760 })
    const image = document.createElement("img")
    setElementBox(image, { top: 620, height: 760 })
    media.append(image)
    const second = document.createElement("p")
    second.dataset.readerBlockId = "text-2"
    second.textContent = "Second"
    setElementBox(second, { top: 1440, height: 24 })
    sectionElement.append(first, media, second)

    const result = service.syncMeasuredPaginatedDomPages({
      container,
      section,
      currentSectionIndex: 0,
      currentPageNumber: 2,
      pages: [createPage(1, 1, 0), createPage(2, 2, 500)],
      pageHeight: 790,
      locator: {
        spineIndex: 0,
        progressInSection: 1
      }
    })

    expect(result?.resolvedPage?.offsetInSection).toBe(620)
  })

  it("does not count inline images as independent media bands", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 320,
      scrollHeight: 320,
      offsetHeight: 320
    })
    sectionElement.innerHTML = `
      <p>Alpha<a class="footnote" href="#note-1"><img id="note" src="note.png"></a>Omega</p>
      <p><img id="plate" src="plate.png"></p>
    `
    const note = sectionElement.querySelector<HTMLElement>("#note")!
    const plate = sectionElement.querySelector<HTMLElement>("#plate")!
    setElementBox(note, { top: 24, height: 16 })
    setElementBox(plate, { top: 140, height: 120 })

    expect(collectPaginatedDomReadableLineBands(sectionElement)).toEqual([
      {
        top: 140,
        bottom: 260
      }
    ])
  })

  it("does not create a trailing tiny page from section height remainder", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 862,
      scrollHeight: 862,
      offsetHeight: 862
    })

    expect(measurePaginatedDomPageOffsets(sectionElement, 430)).toEqual([
      0,
      430
    ])
  })

  it("starts near full page media wrappers on their own page", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 920,
      scrollHeight: 920,
      offsetHeight: 920
    })

    const intro = document.createElement("p")
    setElementBox(intro, { top: 32, height: 24 })
    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 240, height: 360 })
    const image = document.createElement("img")
    setElementBox(image, { top: 240, height: 340 })
    media.append(image)
    const next = document.createElement("p")
    setElementBox(next, { top: 640, height: 24 })
    sectionElement.append(intro, media, next)

    expect(measurePaginatedDomPageOffsets(sectionElement, 500)).toEqual([
      0,
      240,
      640
    ])
  })

  it("uses nested media rects when standalone wrappers do not expose a box", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 1240,
      scrollHeight: 1240,
      offsetHeight: 1240
    })

    const intro = document.createElement("p")
    setElementBox(intro, { top: 24, height: 24 })
    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 0, height: 0, width: 0 })
    const image = document.createElement("img")
    setElementBox(image, { top: 390, height: 720 })
    media.append(image)
    sectionElement.append(intro, media)

    expect(measurePaginatedDomPageOffsets(sectionElement, 790)).toEqual([
      0,
      390
    ])
  })

  it("ignores nested image offsets when standalone wrappers expose a box", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 1500,
      scrollHeight: 1500,
      offsetHeight: 1500
    })

    const intro = document.createElement("p")
    setElementBox(intro, { top: 24, height: 24 })
    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 240, height: 790 })
    const image = document.createElement("img")
    setElementBox(image, { top: 260, height: 751 })
    media.append(image)
    const next = document.createElement("p")
    setElementBox(next, { top: 1080, height: 24 })
    sectionElement.append(intro, media, next)

    expect(measurePaginatedDomPageOffsets(sectionElement, 790)).toEqual([
      0,
      240,
      1080
    ])
  })

  it("keeps consecutive standalone media starts as page offsets", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 1800,
      scrollHeight: 1800,
      offsetHeight: 1800
    })

    const first = document.createElement("div")
    first.className = "image-single epub-dom-media-wrapper"
    setElementBox(first, { top: 0, height: 620 })
    const firstImage = document.createElement("img")
    setElementBox(firstImage, { top: 0, height: 620 })
    first.append(firstImage)

    const second = document.createElement("div")
    second.className = "image-single epub-dom-media-wrapper"
    setElementBox(second, { top: 640, height: 620 })
    const secondImage = document.createElement("img")
    setElementBox(secondImage, { top: 640, height: 620 })
    second.append(secondImage)

    sectionElement.append(first, second)

    expect(measurePaginatedDomPageOffsets(sectionElement, 790)).toEqual([
      0,
      640
    ])
  })

  it("removes fallback offsets that land inside standalone media", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 1600,
      scrollHeight: 1600,
      offsetHeight: 1600
    })

    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 220, height: 900 })
    const image = document.createElement("img")
    setElementBox(image, { top: 220, height: 900 })
    media.append(image)
    sectionElement.append(media)

    expect(measurePaginatedDomPageOffsets(sectionElement, 500)).toEqual([
      0,
      220
    ])
  })

  it("starts following content after standalone media wrapper pages", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 760,
      scrollHeight: 760,
      offsetHeight: 760
    })

    const media = document.createElement("div")
    media.className = "image-single epub-dom-media-wrapper"
    setElementBox(media, { top: 240, height: 220 })
    const image = document.createElement("img")
    setElementBox(image, { top: 240, height: 220 })
    media.append(image)
    const next = document.createElement("p")
    setElementBox(next, { top: 640, height: 24 })
    sectionElement.append(media, next)

    expect(measurePaginatedDomPageOffsets(sectionElement, 500)).toEqual([
      0,
      240,
      640
    ])
  })

  it("creates page boundaries for continuous standalone media wrappers", () => {
    const sectionElement = document.createElement("section")
    sectionElement.className = "epub-dom-section"
    setElementBox(sectionElement, {
      top: 0,
      height: 1680,
      scrollHeight: 1680,
      offsetHeight: 1680
    })

    const first = document.createElement("div")
    first.className = "image-single epub-dom-media-wrapper"
    setElementBox(first, { top: 20, height: 610 })
    const firstImage = document.createElement("img")
    setElementBox(firstImage, { top: 20, height: 610 })
    first.append(firstImage)

    const second = document.createElement("div")
    second.className = "image-single epub-dom-media-wrapper"
    setElementBox(second, { top: 670, height: 610 })
    const secondImage = document.createElement("img")
    setElementBox(secondImage, { top: 670, height: 610 })
    second.append(secondImage)

    sectionElement.append(first, second)

    expect(measurePaginatedDomPageOffsets(sectionElement, 790)).toEqual([
      0,
      20,
      670
    ])
  })
})

function createSection(): SectionDocument {
  return {
    id: "section-1",
    href: "section-1.xhtml",
    anchors: {},
    blocks: [
      {
        id: "text-1",
        kind: "text",
        inlines: [{ kind: "text", text: "First" }]
      },
      {
        id: "text-2",
        kind: "text",
        inlines: [{ kind: "text", text: "Second" }]
      }
    ]
  }
}

function createPage(
  pageNumber: number,
  pageNumberInSection: number,
  offsetInSection: number
): ReaderPage {
  return {
    pageNumber,
    pageNumberInSection,
    totalPagesInSection: 2,
    spineIndex: 0,
    sectionId: "section-1",
    sectionHref: "section-1.xhtml",
    offsetInSection,
    blocks: []
  }
}

function setElementBox(
  element: HTMLElement,
  input: {
    top: number
    height: number
    width?: number
    scrollHeight?: number
    offsetHeight?: number
  }
): void {
  if (input.scrollHeight !== undefined) {
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value: input.scrollHeight
    })
  }
  if (input.offsetHeight !== undefined) {
    Object.defineProperty(element, "offsetHeight", {
      configurable: true,
      value: input.offsetHeight
    })
  }
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: input.top,
      left: 0,
      top: input.top,
      right: input.width ?? 100,
      bottom: input.top + input.height,
      width: input.width ?? 100,
      height: input.height,
      toJSON() {
        return this
      }
    })
  })
}
