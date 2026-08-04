import { describe, expect, it } from "vitest"
import { parseNcxDocument } from "../src/parser/ncx-parser"

describe("parseNcxDocument", () => {
  it("parses nested navPoint structures", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
        <navMap>
          <navPoint id="chapter-1">
            <navLabel><text>Chapter 1</text></navLabel>
            <content src="text/chapter-1.xhtml" />
          </navPoint>
          <navPoint id="chapter-2">
            <navLabel><text>Chapter 2</text></navLabel>
            <content src="text/chapter-2.xhtml" />
            <navPoint id="chapter-2-part-1">
              <navLabel><text>Part 1</text></navLabel>
              <content src="text/chapter-2.xhtml#part-1" />
            </navPoint>
          </navPoint>
        </navMap>
      </ncx>`

    expect(parseNcxDocument(xml, "OPS/toc.ncx")).toEqual([
      {
        id: "chapter-1",
        label: "Chapter 1",
        href: "OPS/text/chapter-1.xhtml",
        children: []
      },
      {
        id: "chapter-2",
        label: "Chapter 2",
        href: "OPS/text/chapter-2.xhtml",
        children: [
          {
            id: "chapter-2-part-1",
            label: "Part 1",
            href: "OPS/text/chapter-2.xhtml#part-1",
            children: []
          }
        ]
      }
    ])
  })

  it("skips invalid navPoint nodes", () => {
    const xml = `<?xml version="1.0"?>
      <ncx>
        <navMap>
          <navPoint id="valid">
            <navLabel><text>Valid</text></navLabel>
            <content src="text/valid.xhtml" />
          </navPoint>
          <navPoint id="missing-content">
            <navLabel><text>Missing Content</text></navLabel>
          </navPoint>
        </navMap>
      </ncx>`

    expect(parseNcxDocument(xml, "OPS/toc.ncx")).toEqual([
      {
        id: "valid",
        label: "Valid",
        href: "OPS/text/valid.xhtml",
        children: []
      }
    ])
  })
})
