import { describe, expect, it } from "vitest"
import { parseInlineContent } from "../src/parser/inline-parser"

describe("parseInlineContent", () => {
  it("parses semantic spans, emphasis, links, code, images, and line breaks", () => {
    const source = {
      "#text": "Alice ",
      span: { "#text": "reader " },
      strong: { "#text": "saw" },
      em: { "#text": " a " },
      sub: { "#text": "2" },
      small: {
        mark: { "#text": " note " }
      },
      a: {
        "@_href": "notes.xhtml#n1",
        "#text": "note"
      },
      br: "",
      code: { "#text": "print('alice')" },
      img: {
        "@_src": "../images/inline.png",
        "@_alt": "Inline"
      }
    }

    expect(parseInlineContent(source, "OPS/text/chapter.xhtml")).toEqual([
      { kind: "text", text: "Alice " },
      { kind: "span", children: [{ kind: "text", text: "reader " }] },
      { kind: "strong", children: [{ kind: "text", text: "saw" }] },
      { kind: "emphasis", children: [{ kind: "text", text: " a " }] },
      { kind: "sub", children: [{ kind: "text", text: "2" }] },
      {
        kind: "small",
        children: [
          {
            kind: "mark",
            children: [{ kind: "text", text: " note " }]
          }
        ]
      },
      {
        kind: "link",
        href: "OPS/text/notes.xhtml#n1",
        children: [{ kind: "text", text: "note" }]
      },
      { kind: "line-break" },
      { kind: "code", text: "print('alice')" },
      {
        kind: "image",
        src: "OPS/images/inline.png",
        alt: "Inline"
      }
    ])
  })

  it("downgrades unknown inline tags into span nodes while preserving children", () => {
    expect(
      parseInlineContent(
        {
          custom: {
            "#text": "Wrapped"
          }
        },
        "OPS/chapter.xhtml"
      )
    ).toEqual([
      {
        kind: "span",
        children: [{ kind: "text", text: "Wrapped" }]
      }
    ])
  })
})
