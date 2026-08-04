import { afterEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src/renderer/canvas-renderer"
import type { SectionDisplayList } from "../src/renderer/draw-ops"

describe("CanvasRenderer image painting", () => {
  const originalImage = globalThis.Image
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  afterEach(() => {
    globalThis.Image = originalImage
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: originalGetContext
    })
  })

  it("repaints a canvas image after the browser image load completes", () => {
    const drawImage = vi.fn()

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value() {
        return {
          fillStyle: "#000",
          strokeStyle: "#000",
          lineWidth: 1,
          textBaseline: "alphabetic",
          setTransform() {
            return undefined
          },
          clearRect() {
            return undefined
          },
          fillRect() {
            return undefined
          },
          strokeRect() {
            return undefined
          },
          measureText() {
            return {
              actualBoundingBoxAscent: 12
            }
          },
          fillText() {
            return undefined
          },
          drawImage,
          save() {
            return undefined
          },
          restore() {
            return undefined
          },
          beginPath() {
            return undefined
          },
          moveTo() {
            return undefined
          },
          lineTo() {
            return undefined
          },
          stroke() {
            return undefined
          },
          fill() {
            return undefined
          },
          closePath() {
            return undefined
          },
          arcTo() {
            return undefined
          }
        }
      }
    })

    const createdImages: TestImage[] = []

    class TestImage extends EventTarget {
      complete = false
      naturalWidth = 0
      naturalHeight = 0
      private currentSrc = ""

      constructor() {
        super()
        createdImages.push(this)
      }

      get src(): string {
        return this.currentSrc
      }

      set src(value: string) {
        this.currentSrc = value
      }
    }

    globalThis.Image = TestImage as unknown as typeof Image

    const container = document.createElement("div")
    const renderer = new CanvasRenderer()
    const displayList: SectionDisplayList = {
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      width: 280,
      height: 200,
      ops: [
        {
          kind: "image",
          sectionId: "section-1",
          sectionHref: "OPS/chapter-1.xhtml",
          blockId: "image-1",
          locator: {
            spineIndex: 0,
            blockId: "image-1",
            progressInSection: 0
          },
          rect: {
            x: 12,
            y: 12,
            width: 160,
            height: 120
          },
          src: "blob:cover-image",
          alt: "Cover",
          loaded: true,
          background: "transparent"
        }
      ],
      interactions: []
    }

    renderer.renderPaginated(container, displayList, 200)

    expect(drawImage).not.toHaveBeenCalled()
    expect(createdImages).toHaveLength(1)

    const image = createdImages[0]!
    image.complete = true
    image.naturalWidth = 320
    image.naturalHeight = 240
    image.dispatchEvent(new Event("load"))

    expect(drawImage).toHaveBeenCalledTimes(1)
  })

  it("draws loaded images with preserved aspect ratio inside the target rect", () => {
    const drawImage = vi.fn()

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value() {
        return {
          fillStyle: "#000",
          strokeStyle: "#000",
          lineWidth: 1,
          textBaseline: "alphabetic",
          setTransform() {
            return undefined
          },
          clearRect() {
            return undefined
          },
          fillRect() {
            return undefined
          },
          strokeRect() {
            return undefined
          },
          measureText() {
            return {
              actualBoundingBoxAscent: 12
            }
          },
          fillText() {
            return undefined
          },
          drawImage,
          save() {
            return undefined
          },
          restore() {
            return undefined
          },
          beginPath() {
            return undefined
          },
          moveTo() {
            return undefined
          },
          lineTo() {
            return undefined
          },
          stroke() {
            return undefined
          },
          fill() {
            return undefined
          },
          closePath() {
            return undefined
          },
          arcTo() {
            return undefined
          }
        }
      }
    })

    class LoadedImage extends EventTarget {
      complete = true
      naturalWidth = 320
      naturalHeight = 640
      private currentSrc = ""

      get src(): string {
        return this.currentSrc
      }

      set src(value: string) {
        this.currentSrc = value
      }
    }

    globalThis.Image = LoadedImage as unknown as typeof Image

    const container = document.createElement("div")
    const renderer = new CanvasRenderer()
    const displayList: SectionDisplayList = {
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      width: 280,
      height: 200,
      ops: [
        {
          kind: "image",
          sectionId: "section-1",
          sectionHref: "OPS/chapter-1.xhtml",
          blockId: "image-1",
          locator: {
            spineIndex: 0,
            blockId: "image-1",
            progressInSection: 0
          },
          rect: {
            x: 12,
            y: 12,
            width: 160,
            height: 120
          },
          src: "blob:cover-image",
          alt: "Cover",
          loaded: true,
          background: "transparent"
        }
      ],
      interactions: []
    }

    renderer.renderPaginated(container, displayList, 200)

    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 62, 12, 60, 120)
  })

  it("offsets text drawing away from the top edge to avoid clipping tall glyphs", () => {
    const fillText = vi.fn()

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value() {
        return {
          fillStyle: "#000",
          strokeStyle: "#000",
          lineWidth: 1,
          textBaseline: "alphabetic",
          setTransform() {
            return undefined
          },
          clearRect() {
            return undefined
          },
          fillRect() {
            return undefined
          },
          strokeRect() {
            return undefined
          },
          measureText() {
            return {
              actualBoundingBoxAscent: 38
            }
          },
          fillText,
          drawImage() {
            return undefined
          },
          save() {
            return undefined
          },
          restore() {
            return undefined
          },
          beginPath() {
            return undefined
          },
          moveTo() {
            return undefined
          },
          lineTo() {
            return undefined
          },
          stroke() {
            return undefined
          },
          fill() {
            return undefined
          },
          closePath() {
            return undefined
          },
          arcTo() {
            return undefined
          }
        }
      }
    })

    const container = document.createElement("div")
    const renderer = new CanvasRenderer()
    const displayList: SectionDisplayList = {
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      width: 280,
      height: 120,
      ops: [
        {
          kind: "text",
          sectionId: "section-1",
          sectionHref: "OPS/chapter-1.xhtml",
          blockId: "heading-1",
          locator: {
            spineIndex: 0,
            blockId: "heading-1",
            progressInSection: 0
          },
          rect: {
            x: 12,
            y: 0,
            width: 180,
            height: 48
          },
          text: "中文版序",
          x: 12,
          y: 0,
          width: 180,
          font: '700 36px "Iowan Old Style", "Palatino Linotype", serif',
          color: "#111827",
          backgroundColor: undefined,
          highlightColor: undefined,
          underline: undefined,
          href: undefined
        }
      ],
      interactions: []
    }

    renderer.renderPaginated(container, displayList, 120)

    expect(fillText).toHaveBeenCalledWith("中文版序", 12, 40.88)
  })

  it("removes non-section placeholder nodes before scroll rendering", () => {
    const container = document.createElement("div")
    container.innerHTML =
      '<article class="placeholder-page">Waiting</article><div class="stale-node"></div>'

    const renderer = new CanvasRenderer()
    const result = renderer.renderScrollable(container, [
      {
        sectionId: "section-1",
        sectionHref: "OPS/chapter-1.xhtml",
        height: 420
      }
    ])

    expect(container.querySelector(".placeholder-page")).toBeNull()
    expect(container.querySelector(".stale-node")).toBeNull()
    expect(
      container.querySelector('article[data-section-id="section-1"]')
    ).toBeTruthy()
    expect(result.totalCanvasHeight).toBe(0)
  })

  it("clears stale DOM children when reusing a section wrapper for canvas rendering", () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value() {
        return {
          setTransform() {
            return undefined
          },
          clearRect() {
            return undefined
          },
          measureText() {
            return {
              actualBoundingBoxAscent: 12
            }
          }
        }
      }
    })

    const container = document.createElement("div")
    container.innerHTML =
      '<article data-section-id="section-1" class="epub-section epub-section-dom"><p class="stale-dom">目录</p></article>'

    const renderer = new CanvasRenderer()
    const displayList: SectionDisplayList = {
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      width: 280,
      height: 120,
      ops: [],
      interactions: []
    }

    renderer.renderScrollable(container, [
      {
        sectionId: "section-1",
        sectionHref: "OPS/chapter-1.xhtml",
        height: 120,
        displayList
      }
    ])

    const wrapper = container.querySelector<HTMLElement>(
      'article[data-section-id="section-1"]'
    )
    expect(wrapper?.classList.contains("epub-section-canvas")).toBe(true)
    expect(wrapper?.querySelector(".stale-dom")).toBeNull()
    expect(wrapper?.querySelector("canvas.epub-canvas-section")).toBeTruthy()
  })

  it("aligns text layer glyph tops with the measured canvas ascent", () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value() {
        return {
          fillStyle: "#000",
          strokeStyle: "#000",
          lineWidth: 1,
          textBaseline: "alphabetic",
          font: "",
          setTransform() {
            return undefined
          },
          clearRect() {
            return undefined
          },
          fillRect() {
            return undefined
          },
          strokeRect() {
            return undefined
          },
          measureText() {
            return {
              actualBoundingBoxAscent: 25,
              actualBoundingBoxDescent: 0,
              fontBoundingBoxAscent: 38,
              fontBoundingBoxDescent: 11
            }
          },
          fillText() {
            return undefined
          },
          drawImage() {
            return undefined
          },
          save() {
            return undefined
          },
          restore() {
            return undefined
          },
          beginPath() {
            return undefined
          },
          moveTo() {
            return undefined
          },
          lineTo() {
            return undefined
          },
          stroke() {
            return undefined
          },
          fill() {
            return undefined
          },
          closePath() {
            return undefined
          },
          arcTo() {
            return undefined
          }
        }
      }
    })

    const container = document.createElement("div")
    const renderer = new CanvasRenderer()
    const displayList: SectionDisplayList = {
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      width: 280,
      height: 120,
      ops: [
        {
          kind: "text",
          sectionId: "section-1",
          sectionHref: "OPS/chapter-1.xhtml",
          blockId: "text-1",
          locator: {
            spineIndex: 0,
            blockId: "text-1",
            progressInSection: 0
          },
          rect: {
            x: 12,
            y: 0,
            width: 180,
            height: 48
          },
          text: "Alignment",
          x: 12,
          y: 0,
          width: 180,
          font: '700 36px "Iowan Old Style", "Palatino Linotype", serif',
          color: "#111827",
          backgroundColor: undefined,
          highlightColor: undefined,
          underline: undefined,
          href: undefined
        }
      ],
      interactions: []
    }

    renderer.renderPaginated(container, displayList, 120)

    const textRun = container.querySelector<HTMLElement>(".epub-text-run")
    expect(Number.parseFloat(textRun?.style.top ?? "0")).toBeCloseTo(-10.12, 2)
    expect(textRun?.style.height).toBe("49px")
    expect(textRun?.style.lineHeight).toBe("49px")
  })
})
