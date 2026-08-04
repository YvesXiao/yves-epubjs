import { describe, expect, it } from "vitest"
import {
  findHtmlElementsByTagName,
  getHtmlChildElements,
  getHtmlElementAttribute,
  getHtmlNodeTextContent,
  getHtmlTagName,
  parseHtmlDocument
} from "../src/parser/html-dom-adapter"

describe("html DOM adapter", () => {
  it("parses XHTML into a stable DOM tree", () => {
    const document = parseHtmlDocument(`<?xml version="1.0" encoding="UTF-8"?>
      <html xml:lang="en">
        <head><title>Demo</title></head>
        <body>
          <section id="chapter-1">
            <p>Hello <span class="accent">world</span>.</p>
            <img src="cover.png" alt="Cover" />
          </section>
        </body>
      </html>`)

    const rootElements = getHtmlChildElements(document)
    expect(rootElements.map(getHtmlTagName)).toEqual(["html"])

    const htmlElement = rootElements[0]
    expect(
      htmlElement && getHtmlElementAttribute(htmlElement, "xml:lang")
    ).toBe("en")

    const sections = findHtmlElementsByTagName(document, "section")
    expect(sections).toHaveLength(1)
    expect(sections[0] && getHtmlElementAttribute(sections[0], "id")).toBe(
      "chapter-1"
    )

    const images = findHtmlElementsByTagName(document, "img")
    expect(images).toHaveLength(1)
    expect(images[0] && getHtmlElementAttribute(images[0], "src")).toBe(
      "cover.png"
    )
  })

  it("collects descendant text content without dropping inline order", () => {
    const document = parseHtmlDocument(
      `<html><body><p>Hello <span>dear</span> reader.</p></body></html>`
    )
    const paragraphs = findHtmlElementsByTagName(document, "p")

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0] && getHtmlNodeTextContent(paragraphs[0])).toBe(
      "Hello dear reader."
    )
  })
})
