import { describe, expect, it } from "vitest"
import type { ChapterRenderDecision, SectionDocument } from "../src/model/types"
import type { SectionDisplayList } from "../src/renderer/draw-ops"
import { buildScrollRenderPlan } from "../src/runtime/scroll-render-plan"

describe("buildScrollRenderPlan", () => {
  it("creates placeholders outside the scroll window and keeps DOM markup inside it", () => {
    const sections = [
      createSection("section-1", "OPS/one.xhtml"),
      createSection("section-2", "OPS/two.xhtml")
    ]

    const plan = buildScrollRenderPlan({
      sections,
      scrollWindowStart: 1,
      scrollWindowEnd: 1,
      sectionEstimatedHeights: [],
      viewportTop: 0,
      viewportHeight: 600,
      pageHeight: 720,
      overscanMultiplier: 0.75,
      lastMeasuredWidth: 0,
      getSectionHeight: () => 480,
      resolveChapterRenderDecision: (index) =>
        index === 1 ? domDecision() : canvasDecision(),
      buildDomMarkup: (section) => `<div data-section="${section.id}"></div>`,
      buildCanvasSection: (section) => ({
        width: 640,
        displayList: createDisplayList(section, 320),
        measuredHeight: 320,
        estimatedHeight: 720
      })
    })

    expect(plan.sectionsToRender[0]).toEqual({
      sectionId: "section-1",
      sectionHref: "OPS/one.xhtml",
      height: 480
    })
    expect(plan.sectionsToRender[1]?.domHtml).toContain(
      'data-section="section-2"'
    )
    expect(plan.measuredSectionHeights[0]).toBe(480)
    expect(plan.measuredSectionHeights[1]).toBe(720)
  })

  it("builds canvas windows and updates estimated heights", () => {
    const section = createSection("section-1", "OPS/one.xhtml")

    const plan = buildScrollRenderPlan({
      sections: [section],
      scrollWindowStart: 0,
      scrollWindowEnd: 0,
      sectionEstimatedHeights: [],
      viewportTop: 120,
      viewportHeight: 100,
      pageHeight: 720,
      overscanMultiplier: 0.5,
      lastMeasuredWidth: 0,
      getSectionHeight: () => 300,
      resolveChapterRenderDecision: () => canvasDecision(),
      buildDomMarkup: () => undefined,
      buildCanvasSection: () => ({
        width: 640,
        displayList: createDisplayList(section, 300),
        measuredHeight: 300,
        estimatedHeight: 720
      })
    })

    expect(plan.lastMeasuredWidth).toBe(640)
    expect(plan.sectionEstimatedHeights[0]).toBe(720)
    expect(plan.sectionsToRender[0]?.renderWindows).toEqual([
      { top: 0, height: 70 },
      { top: 70, height: 200 },
      { top: 270, height: 30 }
    ])
    expect(plan.scrollRenderWindows.get("section-1")).toEqual([
      { top: 0, height: 70 },
      { top: 70, height: 200 },
      { top: 270, height: 30 }
    ])
  })
})

function createSection(id: string, href: string): SectionDocument {
  return {
    id,
    href,
    blocks: [],
    anchors: {}
  }
}

function createDisplayList(
  section: SectionDocument,
  height: number
): SectionDisplayList {
  return {
    sectionId: section.id,
    sectionHref: section.href,
    width: 640,
    height,
    ops: [],
    interactions: []
  }
}

function canvasDecision(): ChapterRenderDecision {
  return {
    mode: "canvas",
    score: 0,
    reasons: []
  }
}

function domDecision(): ChapterRenderDecision {
  return {
    mode: "dom",
    score: 0,
    reasons: []
  }
}
