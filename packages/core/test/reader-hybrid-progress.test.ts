import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import {
  EpubReader,
  createSharedChapterRenderInput,
  toCanvasChapterRenderInput
} from "../src"

const SIMPLE_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Simple</title></head>
    <body>
      <section>
        <h1>Simple chapter</h1>
        <p>Canvas section.</p>
      </section>
    </body>
  </html>`

const COMPLEX_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Complex</title></head>
    <body>
      <section>
        <h1>Complex chapter</h1>
        <table>
          <tr><td>DOM section.</td></tr>
        </table>
        <p>Additional detail.</p>
      </section>
    </body>
  </html>`

describe("EpubReader hybrid progress", () => {
  it("returns null progress before a book is opened", () => {
    const reader = new EpubReader()

    expect(reader.getReadingProgress()).toBeNull()
  })

  it("preserves section progress when relocating into a dom chapter", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 400
    })
    Object.defineProperty(container, "scrollHeight", {
      configurable: true,
      get() {
        return 1000
      }
    })
    document.body.appendChild(container)

    const simpleInput = createSharedChapterRenderInput({
      href: "OPS/simple.xhtml",
      content: SIMPLE_CHAPTER
    })
    const complexInput = createSharedChapterRenderInput({
      href: "OPS/complex.xhtml",
      content: COMPLEX_CHAPTER
    })
    const simpleSection: SectionDocument = {
      ...toCanvasChapterRenderInput(simpleInput).section,
      id: "section-1"
    }
    const complexSection: SectionDocument = {
      ...toCanvasChapterRenderInput(complexInput).section,
      id: "section-2"
    }

    const book: Book = {
      metadata: { title: "Hybrid Progress" },
      manifest: [],
      spine: [
        { idref: "item-1", href: simpleSection.href, linear: true },
        { idref: "item-2", href: complexSection.href, linear: true }
      ],
      toc: [],
      sections: [simpleSection, complexSection]
    }

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).book = book
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).chapterRenderInputs = [simpleInput, complexInput]

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0.5
    })

    const domSection = container.querySelector(
      ".epub-dom-section"
    ) as HTMLElement | null
    expect(domSection).toBeTruthy()
    const domWrapper = container.querySelector(
      'article[data-section-id="section-2"]'
    ) as HTMLElement | null
    expect(domWrapper).toBeTruthy()
    Object.defineProperty(domWrapper!, "offsetHeight", {
      configurable: true,
      value: 1000
    })
    Object.defineProperty(domSection!, "scrollHeight", {
      configurable: true,
      value: 1000
    })

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0.5
    })

    const sectionTop = (
      reader as unknown as { getSectionTop: (sectionId: string) => number }
    ).getSectionTop("section-2")
    expect(reader.getRenderMetrics().backend).toBe("dom")
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)
    expect(reader.getCurrentLocation()?.progressInSection).toBe(0.5)
    expect(container.scrollTop).toBe(sectionTop + 300)
  })

  it("does not refresh scroll slices for a visible dom chapter", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 400
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const complexInput = createSharedChapterRenderInput({
      href: "OPS/complex.xhtml",
      content: COMPLEX_CHAPTER
    })
    const complexSection: SectionDocument = {
      ...toCanvasChapterRenderInput(complexInput).section,
      id: "section-2"
    }

    const book: Book = {
      metadata: { title: "Hybrid Progress" },
      manifest: [],
      spine: [{ idref: "item-2", href: complexSection.href, linear: true }],
      toc: [],
      sections: [complexSection]
    }

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
        syncPositionFromScroll(emitEvent: boolean): boolean
        refreshScrollSlicesIfNeeded(): boolean
      }
    ).book = book
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
        syncPositionFromScroll(emitEvent: boolean): boolean
        refreshScrollSlicesIfNeeded(): boolean
      }
    ).chapterRenderInputs = [complexInput]

    await reader.render()

    const domWrapper = container.querySelector(
      'article[data-section-id="section-2"]'
    ) as HTMLElement | null
    expect(domWrapper).toBeTruthy()
    Object.defineProperty(domWrapper!, "offsetHeight", {
      configurable: true,
      value: 1200
    })

    container.scrollTop = 320
    ;(
      reader as unknown as {
        syncPositionFromScroll(emitEvent: boolean): boolean
        refreshScrollSlicesIfNeeded(): boolean
      }
    ).syncPositionFromScroll(false)
    const refreshed = (
      reader as unknown as {
        refreshScrollSlicesIfNeeded(): boolean
      }
    ).refreshScrollSlicesIfNeeded()

    expect(refreshed).toBe(false)
    expect(container.scrollTop).toBe(320)
  })

  it("stays anchored in the next dom chapter when a nearby canvas slice refreshes", async () => {
    const originalOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop"
    )
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )

    const sectionOffsets = new Map<string, { top: number; height: number }>([
      ["section-1", { top: 0, height: 420 }],
      ["section-2", { top: 420, height: 15840 }],
      ["section-3", { top: 16260, height: 66200 }],
      ["section-4", { top: 82460, height: 420 }]
    ])

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return sectionOffsets.get(sectionId)?.top ?? 0
          }
          return originalOffsetTop?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const sectionId = this.dataset?.sectionId
          if (sectionId) {
            return sectionOffsets.get(sectionId)?.height ?? 0
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      const container = document.createElement("div")
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        value: 320
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 400
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
      document.body.appendChild(container)

      const simpleLeadingInput = createSharedChapterRenderInput({
        href: "OPS/chapter-1.xhtml",
        content: SIMPLE_CHAPTER
      })
      const complexSecondInput = createSharedChapterRenderInput({
        href: "OPS/chapter-2.xhtml",
        content: COMPLEX_CHAPTER
      })
      const complexThirdInput = createSharedChapterRenderInput({
        href: "OPS/chapter-3.xhtml",
        content: COMPLEX_CHAPTER.replace(
          "Additional detail.",
          "Additional detail for chapter three."
        )
      })
      const simpleTrailingInput = createSharedChapterRenderInput({
        href: "OPS/chapter-4.xhtml",
        content: SIMPLE_CHAPTER.replace(
          "Simple chapter",
          "Simple trailing chapter"
        )
      })

      const sections: SectionDocument[] = [
        {
          ...toCanvasChapterRenderInput(simpleLeadingInput).section,
          id: "section-1"
        },
        {
          ...toCanvasChapterRenderInput(complexSecondInput).section,
          id: "section-2"
        },
        {
          ...toCanvasChapterRenderInput(complexThirdInput).section,
          id: "section-3"
        },
        {
          ...toCanvasChapterRenderInput(simpleTrailingInput).section,
          id: "section-4"
        }
      ]

      const book: Book = {
        metadata: { title: "Hybrid Boundary" },
        manifest: [],
        spine: sections.map((section, index) => ({
          idref: `item-${index + 1}`,
          href: section.href,
          linear: true
        })),
        toc: [],
        sections
      }

      const reader = new EpubReader({ container, mode: "scroll" })
      const state = reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
        currentSectionIndex: number
        scrollWindowStart: number
        scrollWindowEnd: number
        lastRenderedSectionIds: string[]
        lastScrollRenderWindows: Map<
          string,
          Array<{ top: number; height: number }>
        >
        renderVersion: number
        renderScrollableCanvas(renderVersion: number): void
        syncPositionFromScroll(emitEvent: boolean): boolean
        refreshScrollSlicesIfNeeded(): boolean
      }
      state.book = book
      state.chapterRenderInputs = [
        simpleLeadingInput,
        complexSecondInput,
        complexThirdInput,
        simpleTrailingInput
      ]

      await reader.goToLocation({
        spineIndex: 1,
        progressInSection: 0
      })

      container.scrollTop = 16280
      state.syncPositionFromScroll(false)
      expect(reader.getCurrentLocation()?.spineIndex).toBe(2)
      expect(reader.getRenderMetrics().backend).toBe("dom")

      state.currentSectionIndex = 2
      state.scrollWindowStart = 0
      state.scrollWindowEnd = 2
      state.lastRenderedSectionIds = [
        "section-1",
        "section-2",
        "section-3",
        "section-4"
      ]
      state.lastScrollRenderWindows = new Map([
        [
          "section-1",
          [
            {
              top: 0,
              height: 0
            }
          ]
        ]
      ])

      const originalRenderScrollableCanvas =
        state.renderScrollableCanvas.bind(reader)
      state.renderScrollableCanvas = (renderVersion: number) => {
        originalRenderScrollableCanvas(renderVersion)
        container.scrollTop = 0
      }

      const refreshed = state.refreshScrollSlicesIfNeeded()
      state.syncPositionFromScroll(false)

      expect(refreshed).toBe(true)
      expect(container.scrollTop).toBe(16280)
      expect(reader.getCurrentLocation()?.spineIndex).toBe(2)
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

  it("reports overall progress and jumps by percentage across mixed chapters", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 400
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0
    })
    document.body.appendChild(container)

    const simpleInput = createSharedChapterRenderInput({
      href: "OPS/simple.xhtml",
      content: SIMPLE_CHAPTER
    })
    const complexInput = createSharedChapterRenderInput({
      href: "OPS/complex.xhtml",
      content: COMPLEX_CHAPTER
    })
    const simpleSection: SectionDocument = {
      ...toCanvasChapterRenderInput(simpleInput).section,
      id: "section-1"
    }
    const complexSection: SectionDocument = {
      ...toCanvasChapterRenderInput(complexInput).section,
      id: "section-2"
    }

    const book: Book = {
      metadata: { title: "Hybrid Overall Progress" },
      manifest: [],
      spine: [
        { idref: "item-1", href: simpleSection.href, linear: true },
        { idref: "item-2", href: complexSection.href, linear: true }
      ],
      toc: [],
      sections: [simpleSection, complexSection]
    }

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).book = book
    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).chapterRenderInputs = [simpleInput, complexInput]

    await reader.render()
    expect(reader.getReadingProgress()?.overallProgress).toBe(0)

    const targetLocator = await reader.goToProgress(0.75)
    expect(targetLocator?.spineIndex).toBe(1)
    expect(targetLocator?.progressInSection).toBeCloseTo(0.5, 3)
    expect(reader.getCurrentLocation()?.spineIndex).toBe(1)

    const domSection = container.querySelector(
      ".epub-dom-section"
    ) as HTMLElement | null
    const domWrapper = container.querySelector(
      'article[data-section-id="section-2"]'
    ) as HTMLElement | null
    expect(domSection).toBeTruthy()
    expect(domWrapper).toBeTruthy()
    Object.defineProperty(domWrapper!, "offsetHeight", {
      configurable: true,
      value: 400
    })
    Object.defineProperty(domSection!, "scrollHeight", {
      configurable: true,
      value: 400
    })

    const snapshot = reader.getReadingProgress()
    expect(snapshot?.spineIndex).toBe(1)
    expect(snapshot?.sectionProgress).toBeCloseTo(0.5, 3)
    expect(snapshot?.overallProgress).toBeCloseTo(0.75, 3)
  })
})
