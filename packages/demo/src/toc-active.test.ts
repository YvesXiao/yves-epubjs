import { describe, expect, it } from "vitest"
import { findActiveTocId } from "./toc-active"

describe("findActiveTocId", () => {
  it("preserves the selected toc item when multiple entries share the same split-file href", () => {
    const toc = [
      {
        id: "part-1",
        label: "Part I",
        href: "EPUB/index_split_000.html#p23",
        children: [
          {
            id: "chapter-1",
            label: "1 The Role of Algorithms in Computing",
            href: "EPUB/index_split_000.html#p26",
            children: []
          },
          {
            id: "chapter-2",
            label: "2 Getting Started",
            href: "EPUB/index_split_000.html#p37",
            children: []
          }
        ]
      }
    ]

    expect(findActiveTocId(toc, "EPUB/index_split_000.html", "chapter-1")).toBe(
      "chapter-1"
    )
  })

  it("falls back to a base href match when there is no previous selection", () => {
    const toc = [
      {
        id: "contents",
        label: "Contents",
        href: "EPUB/index_split_000.html#p6",
        children: []
      },
      {
        id: "preface",
        label: "Preface",
        href: "EPUB/index_split_001.html#p14",
        children: []
      }
    ]

    expect(findActiveTocId(toc, "EPUB/index_split_001.html")).toBe("preface")
  })
})
