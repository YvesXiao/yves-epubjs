import { describe, expect, it } from "vitest"
import {
  canParseSpineContentDocument,
  parseSpineContentDocument
} from "../src/parser/spine-content-parser"

describe("spine content parser", () => {
  it("only accepts XHTML-like spine content media types", () => {
    expect(canParseSpineContentDocument("application/xhtml+xml")).toBe(true)
    expect(canParseSpineContentDocument("text/html")).toBe(true)
    expect(canParseSpineContentDocument("text/css")).toBe(false)
    expect(canParseSpineContentDocument(undefined)).toBe(false)
  })

  it("parses supported XHTML spine documents", () => {
    const section = parseSpineContentDocument({
      href: "OPS/chapter-1.xhtml",
      mediaType: "application/xhtml+xml",
      content: `<?xml version="1.0"?>
        <html>
          <head><title>Chapter 1</title></head>
          <body><h1>Chapter 1</h1><p>Intro text</p></body>
        </html>`
    })

    expect(section.title).toBe("Chapter 1")
    expect(section.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "text"
    ])
  })

  it("throws for non-content media types", () => {
    expect(() =>
      parseSpineContentDocument({
        href: "OPS/styles.css",
        mediaType: "text/css",
        content: "body { color: red; }"
      })
    ).toThrow("Unsupported spine content media type: text/css (OPS/styles.css)")
  })
})
