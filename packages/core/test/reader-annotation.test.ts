import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"
import {
  createSharedChapterRenderInput,
  toCanvasChapterRenderInput
} from "../src"

describe("EpubReader annotations", () => {
  it("creates annotations from the current locator and derives quote text", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    })

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
          inlines: [{ kind: "text", text: "Annotation target paragraph." }]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"

    await reader.goToLocation({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })

    const annotation = reader.createAnnotation({ note: "Remember this", color: "#f59e0b" })
    expect(annotation?.publicationId).toBe("title:Annotations::source:sample.epub")
    expect(annotation?.quote).toBe("Annotation target paragraph.")
    expect(annotation?.note).toBe("Remember this")
  })

  it("creates annotations from stored text ranges and derives exact quote text", () => {
    const container = document.createElement("div")
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
          inlines: [{ kind: "text", text: "Alpha exact quote target omega." }]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"

    const annotation = reader.createAnnotation({
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        inlineOffset: 6,
        progressInSection: 0
      },
      textRange: {
        start: { blockId: "text-1", inlineOffset: 6 },
        end: { blockId: "text-1", inlineOffset: 17 }
      },
      style: "underline"
    })

    expect(annotation?.quote).toBe("exact quote")
    expect(annotation?.textRange).toEqual({
      start: { blockId: "text-1", inlineOffset: 6 },
      end: { blockId: "text-1", inlineOffset: 17 }
    })
  })

  it("stores annotations and exposes them as annotation decorations", () => {
    const container = document.createElement("div")
    const reader = new EpubReader({ container, mode: "scroll" })

    ;(reader as unknown as { book: Book }).book = {
      metadata: { title: "Annotations", identifier: "urn:uuid:annotations" },
      manifest: [],
      spine: [],
      toc: [],
      sections: []
    }

    reader.setAnnotations([
      {
        id: "annotation-1",
        publicationId: "identifier:urn:uuid:annotations",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.2
        },
        quote: "Target paragraph",
        note: "Important",
        color: "#f59e0b",
        createdAt: "2026-04-18T11:00:00.000Z",
        updatedAt: "2026-04-18T11:05:00.000Z"
      }
    ])

    expect(reader.getAnnotations()).toHaveLength(1)
    expect(reader.getDecorations("annotations")).toEqual([
      {
        id: "annotation:annotation-1",
        group: "annotations",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.2
        },
        style: "highlight",
        color: "#f59e0b"
      }
    ])

    reader.clearAnnotations()
    expect(reader.getAnnotations()).toHaveLength(0)
    expect(reader.getDecorations("annotations")).toHaveLength(0)
  })

  it("only exposes current-location decorations when debug mode is enabled", async () => {
    const container = document.createElement("div")
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
          inlines: [{ kind: "text", text: "Annotation target paragraph." }]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"

    await reader.goToLocation({
      spineIndex: 0,
      blockId: "text-1",
      progressInSection: 0
    })

    expect(reader.getDecorations("current-location")).toHaveLength(0)

    reader.setDebugMode(true)
    expect(reader.getDecorations("current-location")).toEqual([
      {
        id: "current-location:active",
        group: "current-location",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0
        },
        style: "active"
      }
    ])

    reader.setDebugMode(false)
    expect(reader.getDecorations("current-location")).toHaveLength(0)
  })

  it("creates annotations from an active canvas text selection", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    const reader = new EpubReader({ container, mode: "scroll" })
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <p>Canvas selectable annotation target.</p>
            </section>
          </body>
        </html>`
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    }
    ;(
      reader as unknown as {
        book: Book
        sourceName: string | null
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(
      reader as unknown as {
        book: Book
        sourceName: string | null
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).sourceName = "sample.epub"
    ;(
      reader as unknown as {
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).chapterRenderInputs = [sharedInput]

    await reader.render()

    const textRun = container.querySelector<HTMLElement>(".epub-text-run[data-reader-block-id='text-1']")
    const originalGetSelection = window.getSelection
    const textNode = textRun?.firstChild ?? null
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "Canvas selectable",
        rangeCount: 1,
        getRangeAt: () => ({
          startContainer: textNode,
          startOffset: 0,
          endContainer: textNode,
          endOffset: 17,
          getClientRects: () => [new DOMRect(24, 32, 128, 24)]
        }),
        anchorNode: textNode,
        focusNode: textNode
      })
    })

    const annotation = reader.createAnnotationFromSelection({ color: "#2563eb" })

    expect(annotation?.locator.blockId).toBe("text-1")
    expect(annotation?.quote).toBe("Canvas selectable")
    expect(annotation?.color).toBe("#2563eb")
    expect(annotation?.textRange).toEqual({
      start: {
        blockId: "text-1",
        inlineOffset: 0
      },
      end: {
        blockId: "text-1",
        inlineOffset: 17
      }
    })

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("creates annotations from a dom text selection when the rendered block uses a synthetic block marker", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">Dom selectable annotation target.</p>
      </div>
    `

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter-1.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter-1.xhtml",
          title: "Chapter 1",
          anchors: {},
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Dom selectable annotation target." }]
            }
          ]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"

    const textNode = container.querySelector("p")?.firstChild ?? null
    const originalGetSelection = window.getSelection
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "Dom selectable",
        rangeCount: 1,
        getRangeAt: () => ({
          startContainer: textNode,
          startOffset: 0,
          endContainer: textNode,
          endOffset: 14,
          getClientRects: () => [new DOMRect(24, 32, 128, 24)]
        }),
        anchorNode: textNode,
        focusNode: textNode
      })
    })

    const annotation = reader.createAnnotationFromSelection({ color: "#2563eb" })

    expect(annotation?.locator.blockId).toBe("text-1")
    expect(annotation?.quote).toBe("Dom selectable")
    expect(annotation?.textRange).toEqual({
      start: {
        blockId: "text-1",
        inlineOffset: 0
      },
      end: {
        blockId: "text-1",
        inlineOffset: 14
      }
    })

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("keeps dom annotation offsets stable when selected text follows an inline note image", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">Alpha <a class="footnote" href="#note-1"><img src="OPS/images/note.png" alt="" /></a><span>Omega target</span>.</p>
      </div>
    `

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter-1.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter-1.xhtml",
          title: "Chapter 1",
          anchors: {},
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [
                { kind: "text", text: "Alpha " },
                {
                  kind: "link",
                  href: "#note-1",
                  className: "footnote",
                  children: [
                    {
                      kind: "image",
                      src: "OPS/images/note.png",
                      alt: ""
                    }
                  ]
                },
                { kind: "text", text: "Omega target." }
              ]
            }
          ]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"

    const textNode = container.querySelector("span")?.firstChild ?? null
    const originalGetSelection = mockDomSelection({
      text: "Omega target",
      node: textNode,
      startOffset: 0,
      endOffset: 12,
      rects: [new DOMRect(72, 32, 112, 20)]
    })

    const annotation = reader.createAnnotationFromSelection({ color: "#2563eb" })

    expect(annotation?.locator.blockId).toBe("text-1")
    expect(annotation?.quote).toBe("Omega target")
    expect(annotation?.textRange).toEqual({
      start: {
        blockId: "text-1",
        inlineOffset: 6
      },
      end: {
        blockId: "text-1",
        inlineOffset: 18
      }
    })

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("exposes host-facing text selection snapshots for active selections", async () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })

    const selectionChanges: Array<{ text: string | null; rectCount: number }> = []
    const reader = new EpubReader({
      container,
      mode: "scroll",
      onTextSelectionChanged: ({ selection }) => {
        selectionChanges.push({
          text: selection?.text ?? null,
          rectCount: selection?.rects.length ?? 0
        })
      }
    })
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/chapter-1.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <p>Canvas selectable annotation target.</p>
            </section>
          </body>
        </html>`
    })
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    }
    ;(
      reader as unknown as {
        book: Book
        sourceName: string | null
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).book = {
      metadata: { title: "Annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }
    ;(
      reader as unknown as {
        book: Book
        sourceName: string | null
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).sourceName = "sample.epub"
    ;(
      reader as unknown as {
        chapterRenderInputs: ReturnType<typeof createSharedChapterRenderInput>[]
      }
    ).chapterRenderInputs = [sharedInput]

    await reader.render()

    const textRun = container.querySelector<HTMLElement>(".epub-text-run[data-reader-block-id='text-1']")
    Object.defineProperty(textRun, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(48, 72, 160, 24)
    })

    const originalGetSelection = window.getSelection
    const selectionState: {
      text: string
      anchorNode: Node | null
      focusNode: Node | null
    } = {
      text: "Canvas selectable",
      anchorNode: textRun?.firstChild ?? null,
      focusNode: textRun?.firstChild ?? null
    }
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => selectionState.text,
        rangeCount: 1,
        getRangeAt: () => ({
          startContainer: selectionState.anchorNode,
          startOffset: 0,
          endContainer: selectionState.focusNode,
          endOffset: 17,
          getClientRects: () => [new DOMRect(48, 72, 160, 24)]
        }),
        anchorNode: selectionState.anchorNode,
        focusNode: selectionState.focusNode,
        removeAllRanges: () => {
          selectionState.text = ""
          selectionState.anchorNode = null
          selectionState.focusNode = null
        }
      })
    })

    document.dispatchEvent(new Event("selectionchange"))
    const snapshot = reader.getCurrentTextSelectionSnapshot()

    expect(snapshot?.text).toBe("Canvas selectable")
    expect(snapshot?.locator.blockId).toBe("text-1")
    expect(snapshot?.textRange).toEqual({
      start: {
        blockId: "text-1",
        inlineOffset: 0
      },
      end: {
        blockId: "text-1",
        inlineOffset: 17
      }
    })
    expect(snapshot?.rects).toEqual([
      {
        x: 48,
        y: 72,
        width: 160,
        height: 24
      }
    ])
    expect(selectionChanges.at(-1)).toEqual({
      text: "Canvas selectable",
      rectCount: 1
    })

    reader.clearCurrentTextSelection()

    expect(reader.getCurrentTextSelectionSnapshot()).toBeNull()
    expect(selectionChanges.at(-1)).toEqual({
      text: null,
      rectCount: 0
    })

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("treats fully covered selections as remove-highlight and splits the existing highlight", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">abcdef</p>
      </div>
    `

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations", identifier: "urn:test:annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter-1.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter-1.xhtml",
          title: "Chapter 1",
          anchors: {},
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "abcdef" }]
            }
          ]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"
    ;(reader as unknown as { annotations: ReturnType<EpubReader["getAnnotations"]> }).annotations = [
      {
        id: "annotation-1",
        publicationId: "identifier:urn:test:annotations",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.1
        },
        textRange: {
          start: {
            blockId: "text-1",
            inlineOffset: 0
          },
          end: {
            blockId: "text-1",
            inlineOffset: 6
          }
        },
        quote: "abcdef",
        color: "#3b82f6",
        createdAt: "2026-04-18T11:00:00.000Z",
        updatedAt: "2026-04-18T11:00:00.000Z"
      }
    ]

    const originalGetSelection = mockDomSelection({
      text: "cd",
      node: container.querySelector("p")?.firstChild ?? null,
      startOffset: 2,
      endOffset: 4,
      rects: [new DOMRect(24, 32, 24, 20)]
    })

    expect(reader.getCurrentSelectionHighlightState()).toEqual({
      mode: "remove-highlight",
      disabled: false
    })

    expect(reader.applyCurrentSelectionHighlightAction()).toEqual({
      mode: "remove-highlight",
      changedCount: 1
    })
    expect(
      reader
        .getAnnotations()
        .map((annotation) => annotation.textRange)
        .sort((left, right) => (left?.start.inlineOffset ?? 0) - (right?.start.inlineOffset ?? 0))
    ).toEqual([
      {
        start: {
          blockId: "text-1",
          inlineOffset: 0
        },
        end: {
          blockId: "text-1",
          inlineOffset: 2
        }
      },
      {
        start: {
          blockId: "text-1",
          inlineOffset: 4
        },
        end: {
          blockId: "text-1",
          inlineOffset: 6
        }
      }
    ])

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("adds only the uncovered suffix when the selection partially overlaps an existing highlight", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">abcdef</p>
      </div>
    `

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations", identifier: "urn:test:annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter-1.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter-1.xhtml",
          title: "Chapter 1",
          anchors: {},
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "abcdef" }]
            }
          ]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"
    ;(reader as unknown as { annotations: ReturnType<EpubReader["getAnnotations"]> }).annotations = [
      {
        id: "annotation-1",
        publicationId: "identifier:urn:test:annotations",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.1
        },
        textRange: {
          start: {
            blockId: "text-1",
            inlineOffset: 0
          },
          end: {
            blockId: "text-1",
            inlineOffset: 4
          }
        },
        quote: "abcd",
        color: "#3b82f6",
        createdAt: "2026-04-18T11:00:00.000Z",
        updatedAt: "2026-04-18T11:00:00.000Z"
      }
    ]

    const originalGetSelection = mockDomSelection({
      text: "cdef",
      node: container.querySelector("p")?.firstChild ?? null,
      startOffset: 2,
      endOffset: 6,
      rects: [new DOMRect(24, 32, 48, 20)]
    })

    expect(reader.getCurrentSelectionHighlightState()).toEqual({
      mode: "highlight",
      disabled: false
    })

    expect(reader.applyCurrentSelectionHighlightAction({ color: "#3b82f6" })).toEqual({
      mode: "highlight",
      changedCount: 1
    })
    expect(
      reader
        .getAnnotations()
        .map((annotation) => annotation.textRange)
        .sort((left, right) => (left?.start.inlineOffset ?? 0) - (right?.start.inlineOffset ?? 0))
    ).toEqual([
      {
        start: {
          blockId: "text-1",
          inlineOffset: 0
        },
        end: {
          blockId: "text-1",
          inlineOffset: 4
        }
      },
      {
        start: {
          blockId: "text-1",
          inlineOffset: 4
        },
        end: {
          blockId: "text-1",
          inlineOffset: 6
        }
      }
    ])

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
  })

  it("creates a pinned selection snapshot when clicking inside an existing highlight", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    })
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 220
    })
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 320, 220)
    })
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 120
    })
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">abcdef</p>
      </div>
    `

    const reader = new EpubReader({ container, mode: "scroll" })
    ;(reader as unknown as { book: Book; sourceName: string | null }).book = {
      metadata: { title: "Annotations", identifier: "urn:test:annotations" },
      manifest: [],
      spine: [{ idref: "item-1", href: "OPS/chapter-1.xhtml", linear: true }],
      toc: [],
      sections: [
        {
          id: "section-1",
          href: "OPS/chapter-1.xhtml",
          title: "Chapter 1",
          anchors: {},
          blocks: [
            {
              id: "text-1",
              kind: "text",
              inlines: [{ kind: "text", text: "abcdef" }]
            }
          ]
        }
      ]
    }
    ;(reader as unknown as { book: Book; sourceName: string | null }).sourceName = "sample.epub"
    ;(reader as unknown as { annotations: ReturnType<EpubReader["getAnnotations"]> }).annotations = [
      {
        id: "annotation-1",
        publicationId: "identifier:urn:test:annotations",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.1
        },
        textRange: {
          start: {
            blockId: "text-1",
            inlineOffset: 1
          },
          end: {
            blockId: "text-1",
            inlineOffset: 5
          }
        },
        quote: "bcde",
        color: "#3b82f6",
        createdAt: "2026-04-18T11:00:00.000Z",
        updatedAt: "2026-04-18T11:00:00.000Z"
      }
    ]

    const originalGetSelection = window.getSelection
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "",
        rangeCount: 0,
        anchorNode: null,
        focusNode: null
      })
    })

    const originalCreateRange = document.createRange.bind(document)
    document.createRange = ((() => ({
      setStart: () => undefined,
      setEnd: () => undefined,
      getClientRects: () => [new DOMRect(24, 32, 72, 20)]
    })) as unknown) as typeof document.createRange

    container.querySelector("p")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 30,
        clientY: 36
      })
    )

    expect(reader.getCurrentTextSelectionSnapshot()).toMatchObject({
      text: "bcde",
      sectionId: "section-1",
      blockId: "text-1",
      textRange: {
        start: {
          blockId: "text-1",
          inlineOffset: 1
        },
        end: {
          blockId: "text-1",
          inlineOffset: 5
        }
      }
    })
    expect(reader.getCurrentSelectionHighlightState()).toEqual({
      mode: "remove-highlight",
      disabled: false
    })

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    })
    document.createRange = originalCreateRange
  })
})

function mockDomSelection(input: {
  text: string
  node: Node | null
  startOffset: number
  endOffset: number
  rects: DOMRect[]
}): typeof window.getSelection {
  const originalGetSelection = window.getSelection
  Object.defineProperty(window, "getSelection", {
    configurable: true,
    value: () => ({
      toString: () => input.text,
      rangeCount: 1,
      getRangeAt: () => ({
        startContainer: input.node,
        startOffset: input.startOffset,
        endContainer: input.node,
        endOffset: input.endOffset,
        getClientRects: () => input.rects
      }),
      anchorNode: input.node,
      focusNode: input.node,
      removeAllRanges: () => undefined
    })
  })

  return originalGetSelection
}
