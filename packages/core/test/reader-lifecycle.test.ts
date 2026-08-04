import { afterEach, describe, expect, it, vi } from "vitest"
import { EpubReader } from "../src"
import { InMemoryResourceContainer } from "../src/container/resource-container"
import { BookParser, type BookParseResult } from "../src/parser/book-parser"
import type { Book } from "../src/model/types"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function createParseResult(title: string): BookParseResult {
  const href = `OPS/${title}.xhtml`
  const book: Book = {
    metadata: { title },
    manifest: [],
    spine: [{ idref: title, href, linear: true }],
    toc: [],
    sections: [
      {
        id: title,
        href,
        title,
        blocks: [],
        anchors: {}
      }
    ]
  }

  return {
    book,
    resources: new InMemoryResourceContainer({}),
    sectionContents: [
      {
        href,
        content: `<html><body><p>${title}</p></body></html>`,
        linkedStyleSheets: []
      }
    ]
  }
}

describe("EpubReader lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("removes container event listeners symmetrically on destroy", () => {
    const container = document.createElement("div")
    const addEventListenerSpy = vi.spyOn(container, "addEventListener")
    const removeEventListenerSpy = vi.spyOn(container, "removeEventListener")

    const reader = new EpubReader({
      container,
      mode: "paginated"
    })

    const addedHandlers = new Map<string, EventListenerOrEventListenerObject>()
    for (const [type, handler] of addEventListenerSpy.mock.calls) {
      if (
        (type === "scroll" || type === "click" || type === "keydown") &&
        handler
      ) {
        addedHandlers.set(type, handler)
      }
    }

    expect(addedHandlers.get("scroll")).toBeTruthy()
    expect(addedHandlers.get("click")).toBeTruthy()
    expect(addedHandlers.get("keydown")).toBeTruthy()

    reader.destroy()

    const removedHandlers = new Map<
      string,
      EventListenerOrEventListenerObject
    >()
    for (const [type, handler] of removeEventListenerSpy.mock.calls) {
      if (
        (type === "scroll" || type === "click" || type === "keydown") &&
        handler
      ) {
        removedHandlers.set(type, handler)
      }
    }

    expect(removedHandlers.get("scroll")).toBe(addedHandlers.get("scroll"))
    expect(removedHandlers.get("click")).toBe(addedHandlers.get("click"))
    expect(removedHandlers.get("keydown")).toBe(addedHandlers.get("keydown"))
  })

  it("keeps the latest book when concurrent opens finish out of order", async () => {
    const first = createDeferred<BookParseResult>()
    const second = createDeferred<BookParseResult>()
    const parseDetailed = vi
      .spyOn(BookParser.prototype, "parseDetailed")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const reader = new EpubReader()
    const openedTitles: string[] = []
    reader.on("opened", ({ book }) => openedTitles.push(book.metadata.title))

    const firstOpen = reader.open(new Uint8Array([1]))
    await vi.waitFor(() => expect(parseDetailed).toHaveBeenCalledTimes(1))
    const secondOpen = reader.open(new Uint8Array([2]))
    await vi.waitFor(() => expect(parseDetailed).toHaveBeenCalledTimes(2))

    second.resolve(createParseResult("second"))
    await expect(secondOpen).resolves.toMatchObject({
      metadata: { title: "second" }
    })
    first.resolve(createParseResult("first"))

    await expect(firstOpen).rejects.toMatchObject({
      name: "ReaderOperationCancelledError"
    })
    expect(reader.getBook()?.metadata.title).toBe("second")
    expect(openedTitles).toEqual(["second"])
  })

  it("invalidates a pending open when destroyed", async () => {
    const pending = createDeferred<BookParseResult>()
    vi.spyOn(BookParser.prototype, "parseDetailed").mockReturnValue(
      pending.promise
    )
    const reader = new EpubReader()
    const opened = vi.fn()
    reader.on("opened", opened)

    const opening = reader.open(new Uint8Array([1]))
    await Promise.resolve()
    reader.destroy()
    pending.resolve(createParseResult("late"))

    await expect(opening).rejects.toMatchObject({
      name: "ReaderOperationCancelledError"
    })
    expect(reader.getBook()).toBeNull()
    expect(opened).not.toHaveBeenCalled()
  })

  it("does not render a publication after a newer open starts", async () => {
    vi.spyOn(BookParser.prototype, "parseDetailed")
      .mockResolvedValueOnce(createParseResult("first"))
      .mockResolvedValueOnce(createParseResult("second"))
    const reader = new EpubReader()
    await reader.open(new Uint8Array([1]))

    const fonts = createDeferred<void>()
    const renderCurrentSection = vi.fn()
    const internals = reader as unknown as {
      waitForFonts: () => Promise<void>
      renderCurrentSection: () => void
    }
    internals.waitForFonts = () => fonts.promise
    internals.renderCurrentSection = renderCurrentSection
    const rendered = vi.fn()
    reader.on("rendered", rendered)

    const rendering = reader.render()
    await reader.open(new Uint8Array([2]))
    fonts.resolve()
    await rendering

    expect(reader.getBook()?.metadata.title).toBe("second")
    expect(renderCurrentSection).not.toHaveBeenCalled()
    expect(rendered).not.toHaveBeenCalled()
  })

  it("does not finish a pending render after destroy", async () => {
    vi.spyOn(BookParser.prototype, "parseDetailed").mockResolvedValue(
      createParseResult("first")
    )
    const reader = new EpubReader()
    await reader.open(new Uint8Array([1]))
    const fonts = createDeferred<void>()
    const renderCurrentSection = vi.fn()
    const internals = reader as unknown as {
      waitForFonts: () => Promise<void>
      renderCurrentSection: () => void
    }
    internals.waitForFonts = () => fonts.promise
    internals.renderCurrentSection = renderCurrentSection

    const rendering = reader.render()
    reader.destroy()
    fonts.resolve()
    await rendering

    expect(renderCurrentSection).not.toHaveBeenCalled()
    expect(reader.getBook()).toBeNull()
  })

  it("does not emit stale preference events for a newer publication", async () => {
    vi.spyOn(BookParser.prototype, "parseDetailed")
      .mockResolvedValueOnce(createParseResult("first"))
      .mockResolvedValueOnce(createParseResult("second"))
    const reader = new EpubReader()
    await reader.open(new Uint8Array([1]))
    const fonts = createDeferred<void>()
    const renderCurrentSection = vi.fn()
    const internals = reader as unknown as {
      waitForFonts: () => Promise<void>
      renderCurrentSection: () => void
    }
    internals.waitForFonts = () => fonts.promise
    internals.renderCurrentSection = renderCurrentSection
    const preferencesChanged = vi.fn()
    const themeChanged = vi.fn()
    reader.on("preferencesChanged", preferencesChanged)
    reader.on("themeChanged", themeChanged)

    const changingTheme = reader.setTheme({ color: "#123456" })
    await reader.open(new Uint8Array([2]))
    fonts.resolve()
    await changingTheme

    expect(reader.getBook()?.metadata.title).toBe("second")
    expect(renderCurrentSection).not.toHaveBeenCalled()
    expect(preferencesChanged).not.toHaveBeenCalled()
    expect(themeChanged).not.toHaveBeenCalled()
  })
})
