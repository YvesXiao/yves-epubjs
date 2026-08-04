import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

function createStructuredSection(): SectionDocument {
  return {
    id: "section-structured-pagination",
    href: "OPS/structured-pagination.xhtml",
    title: "Structured Pagination",
    anchors: {
      "table-anchor": "table-1"
    },
    blocks: [
      {
        id: "text-1",
        kind: "text",
        inlines: [
          { kind: "text", text: "Intro paragraph for locator stability." }
        ]
      },
      {
        id: "list-1",
        kind: "list",
        ordered: true,
        items: Array.from({ length: 6 }, (_, index) => ({
          id: `item-${index + 1}`,
          blocks: [
            {
              id: `item-text-${index + 1}`,
              kind: "text",
              inlines: [
                {
                  kind: "text",
                  text: `List item ${index + 1} with enough text to wrap.`
                }
              ]
            }
          ]
        }))
      },
      {
        id: "figure-1",
        kind: "figure",
        blocks: [
          {
            id: "image-1",
            kind: "image",
            src: "OPS/images/figure.png",
            alt: "Figure",
            width: 320,
            height: 180
          }
        ],
        caption: [
          {
            id: "figure-caption-1",
            kind: "text",
            inlines: [
              { kind: "text", text: "Figure caption for locator testing." }
            ]
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
            inlines: [{ kind: "text", text: "Table caption for pagination." }]
          }
        ],
        rows: [
          {
            id: "row-1",
            cells: [
              {
                id: "cell-1",
                header: true,
                blocks: [
                  {
                    id: "cell-text-1",
                    kind: "text",
                    inlines: [{ kind: "text", text: "Name" }]
                  }
                ]
              },
              {
                id: "cell-2",
                header: true,
                blocks: [
                  {
                    id: "cell-text-2",
                    kind: "text",
                    inlines: [{ kind: "text", text: "Value" }]
                  }
                ]
              }
            ]
          },
          ...Array.from({ length: 4 }, (_, index) => ({
            id: `row-${index + 2}`,
            cells: [
              {
                id: `cell-name-${index + 1}`,
                blocks: [
                  {
                    id: `cell-name-text-${index + 1}`,
                    kind: "text" as const,
                    inlines: [
                      { kind: "text" as const, text: `Entry ${index + 1}` }
                    ]
                  }
                ]
              },
              {
                id: `cell-value-${index + 1}`,
                blocks: [
                  {
                    id: `cell-value-text-${index + 1}`,
                    kind: "text" as const,
                    inlines: [
                      { kind: "text" as const, text: `Value ${index + 1}` }
                    ]
                  }
                ]
              }
            ]
          }))
        ]
      }
    ]
  }
}

describe("EpubReader pagination compatibility", () => {
  it("keeps pagination and locators stable for structured sections", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 280
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })

    const reader = new EpubReader({ container, mode: "paginated" })
    const section = createStructuredSection()
    const book: Book = {
      metadata: { title: "Structured Pagination" },
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

    expect(reader.getPaginationInfo().totalPages).toBeGreaterThan(1)

    await reader.goToPage(2)

    expect(reader.getPaginationInfo().currentPage).toBe(2)
    expect(reader.getVisibleDrawBounds().length).toBeGreaterThan(0)
  })

  it("goes to structured block anchors without losing the target locator", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 320
    })

    const reader = new EpubReader({ container, mode: "scroll" })
    const section = createStructuredSection()
    const book: Book = {
      metadata: { title: "Structured Pagination" },
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
          id: "toc-table",
          label: "Table",
          href: `${section.href}#table-anchor`,
          children: []
        }
      ],
      sections: [section]
    }

    ;(reader as unknown as { book: Book }).book = book
    await reader.render()
    await reader.goToTocItem("toc-table")

    expect(reader.getCurrentLocation()?.blockId).toBe("table-1")
  })
})
