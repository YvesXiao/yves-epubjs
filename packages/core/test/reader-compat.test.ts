import { describe, expect, it } from "vitest"
import type { Book, ReaderOptions, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

describe("EpubReader compatibility behavior", () => {
  it("exposes citic integration contracts on the public reader surface", () => {
    const options: ReaderOptions = {
      onSectionRendered: async () => {},
      onSectionRelocated: async () => {}
    }
    const reader = new EpubReader(options)

    expect(typeof reader.getReadingProgress).toBe("function")
    expect(typeof reader.goToProgress).toBe("function")
    expect(typeof reader.goToHref).toBe("function")
    expect(typeof reader.resolveHrefLocator).toBe("function")
    expect(typeof reader.getTocTargets).toBe("function")
  })

  it("searches text from figure captions, tables, definition lists, and inline image alt text", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    })

    const reader = new EpubReader({ container, mode: "paginated" })
    const section: SectionDocument = {
      id: "section-search-compat",
      href: "OPS/search-compat.xhtml",
      title: "Compatibility Search",
      anchors: {},
      blocks: [
        {
          id: "figure-1",
          kind: "figure",
          blocks: [],
          caption: [
            {
              id: "caption-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Figure caption text" }]
            }
          ]
        },
        {
          id: "table-1",
          kind: "table",
          caption: [
            {
              id: "table-caption-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Score table" }]
            }
          ],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  blocks: [
                    {
                      id: "cell-text-1",
                      kind: "text",
                      inlines: [{ kind: "text", text: "Alice" }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: "dl-1",
          kind: "definition-list",
          items: [
            {
              id: "definition-item-1",
              term: [
                {
                  id: "term-1",
                  kind: "text",
                  inlines: [{ kind: "text", text: "Term" }]
                }
              ],
              descriptions: [
                [
                  {
                    id: "description-1",
                    kind: "text",
                    inlines: [{ kind: "text", text: "Definition body" }]
                  }
                ]
              ]
            }
          ]
        },
        {
          id: "text-1",
          kind: "text",
          inlines: [
            {
              kind: "image",
              src: "OPS/images/icon.png",
              alt: "searchable icon",
              width: 18,
              height: 18
            }
          ]
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Compatibility Search" },
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

    expect(
      (await reader.search("caption")).map((result) => result.locator.blockId)
    ).toContain("caption-1")
    expect(
      (await reader.search("Alice")).map((result) => result.locator.blockId)
    ).toContain("cell-text-1")
    expect(
      (await reader.search("Definition body")).map(
        (result) => result.locator.blockId
      )
    ).toContain("description-1")
    expect(
      (await reader.search("searchable icon")).map(
        (result) => result.locator.blockId
      )
    ).toContain("text-1")
  })

  it("hit tests inline images inside pretext paragraphs", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 240
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 240
    })

    const reader = new EpubReader({ container, mode: "paginated" })
    const section: SectionDocument = {
      id: "section-inline-image-hit",
      href: "OPS/inline-image-hit.xhtml",
      title: "Inline Image Hit",
      anchors: {},
      blocks: [
        {
          id: "text-inline-image",
          kind: "text",
          inlines: [
            {
              kind: "image",
              src: "OPS/images/icon.png",
              alt: "icon",
              width: 24,
              height: 24
            },
            { kind: "text", text: " tail" }
          ]
        }
      ]
    }

    const book: Book = {
      metadata: { title: "Inline Image Hit" },
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

    const imageRegion = (
      reader as unknown as {
        lastInteractionRegions: Array<{
          kind: string
          rect: { x: number; y: number; width: number; height: number }
        }>
      }
    ).lastInteractionRegions.find((region) => region.kind === "image")

    const hit = reader.hitTest({
      x: imageRegion ? imageRegion.rect.x + imageRegion.rect.width * 0.5 : 20,
      y: imageRegion ? imageRegion.rect.y + imageRegion.rect.height * 0.5 : 16
    })

    expect(imageRegion).toBeTruthy()
    expect(hit?.kind).toBe("image")
    expect(hit && hit.kind === "image" ? hit.blockId : undefined).toBe(
      "text-inline-image"
    )
  })

  it("hit tests canvas links with absolute scroll coordinates", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 500
    })
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 0
    })
    container.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 0,
        right: 500,
        bottom: 600,
        width: 400,
        height: 600,
        x: 100,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect
    const sectionElement = document.createElement("article")
    sectionElement.dataset.sectionId = "section-1"
    const textLayer = document.createElement("div")
    textLayer.className = "epub-text-layer-section"
    textLayer.getBoundingClientRect = () =>
      ({
        left: 220,
        top: 0,
        right: 520,
        bottom: 600,
        width: 300,
        height: 600,
        x: 220,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect
    sectionElement.appendChild(textLayer)
    container.appendChild(sectionElement)

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(
      reader as unknown as {
        lastInteractionRegions: Array<{
          kind: "link"
          rect: { x: number; y: number; width: number; height: number }
          sectionId: string
          blockId: string
          href: string
          locator: undefined
          text: string
        }>
      }
    ).lastInteractionRegions = [
      {
        kind: "link",
        rect: { x: 120, y: 560, width: 32, height: 22 },
        sectionId: "section-1",
        blockId: "text-1",
        href: "OPS/notes.xhtml#note-12",
        locator: undefined,
        text: "[12]"
      }
    ]

    const hit = reader.hitTest({ x: 256, y: 71 })

    expect(hit?.kind).toBe("link")
    expect(hit && hit.kind === "link" ? hit.href : undefined).toBe(
      "OPS/notes.xhtml#note-12"
    )
  })
})
