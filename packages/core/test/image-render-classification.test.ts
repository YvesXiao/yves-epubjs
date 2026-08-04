import { describe, expect, it } from "vitest"
import {
  classifySectionImageRenderCategory,
  collectInlineImageNodeCategories,
  hasInlineImageSemantic,
  isDomInlineImageElement
} from "../src"

describe("image render classification", () => {
  it("classifies presentation and fixed-layout section image contexts first", () => {
    expect(
      classifySectionImageRenderCategory({
        presentationRole: "cover"
      })
    ).toBe("presentation")
    expect(
      classifySectionImageRenderCategory({
        presentationRole: "image-page",
        renditionLayout: "pre-paginated"
      })
    ).toBe("presentation")
    expect(
      classifySectionImageRenderCategory({
        renditionLayout: "pre-paginated"
      })
    ).toBe("fxl")
    expect(classifySectionImageRenderCategory({})).toBeNull()
  })

  it("recognizes footnote and noteref inline image semantics", () => {
    expect(hasInlineImageSemantic({ className: "footnote" })).toBe(true)
    expect(hasInlineImageSemantic({ className: "noteref" })).toBe(true)
    expect(hasInlineImageSemantic({ role: "doc-noteref" })).toBe(true)
    expect(hasInlineImageSemantic({ epubType: "noteref" })).toBe(true)
    expect(hasInlineImageSemantic({ tagName: "sup" })).toBe(true)
    expect(hasInlineImageSemantic({ className: "gallery-link" })).toBe(false)
  })

  it("classifies DOM images inside footnote anchors and mixed text as inline", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <p>Alpha<a class="footnote" href="#note-1"><img id="note" src="note.png"></a>Omega</p>
      <p>Alpha<img id="mixed" src="badge.png">Omega</p>
      <figure><img id="figure" src="plate.png"></figure>
      <p><a href="plate.xhtml"><img id="linked-plate" src="plate.png"></a></p>
    `

    expect(isDomInlineImageElement(container.querySelector("#note")!)).toBe(
      true
    )
    expect(isDomInlineImageElement(container.querySelector("#mixed")!)).toBe(
      true
    )
    expect(isDomInlineImageElement(container.querySelector("#figure")!)).toBe(
      false
    )
    expect(
      isDomInlineImageElement(container.querySelector("#linked-plate")!)
    ).toBe(false)
  })

  it("classifies parsed inline image nodes from ancestor metadata", () => {
    const categories = collectInlineImageNodeCategories([
      {
        kind: "link",
        href: "#note-1",
        tagName: "a",
        className: "footnote",
        children: [
          {
            kind: "image",
            src: "OPS/images/note.png"
          }
        ]
      },
      {
        kind: "span",
        tagName: "span",
        children: [
          {
            kind: "image",
            src: "OPS/images/logo.png"
          }
        ]
      }
    ])

    expect(categories).toEqual([
      {
        src: "OPS/images/note.png",
        category: "inline"
      },
      {
        src: "OPS/images/logo.png",
        category: "block"
      }
    ])
  })
})
