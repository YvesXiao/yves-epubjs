import { describe, expect, it } from "vitest"
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter"
import { parseHtmlDocument } from "../src/parser/html-dom-adapter"
import { selectFirstHtmlElement } from "../src/parser/selector-matcher"
import {
  collectMatchedCssRules,
  compareSelectorSpecificity,
  computeSelectorSpecificity
} from "../src/parser/style-rule-matcher"

describe("style rule matcher", () => {
  it("computes selector specificity for supported selector shapes", () => {
    expect(computeSelectorSpecificity("p")).toEqual([0, 0, 1])
    expect(computeSelectorSpecificity(".lead")).toEqual([0, 1, 0])
    expect(computeSelectorSpecificity("#intro")).toEqual([1, 0, 0])
    expect(computeSelectorSpecificity("section.chapter p.lead")).toEqual([
      0, 2, 2
    ])
  })

  it("compares selector specificity lexicographically", () => {
    expect(compareSelectorSpecificity([0, 1, 0], [0, 0, 1])).toBeGreaterThan(0)
    expect(compareSelectorSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareSelectorSpecificity([0, 1, 1], [0, 1, 1])).toBe(0)
  })

  it("collects matched CSS rules in cascade order for a DOM element", () => {
    const document = parseHtmlDocument(`
      <html>
        <body>
          <section class="chapter">
            <p id="intro" class="lead">Hello</p>
          </section>
        </body>
      </html>
    `)
    const paragraph = selectFirstHtmlElement("p", document)
    expect(paragraph).toBeTruthy()

    const stylesheet = parseCssStyleSheet(`
      p { color: black; }
      .lead { font-weight: 600; }
      section.chapter p.lead { color: #333; }
      #intro { color: red; }
    `)

    const matchedRules = paragraph
      ? collectMatchedCssRules(paragraph, [stylesheet])
      : []

    expect(matchedRules.map((rule) => rule.selector)).toEqual([
      "p",
      ".lead",
      "section.chapter p.lead",
      "#intro"
    ])
  })

  it("skips unsupported selectors while still matching supported rules", () => {
    const document = parseHtmlDocument(`
      <html>
        <body>
          <p class="lead">Hello</p>
        </body>
      </html>
    `)
    const paragraph = selectFirstHtmlElement("p", document)
    expect(paragraph).toBeTruthy()

    const stylesheet = parseCssStyleSheet(`
      :lang(ja) { font-family: serif; }
      p.lead { color: #333; }
    `)

    const matchedRules = paragraph
      ? collectMatchedCssRules(paragraph, [stylesheet])
      : []

    expect(matchedRules.map((rule) => rule.selector)).toEqual(["p.lead"])
  })
})
