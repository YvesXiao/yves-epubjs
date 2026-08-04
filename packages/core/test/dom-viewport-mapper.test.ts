import { describe, expect, it } from "vitest"
import type { Locator, SectionDocument } from "../src/model/types"
import {
  mapDomLocatorToViewport,
  mapDomPointToLocator
} from "../src/runtime/dom-viewport-mapper"

describe("dom viewport mapper", () => {
  it("prefers rendered anchor geometry before falling back to section progress", () => {
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect"
    )

    try {
      const container = document.createElement("div")
      const sectionElement = document.createElement("article")
      const domSection = document.createElement("div")
      const heading = document.createElement("h2")
      heading.id = "details"
      domSection.className = "epub-dom-section"
      domSection.appendChild(heading)
      sectionElement.appendChild(domSection)

      Object.defineProperty(container, "scrollLeft", {
        configurable: true,
        writable: true,
        value: 0
      })
      Object.defineProperty(container, "scrollTop", {
        configurable: true,
        writable: true,
        value: 0
      })

      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value() {
          if (this === container) {
            return {
              x: 0,
              y: 100,
              top: 100,
              left: 0,
              bottom: 580,
              right: 320,
              width: 320,
              height: 480,
              toJSON() {
                return this
              }
            }
          }
          if (this === domSection) {
            return {
              x: 0,
              y: 116,
              top: 116,
              left: 0,
              bottom: 516,
              right: 320,
              width: 320,
              height: 400,
              toJSON() {
                return this
              }
            }
          }
          if (this === heading) {
            return {
              x: 20,
              y: 240,
              top: 240,
              left: 20,
              bottom: 272,
              right: 300,
              width: 280,
              height: 32,
              toJSON() {
                return this
              }
            }
          }
          return (
            originalGetBoundingClientRect?.value?.call(this) ?? {
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
          )
        }
      })

      const rects = mapDomLocatorToViewport({
        container,
        mode: "paginated",
        sectionElement,
        locator: {
          spineIndex: 0,
          anchorId: "details",
          progressInSection: 0.5
        },
        sectionTop: 0,
        sectionHeight: 1200
      })

      expect(rects).toEqual([
        {
          x: 20,
          y: 140,
          width: 280,
          height: 32
        }
      ])

      const fallbackRects = mapDomLocatorToViewport({
        container,
        mode: "paginated",
        sectionElement,
        locator: {
          spineIndex: 0,
          progressInSection: 0.25
        },
        sectionTop: 0,
        sectionHeight: 1200
      })

      expect(fallbackRects).toEqual([
        {
          x: 0,
          y: 316,
          width: 320,
          height: 1
        }
      ])
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

  it("maps viewport points back to dom locators with anchor and block metadata", () => {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight"
    )
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect"
    )

    try {
      const container = document.createElement("div")
      const sectionElement = document.createElement("article")
      const domSection = document.createElement("div")
      const paragraph = document.createElement("p")
      paragraph.id = "details-block"
      const anchor = document.createElement("a")
      anchor.setAttribute("name", "details")
      paragraph.appendChild(anchor)
      domSection.className = "epub-dom-section"
      domSection.appendChild(paragraph)
      sectionElement.appendChild(domSection)

      const section: SectionDocument = {
        id: "section-1",
        href: "OPS/complex.xhtml",
        anchors: {
          details: "details-block"
        },
        blocks: []
      }

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          if (this === domSection) {
            return 1600
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() {
          if (this === domSection) {
            return 1600
          }
          return originalScrollHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value() {
          if (this === container) {
            return {
              x: 0,
              y: 80,
              top: 80,
              left: 0,
              bottom: 560,
              right: 320,
              width: 320,
              height: 480,
              toJSON() {
                return this
              }
            }
          }
          if (this === domSection) {
            return {
              x: 0,
              y: 96,
              top: 96,
              left: 0,
              bottom: 516,
              right: 320,
              width: 320,
              height: 420,
              toJSON() {
                return this
              }
            }
          }
          if (this === paragraph) {
            return {
              x: 16,
              y: 280,
              top: 280,
              left: 16,
              bottom: 328,
              right: 304,
              width: 288,
              height: 48,
              toJSON() {
                return this
              }
            }
          }
          if (this === anchor) {
            return {
              x: 20,
              y: 288,
              top: 288,
              left: 20,
              bottom: 300,
              right: 180,
              width: 160,
              height: 12,
              toJSON() {
                return this
              }
            }
          }
          return (
            originalGetBoundingClientRect?.value?.call(this) ?? {
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
          )
        }
      })

      const locator = mapDomPointToLocator({
        container,
        sectionElement,
        section,
        spineIndex: 0,
        point: {
          x: 24,
          y: 210
        }
      })

      expect(locator).toEqual<Locator>({
        spineIndex: 0,
        anchorId: "details",
        blockId: "details-block",
        progressInSection: 0.12125
      })
    } finally {
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
      if (originalGetBoundingClientRect) {
        Object.defineProperty(
          HTMLElement.prototype,
          "getBoundingClientRect",
          originalGetBoundingClientRect
        )
      }
    }
  })

  it("maps points inside legacy paragraphs to the preceding empty anchor", () => {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight"
    )
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "getBoundingClientRect"
    )

    try {
      const container = document.createElement("div")
      const sectionElement = document.createElement("article")
      const domSection = document.createElement("div")
      const fileposAnchor = document.createElement("span")
      const paragraph = document.createElement("p")

      domSection.className = "epub-dom-section"
      fileposAnchor.id = "filepos0000203096"
      paragraph.textContent = "Legacy paragraph without its own id."
      domSection.appendChild(fileposAnchor)
      domSection.appendChild(paragraph)
      sectionElement.appendChild(domSection)

      const section: SectionDocument = {
        id: "section-1",
        href: "OEBPS/text00000.html",
        anchors: {
          filepos0000203096: "text-42"
        },
        blocks: []
      }

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          if (this === domSection) {
            return 2000
          }
          return originalOffsetHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() {
          if (this === domSection) {
            return 2000
          }
          return originalScrollHeight?.get?.call(this) ?? 0
        }
      })

      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value() {
          if (this === container) {
            return {
              x: 0,
              y: 80,
              top: 80,
              left: 0,
              bottom: 560,
              right: 320,
              width: 320,
              height: 480,
              toJSON() {
                return this
              }
            }
          }
          if (this === domSection) {
            return {
              x: 0,
              y: 96,
              top: 96,
              left: 0,
              bottom: 516,
              right: 320,
              width: 320,
              height: 420,
              toJSON() {
                return this
              }
            }
          }
          if (this === fileposAnchor) {
            return {
              x: 16,
              y: 190,
              top: 190,
              left: 16,
              bottom: 190,
              right: 16,
              width: 0,
              height: 0,
              toJSON() {
                return this
              }
            }
          }
          if (this === paragraph) {
            return {
              x: 16,
              y: 200,
              top: 200,
              left: 16,
              bottom: 260,
              right: 304,
              width: 288,
              height: 60,
              toJSON() {
                return this
              }
            }
          }
          return (
            originalGetBoundingClientRect?.value?.call(this) ?? {
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
          )
        }
      })

      const locator = mapDomPointToLocator({
        container,
        sectionElement,
        section,
        spineIndex: 0,
        point: {
          x: 24,
          y: 150
        }
      })

      expect(locator).toEqual<Locator>({
        spineIndex: 0,
        anchorId: "filepos0000203096",
        blockId: "text-42",
        progressInSection: 0.067
      })
    } finally {
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
      if (originalGetBoundingClientRect) {
        Object.defineProperty(
          HTMLElement.prototype,
          "getBoundingClientRect",
          originalGetBoundingClientRect
        )
      }
    }
  })
})
