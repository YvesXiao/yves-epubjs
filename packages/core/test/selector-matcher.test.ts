import { describe, expect, it } from "vitest"
import { parseHtmlDocument } from "../src/parser/html-dom-adapter"
import {
  matchesHtmlSelector,
  selectFirstHtmlElement,
  selectHtmlElements
} from "../src/parser/selector-matcher"

describe("selector matcher", () => {
  it("selects matching elements from XHTML DOM trees", () => {
    const document = parseHtmlDocument(`
      <html>
        <body>
          <section class="chapter">
            <p class="lead"><a href="#note-1">Intro</a></p>
            <p>Body</p>
          </section>
        </body>
      </html>
    `)

    const paragraphs = selectHtmlElements("section.chapter p", document)
    expect(paragraphs).toHaveLength(2)

    const link = selectFirstHtmlElement("section.chapter p.lead a", document)
    expect(link?.attribs.href).toBe("#note-1")
  })

  it("checks whether an element matches a selector", () => {
    const document = parseHtmlDocument(`
      <html>
        <body>
          <section class="chapter">
            <p class="lead">Intro</p>
          </section>
        </body>
      </html>
    `)

    const paragraph = selectFirstHtmlElement("p", document)
    expect(paragraph).toBeTruthy()
    expect(
      paragraph
        ? matchesHtmlSelector(paragraph, "section.chapter p.lead")
        : false
    ).toBe(true)
    expect(
      paragraph
        ? matchesHtmlSelector(paragraph, "section.chapter p.note")
        : true
    ).toBe(false)
  })
})
