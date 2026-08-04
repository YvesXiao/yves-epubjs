import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

function createContainer(): HTMLDivElement {
  const container = document.createElement("div")
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: 320
  })
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    value: 480
  })
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    writable: true,
    value: 0
  })
  document.body.appendChild(container)
  return container
}

describe("EpubReader accessibility snapshots", () => {
  it("exposes section and publication accessibility snapshots", () => {
    const reader = new EpubReader({
      container: createContainer(),
      mode: "scroll"
    })
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "heading-1",
          kind: "heading",
          level: 2,
          inlines: [{ kind: "text", text: "Chapter heading" }]
        },
        {
          id: "image-1",
          kind: "image",
          src: "images/chart.jpg",
          alt: "Chart alt text"
        }
      ]
    }

    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Accessibility Reader" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(
      reader as unknown as { book: Book; sourceName: string | null }
    ).sourceName = "sample.epub"

    const sectionSnapshot = reader.getSectionAccessibilitySnapshot()
    const publicationSnapshot = reader.getPublicationAccessibilitySnapshot()

    expect(sectionSnapshot?.sectionId).toBe("section-1")
    expect(sectionSnapshot?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "heading",
          blockId: "heading-1",
          text: "Chapter heading",
          headingLevel: 2
        }),
        expect.objectContaining({
          kind: "image",
          blockId: "image-1",
          text: "Chart alt text",
          altText: "Chart alt text"
        })
      ])
    )

    expect(publicationSnapshot).toEqual(
      expect.objectContaining({
        publicationId: "title:Accessibility Reader::source:sample.epub",
        text: "Chapter heading Chart alt text"
      })
    )
    expect(publicationSnapshot?.sections).toHaveLength(1)
    expect(publicationSnapshot?.diagnostics.imageEntries).toBe(1)
  })

  it("keeps search targets aligned with semantic output entries", async () => {
    const reader = new EpubReader({
      container: createContainer(),
      mode: "scroll"
    })
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "figure-1",
          kind: "figure",
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Body text" }]
            }
          ],
          caption: [
            {
              id: "caption-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Accessible figure caption" }]
            }
          ]
        },
        {
          id: "defs-1",
          kind: "definition-list",
          items: [
            {
              id: "item-1",
              term: [
                {
                  id: "term-1",
                  kind: "text",
                  inlines: [{ kind: "text", text: "Glossary term" }]
                }
              ],
              descriptions: [
                [
                  {
                    id: "desc-1",
                    kind: "text",
                    inlines: [
                      { kind: "text", text: "Semantic definition target" }
                    ]
                  }
                ]
              ]
            }
          ]
        }
      ]
    }

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "Accessibility Search",
        identifier: "urn:uuid:accessibility-search"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const snapshot = reader.getSectionAccessibilitySnapshot(0)
    const captionResults = await reader.search("Accessible figure caption")
    const definitionResults = await reader.search("Semantic definition target")

    expect(
      snapshot?.entries.some(
        (entry) =>
          entry.blockId === captionResults[0]?.locator.blockId &&
          entry.text === "Accessible figure caption"
      )
    ).toBe(true)
    expect(
      snapshot?.entries.some(
        (entry) =>
          entry.blockId === definitionResults[0]?.locator.blockId &&
          entry.text === "Semantic definition target"
      )
    ).toBe(true)
    expect(snapshot?.text).toContain("Accessible figure caption")
    expect(snapshot?.text).toContain("Semantic definition target")
  })
})
