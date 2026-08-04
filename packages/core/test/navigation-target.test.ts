import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"
import {
  createBlockLocator,
  flattenTocTargets,
  findRenderedAnchorTarget,
  resolveBookHrefLocator
} from "../src/runtime/navigation-target"

function createBook(sections: SectionDocument[]): Book {
  return {
    metadata: {
      title: "Navigation Target Test"
    },
    manifest: [],
    spine: sections.map((section, index) => ({
      idref: `item-${index + 1}`,
      href: section.href,
      linear: true
    })),
    toc: [],
    sections
  }
}

describe("navigation target helpers", () => {
  it("creates block locators with section-relative progress", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter.xhtml",
      title: "Chapter",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Intro" }]
        },
        {
          id: "text-2",
          kind: "text",
          inlines: [{ kind: "text", text: "Target" }]
        },
        {
          id: "text-3",
          kind: "text",
          inlines: [{ kind: "text", text: "Outro" }]
        }
      ],
      anchors: {}
    }

    expect(
      createBlockLocator({
        section,
        spineIndex: 0,
        blockId: "text-2"
      })
    ).toEqual({
      spineIndex: 0,
      blockId: "text-2",
      progressInSection: 0.5
    })
  })

  it("resolves href fragments into anchor-aware locators", () => {
    const sectionDocument = parseXhtmlDocument(
      `<?xml version="1.0"?>
      <html>
        <head><title>Chapter 1</title></head>
        <body>
          <p>Intro</p>
          <section id="later">
            <h2>Later</h2>
            <p>Target paragraph</p>
          </section>
        </body>
      </html>`,
      "OPS/chapter-1.xhtml"
    )
    const section: SectionDocument = {
      ...sectionDocument,
      id: "section-1"
    }

    expect(
      resolveBookHrefLocator({
        book: createBook([section]),
        currentSectionIndex: 0,
        href: "OPS/chapter-1.xhtml#later"
      })
    ).toEqual({
      spineIndex: 0,
      blockId: section.anchors.later,
      anchorId: "later",
      progressInSection: 0.5
    })
  })

  it("finds rendered anchors by id and legacy name", () => {
    const container = document.createElement("article")
    container.innerHTML = `
      <div class="epub-dom-section">
        <h2 id="chapter-1">Chapter 1</h2>
        <a name="legacy-anchor"></a>
      </div>
    `

    expect(findRenderedAnchorTarget(container, "chapter-1")?.id).toBe(
      "chapter-1"
    )
    expect(
      findRenderedAnchorTarget(container, "legacy-anchor")?.getAttribute("name")
    ).toBe("legacy-anchor")
  })

  it("flattens nested toc items into href-resolved targets", () => {
    const firstSection: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Intro" }]
        }
      ],
      anchors: {
        intro: "text-1"
      }
    }
    const secondSection: SectionDocument = {
      id: "section-2",
      href: "OPS/chapter-2.xhtml",
      title: "Chapter 2",
      blocks: [
        {
          id: "text-2",
          kind: "text",
          inlines: [{ kind: "text", text: "Details" }]
        }
      ],
      anchors: {
        details: "text-2"
      }
    }
    const book: Book = {
      ...createBook([firstSection, secondSection]),
      toc: [
        {
          id: "toc-1",
          label: "Chapter 1",
          href: "OPS/chapter-1.xhtml#intro",
          children: [
            {
              id: "toc-2",
              label: "Chapter 2",
              href: "OPS/chapter-2.xhtml#details",
              children: []
            }
          ]
        }
      ]
    }

    expect(flattenTocTargets(book)).toEqual([
      {
        id: "toc-1",
        label: "Chapter 1",
        href: "OPS/chapter-1.xhtml#intro",
        depth: 0,
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          anchorId: "intro",
          progressInSection: 0
        }
      },
      {
        id: "toc-2",
        label: "Chapter 2",
        href: "OPS/chapter-2.xhtml#details",
        depth: 1,
        parentId: "toc-1",
        locator: {
          spineIndex: 1,
          blockId: "text-2",
          anchorId: "details",
          progressInSection: 0
        }
      }
    ])
  })
})
