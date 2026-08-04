import { describe, expect, it } from "vitest"
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter"
import { parseXhtmlDocument } from "../src/parser/xhtml-parser"

function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripIds)
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {}

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (key === "id") {
        continue
      }
      next[key] = stripIds(child)
    }

    return next
  }

  return value
}

describe("parseXhtmlDocument", () => {
  it("maps headings, paragraphs, lists, quotes, code blocks, images, and thematic breaks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" dir="rtl">
        <head>
          <title>Chapter 1</title>
          <meta name="viewport" content="width=1024,height=768" />
        </head>
        <body>
          <h1 id="intro">Chapter 1</h1>
          <p>Alice was beginning to get very tired.</p>
          <blockquote>
            <p>What is the use of a book?</p>
          </blockquote>
          <pre><code data-language="js">console.log('alice')</code></pre>
          <img src="../images/cover.png" alt="Cover" width="320" height="480" />
          <hr />
          <ul>
            <li>First item</li>
            <li><p>Second item</p></li>
          </ul>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/text/chapter-1.xhtml")

    expect(section.title).toBe("Chapter 1")
    expect(section.lang).toBe("en")
    expect(section.dir).toBe("rtl")
    expect(section.renditionViewport).toEqual({
      width: 1024,
      height: 768
    })
    expect(section.anchors.intro).toBe("heading-1")
    expect(section.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "text",
      "quote",
      "code",
      "image",
      "thematic-break",
      "list"
    ])

    const imageBlock = section.blocks[4]
    expect(imageBlock).toMatchObject({
      kind: "image",
      src: "OPS/images/cover.png",
      alt: "Cover",
      width: 320,
      height: 480
    })
  })

  it("preserves preformatted code indentation while trimming only wrapper newlines", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>
          <pre><code>
  const answer = 42
    return answer
          </code></pre>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/code.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "code",
      text: "  const answer = 42\n    return answer"
    })
  })

  it("parses ordered lists and tables into structured blocks", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <ol start="3">
            <li>Third</li>
            <li>Fourth</li>
          </ol>
          <table>
            <tr>
              <th>Name</th>
              <td colspan="2">Alice</td>
            </tr>
          </table>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/chapter.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "list",
      ordered: true,
      start: 3
    })
    expect(section.blocks[1]).toMatchObject({
      kind: "table"
    })
    expect(stripIds(section)).toEqual({
      href: "OPS/chapter.xhtml",
      blocks: [
        {
          kind: "list",
          tagName: "ol",
          ordered: true,
          start: 3,
          items: [
            {
              blocks: [
                {
                  kind: "text",
                  tagName: "li",
                  inlines: [{ kind: "text", text: "Third" }]
                }
              ]
            },
            {
              blocks: [
                {
                  kind: "text",
                  tagName: "li",
                  inlines: [{ kind: "text", text: "Fourth" }]
                }
              ]
            }
          ]
        },
        {
          kind: "table",
          tagName: "table",
          rows: [
            {
              cells: [
                {
                  blocks: [
                    {
                      kind: "text",
                      inlines: [{ kind: "text", text: "Name" }]
                    }
                  ],
                  header: true
                },
                {
                  blocks: [
                    {
                      kind: "text",
                      inlines: [{ kind: "text", text: "Alice" }]
                    }
                  ],
                  colSpan: 2
                }
              ]
            }
          ]
        }
      ],
      anchors: {}
    })
  })

  it("preserves legacy paragraph alignment and font tag styling for old epub markup", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p align="center">
            <img src="Image00122.jpg" width="644" height="219" />
          </p>
          <p align="center">
            <font size="2" color="#663300"><b>图1.3 简历中描述项目的STAR模型</b></font>
          </p>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/text00000.html")

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      style: {
        textAlign: "center"
      },
      inlines: [
        {
          kind: "image",
          src: "OPS/Image00122.jpg",
          width: 644,
          height: 219
        }
      ]
    })

    expect(section.blocks[1]).toMatchObject({
      kind: "text",
      style: {
        textAlign: "center"
      },
      inlines: [
        {
          kind: "span",
          style: {
            fontSize: 13,
            color: "#663300"
          }
        }
      ]
    })
  })

  it("flattens structural wrapper elements and preserves supported semantic blocks", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <section id="chapter-2">
            <div>
              <h2><a id="heading-anchor"></a>Wrapped heading</h2>
              <aside>Ignored aside</aside>
              <p>Wrapped paragraph</p>
            </div>
          </section>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/wrapped.xhtml")

    expect(section.blocks).toHaveLength(3)
    expect(section.blocks[0]).toMatchObject({ kind: "heading", level: 2 })
    expect(section.blocks[1]).toMatchObject({ kind: "aside" })
    expect(section.blocks[2]).toMatchObject({ kind: "text" })
    expect(section.anchors["chapter-2"]).toBe("heading-1")
    expect(section.anchors["heading-anchor"]).toBe("heading-1")
  })

  it("binds standalone anchor markers to the next rendered block", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <a id="chapter-4"></a>
          <a name="chapter-4-name"></a>
          <span id="chapter-4-span"></span>
          <h2>Chapter 4</h2>
          <p>Later paragraph</p>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/combined.xhtml")

    expect(section.blocks).toHaveLength(2)
    expect(section.blocks[0]).toMatchObject({ kind: "heading", level: 2 })
    expect(section.anchors["chapter-4"]).toBe("heading-1")
    expect(section.anchors["chapter-4-name"]).toBe("heading-1")
    expect(section.anchors["chapter-4-span"]).toBe("heading-1")
  })

  it("maps figure, aside, nav, definition lists, and table captions into structured blocks", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <figure id="fig-1">
            <img src="images/figure.png" alt="Figure" />
            <figcaption>Figure caption</figcaption>
          </figure>
          <aside><p>Side note</p></aside>
          <nav><p>Related links</p></nav>
          <dl>
            <dt>Term</dt>
            <dd>Definition</dd>
          </dl>
          <table>
            <caption>Table caption</caption>
            <tr><td>Value</td></tr>
          </table>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/semantic.xhtml")

    expect(section.blocks.map((block) => block.kind)).toEqual([
      "figure",
      "aside",
      "nav",
      "definition-list",
      "table"
    ])
    expect(section.blocks[0]).toMatchObject({
      kind: "figure",
      blocks: [{ kind: "image" }],
      caption: [
        { kind: "text", inlines: [{ kind: "text", text: "Figure caption" }] }
      ]
    })
    expect(section.blocks[1]).toMatchObject({
      kind: "aside",
      blocks: [{ kind: "text" }]
    })
    expect(section.blocks[2]).toMatchObject({
      kind: "nav",
      blocks: [{ kind: "text" }]
    })
    expect(section.blocks[3]).toMatchObject({
      kind: "definition-list",
      items: [
        {
          term: [{ kind: "text" }],
          descriptions: [[{ kind: "text" }]]
        }
      ]
    })
    expect(section.blocks[4]).toMatchObject({
      kind: "table",
      caption: [
        { kind: "text", inlines: [{ kind: "text", text: "Table caption" }] }
      ]
    })
  })

  it("keeps footnote-style links and anchors resolvable within the same section", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p>Reference <a href="#fn-1">1</a></p>
          <aside id="fn-1">
            <p>Footnote body</p>
          </aside>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/text/chapter.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      inlines: [
        { kind: "text", text: "Reference " },
        {
          kind: "link",
          href: "OPS/text/chapter.xhtml#fn-1",
          children: [{ kind: "text", text: "1" }]
        }
      ]
    })
    expect(section.blocks[1]).toMatchObject({ kind: "aside" })
    expect(section.anchors["fn-1"]).toBe("aside-2")
  })

  it("preserves external anchor hrefs instead of rewriting them as book-relative paths", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p><a href="https://example.com/docs">Docs</a><a href="mailto:reader@example.com">Mail</a></p>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/chapter.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      inlines: [
        {
          kind: "link",
          href: "https://example.com/docs"
        },
        {
          kind: "link",
          href: "mailto:reader@example.com"
        }
      ]
    })
  })

  it("preserves external image resources for canvas and dom rendering", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p><img src="https://public.example.com/ei/plate.jpg?token=1" alt="Plate" /></p>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/Text/part4.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      inlines: [
        {
          kind: "image",
          src: "https://public.example.com/ei/plate.jpg?token=1",
          alt: "Plate"
        }
      ]
    })
  })

  it("falls back unknown block tags to child content and preserves supported inline style metadata", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <custom-block id="custom-1" class="note-shell" style="text-align: center; position: absolute;">
            <unknown-inline style="color: #333; inset: 0;">Lead text</unknown-inline>
          </custom-block>
          <script>window.__ignored = true;</script>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/fallback.xhtml")

    expect(section.blocks).toHaveLength(1)
    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      tagName: "unknown-inline",
      className: "note-shell",
      style: {
        color: "#333",
        textAlign: "center"
      },
      inlines: [{ kind: "text", text: "Lead text" }]
    })
    expect(section.anchors["custom-1"]).toBe("text-1")
  })

  it("applies linked stylesheet rules to inline image metadata without changing structure", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p>Alpha<img class="h-pic" src="images/badge.png" width="20" height="20" alt="Badge" />Omega</p>
        </body>
      </html>`
    const stylesheet = parseCssStyleSheet(`
      .h-pic {
        height: 1.1em;
        margin-left: 0.2em;
        margin-right: 0.3em;
        vertical-align: middle;
      }
    `)

    const section = parseXhtmlDocument(xml, "OPS/chapter.xhtml", [stylesheet])

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      inlines: [
        { kind: "text", text: "Alpha" },
        {
          kind: "image",
          src: "OPS/images/badge.png",
          width: 20,
          height: 20,
          alt: "Badge",
          className: "h-pic",
          style: {
            height: 17.6,
            marginLeft: 3.2,
            marginRight: 4.8,
            verticalAlign: "middle"
          }
        },
        { kind: "text", text: "Omega" }
      ]
    })
  })

  it("ignores unsupported stylesheet selectors without aborting chapter parsing", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p class="lead">Hello</p>
        </body>
      </html>`
    const stylesheet = parseCssStyleSheet(`
      :lang(ja) { font-family: serif; }
      p.lead { color: #333; }
    `)

    const section = parseXhtmlDocument(xml, "OPS/chapter.xhtml", [stylesheet])

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      style: {
        color: "#333"
      },
      inlines: [{ kind: "text", text: "Hello" }]
    })
  })

  it("converts common legacy HTML named entities into readable text in XHTML content", () => {
    const xml = `<?xml version="1.0"?>
      <html>
        <body>
          <p>&nbsp版权所有&nbsp; &ldquo;示例&rdquo; &mdash; 价格&nbsp;&yen;100，折扣&nbsp;&frac12;，版权&nbsp;&copy;2026</p>
        </body>
      </html>`

    const section = parseXhtmlDocument(xml, "OPS/chapter.xhtml")

    expect(section.blocks[0]).toMatchObject({
      kind: "text",
      inlines: [
        {
          kind: "text",
          text: " 版权所有 “示例” — 价格 ¥100，折扣 ½，版权 ©2026"
        }
      ]
    })
  })
})
