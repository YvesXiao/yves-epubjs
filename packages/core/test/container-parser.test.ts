import { describe, expect, it } from "vitest"
import { parseContainerXml } from "../src/parser/container-parser"

describe("parseContainerXml", () => {
  it("extracts the package document full-path from a standard container.xml", () => {
    const xml = `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile
            full-path="OPS/content.opf"
            media-type="application/oebps-package+xml"
          />
        </rootfiles>
      </container>`

    expect(parseContainerXml(xml)).toEqual({
      fullPath: "OPS/content.opf",
      mediaType: "application/oebps-package+xml"
    })
  })

  it("normalizes the returned rootfile path", () => {
    const xml = `<?xml version="1.0"?>
      <container>
        <rootfiles>
          <rootfile full-path="./OPS\\content.opf" />
        </rootfiles>
      </container>`

    expect(parseContainerXml(xml)).toEqual({
      fullPath: "OPS/content.opf",
      mediaType: undefined
    })
  })

  it("supports multiple rootfiles by selecting the first declared package document", () => {
    const xml = `<?xml version="1.0"?>
      <container>
        <rootfiles>
          <rootfile full-path="OPS/content.opf" />
          <rootfile full-path="OPS/alternate.opf" />
        </rootfiles>
      </container>`

    expect(parseContainerXml(xml).fullPath).toBe("OPS/content.opf")
  })

  it("throws when rootfile full-path is missing", () => {
    const xml = `<?xml version="1.0"?>
      <container>
        <rootfiles>
          <rootfile />
        </rootfiles>
      </container>`

    expect(() => parseContainerXml(xml)).toThrowError(
      "Invalid container.xml: missing rootfile full-path."
    )
  })
})
