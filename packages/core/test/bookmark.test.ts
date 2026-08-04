import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import {
  createBookmark,
  derivePublicationId,
  deserializeBookmark,
  serializeBookmark
} from "../src/runtime/bookmark"

function createBook(section: SectionDocument): Book {
  return {
    metadata: {
      title: "Bookmark Test",
      identifier: "urn:uuid:bookmark-test"
    },
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
}

describe("bookmark helpers", () => {
  it("derives publication ids from identifiers before falling back to title/source name", () => {
    const identifiedBook = createBook({
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: []
    })

    expect(derivePublicationId({ book: identifiedBook })).toBe(
      "identifier:urn:uuid:bookmark-test"
    )

    expect(
      derivePublicationId({
        book: {
          ...identifiedBook,
          metadata: {
            title: "Fallback Title"
          }
        },
        sourceName: "sample.epub"
      })
    ).toBe("title:Fallback Title::source:sample.epub")
  })

  it("creates serializable bookmarks from locators", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Target paragraph" }]
        }
      ]
    }
    const book = createBook(section)

    const bookmark = createBookmark({
      publicationId: derivePublicationId({ book }),
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        progressInSection: 0.25
      },
      book,
      label: "Current spot",
      excerpt: "Target paragraph",
      createdAt: "2026-04-18T10:00:00.000Z"
    })

    expect(bookmark.publicationId).toBe("identifier:urn:uuid:bookmark-test")
    expect(bookmark.locator).toEqual({
      spineIndex: 0,
      href: "OPS/chapter-1.xhtml",
      blockId: "text-1",
      cfi: "epubcfi(/6/2!/2[text-1])",
      progressInSection: 0.25
    })
    expect(deserializeBookmark(serializeBookmark(bookmark))).toEqual(bookmark)
  })

  it("does not synthesize a cfi for progress-only bookmarks", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Alpha" }]
        },
        {
          id: "text-2",
          kind: "text",
          inlines: [{ kind: "text", text: "Beta" }]
        }
      ]
    }
    const book = createBook(section)

    const bookmark = createBookmark({
      publicationId: derivePublicationId({ book }),
      locator: {
        spineIndex: 0,
        progressInSection: 0.25
      },
      book,
      createdAt: "2026-04-18T10:00:00.000Z"
    })

    expect(bookmark.locator).toEqual({
      spineIndex: 0,
      href: "OPS/chapter-1.xhtml",
      progressInSection: 0.25
    })
  })
})
