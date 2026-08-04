import { describe, expect, it } from "vitest"
import { parseNavDocument } from "../src/parser/nav-parser"

describe("parseNavDocument", () => {
  it("parses nested toc items from an EPUB 3 nav document", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body>
          <nav epub:type="toc">
            <ol>
              <li>
                <a href="text/chapter-1.xhtml">Chapter 1</a>
              </li>
              <li>
                <a href="text/chapter-2.xhtml">Chapter 2</a>
                <ol>
                  <li><a href="text/chapter-2.xhtml#part-1">Part 1</a></li>
                  <li><a href="text/chapter-2.xhtml#part-2">Part 2</a></li>
                </ol>
              </li>
            </ol>
          </nav>
        </body>
      </html>`

    expect(parseNavDocument(xml, "OPS/nav.xhtml")).toEqual([
      {
        id: "toc.0:Chapter 1",
        label: "Chapter 1",
        href: "OPS/text/chapter-1.xhtml",
        children: []
      },
      {
        id: "toc.1:Chapter 2",
        label: "Chapter 2",
        href: "OPS/text/chapter-2.xhtml",
        children: [
          {
            id: "toc.1.0:Part 1",
            label: "Part 1",
            href: "OPS/text/chapter-2.xhtml#part-1",
            children: []
          },
          {
            id: "toc.1.1:Part 2",
            label: "Part 2",
            href: "OPS/text/chapter-2.xhtml#part-2",
            children: []
          }
        ]
      }
    ])
  })

  it("prefers the toc nav when multiple nav sections exist", () => {
    const xml = `<?xml version="1.0"?>
      <html xmlns:epub="http://www.idpf.org/2007/ops">
        <body>
          <nav epub:type="landmarks">
            <ol><li><a href="cover.xhtml">Cover</a></li></ol>
          </nav>
          <nav epub:type="toc">
            <ol><li><a href="text/start.xhtml">Start</a></li></ol>
          </nav>
        </body>
      </html>`

    expect(parseNavDocument(xml, "OPS/nav.xhtml")).toEqual([
      {
        id: "toc.0:Start",
        label: "Start",
        href: "OPS/text/start.xhtml",
        children: []
      }
    ])
  })

  it("returns an empty toc when no nav element is present", () => {
    const xml = `<?xml version="1.0"?><html><body><section>No nav</section></body></html>`

    expect(parseNavDocument(xml, "OPS/nav.xhtml")).toEqual([])
  })
})
