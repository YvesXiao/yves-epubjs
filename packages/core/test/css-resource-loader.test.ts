import { describe, expect, it } from "vitest"
import type { ManifestItem } from "../src/model/types"
import {
  CssAstCache,
  extractLinkedStyleSheetHrefs,
  loadChapterStyleSheets,
  resolveChapterStyleSheetManifestItems
} from "../src/parser/css-resource-loader"

describe("CSS resource loader", () => {
  it("extracts linked stylesheets from a chapter document", () => {
    const hrefs = extractLinkedStyleSheetHrefs(
      `<?xml version="1.0"?>
      <html>
        <head>
          <link rel="stylesheet" href="../styles/base.css" />
          <link rel="alternate stylesheet" href="../styles/ignored.css" />
          <link rel="stylesheet" href="../styles/base.css" />
        </head>
        <body><p>Hello</p></body>
      </html>`,
      "OPS/text/chapter-1.xhtml"
    )

    expect(hrefs).toEqual(["OPS/styles/base.css", "OPS/styles/ignored.css"])
  })

  it("resolves linked stylesheet hrefs against manifest items", () => {
    const manifest: ManifestItem[] = [
      {
        id: "base-css",
        href: "OPS/styles/base.css",
        mediaType: "text/css"
      },
      {
        id: "theme-css",
        href: "OPS/styles/theme.css",
        mediaType: "text/css"
      },
      {
        id: "cover",
        href: "OPS/images/cover.jpg",
        mediaType: "image/jpeg"
      }
    ]

    expect(
      resolveChapterStyleSheetManifestItems(manifest, [
        "OPS/styles/base.css",
        "OPS/images/cover.jpg"
      ])
    ).toEqual([
      {
        id: "base-css",
        href: "OPS/styles/base.css",
        mediaType: "text/css"
      }
    ])
  })

  it("loads linked stylesheets and reuses the CSS AST cache by href", async () => {
    const manifest: ManifestItem[] = [
      {
        id: "base-css",
        href: "OPS/styles/base.css",
        mediaType: "text/css"
      }
    ]
    const cache = new CssAstCache()
    let readCount = 0

    const firstLoad = await loadChapterStyleSheets({
      sectionHref: "OPS/text/chapter-1.xhtml",
      sectionXml: `<?xml version="1.0"?>
        <html>
          <head><link rel="stylesheet" href="../styles/base.css" /></head>
          <body><p>Chapter 1</p></body>
        </html>`,
      manifest,
      cache,
      readText: async (href) => {
        readCount += 1
        expect(href).toBe("OPS/styles/base.css")
        return "p { color: #333; }"
      }
    })

    const secondLoad = await loadChapterStyleSheets({
      sectionHref: "OPS/text/chapter-2.xhtml",
      sectionXml: `<?xml version="1.0"?>
        <html>
          <head><link rel="stylesheet" href="../styles/base.css" /></head>
          <body><p>Chapter 2</p></body>
        </html>`,
      manifest,
      cache,
      readText: async () => {
        readCount += 1
        return "p { color: #333; }"
      }
    })

    expect(firstLoad).toHaveLength(1)
    expect(secondLoad).toHaveLength(1)
    expect(firstLoad[0]?.ast).toBe(secondLoad[0]?.ast)
    expect(readCount).toBe(2)
  })
})
