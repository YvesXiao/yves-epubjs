import { describe, expect, it, vi } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import { EpubReader } from "../src/runtime/reader"

function createContainer(): HTMLDivElement {
  const container = document.createElement("div")
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: 260
  })
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    value: 180
  })
  Object.defineProperty(container, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: 260,
      bottom: 180,
      width: 260,
      height: 180,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  })
  document.body.appendChild(container)
  return container
}

function createPagedSection(
  overrides: Partial<SectionDocument> = {}
): SectionDocument {
  return {
    id: "section-1",
    href: "OPS/chapter-1.xhtml",
    title: "Chapter 1",
    lang: "en",
    anchors: {},
    blocks: [
      {
        id: "text-1",
        kind: "text",
        inlines: Array.from({ length: 36 }, () => ({
          kind: "text" as const,
          text: "This is a long paragraph designed to spill across multiple pages. "
        }))
      }
    ],
    ...overrides
  }
}

async function flushKeyboardNavigation(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("EpubReader reading navigation", () => {
  it("exposes ltr paginated navigation context and responds to ArrowRight/ArrowLeft", async () => {
    const container = createContainer()
    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createPagedSection()

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "LTR Reader",
        language: "en"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    await reader.render()

    expect(reader.getReadingNavigationContext()).toEqual({
      spineIndex: 0,
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      contentDirection: "ltr",
      pageProgression: "ltr",
      rtlActive: false,
      previousPageKey: "ArrowLeft",
      nextPageKey: "ArrowRight"
    })
    expect(container.dataset.pageProgression).toBe("ltr")
    expect(container.dataset.nextPageKey).toBe("ArrowRight")
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
    await flushKeyboardNavigation()
    expect(reader.getPaginationInfo().currentPage).toBe(2)

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    )
    await flushKeyboardNavigation()
    expect(reader.getPaginationInfo().currentPage).toBe(1)
  })

  it("swaps paginated arrow-key navigation when rtl progression is active", async () => {
    const container = createContainer()
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        experimentalRtl: true
      }
    })
    const section = createPagedSection({
      lang: "ar",
      dir: "rtl"
    })

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "RTL Reader",
        language: "ar"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    await reader.render()

    expect(reader.getReadingNavigationContext()).toEqual({
      spineIndex: 0,
      sectionId: "section-1",
      sectionHref: "OPS/chapter-1.xhtml",
      contentDirection: "rtl",
      pageProgression: "rtl",
      rtlActive: true,
      previousPageKey: "ArrowRight",
      nextPageKey: "ArrowLeft"
    })
    expect(container.dataset.pageProgression).toBe("rtl")
    expect(container.dataset.previousPageKey).toBe("ArrowRight")
    expect(container.dataset.nextPageKey).toBe("ArrowLeft")
    expect(container.dir).toBe("rtl")
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    )
    await flushKeyboardNavigation()
    expect(reader.getPaginationInfo().currentPage).toBe(2)

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
    await flushKeyboardNavigation()
    expect(reader.getPaginationInfo().currentPage).toBe(1)
  })

  it("uses physical page-edge click zones for ltr and rtl paginated navigation", async () => {
    const ltrContainer = createContainer()
    const ltrReader = new EpubReader({
      container: ltrContainer,
      mode: "paginated"
    })
    const ltrSection = createPagedSection()

    ;(ltrReader as unknown as { book: Book }).book = {
      metadata: {
        title: "LTR Click Reader",
        language: "en"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: ltrSection.href, linear: true }],
      toc: [],
      sections: [ltrSection]
    }

    await ltrReader.render()
    ltrContainer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 250, clientY: 90 })
    )
    await flushKeyboardNavigation()
    expect(ltrReader.getPaginationInfo().currentPage).toBe(2)

    ltrContainer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 90 })
    )
    await flushKeyboardNavigation()
    expect(ltrReader.getPaginationInfo().currentPage).toBe(1)

    const rtlContainer = createContainer()
    const rtlReader = new EpubReader({
      container: rtlContainer,
      mode: "paginated",
      preferences: {
        experimentalRtl: true
      }
    })
    const rtlSection = createPagedSection({
      lang: "ar",
      dir: "rtl"
    })

    ;(rtlReader as unknown as { book: Book }).book = {
      metadata: {
        title: "RTL Click Reader",
        language: "ar"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: rtlSection.href, linear: true }],
      toc: [],
      sections: [rtlSection]
    }

    await rtlReader.render()
    rtlContainer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 90 })
    )
    await flushKeyboardNavigation()
    expect(rtlReader.getPaginationInfo().currentPage).toBe(2)

    rtlContainer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 250, clientY: 90 })
    )
    await flushKeyboardNavigation()
    expect(rtlReader.getPaginationInfo().currentPage).toBe(1)
  })

  it("emits paginatedCenterTapped for center clicks without changing page", async () => {
    const container = createContainer()
    const onPaginatedCenterTap = vi.fn()
    const reader = new EpubReader({
      container,
      mode: "paginated",
      onPaginatedCenterTap
    })
    const section = createPagedSection()

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "Center Tap Reader",
        language: "en"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const centerTappedPayloads: Array<{
      source: "dom" | "canvas"
      offsetX: number
      containerWidth: number
      spineIndex: number | null
    }> = []
    reader.on("paginatedCenterTapped", (payload) => {
      centerTappedPayloads.push({
        source: payload.source,
        offsetX: payload.offsetX,
        containerWidth: payload.containerWidth,
        spineIndex: payload.locator?.spineIndex ?? null
      })
    })

    await reader.render()
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    container.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 130, clientY: 90 })
    )
    await flushKeyboardNavigation()

    expect(reader.getPaginationInfo().currentPage).toBe(1)
    expect(centerTappedPayloads).toEqual([
      {
        source: "canvas",
        offsetX: 130,
        containerWidth: 260,
        spineIndex: 0
      }
    ])
    expect(onPaginatedCenterTap).toHaveBeenCalledTimes(1)
    expect(onPaginatedCenterTap).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "canvas",
        offsetX: 130,
        containerWidth: 260,
        locator: expect.objectContaining({
          spineIndex: 0
        })
      })
    )
  })

  it("does not emit paginatedCenterTapped when edge click triggers page turn", async () => {
    const container = createContainer()
    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createPagedSection()

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "Edge Tap Reader",
        language: "en"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    const centerTappedPayloads: unknown[] = []
    reader.on("paginatedCenterTapped", (payload) => {
      centerTappedPayloads.push(payload)
    })

    await reader.render()
    container.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 250, clientY: 90 })
    )
    await flushKeyboardNavigation()

    expect(reader.getPaginationInfo().currentPage).toBe(2)
    expect(centerTappedPayloads).toHaveLength(0)
  })

  it("keeps toc jumps and bookmark restore stable in rtl paginated mode", async () => {
    const container = createContainer()
    const reader = new EpubReader({
      container,
      mode: "paginated",
      preferences: {
        experimentalRtl: true
      }
    })
    const repeatedText = Array.from({ length: 20 }, () => ({
      kind: "text" as const,
      text: "RTL pagination target text. "
    }))
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "RTL Chapter",
      lang: "ar",
      dir: "rtl",
      anchors: {
        later: "text-2"
      },
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

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "RTL Bookmark Reader",
        identifier: "urn:uuid:rtl-bookmark-reader",
        language: "ar"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [
        {
          id: "toc-later",
          label: "Later",
          href: `${section.href}#later`,
          children: []
        }
      ],
      sections: [section]
    }

    await reader.render()
    expect(reader.getReadingNavigationContext()?.pageProgression).toBe("rtl")
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    await reader.goToTocItem("toc-later")
    const targetPage = reader.getPaginationInfo().currentPage
    const targetLocation = reader.getCurrentLocation()
    expect(targetLocation?.blockId).toBe("text-2")
    expect(targetPage).toBeGreaterThan(1)

    const bookmark = reader.createBookmark({ label: "rtl target" })
    expect(bookmark?.publicationId).toBe(
      "identifier:urn:uuid:rtl-bookmark-reader"
    )
    expect(bookmark?.locator.blockId).toBe("text-2")

    await reader.goToPage(1)
    expect(reader.getPaginationInfo().currentPage).toBe(1)

    const restored = await reader.restoreBookmark(bookmark!)
    expect(restored).toBe(true)
    expect(reader.getCurrentLocation()?.blockId).toBe("text-2")
    expect(reader.getPaginationInfo().currentPage).toBe(targetPage)
    expect(reader.getReadingNavigationContext()?.pageProgression).toBe("rtl")
  })

  it("reports paginated overall progress and supports percentage jumps", async () => {
    const container = createContainer()
    const reader = new EpubReader({
      container,
      mode: "paginated"
    })
    const section = createPagedSection()

    ;(reader as unknown as { book: Book }).book = {
      metadata: {
        title: "Paginated Progress"
      },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    }

    await reader.render()

    const startSnapshot = reader.getReadingProgress()
    expect(startSnapshot?.overallProgress).toBe(0)
    expect(startSnapshot?.currentPage).toBe(1)
    expect(startSnapshot?.totalPages ?? 0).toBeGreaterThan(1)

    const endLocator = await reader.goToProgress(1)
    expect(endLocator?.spineIndex).toBe(0)
    expect(reader.getPaginationInfo().currentPage).toBeGreaterThan(1)
    expect(reader.getReadingProgress()?.overallProgress).toBe(1)

    await reader.goToProgress(0)
    expect(reader.getPaginationInfo().currentPage).toBe(1)
    expect(reader.getReadingProgress()?.overallProgress).toBe(0)
  })
})
