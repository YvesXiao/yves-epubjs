import { describe, expect, it } from "vitest"
import type {
  BlockNode,
  InlineNode,
  SectionDocument,
  TableBlock
} from "../src/model/types"

function serializeSection(section: SectionDocument): string {
  return JSON.stringify(section, null, 2)
}

describe("content model", () => {
  it("supports a section document composed of heterogeneous block nodes", () => {
    const heading: BlockNode = {
      id: "heading-1",
      kind: "heading",
      level: 1,
      inlines: [{ kind: "text", text: "Chapter 1" }]
    }

    const paragraph: BlockNode = {
      id: "paragraph-1",
      kind: "text",
      style: {
        textAlign: "justify",
        lineHeight: 1.7
      },
      inlines: [
        { kind: "text", text: "Alice " },
        { kind: "strong", children: [{ kind: "text", text: "opened" }] },
        { kind: "text", text: " the door." }
      ]
    }

    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      lang: "en",
      blocks: [heading, paragraph],
      anchors: {
        intro: "heading-1"
      }
    }

    expect(section.blocks).toHaveLength(2)
    expect(section.anchors.intro).toBe("heading-1")
    expect(serializeSection(section)).toContain('"kind": "heading"')
    expect(serializeSection(section)).toContain('"kind": "text"')
  })

  it("supports nested inline structures for links, emphasis, and images", () => {
    const paragraph: BlockNode = {
      id: "paragraph-inline",
      kind: "text",
      inlines: [
        { kind: "text", text: "Visit " },
        {
          kind: "link",
          href: "OPS/notes.xhtml#note-1",
          children: [
            { kind: "emphasis", children: [{ kind: "text", text: "note 1" }] }
          ]
        },
        { kind: "text", text: " or inspect " },
        { kind: "image", src: "OPS/images/cover.png", alt: "Cover" }
      ]
    }

    const inlines = paragraph.inlines as InlineNode[]

    expect(inlines[1]).toEqual({
      kind: "link",
      href: "OPS/notes.xhtml#note-1",
      children: [
        {
          kind: "emphasis",
          children: [{ kind: "text", text: "note 1" }]
        }
      ]
    })
    expect(inlines[3]).toEqual({
      kind: "image",
      src: "OPS/images/cover.png",
      alt: "Cover"
    })
  })

  it("supports expanded semantic nodes for future reflowable compatibility work", () => {
    const paragraph: BlockNode = {
      id: "paragraph-semantic",
      kind: "text",
      tagName: "p",
      className: "lead",
      lang: "en",
      inlines: [
        { kind: "text", text: "A " },
        {
          kind: "mark",
          children: [
            { kind: "small", children: [{ kind: "text", text: "small note" }] }
          ]
        },
        { kind: "text", text: " with " },
        {
          kind: "sup",
          children: [{ kind: "text", text: "1" }]
        }
      ]
    }

    const figure: BlockNode = {
      id: "figure-1",
      kind: "figure",
      tagName: "figure",
      blocks: [
        {
          id: "image-1",
          kind: "image",
          src: "OPS/images/figure.png",
          alt: "Figure"
        }
      ],
      caption: [
        {
          id: "caption-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Figure caption" }]
        }
      ]
    }

    const definitionList: BlockNode = {
      id: "dl-1",
      kind: "definition-list",
      items: [
        {
          id: "dl-item-1",
          term: [
            {
              id: "term-1",
              kind: "text",
              inlines: [{ kind: "text", text: "Term" }]
            }
          ],
          descriptions: [
            [
              {
                id: "desc-1",
                kind: "text",
                inlines: [{ kind: "text", text: "Definition" }]
              }
            ]
          ]
        }
      ]
    }

    const section: SectionDocument = {
      id: "section-expanded",
      href: "OPS/chapter-2.xhtml",
      blocks: [
        paragraph,
        figure,
        definitionList,
        {
          id: "aside-1",
          kind: "aside",
          blocks: [paragraph]
        },
        {
          id: "nav-1",
          kind: "nav",
          blocks: [paragraph]
        }
      ],
      anchors: {}
    }

    expect(section.blocks[0]?.kind).toBe("text")
    expect(section.blocks[1]?.kind).toBe("figure")
    expect(section.blocks[2]?.kind).toBe("definition-list")
    expect(section.blocks[3]?.kind).toBe("aside")
    expect(section.blocks[4]?.kind).toBe("nav")
    expect(serializeSection(section)).toContain('"kind": "mark"')
    expect(serializeSection(section)).toContain('"kind": "sup"')
  })

  it("supports complex blocks like lists, quotes, code, tables, and thematic breaks", () => {
    const table: TableBlock = {
      id: "table-1",
      kind: "table",
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              header: true,
              blocks: [
                {
                  id: "text-h1",
                  kind: "text",
                  inlines: [{ kind: "text", text: "Name" }]
                }
              ]
            }
          ]
        }
      ]
    }

    const section: SectionDocument = {
      id: "section-complex",
      href: "OPS/appendix.xhtml",
      blocks: [
        {
          id: "list-1",
          kind: "list",
          ordered: true,
          start: 3,
          items: [
            {
              id: "item-1",
              blocks: [
                {
                  id: "text-1",
                  kind: "text",
                  inlines: [{ kind: "text", text: "First item" }]
                }
              ]
            }
          ]
        },
        {
          id: "quote-1",
          kind: "quote",
          attribution: "Lewis Carroll",
          blocks: [
            {
              id: "quote-text",
              kind: "text",
              inlines: [{ kind: "text", text: "Curiouser and curiouser!" }]
            }
          ]
        },
        {
          id: "code-1",
          kind: "code",
          language: "txt",
          text: "print('alice')"
        },
        table,
        {
          id: "hr-1",
          kind: "thematic-break"
        }
      ],
      anchors: {}
    }

    expect(section.blocks[0]?.kind).toBe("list")
    expect(section.blocks[1]?.kind).toBe("quote")
    expect(section.blocks[2]?.kind).toBe("code")
    expect(section.blocks[3]?.kind).toBe("table")
    expect(section.blocks[4]?.kind).toBe("thematic-break")
    expect(table.rows[0]?.cells[0]?.blocks[0]?.kind).toBe("text")
  })
})
