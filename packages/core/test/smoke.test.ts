// @vitest-environment node

import { zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import {
  EpubReader,
  InMemoryResourceContainer,
  ZipResourceContainer
} from "../src"

describe("core scaffold", () => {
  const encoder = new TextEncoder()

  function createMinimalEpubBytes(): Uint8Array {
    return zipSync({
      mimetype: encoder.encode("application/epub+zip"),
      "META-INF/container.xml": encoder.encode(
        `<?xml version="1.0"?>
        <container>
          <rootfiles>
            <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`
      ),
      "OPS/content.opf": encoder.encode(
        `<?xml version="1.0"?>
        <package>
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Smoke Test Book</dc:title>
          </metadata>
          <manifest>
            <item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml" />
          </manifest>
          <spine>
            <itemref idref="chapter-1" />
          </spine>
        </package>`
      ),
      "OPS/chapter-1.xhtml": encoder.encode(
        `<?xml version="1.0"?>
        <html>
          <head><title>Smoke Test Book</title></head>
          <body><h1>Smoke Test Book</h1><p>Sample paragraph.</p></body>
        </html>`
      )
    })
  }

  it("creates a reader instance", () => {
    const reader = new EpubReader()
    expect(reader.getCurrentLocation()).toBeNull()
  })

  it("opens a Uint8Array input", async () => {
    const reader = new EpubReader()
    const book = await reader.open(createMinimalEpubBytes())

    expect(book.metadata.title).toBe("Smoke Test Book")
  })

  it("initializes the current location from the epub guide text reference", async () => {
    const reader = new EpubReader()
    const guideStartBytes = zipSync({
      mimetype: encoder.encode("application/epub+zip"),
      "META-INF/container.xml": encoder.encode(
        `<?xml version="1.0"?>
        <container>
          <rootfiles>
            <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml" />
          </rootfiles>
        </container>`
      ),
      "OPS/content.opf": encoder.encode(
        `<?xml version="1.0"?>
        <package>
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Guide Start Book</dc:title>
          </metadata>
          <manifest>
            <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" />
            <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml" />
            <item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml" />
          </manifest>
          <spine>
            <itemref idref="cover" />
            <itemref idref="title-page" />
            <itemref idref="chapter-1" />
          </spine>
          <guide>
            <reference type="text" title="Start" href="chapter-1.xhtml#start" />
          </guide>
        </package>`
      ),
      "OPS/cover.xhtml": encoder.encode(
        `<?xml version="1.0"?>
        <html><body><p><img src="cover.jpg" /></p></body></html>`
      ),
      "OPS/title.xhtml": encoder.encode(
        `<?xml version="1.0"?>
        <html><body><p><img src="title.jpg" /></p></body></html>`
      ),
      "OPS/chapter-1.xhtml": encoder.encode(
        `<?xml version="1.0"?>
        <html>
          <head><title>Start Chapter</title></head>
          <body>
            <h1 id="start">Start Chapter</h1>
            <p>The reader should open here instead of staying on the cover.</p>
          </body>
        </html>`
      ),
      "OPS/cover.jpg": new Uint8Array([255, 216, 255]),
      "OPS/title.jpg": new Uint8Array([255, 216, 255])
    })

    const book = await reader.open(guideStartBytes)

    expect(book.metadata.startHref).toBe("OPS/chapter-1.xhtml#start")
    expect(reader.getCurrentLocation()).toMatchObject({
      spineIndex: 2,
      anchorId: "start"
    })
  })

  it("resolves resource paths", () => {
    const container = new InMemoryResourceContainer()
    expect(
      container.resolvePath("OPS/chapter-1.xhtml", "../images/a.png")
    ).toBe("images/a.png")
  })

  it("creates a ZIP-backed resource container", async () => {
    const container = await ZipResourceContainer.fromZip(
      new Uint8Array([
        80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      ])
    )

    expect(container.listPaths()).toEqual([])
  })

  it("keeps the smoke suite focused on parser/runtime basics", () => {
    expect(true).toBe(true)
  })
})
