import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"
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

describe("EpubReader bookmarks", () => {
  it("creates bookmarks from the current publication and location", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Paragraph" }]
        }
      ]
    }

    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Bookmark Reader" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(
      reader as unknown as { book: Book; sourceName: string | null }
    ).sourceName = "sample.epub"

    await reader.goToLocation({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })

    const bookmark = reader.createBookmark({ label: "Saved here" })
    expect(bookmark?.publicationId).toBe(
      "title:Bookmark Reader::source:sample.epub"
    )
    expect(bookmark?.locator.href).toBe("OPS/chapter-1.xhtml")
    expect(bookmark?.locator.blockId).toBe("text-1")
    expect(bookmark?.locator.cfi).toBe("epubcfi(/6/2!/2[text-1])")
  })

  it("restores bookmarks through anchor-aware fallback and records diagnostics", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })
    const parsed = parseXhtmlDocument(
      `<?xml version="1.0"?>
      <html>
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
      ...parsed,
      id: "section-1"
    }
    const book: Book = {
      metadata: {
        title: "Bookmark Reader",
        identifier: "urn:uuid:bookmark-reader"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book; sourceName: string | null }).book =
      book

    const restored = await reader.restoreBookmark({
      id: "bookmark-1",
      publicationId: "identifier:urn:uuid:bookmark-reader",
      locator: {
        href: "OPS/chapter-1.xhtml",
        anchorId: "later",
        progressInSection: 0.1
      },
      createdAt: "2026-04-18T10:00:00.000Z"
    })

    expect(restored).toBe(true)
    expect(reader.getCurrentLocation()).toEqual({
      spineIndex: 0,
      blockId: section.anchors.later,
      anchorId: "later",
      progressInSection: 0.5
    })
    expect(reader.getLastLocationRestoreDiagnostics()).toEqual({
      requestedPrecision: "anchor",
      resolvedPrecision: "anchor",
      matchedBy: "href",
      fallbackApplied: false,
      status: "restored"
    })
  })

  it("rejects bookmarks from another publication and exposes diagnostics", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "Bookmark Reader",
        identifier: "urn:uuid:bookmark-reader"
      },
      manifest: [],
      spine: [],
      toc: [],
      sections: []
    }

    const restored = await reader.restoreBookmark({
      id: "bookmark-1",
      publicationId: "identifier:other-book",
      locator: {
        href: "OPS/chapter-1.xhtml",
        progressInSection: 0
      },
      createdAt: "2026-04-18T10:00:00.000Z"
    })

    expect(restored).toBe(false)
    expect(reader.getLastLocationRestoreDiagnostics()).toEqual({
      requestedPrecision: "section",
      fallbackApplied: false,
      status: "failed",
      reason: "publication-mismatch"
    })
  })

  it("restores bookmarks from cfi-only locators and reports cfi diagnostics", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "scroll" })
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
    const book: Book = {
      metadata: {
        title: "Bookmark Reader",
        identifier: "urn:uuid:bookmark-reader"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book; sourceName: string | null }).book =
      book

    const restored = await reader.restoreBookmark({
      id: "bookmark-2",
      publicationId: "identifier:urn:uuid:bookmark-reader",
      locator: {
        cfi: "epubcfi(/6/2!/4[stale-block-id])"
      },
      createdAt: "2026-04-18T10:00:00.000Z"
    })

    expect(restored).toBe(true)
    expect(reader.getCurrentLocation()).toEqual({
      spineIndex: 0,
      blockId: "text-2",
      cfi: "epubcfi(/6/2!/4[stale-block-id])",
      progressInSection: 1
    })
    expect(reader.getLastLocationRestoreDiagnostics()).toEqual({
      requestedPrecision: "cfi",
      resolvedPrecision: "cfi",
      matchedBy: "cfi",
      fallbackApplied: false,
      status: "restored"
    })
  })

  it("restores paginated progress bookmarks without snapping back to the first block", async () => {
    const container = createContainer()
    const reader = new EpubReader({ container, mode: "paginated" })
    const repeatedText = Array.from({ length: 140 }, () => ({
      kind: "text" as const,
      text: "Progress bookmark pagination target text. "
    }))
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: repeatedText
        },
        {
          id: "text-2",
          kind: "text",
          inlines: repeatedText
        }
      ]
    }
    const book: Book = {
      metadata: {
        title: "Bookmark Reader",
        identifier: "urn:uuid:bookmark-reader"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    ;(reader as unknown as { book: Book; sourceName: string | null }).book =
      book

    await reader.render()
    await reader.goToPage(3)

    const savedPage = reader.getPaginationInfo().currentPage
    expect(savedPage).toBe(3)

    const bookmark = reader.createBookmark({ label: "saved progress page" })
    expect(bookmark?.locator.progressInSection).toBeGreaterThan(0)
    expect(bookmark?.locator.cfi).toBeUndefined()

    await reader.goToPage(1)
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    const restored = await reader.restoreBookmark(bookmark!)
    expect(restored).toBe(true)
    expect(reader.getPaginationInfo().currentPage).toBe(savedPage)
    expect(reader.getLastLocationRestoreDiagnostics()).toEqual({
      requestedPrecision: "progress",
      resolvedPrecision: "progress",
      matchedBy: "href",
      fallbackApplied: false,
      status: "restored"
    })
  })
})
