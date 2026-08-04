import { describe, expect, it } from "vitest"
import {
  normalizeResourcePath,
  resolveResourcePath
} from "../src/container/resource-path"
import {
  getExtension,
  getMimeTypeFromPath
} from "../src/container/resource-mime"

describe("resource path utilities", () => {
  it("normalizes leading dots, slashes, and windows separators", () => {
    expect(normalizeResourcePath("./OPS\\chapter.xhtml")).toBe(
      "OPS/chapter.xhtml"
    )
    expect(normalizeResourcePath("/META-INF/container.xml")).toBe(
      "META-INF/container.xml"
    )
  })

  it("resolves relative, current, parent, and root paths", () => {
    expect(resolveResourcePath("OPS/chapter.xhtml", "../images/a.png")).toBe(
      "images/a.png"
    )
    expect(resolveResourcePath("OPS/text/chapter.xhtml", "./note.xhtml")).toBe(
      "OPS/text/note.xhtml"
    )
    expect(
      resolveResourcePath("OPS/text/chapter.xhtml", "../../nav.xhtml")
    ).toBe("nav.xhtml")
    expect(
      resolveResourcePath("OPS/text/chapter.xhtml", "/Styles/main.css")
    ).toBe("Styles/main.css")
  })

  it("preserves fragment identifiers for same-document and cross-document links", () => {
    expect(resolveResourcePath("OPS/text/chapter.xhtml", "#note-1")).toBe(
      "OPS/text/chapter.xhtml#note-1"
    )
    expect(
      resolveResourcePath("OPS/text/chapter.xhtml", "notes.xhtml#note-2")
    ).toBe("OPS/text/notes.xhtml#note-2")
  })

  it("preserves absolute embedded resource URLs instead of resolving them as book paths", () => {
    expect(
      resolveResourcePath(
        "OPS/text/chapter.xhtml",
        "https://public.example.com/images/plate.jpg?size=large#view"
      )
    ).toBe("https://public.example.com/images/plate.jpg?size=large#view")
    expect(
      resolveResourcePath("OPS/text/chapter.xhtml", "//cdn.example.com/a.png")
    ).toBe("//cdn.example.com/a.png")
    expect(
      resolveResourcePath(
        "OPS/text/chapter.xhtml",
        "data:image/png;base64,AAAA"
      )
    ).toBe("data:image/png;base64,AAAA")
    expect(
      resolveResourcePath("OPS/text/chapter.xhtml", "blob:cover-image")
    ).toBe("blob:cover-image")
  })
})

describe("resource mime utilities", () => {
  it("extracts file extensions from common resource paths", () => {
    expect(getExtension("OPS/chapter.xhtml")).toBe("xhtml")
    expect(getExtension("OPS/image.cover.JPG?size=large")).toBe("jpg")
    expect(getExtension("OPS/nav")).toBeNull()
  })

  it("maps common EPUB resource extensions to MIME types", () => {
    expect(getMimeTypeFromPath("OPS/chapter.xhtml")).toBe(
      "application/xhtml+xml"
    )
    expect(getMimeTypeFromPath("OPS/styles/book.css")).toBe("text/css")
    expect(getMimeTypeFromPath("OPS/images/cover.png")).toBe("image/png")
    expect(getMimeTypeFromPath("OPS/fonts/serif.woff2")).toBe("font/woff2")
    expect(getMimeTypeFromPath("OPS/toc.ncx")).toBe("application/x-dtbncx+xml")
  })

  it("returns null for unknown or extensionless files", () => {
    expect(getMimeTypeFromPath("OPS/README")).toBeNull()
    expect(getMimeTypeFromPath("OPS/archive.unknown")).toBeNull()
  })
})
