import { describe, expect, it, vi } from "vitest"
import { InMemoryResourceContainer } from "../src/container/resource-container"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

describe("EpubReader image resources", () => {
  it("sanitizes remote canvas image resources unless explicitly enabled", () => {
    const defaultReader = new EpubReader()
    const defaultState = defaultReader as unknown as {
      resolveCanvasResourceUrl(path: string): string
    }

    expect(
      defaultState.resolveCanvasResourceUrl("https://cdn.example.com/plate.png")
    ).toBe("data:,")
    expect(defaultState.resolveCanvasResourceUrl("OPS/images/plate.png")).toBe(
      "OPS/images/plate.png"
    )
    defaultReader.destroy()

    const externalReader = new EpubReader({
      allowExternalEmbeddedResources: true
    })
    const externalState = externalReader as unknown as {
      resolveCanvasResourceUrl(path: string): string
    }

    expect(
      externalState.resolveCanvasResourceUrl("https://cdn.example.com/plate.png")
    ).toBe("https://cdn.example.com/plate.png")
    expect(
      externalState.resolveCanvasResourceUrl("javascript:alert(1)")
    ).toBe("data:,")
    externalReader.destroy()
  })

  it("converts EPUB image resources into object URLs for rendering", async () => {
    const createObjectURL = vi.fn(() => "blob:cover-image")
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const container = document.createElement("div")
    const reader = new EpubReader({ container })

    const resources = new InMemoryResourceContainer({
      "OPS/images/cover.png": new Uint8Array([137, 80, 78, 71])
    })

    const imageUrl = reader as unknown as {
      resources: typeof resources
      resolveRenderableResourceUrl(path: string): string
    }

    imageUrl.resources = resources
    expect(imageUrl.resolveRenderableResourceUrl("OPS/images/cover.png")).toBe(
      "OPS/images/cover.png"
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(imageUrl.resolveRenderableResourceUrl("OPS/images/cover.png")).toBe(
      "blob:cover-image"
    )

    reader.destroy()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover-image")

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it("tolerates missing image resources without throwing", async () => {
    const container = document.createElement("div")
    const reader = new EpubReader({ container })
    const resources = new InMemoryResourceContainer({})

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
        resolveImageIntrinsicSizeForLayout(path: string): { width: number; height: number } | null | undefined
      }
    ).resources = resources

    const state = reader as unknown as {
      resolveDomResourceUrl(path: string): string
      resolveImageIntrinsicSizeForLayout(path: string): { width: number; height: number } | null | undefined
    }

    expect(() => state.resolveDomResourceUrl("OPS/images/missing.png")).not.toThrow()
    expect(state.resolveDomResourceUrl("OPS/images/missing.png")).toBe(
      "OPS/images/missing.png"
    )

    expect(
      state.resolveImageIntrinsicSizeForLayout("OPS/images/missing.png")
    ).toBeUndefined()
    expect(
      state.resolveImageIntrinsicSizeForLayout("OPS/images/missing.png")
    ).toBeNull()
  })

  it("uses resolved blob URLs for canvas image rendering and hit testing", async () => {
    const createObjectURL = vi.fn(() => "blob:cover-image")
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })

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
          src: "OPS/images/cover.png",
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

    const resources = new InMemoryResourceContainer({
      "OPS/images/cover.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(reader as unknown as { book: Book; resources: typeof resources }).book =
      book
    ;(
      reader as unknown as { book: Book; resources: typeof resources }
    ).resources = resources
    await reader.render()
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 60))
    await Promise.resolve()

    const hit = reader.hitTest({
      x: 160,
      y: 120
    })

    expect(hit?.kind).toBe("image")
    expect(hit && hit.kind === "image" ? hit.src : null).toBe(
      "blob:cover-image"
    )

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it("patches rendered DOM image resources in place without forcing a scroll rerender", async () => {
    const createObjectURL = vi.fn(() => "blob:dom-cover-image")
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const container = document.createElement("div")
    container.innerHTML =
      '<div class="epub-dom-section"><img src="OPS/images/dom-cover.png" alt="Cover"></div>'
    const reader = new EpubReader({ container })
    const renderSpy = vi.spyOn(
      reader as unknown as {
        renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
      },
      "renderCurrentSection"
    )

    const resources = new InMemoryResourceContainer({
      "OPS/images/dom-cover.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
      }
    ).resources = resources

    expect(
      (
        reader as unknown as {
          resolveDomResourceUrl(path: string): string
        }
      ).resolveDomResourceUrl("OPS/images/dom-cover.png")
    ).toBe("OPS/images/dom-cover.png")

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const image = container.querySelector("img")
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(image?.getAttribute("src")).toBe("blob:dom-cover-image")
    expect(renderSpy).not.toHaveBeenCalled()

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it("rerenders paginated DOM sections when an image load changes layout", async () => {
    const createObjectURL = vi.fn(() => "blob:dom-cover-image")
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    container.innerHTML =
      '<div class="epub-dom-section"><img src="OPS/images/dom-cover.png" alt="Cover"></div>'
    const reader = new EpubReader({ container, mode: "paginated" })
    ;(
      reader as unknown as {
        book: Book
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).book = {
      metadata: { title: "DOM Layout Change" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter.xhtml",
          anchors: {},
          blocks: []
        }
      ]
    }
    ;(
      reader as unknown as {
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).lastChapterRenderDecision = {
      mode: "dom",
      score: 0,
      reasons: ["test-dom-layout-change"]
    }
    const renderSpy = vi.spyOn(
      reader as unknown as {
        renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
      },
      "renderCurrentSection"
    )

    const resources = new InMemoryResourceContainer({
      "OPS/images/dom-cover.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
      }
    ).resources = resources

    expect(
      (
        reader as unknown as {
          resolveDomResourceUrl(path: string): string
        }
      ).resolveDomResourceUrl("OPS/images/dom-cover.png")
    ).toBe("OPS/images/dom-cover.png")

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const image = container.querySelector("img")
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(image?.getAttribute("src")).toBe("blob:dom-cover-image")
    image?.dispatchEvent(new Event("load"))
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(renderSpy).toHaveBeenCalledWith("preserve")

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it("ignores DOM image load events from stale detached elements", async () => {
    const createObjectURL = vi.fn(() => "blob:stale-dom-image")
    const originalCreateObjectURL = URL.createObjectURL

    URL.createObjectURL = createObjectURL

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    container.innerHTML =
      '<div class="epub-dom-section"><img src="OPS/images/stale.png" alt="Stale"></div>'
    const reader = new EpubReader({ container, mode: "paginated" })
    ;(
      reader as unknown as {
        book: Book
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).book = {
      metadata: { title: "Stale DOM Layout Change" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter.xhtml",
          anchors: {},
          blocks: []
        }
      ]
    }
    ;(
      reader as unknown as {
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).lastChapterRenderDecision = {
      mode: "dom",
      score: 0,
      reasons: ["test-stale-dom-layout-change"]
    }
    const renderSpy = vi.spyOn(
      reader as unknown as {
        renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
      },
      "renderCurrentSection"
    )

    const resources = new InMemoryResourceContainer({
      "OPS/images/stale.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
      }
    ).resources = resources

    ;(
      reader as unknown as {
        resolveDomResourceUrl(path: string): string
      }
    ).resolveDomResourceUrl("OPS/images/stale.png")

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const image = container.querySelector("img")
    image?.remove()
    image?.dispatchEvent(new Event("load"))
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(renderSpy).not.toHaveBeenCalled()

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
  })

  it("patches fixed-layout DOM images without scheduling reflow pagination", async () => {
    const createObjectURL = vi.fn(() => "blob:fxl-dom-image")
    const originalCreateObjectURL = URL.createObjectURL

    URL.createObjectURL = createObjectURL

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })
    container.innerHTML =
      '<div class="epub-dom-section epub-dom-section-fxl"><img src="OPS/images/fxl.png" alt="FXL"></div>'
    const reader = new EpubReader({ container, mode: "paginated" })
    ;(
      reader as unknown as {
        book: Book
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).book = {
      metadata: { title: "FXL DOM Layout Change" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/fxl.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-fxl",
          href: "OPS/fxl.xhtml",
          renditionLayout: "pre-paginated",
          renditionViewport: {
            width: 1200,
            height: 1600
          },
          anchors: {},
          blocks: []
        }
      ]
    }
    ;(
      reader as unknown as {
        lastChapterRenderDecision: { mode: "dom"; score: number; reasons: string[] }
      }
    ).lastChapterRenderDecision = {
      mode: "dom",
      score: 0,
      reasons: ["fixed-layout-section"]
    }
    const renderSpy = vi.spyOn(
      reader as unknown as {
        renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
      },
      "renderCurrentSection"
    )

    const resources = new InMemoryResourceContainer({
      "OPS/images/fxl.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
      }
    ).resources = resources

    ;(
      reader as unknown as {
        resolveDomResourceUrl(path: string): string
      }
    ).resolveDomResourceUrl("OPS/images/fxl.png")

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const image = container.querySelector("img")
    expect(image?.getAttribute("src")).toBe("blob:fxl-dom-image")
    image?.dispatchEvent(new Event("load"))
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(renderSpy).not.toHaveBeenCalled()

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
  })

  it("rewrites svg image xlink:href resources for dom rendering", async () => {
    const createObjectURL = vi.fn(() => "blob:dom-svg-cover")
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const container = document.createElement("div")
    container.innerHTML =
      '<div class="epub-dom-section"><svg><image xlink:href="OPS/images/dom-cover.png"></image></svg></div>'
    const reader = new EpubReader({ container })

    const resources = new InMemoryResourceContainer({
      "OPS/images/dom-cover.png": new Uint8Array([137, 80, 78, 71])
    })

    ;(
      reader as unknown as {
        resources: typeof resources
        resolveDomResourceUrl(path: string): string
      }
    ).resources = resources

    expect(
      (
        reader as unknown as {
          resolveDomResourceUrl(path: string): string
        }
      ).resolveDomResourceUrl("OPS/images/dom-cover.png")
    ).toBe("OPS/images/dom-cover.png")

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const image = container.querySelector("image")
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(image?.getAttribute("xlink:href")).toBe("blob:dom-svg-cover")

    reader.destroy()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it("forces cover sections onto the dom backend and uses the direct cover image", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 980
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 720
    })
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        spreadMode: "none"
      }
    })
    const section: SectionDocument = {
      id: "section-cover",
      href: "OPS/Text/cover.xhtml",
      title: "Cover",
      presentationRole: "cover",
      anchors: {},
      blocks: []
    }

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
        resolveChapterRenderDecision(sectionIndex: number): {
          mode: string
          reasons: string[]
        }
        createDomRenderInput(
          section: SectionDocument,
          input: {
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }
        ): {
          presentationImageSrc?: string
          presentationRole?: "cover" | "image-page"
          presentationViewportWidth?: number
          presentationViewportHeight?: number
        }
      }
    ).book = {
      metadata: {
        title: "Rust Cover",
        coverImageHref: "OPS/Images/cover.jpg"
      },
      manifest: [],
      spine: [{ idref: "cover", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      chapterRenderInputs: Array<{
        href: string
        content: string
        preprocessed: {
          href: string
          nodes: []
        }
      }>
      resolveChapterRenderDecision(sectionIndex: number): {
        mode: string
        reasons: string[]
      }
      createDomRenderInput(
        section: SectionDocument,
        input: {
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }
      ): {
        presentationImageSrc?: string
        presentationRole?: "cover" | "image-page"
        presentationViewportWidth?: number
        presentationViewportHeight?: number
      }
    }
    state.chapterRenderInputs = [
      {
        href: section.href,
        content: "<html><body></body></html>",
        preprocessed: {
          href: section.href,
          nodes: []
        }
      }
    ]

    expect(state.resolveChapterRenderDecision(0)).toEqual({
      mode: "dom",
      score: 0,
      reasons: ["cover-section"]
    })
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .presentationRole
    ).toBe("cover")
    const domRenderInput = state.createDomRenderInput(
      section,
      state.chapterRenderInputs[0]!
    )
    expect(domRenderInput.presentationImageSrc).toBe("OPS/Images/cover.jpg")
    expect(domRenderInput.presentationViewportWidth).toBe(980)
    expect(domRenderInput.presentationViewportHeight).toBe(720)
  })

  it("forces image-only sections onto the dom backend and uses the standalone image", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 960
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 700
    })
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        spreadMode: "none"
      }
    })
    const section: SectionDocument = {
      id: "section-title-page",
      href: "OPS/text00000.xhtml",
      title: "书名页",
      presentationRole: "image-page",
      anchors: {},
      blocks: [
        {
          id: "title-image-block",
          kind: "text",
          inlines: [
            { kind: "image", src: "OPS/Image00000.jpg", alt: "Title image" }
          ]
        }
      ]
    }

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
        resolveChapterRenderDecision(sectionIndex: number): {
          mode: string
          reasons: string[]
        }
        createDomRenderInput(
          section: SectionDocument,
          input: {
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }
        ): {
          presentationImageSrc?: string
          presentationRole?: "cover" | "image-page"
          presentationViewportWidth?: number
          presentationViewportHeight?: number
        }
      }
    ).book = {
      metadata: {
        title: "Quit Smoking"
      },
      manifest: [],
      spine: [{ idref: "title-page", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      chapterRenderInputs: Array<{
        href: string
        content: string
        preprocessed: {
          href: string
          nodes: []
        }
      }>
      resolveChapterRenderDecision(sectionIndex: number): {
        mode: string
        reasons: string[]
      }
      createDomRenderInput(
        section: SectionDocument,
        input: {
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }
      ): {
        presentationImageSrc?: string
        presentationRole?: "cover" | "image-page"
        presentationViewportWidth?: number
        presentationViewportHeight?: number
      }
    }
    state.chapterRenderInputs = [
      {
        href: section.href,
        content: "<html><body></body></html>",
        preprocessed: {
          href: section.href,
          nodes: []
        }
      }
    ]

    expect(state.resolveChapterRenderDecision(0)).toEqual({
      mode: "dom",
      score: 0,
      reasons: ["image-page-section"]
    })
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .presentationRole
    ).toBe("image-page")
    const domRenderInput = state.createDomRenderInput(
      section,
      state.chapterRenderInputs[0]!
    )
    expect(domRenderInput.presentationImageSrc).toBe("OPS/Image00000.jpg")
    expect(domRenderInput.presentationViewportWidth).toBe(960)
    expect(domRenderInput.presentationViewportHeight).toBe(700)
  })

  it("forces fixed-layout sections onto the dom backend and computes a fitted viewport box", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 540
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 720
    })
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        spreadMode: "none"
      }
    })
    const section: SectionDocument = {
      id: "section-fxl",
      href: "OPS/fxl.xhtml",
      title: "FXL",
      renditionLayout: "pre-paginated",
      renditionViewport: {
        width: 1200,
        height: 1600
      },
      anchors: {},
      blocks: []
    }

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
        resolveChapterRenderDecision(sectionIndex: number): {
          mode: string
          score: number
          reasons: string[]
        }
        createDomRenderInput(
          section: SectionDocument,
          input: {
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }
        ): {
          renditionLayout?: "pre-paginated"
          fixedLayoutViewport?: { width: number; height: number }
          fixedLayoutRenderWidth?: number
          fixedLayoutRenderHeight?: number
          fixedLayoutScale?: number
        }
      }
    ).book = {
      metadata: {
        title: "FXL Book",
        renditionLayout: "pre-paginated",
        renditionViewport: {
          width: 1200,
          height: 1600
        }
      },
      manifest: [],
      spine: [
        {
          idref: "fxl",
          href: section.href,
          linear: true,
          renditionLayout: "pre-paginated"
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      chapterRenderInputs: Array<{
        href: string
        content: string
        preprocessed: {
          href: string
          nodes: []
        }
      }>
      resolveChapterRenderDecision(sectionIndex: number): {
        mode: string
        score: number
        reasons: string[]
      }
      createDomRenderInput(
        section: SectionDocument,
        input: {
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }
      ): {
        renditionLayout?: "pre-paginated"
        fixedLayoutViewport?: { width: number; height: number }
        fixedLayoutRenderWidth?: number
        fixedLayoutRenderHeight?: number
        fixedLayoutScale?: number
      }
    }
    state.chapterRenderInputs = [
      {
        href: section.href,
        content: "<html><body></body></html>",
        preprocessed: {
          href: section.href,
          nodes: []
        }
      }
    ]

    expect(state.resolveChapterRenderDecision(0)).toEqual({
      mode: "dom",
      score: 0,
      reasons: ["fixed-layout-section"]
    })
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .renditionLayout
    ).toBe("pre-paginated")
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutViewport
    ).toEqual({
      width: 1200,
      height: 1600
    })
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutRenderWidth
    ).toBe(540)
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutRenderHeight
    ).toBe(720)
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutScale
    ).toBe(0.45)
  })

  it("fits fixed-layout sections inside the padded reader viewport instead of using reflow width caps", () => {
    const container = document.createElement("div")
    container.style.padding = "24px 30px"
    document.body.appendChild(container)
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 900
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 720
    })
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        spreadMode: "none"
      }
    })
    const section: SectionDocument = {
      id: "section-fxl-padded",
      href: "OPS/fxl-padded.xhtml",
      title: "FXL Padded",
      renditionLayout: "pre-paginated",
      renditionViewport: {
        width: 1200,
        height: 1600
      },
      anchors: {},
      blocks: []
    }

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
        createDomRenderInput(
          section: SectionDocument,
          input: {
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }
        ): {
          fixedLayoutRenderWidth?: number
          fixedLayoutRenderHeight?: number
          fixedLayoutScale?: number
        }
      }
    ).book = {
      metadata: {
        title: "FXL Padded Book",
        renditionLayout: "pre-paginated",
        renditionViewport: {
          width: 1200,
          height: 1600
        }
      },
      manifest: [],
      spine: [
        {
          idref: "fxl-padded",
          href: section.href,
          linear: true,
          renditionLayout: "pre-paginated"
        }
      ],
      toc: [],
      sections: [section]
    }

    const state = reader as unknown as {
      chapterRenderInputs: Array<{
        href: string
        content: string
        preprocessed: {
          href: string
          nodes: []
        }
      }>
      createDomRenderInput(
        section: SectionDocument,
        input: {
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }
      ): {
        fixedLayoutRenderWidth?: number
        fixedLayoutRenderHeight?: number
        fixedLayoutScale?: number
      }
    }
    state.chapterRenderInputs = [
      {
        href: section.href,
        content: "<html><body></body></html>",
        preprocessed: {
          href: section.href,
          nodes: []
        }
      }
    ]

    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutRenderWidth
    ).toBe(504)
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutRenderHeight
    ).toBe(672)
    expect(
      state.createDomRenderInput(section, state.chapterRenderInputs[0]!)
        .fixedLayoutScale
    ).toBe(0.42)
  })

  it("rerenders pre-paginated sections when the fixed-layout viewport changes on resize", async () => {
    const resizeCallbacks: Array<() => void> = []
    class MockResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        resizeCallbacks.push(() => {
          this.callback([], this as unknown as ResizeObserver)
        })
      }

      observe(): void {
        return undefined
      }

      disconnect(): void {
        return undefined
      }

      unobserve(): void {
        return undefined
      }
    }

    vi.stubGlobal(
      "ResizeObserver",
      MockResizeObserver as unknown as typeof ResizeObserver
    )

    try {
      const container = document.createElement("div")
      container.style.padding = "24px 30px"
      document.body.appendChild(container)
      let clientWidth = 920
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        get: () => clientWidth
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 1400
      })

      const reader = new EpubReader({ container, mode: "paginated" })
      const section: SectionDocument = {
        id: "section-fxl-resize",
        href: "OPS/fxl-resize.xhtml",
        title: "FXL Resize",
        renditionLayout: "pre-paginated",
        renditionViewport: {
          width: 1200,
          height: 1600
        },
        anchors: {},
        blocks: []
      }

      ;(
        reader as unknown as {
          book: Book
          chapterRenderInputs: Array<{
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }>
        }
      ).book = {
        metadata: {
          title: "FXL Resize Book",
          renditionLayout: "pre-paginated",
          renditionViewport: {
            width: 1200,
            height: 1600
          }
        },
        manifest: [],
        spine: [
          {
            idref: "fxl-resize",
            href: section.href,
            linear: true,
            renditionLayout: "pre-paginated"
          }
        ],
        toc: [],
        sections: [section]
      }
      ;(
        reader as unknown as {
          chapterRenderInputs: Array<{
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }>
        }
      ).chapterRenderInputs = [
        {
          href: section.href,
          content: "<html><body></body></html>",
          preprocessed: {
            href: section.href,
            nodes: []
          }
        }
      ]

      const renderSpy = vi.spyOn(
        reader as unknown as {
          renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
        },
        "renderCurrentSection"
      )

      await reader.render()
      renderSpy.mockClear()
      clientWidth = 980
      resizeCallbacks[0]?.()

      expect(renderSpy).toHaveBeenCalledWith("preserve")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rerenders presentation image sections when the reader viewport width changes", async () => {
    const resizeCallbacks: Array<() => void> = []
    class MockResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        resizeCallbacks.push(() => {
          this.callback([], this as unknown as ResizeObserver)
        })
      }

      observe(): void {
        return undefined
      }

      disconnect(): void {
        return undefined
      }

      unobserve(): void {
        return undefined
      }
    }

    vi.stubGlobal(
      "ResizeObserver",
      MockResizeObserver as unknown as typeof ResizeObserver
    )

    try {
      const container = document.createElement("div")
      container.style.padding = "24px 30px"
      document.body.appendChild(container)
      let clientWidth = 920
      Object.defineProperty(container, "clientWidth", {
        configurable: true,
        get: () => clientWidth
      })
      Object.defineProperty(container, "clientHeight", {
        configurable: true,
        value: 900
      })

      const reader = new EpubReader({ container, mode: "paginated" })
      const section: SectionDocument = {
        id: "section-cover-resize",
        href: "OPS/cover.xhtml",
        title: "Cover Resize",
        presentationRole: "cover",
        anchors: {},
        blocks: []
      }

      ;(
        reader as unknown as {
          book: Book
          chapterRenderInputs: Array<{
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }>
        }
      ).book = {
        metadata: {
          title: "Cover Resize Book",
          coverImageHref: "OPS/images/cover.jpg"
        },
        manifest: [],
        spine: [{ idref: "cover", href: section.href, linear: true }],
        toc: [],
        sections: [section]
      }
      ;(
        reader as unknown as {
          chapterRenderInputs: Array<{
            href: string
            content: string
            preprocessed: {
              href: string
              nodes: []
            }
          }>
        }
      ).chapterRenderInputs = [
        {
          href: section.href,
          content: "<html><body></body></html>",
          preprocessed: {
            href: section.href,
            nodes: []
          }
        }
      ]

      const renderSpy = vi.spyOn(
        reader as unknown as {
          renderCurrentSection(renderBehavior?: "relocate" | "preserve"): void
        },
        "renderCurrentSection"
      )

      await reader.render()
      renderSpy.mockClear()
      clientWidth = 980
      resizeCallbacks[0]?.()

      expect(renderSpy).toHaveBeenCalledWith("preserve")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("starts at the first cover page when leading dom image sections have not measured yet", async () => {
    const container = document.createElement("div")
    container.innerHTML = '<article class="placeholder-page">Waiting</article>'
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

    const reader = new EpubReader({ container, mode: "scroll" })
    const coverSection: SectionDocument = {
      id: "section-1",
      href: "OPS/cover.xhtml",
      title: "Cover",
      presentationRole: "cover",
      anchors: {},
      blocks: []
    }
    const titleSection: SectionDocument = {
      id: "section-2",
      href: "OPS/title.xhtml",
      title: "Title Page",
      presentationRole: "image-page",
      anchors: {},
      blocks: [
        {
          id: "title-image",
          kind: "image",
          src: "OPS/title.jpg",
          alt: "Title"
        }
      ]
    }
    const chapterSection: SectionDocument = {
      id: "section-3",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "First chapter text." }]
        }
      ]
    }

    ;(
      reader as unknown as {
        book: Book
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
      }
    ).book = {
      metadata: {
        title: "Quit Smoking",
        coverImageHref: "OPS/cover.jpg"
      },
      manifest: [],
      spine: [
        { idref: "cover", href: coverSection.href, linear: true },
        { idref: "title", href: titleSection.href, linear: true },
        { idref: "chapter-1", href: chapterSection.href, linear: true }
      ],
      toc: [],
      sections: [coverSection, titleSection, chapterSection]
    }
    ;(
      reader as unknown as {
        chapterRenderInputs: Array<{
          href: string
          content: string
          preprocessed: {
            href: string
            nodes: []
          }
        }>
      }
    ).chapterRenderInputs = [
      {
        href: coverSection.href,
        content: "<html><body></body></html>",
        preprocessed: { href: coverSection.href, nodes: [] }
      },
      {
        href: titleSection.href,
        content: "<html><body></body></html>",
        preprocessed: { href: titleSection.href, nodes: [] }
      },
      {
        href: chapterSection.href,
        content: "<html><body></body></html>",
        preprocessed: { href: chapterSection.href, nodes: [] }
      }
    ]

    await reader.setTheme({ background: "#fffaf0" })
    await reader.setTypography({ fontSize: 18 })
    await reader.setMode("scroll")
    await reader.render()

    expect(reader.getCurrentLocation()).toEqual({
      spineIndex: 0,
      progressInSection: 0
    })
    expect(reader.getPaginationInfo()).toEqual({
      currentPage: 1,
      totalPages: 3
    })
    expect(container.scrollTop).toBe(0)
    expect(container.querySelector(".placeholder-page")).toBeNull()
    expect(reader.getRenderMetrics().backend).toBe("dom")
  })
})
