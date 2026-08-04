import { describe, expect, it } from "vitest"
import { parseXhtmlDomDocument } from "../src/parser/xhtml-dom-parser"
import {
  findHtmlElementsByTagName,
  getHtmlElementAttribute,
  getHtmlNodeTextContent
} from "../src/parser/html-dom-adapter"

describe("parseXhtmlDomDocument", () => {
  it("builds a DOM-backed chapter document with body and metadata", () => {
    const parsed = parseXhtmlDomDocument(`<?xml version="1.0" encoding="UTF-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" dir="rtl">
        <head>
          <title>Chapter 1</title>
          <meta name="viewport" content="width=1200,height=1600" />
        </head>
        <body>
          <section id="chapter-1">
            <p>Hello <span class="accent">reader</span>.</p>
          </section>
        </body>
      </html>`)

    expect(parsed.title).toBe("Chapter 1")
    expect(parsed.lang).toBe("en")
    expect(parsed.dir).toBe("rtl")
    expect(parsed.viewport).toEqual({
      width: 1200,
      height: 1600
    })
    expect(parsed.htmlElement?.name).toBe("html")
    expect(parsed.headElement?.name).toBe("head")
    expect(parsed.bodyElement?.name).toBe("body")
  })

  it("preserves body descendants, attribute access, and text order", () => {
    const parsed = parseXhtmlDomDocument(`
      <html>
        <body>
          <figure id="fig-1">
            <img src="images/cover.png" alt="Cover" />
            <figcaption>Cover image</figcaption>
          </figure>
        </body>
      </html>
    `)

    expect(parsed.bodyElement).toBeTruthy()

    const figures = parsed.bodyElement
      ? findHtmlElementsByTagName(parsed.bodyElement, "figure")
      : []
    const images = parsed.bodyElement
      ? findHtmlElementsByTagName(parsed.bodyElement, "img")
      : []
    const captions = parsed.bodyElement
      ? findHtmlElementsByTagName(parsed.bodyElement, "figcaption")
      : []

    expect(figures).toHaveLength(1)
    expect(figures[0] && getHtmlElementAttribute(figures[0], "id")).toBe(
      "fig-1"
    )
    expect(images[0] && getHtmlElementAttribute(images[0], "src")).toBe(
      "images/cover.png"
    )
    expect(captions[0] && getHtmlNodeTextContent(captions[0])).toBe(
      "Cover image"
    )
  })

  it("normalizes common legacy HTML named entities before XHTML parsing", () => {
    const parsed = parseXhtmlDomDocument(`
      <html>
        <body>
          <p title="Tom&nbsp;Jerry &ldquo;quoted&rdquo;">A&nbsp;B&ensp;C&mdash;D&hellip; &copy; &euro; &frac12;</p>
          <p>&nbsp版权所有 &ldquo;示例&rdquo;</p>
        </body>
      </html>
    `)

    const paragraphs = parsed.bodyElement
      ? findHtmlElementsByTagName(parsed.bodyElement, "p")
      : []

    expect(paragraphs).toHaveLength(2)
    expect(
      paragraphs[0] && getHtmlElementAttribute(paragraphs[0], "title")
    ).toBe("Tom\u00A0Jerry “quoted”")
    expect(paragraphs[0] && getHtmlNodeTextContent(paragraphs[0])).toBe(
      "A\u00A0B\u2002C—D… © € ½"
    )
    expect(paragraphs[1] && getHtmlNodeTextContent(paragraphs[1])).toBe(
      "\u00A0版权所有 “示例”"
    )
  })

  it("preserves XML builtin entities and unknown named entities", () => {
    const parsed = parseXhtmlDomDocument(`
      <html>
        <body>
          <p>&amp; &lt; &gt; &quot; &apos; &unknown; &madeup中文</p>
        </body>
      </html>
    `)

    const paragraphs = parsed.bodyElement
      ? findHtmlElementsByTagName(parsed.bodyElement, "p")
      : []

    expect(paragraphs[0] && getHtmlNodeTextContent(paragraphs[0])).toBe(
      `& < > " ' &unknown; &madeup中文`
    )
  })
})
