import { describe, expect, it } from "vitest"
import type { Book, SectionDocument } from "../src/model/types"
import {
  inferSyntheticPagePlacement,
  resolveReadingSpreadContext,
  resolveSyntheticSpreadViewportPartition
} from "../src/runtime/reading-spread"

function createBook(section: SectionDocument): Book {
  return {
    metadata: {
      title: "FXL Spread Book",
      renditionLayout: "pre-paginated",
      renditionSpread: "auto"
    },
    manifest: [],
    spine: [{ idref: "item-1", href: section.href, linear: true }],
    toc: [],
    sections: [section]
  }
}

describe("reading spread helpers", () => {
  it("activates synthetic spread for landscape fixed-layout pages and infers page placement", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/fxl-1.xhtml",
      renditionLayout: "pre-paginated",
      anchors: {},
      blocks: []
    }
    const context = resolveReadingSpreadContext({
      book: createBook(section),
      section,
      spineIndex: 0,
      mode: "paginated",
      spreadMode: "auto",
      pageProgression: "ltr",
      containerWidth: 1200,
      containerHeight: 800
    })

    expect(context).toEqual({
      spineIndex: 0,
      sectionId: "section-1",
      sectionHref: "OPS/fxl-1.xhtml",
      spreadMode: "auto",
      renditionLayout: "pre-paginated",
      renditionSpread: "auto",
      pageSpreadPlacement: "right",
      syntheticSpreadAllowed: true,
      syntheticSpreadActive: true,
      viewportSlotCount: 2
    })
    expect(
      resolveSyntheticSpreadViewportPartition({
        spreadContext: context,
        containerWidth: 1200,
        containerHeight: 800
      })
    ).toEqual({
      width: 588,
      height: 800,
      gap: 24
    })
  })

  it("honors explicit page spread placement and disables synthetic spread when spread mode is none", () => {
    const section: SectionDocument = {
      id: "section-2",
      href: "OPS/fxl-2.xhtml",
      renditionLayout: "pre-paginated",
      pageSpreadPlacement: "left",
      anchors: {},
      blocks: []
    }
    const context = resolveReadingSpreadContext({
      book: createBook(section),
      section,
      spineIndex: 1,
      mode: "paginated",
      spreadMode: "none",
      pageProgression: "ltr",
      containerWidth: 1200,
      containerHeight: 800
    })

    expect(context.pageSpreadPlacement).toBe("left")
    expect(context.syntheticSpreadAllowed).toBe(false)
    expect(context.syntheticSpreadActive).toBe(false)
    expect(context.viewportSlotCount).toBe(1)
    expect(
      resolveSyntheticSpreadViewportPartition({
        spreadContext: context,
        containerWidth: 1200,
        containerHeight: 800
      })
    ).toBeNull()
  })

  it("uses page progression when inferring synthetic spread placement", () => {
    expect(
      inferSyntheticPagePlacement({ spineIndex: 0, pageProgression: "ltr" })
    ).toBe("right")
    expect(
      inferSyntheticPagePlacement({ spineIndex: 1, pageProgression: "ltr" })
    ).toBe("left")
    expect(
      inferSyntheticPagePlacement({ spineIndex: 0, pageProgression: "rtl" })
    ).toBe("left")
    expect(
      inferSyntheticPagePlacement({ spineIndex: 1, pageProgression: "rtl" })
    ).toBe("right")
  })
})
