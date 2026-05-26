import { describe, expect, it, vi } from "vitest"
import type { SectionDocument, SectionRelocatedEvent } from "../src/model/types"
import {
  EpubReader,
  createSharedChapterRenderInput,
  toCanvasChapterRenderInput
} from "../src"
import {
  createBookFromSections,
  installReaderBook
} from "./helpers/reader-harness"

function createCanvasChapter(title: string, paragraphCount = 40): string {
  const paragraphs = Array.from(
    { length: paragraphCount },
    (_, index) =>
      `<p>Paragraph ${index + 1} in ${title}. This text is intentionally long enough to paginate.</p>`
  ).join("")

  return `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>${title}</title></head>
      <body>
        <section>
          <h1>${title}</h1>
          ${paragraphs}
        </section>
      </body>
    </html>`
}

function createSingleBlockCanvasChapter(
  title: string,
  repetition = 1600
): string {
  const text = Array.from(
    { length: repetition },
    (_, index) => `Segment ${index + 1} in ${title}. `
  ).join("")

  return `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>${title}</title></head>
      <body>
        <section>
          <h1>${title}</h1>
          <p>${text}</p>
        </section>
      </body>
    </html>`
}

function pickDeepestTextRun(container: HTMLElement): HTMLElement | null {
  const runs = Array.from(
    container.querySelectorAll<HTMLElement>(".epub-text-run")
  )
  if (runs.length === 0) {
    return null
  }

  return runs.reduce((deepest, candidate) => {
    const deepestStart = Number.parseInt(
      deepest?.dataset.readerInlineStart ?? "0",
      10
    )
    const candidateStart = Number.parseInt(
      candidate.dataset.readerInlineStart ?? "0",
      10
    )
    return candidateStart > deepestStart ? candidate : deepest
  }, runs[0] ?? null)
}

const DOM_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Complex Chapter</title></head>
    <body>
      <section>
        <h1>Complex Chapter</h1>
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Alpha</td><td>1</td></tr>
          <tr><td>Beta</td><td>2</td></tr>
        </table>
        <p>Tail paragraph for dom pagination checks.</p>
      </section>
    </body>
  </html>`

const DOM_SCROLL_TARGET_MARKER =
  "Target paragraph for dom scroll locator verification."

function createScrollableDomChapter(title: string): string {
  const beforeParagraphs = Array.from({ length: 28 }, (_, index) => {
    return `<p>Lead paragraph ${index + 1} in ${title}. This paragraph keeps the DOM chapter tall enough for scroll relocation coverage.</p>`
  }).join("")
  const afterParagraphs = Array.from({ length: 12 }, (_, index) => {
    return `<p>Tail paragraph ${index + 1} in ${title}. This paragraph keeps extra content after the target block.</p>`
  }).join("")

  return `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>${title}</title></head>
      <body>
        <section>
          <h1>${title}</h1>
          <table>
            <tr><th>Name</th><th>Value</th></tr>
            <tr><td>Alpha</td><td>1</td></tr>
            <tr><td>Beta</td><td>2</td></tr>
          </table>
          ${beforeParagraphs}
          <p>${DOM_SCROLL_TARGET_MARKER} The navigation target carries enough text to exercise inline offsets reliably across DOM text nodes.</p>
          ${afterParagraphs}
        </section>
      </body>
    </html>`
}

describe("EpubReader runtime navigation", () => {
  it("notifies section relocation hooks and isolates hook failures", async () => {
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

    const onSectionRelocated = vi.fn<[SectionRelocatedEvent], void>(() => {
      throw new Error("hook failure")
    })
    const reader = new EpubReader({
      container,
      mode: "paginated",
      onSectionRelocated
    })
    const firstInput = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createCanvasChapter("Chapter 1", 20)
    })
    const secondInput = createSharedChapterRenderInput({
      href: "OPS/chapter-2.xhtml",
      content: createCanvasChapter("Chapter 2", 20)
    })
    const firstSection: SectionDocument = {
      ...toCanvasChapterRenderInput(firstInput).section,
      id: "section-1"
    }
    const secondSection: SectionDocument = {
      ...toCanvasChapterRenderInput(secondInput).section,
      id: "section-2"
    }

    const book = createBookFromSections({
      title: "Relocation Hook",
      sections: [firstSection, secondSection]
    })
    installReaderBook({
      reader,
      book,
      chapterRenderInputs: [firstInput, secondInput]
    })

    await reader.render()
    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    })

    expect(onSectionRelocated).toHaveBeenCalled()
    expect(onSectionRelocated.mock.calls.at(-1)?.[0]).toMatchObject({
      spineIndex: 1,
      sectionId: "section-2",
      sectionHref: "OPS/chapter-2.xhtml",
      backend: "canvas",
      mode: "paginated",
      locator: {
        spineIndex: 1
      }
    })
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
  })

  it("does not suppress the first user scroll relocation after an initial top-of-book render", async () => {
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

    const reader = new EpubReader({ container, mode: "scroll" })
    const firstSection: SectionDocument = {
      ...toCanvasChapterRenderInput(
        createSharedChapterRenderInput({
          href: "OPS/chapter-1.xhtml",
          content: createCanvasChapter("Chapter 1")
        })
      ).section,
      id: "section-1"
    }
    const secondSection: SectionDocument = {
      ...toCanvasChapterRenderInput(
        createSharedChapterRenderInput({
          href: "OPS/chapter-2.xhtml",
          content: createCanvasChapter("Chapter 2")
        })
      ).section,
      id: "section-2"
    }

    const book = createBookFromSections({
      title: "Scroll Sync",
      sections: [firstSection, secondSection]
    })
    installReaderBook({ reader, book })
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

    const relocated: Array<number> = []
    reader.on("relocated", ({ locator }) => {
      if (locator) {
        relocated.push(locator.spineIndex)
      }
    })

    container.scrollTop = 420
    container.dispatchEvent(new Event("scroll"))
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => resolve(undefined))
    )

    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(relocated).toEqual([1])
  })

  it("keeps global paginated page numbers when relocating into a dom chapter", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    document.body.appendChild(container)

    const firstInput = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createCanvasChapter("Chapter 1", 60)
    })
    const domInput = createSharedChapterRenderInput({
      href: "OPS/chapter-2.xhtml",
      content: DOM_CHAPTER
    })
    const thirdInput = createSharedChapterRenderInput({
      href: "OPS/chapter-3.xhtml",
      content: createCanvasChapter("Chapter 3", 10)
    })

    const firstSection: SectionDocument = {
      ...toCanvasChapterRenderInput(firstInput).section,
      id: "section-1"
    }
    const domSection: SectionDocument = {
      ...toCanvasChapterRenderInput(domInput).section,
      id: "section-2"
    }
    const thirdSection: SectionDocument = {
      ...toCanvasChapterRenderInput(thirdInput).section,
      id: "section-3"
    }

    const book = createBookFromSections({
      title: "Paginated DOM",
      sections: [firstSection, domSection, thirdSection]
    })
    const reader = new EpubReader({ container, mode: "paginated" })
    installReaderBook({
      reader,
      book,
      chapterRenderInputs: [firstInput, domInput, thirdInput]
    })

    await reader.render()
    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    })

    expect(reader.getRenderMetrics().backend).toBe("dom")
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(reader.getPaginationInfo().currentPage).toBeGreaterThan(1)
  })

  it("does not treat canvas text selection as a relocation click", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
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
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 320,
        bottom: 220,
        width: 320,
        height: 220
      })
    })

    const input = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createCanvasChapter("Selectable Chapter", 8)
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "Canvas Selection",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({ reader, book, chapterRenderInputs: [input] })

    const relocated = vi.fn()
    reader.on("relocated", relocated)

    await reader.render()

    const textRun = container.querySelector(".epub-text-run")
    expect(textRun).toBeTruthy()

    const originalGetSelection = window.getSelection
    const textNode = textRun?.firstChild ?? null
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "Selectable",
        anchorNode: textNode,
        focusNode: textNode
      })
    })

    textRun?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 24
      })
    )

    expect(relocated).not.toHaveBeenCalled()

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("keeps the centered canvas block anchored when switching from scroll to paginated", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createCanvasChapter("Anchored Chapter", 80)
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "Anchored Canvas Switch",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({ reader, book, chapterRenderInputs: [input] })

    await reader.render()
    container.scrollTop = 640

    const expected = reader.mapViewportToLocator({
      x: container.clientWidth / 2,
      y: container.clientHeight / 2
    })
    expect(expected?.blockId).toBeTruthy()

    await reader.submitPreferences({
      mode: "paginated"
    })

    expect(reader.getSettings().mode).toBe("paginated")
    expect(reader.getCurrentLocation()?.blockId).toBe(expected?.blockId)
  })

  it("uses the captured scroll locator instead of the scroll section number when switching to paginated", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/long-section.xhtml",
      content: createCanvasChapter("Long Section", 140)
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "Long Section Mode Switch",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({ reader, book, chapterRenderInputs: [input] })

    await reader.render()
    container.scrollTop = 1800
    container.dispatchEvent(new Event("scroll"))
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => resolve(undefined))
    )

    const expected = reader.mapViewportToLocator({
      x: container.clientWidth / 2,
      y: container.clientHeight / 2
    })
    expect(expected?.blockId).toBeTruthy()

    await reader.submitPreferences({
      mode: "paginated"
    })

    expect(reader.getSettings().mode).toBe("paginated")
    expect(reader.getPaginationInfo().currentPage).toBeGreaterThan(1)
    expect(reader.mapLocatorToViewport(expected!)).not.toEqual([])
  })

  it("keeps a deep inline position inside a single canvas block when switching from scroll to paginated", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createSingleBlockCanvasChapter(
        "Single Block Scroll Switch",
        5200
      )
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "Single Block Scroll Switch",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({ reader, book, chapterRenderInputs: [input] })

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint"
    )

    try {
      await reader.render()
      container.scrollTop = 3600
      container.dispatchEvent(new Event("scroll"))
      await new Promise((resolve) =>
        window.requestAnimationFrame(() => resolve(undefined))
      )

      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => pickDeepestTextRun(container)
      })

      await reader.submitPreferences({
        mode: "paginated"
      })

      expect(reader.getSettings().mode).toBe("paginated")
      expect(reader.getPaginationInfo().totalPages).toBeGreaterThan(1)
      expect(reader.getCurrentLocation()?.inlineOffset ?? 0).toBeGreaterThan(0)
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(
          document,
          "elementFromPoint",
          originalElementFromPoint
        )
      } else {
        delete (document as { elementFromPoint?: unknown }).elementFromPoint
      }
    }
  }, 20000)

  it("keeps a deep inline position inside a single canvas block when switching from paginated to scroll", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: createSingleBlockCanvasChapter("Single Block Paginated Switch")
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "Single Block Paginated Switch",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "paginated" })
    installReaderBook({ reader, book, chapterRenderInputs: [input] })

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint"
    )

    try {
      await reader.render()
      expect(reader.getPaginationInfo().totalPages).toBeGreaterThan(4)
      await reader.goToPage(4)

      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => pickDeepestTextRun(container)
      })

      await reader.submitPreferences({
        mode: "scroll"
      })

      expect(reader.getSettings().mode).toBe("scroll")
      expect(container.scrollTop).toBeGreaterThan(100)
      expect(reader.getCurrentLocation()?.inlineOffset ?? 0).toBeGreaterThan(0)
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(
          document,
          "elementFromPoint",
          originalElementFromPoint
        )
      } else {
        delete (document as { elementFromPoint?: unknown }).elementFromPoint
      }
    }
  })

  it("scrolls to deep DOM block locators in scroll mode using rendered DOM geometry", async () => {
    const container = document.createElement("div")
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect"
    )
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 0
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 240,
        right: 320,
        width: 320,
        height: 240,
        toJSON() {
          return this
        }
      })
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/dom-scroll-block.xhtml",
      content: createScrollableDomChapter("DOM Scroll Block")
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "DOM Scroll Block",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({
      reader,
      book,
      chapterRenderInputs: [input]
    })

    try {
      await reader.render()
      expect(reader.getRenderMetrics().backend).toBe("dom")

      const sectionWrapper = container.querySelector<HTMLElement>(
        'article[data-section-id="section-1"]'
      )
      const domSection = container.querySelector<HTMLElement>(
        '.epub-dom-section[data-section-id="section-1"]'
      )
      const targetBlock = Array.from(
        domSection?.querySelectorAll<HTMLElement>("[data-reader-block-id]") ?? []
      ).find((element) =>
        element.textContent?.includes(DOM_SCROLL_TARGET_MARKER)
      )
      const targetBlockId = targetBlock?.dataset.readerBlockId

      expect(sectionWrapper).toBeTruthy()
      expect(domSection).toBeTruthy()
      expect(targetBlock).toBeTruthy()
      expect(targetBlockId).toBeTruthy()

      Object.defineProperty(sectionWrapper!, "offsetTop", {
        configurable: true,
        value: 0
      })
      Object.defineProperty(sectionWrapper!, "offsetHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(domSection!, "offsetHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(domSection!, "scrollHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value() {
          if (
            this.dataset.readerBlockId === targetBlockId ||
            this.id === targetBlockId
          ) {
            return {
              x: 12,
              y: 1800 - container.scrollTop,
              top: 1800 - container.scrollTop,
              left: 12,
              bottom: 1920 - container.scrollTop,
              right: 308,
              width: 296,
              height: 120,
              toJSON() {
                return this
              }
            }
          }

          return originalGetBoundingClientRect?.value?.call(this) ?? {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            width: 0,
            height: 0,
            toJSON() {
              return this
            }
          }
        }
      })

      await reader.goToLocation({
        spineIndex: 0,
        blockId: targetBlockId!
      })

      expect(container.scrollTop).toBe(1784)
      expect(targetBlock?.getBoundingClientRect().top).toBe(16)
      expect(reader.getCurrentLocation()?.blockId).toBe(targetBlockId)
    } finally {
      if (originalGetBoundingClientRect) {
        Object.defineProperty(
          HTMLElement.prototype,
          "getBoundingClientRect",
          originalGetBoundingClientRect
        )
      }
    }
  })

  it("uses DOM text geometry for inline scroll locators when the chapter is DOM-rendered", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 0
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 240,
        right: 320,
        width: 320,
        height: 240,
        toJSON() {
          return this
        }
      })
    })
    document.body.appendChild(container)

    const input = createSharedChapterRenderInput({
      href: "OPS/dom-scroll-inline.xhtml",
      content: createScrollableDomChapter("DOM Scroll Inline")
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(input).section,
      id: "section-1"
    }
    const book = createBookFromSections({
      title: "DOM Scroll Inline",
      sections: [section]
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    installReaderBook({
      reader,
      book,
      chapterRenderInputs: [input]
    })

    const originalCreateRange = document.createRange.bind(document)
    let recordedStartOffset = -1

    try {
      await reader.render()
      expect(reader.getRenderMetrics().backend).toBe("dom")

      const sectionWrapper = container.querySelector<HTMLElement>(
        'article[data-section-id="section-1"]'
      )
      const domSection = container.querySelector<HTMLElement>(
        '.epub-dom-section[data-section-id="section-1"]'
      )
      const targetBlock = Array.from(
        domSection?.querySelectorAll<HTMLElement>("[data-reader-block-id]") ?? []
      ).find((element) =>
        element.textContent?.includes(DOM_SCROLL_TARGET_MARKER)
      )
      const targetBlockId = targetBlock?.dataset.readerBlockId

      expect(sectionWrapper).toBeTruthy()
      expect(domSection).toBeTruthy()
      expect(targetBlock).toBeTruthy()
      expect(targetBlockId).toBeTruthy()

      Object.defineProperty(sectionWrapper!, "offsetTop", {
        configurable: true,
        value: 0
      })
      Object.defineProperty(sectionWrapper!, "offsetHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(domSection!, "offsetHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(domSection!, "scrollHeight", {
        configurable: true,
        value: 2600
      })
      Object.defineProperty(targetBlock!, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          x: 12,
          y: 1800 - container.scrollTop,
          top: 1800 - container.scrollTop,
          left: 12,
          bottom: 1920 - container.scrollTop,
          right: 308,
          width: 296,
          height: 120,
          toJSON() {
            return this
          }
        })
      })

      const targetTextNode = targetBlock?.firstChild
      expect(targetTextNode).toBeInstanceOf(Text)

      document.createRange = (() =>
        ({
          setStart(_node: Node, offset: number) {
            recordedStartOffset = offset
          },
          setEnd() {},
          getBoundingClientRect() {
            return {
              x: 24,
              y: 1900 - container.scrollTop,
              top: 1900 - container.scrollTop,
              left: 24,
              bottom: 1924 - container.scrollTop,
              right: 160,
              width: 136,
              height: 24,
              toJSON() {
                return this
              }
            }
          }
        }) as unknown as Range) as typeof document.createRange

      await reader.goToLocation({
        spineIndex: 0,
        blockId: targetBlockId!,
        inlineOffset: 80
      })

      expect(recordedStartOffset).toBe(80)
      expect(container.scrollTop).toBe(1884)
      expect(reader.getCurrentLocation()?.inlineOffset).toBe(80)
    } finally {
      document.createRange = originalCreateRange
    }
  })
})
