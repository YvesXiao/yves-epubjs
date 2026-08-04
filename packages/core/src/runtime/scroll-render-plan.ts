import type { ChapterRenderDecision, SectionDocument } from "../model/types"
import type { SectionDisplayList } from "../renderer/draw-ops"

export type ScrollRenderWindow = {
  top: number
  height: number
}

export type ScrollRenderableSection = {
  sectionId: string
  sectionHref: string
  height: number
  displayList?: SectionDisplayList
  renderWindows?: ScrollRenderWindow[]
  domHtml?: string
}

type CanvasSectionPlan = {
  width: number
  displayList: SectionDisplayList
  measuredHeight: number
  estimatedHeight: number
}

export type ScrollRenderPlan = {
  sectionsToRender: ScrollRenderableSection[]
  measuredSectionHeights: number[]
  sectionEstimatedHeights: number[]
  scrollRenderWindows: Map<string, ScrollRenderWindow[]>
  lastMeasuredWidth: number
}

export function buildScrollRenderPlan(options: {
  sections: SectionDocument[]
  scrollWindowStart: number
  scrollWindowEnd: number
  sectionEstimatedHeights: number[]
  viewportTop: number
  viewportHeight: number
  pageHeight: number
  overscanMultiplier: number
  lastMeasuredWidth: number
  getSectionHeight: (sectionId: string) => number
  resolveChapterRenderDecision: (sectionIndex: number) => ChapterRenderDecision
  buildDomMarkup: (
    section: SectionDocument,
    sectionIndex: number
  ) => string | undefined
  buildCanvasSection: (
    section: SectionDocument,
    sectionIndex: number
  ) => CanvasSectionPlan
}): ScrollRenderPlan {
  const sectionsToRender: ScrollRenderableSection[] = []
  const measuredSectionHeights: number[] = []
  const nextSectionEstimatedHeights = [...options.sectionEstimatedHeights]
  let lastMeasuredWidth = options.lastMeasuredWidth

  for (let index = 0; index < options.sections.length; index += 1) {
    const section = options.sections[index]
    if (!section) {
      continue
    }

    if (index < options.scrollWindowStart || index > options.scrollWindowEnd) {
      // Keep off-window sections as height placeholders so scroll geometry stays
      // stable even when we skip expensive layout/render work for them.
      const height = options.getSectionHeight(section.id)
      measuredSectionHeights[index] = height
      sectionsToRender.push({
        sectionId: section.id,
        sectionHref: section.href,
        height
      })
      continue
    }

    const chapterRenderDecision = options.resolveChapterRenderDecision(index)
    if (chapterRenderDecision.mode === "dom") {
      // DOM sections keep an estimated height until the browser measures them,
      // which lets mixed canvas/DOM scroll mode share one placement model.
      const height =
        options.sectionEstimatedHeights[index] ??
        Math.max(options.pageHeight, options.viewportHeight)
      const domHtml = options.buildDomMarkup(section, index)
      measuredSectionHeights[index] = height
      if (typeof domHtml === "string") {
        sectionsToRender.push({
          sectionId: section.id,
          sectionHref: section.href,
          height,
          domHtml
        })
      } else {
        sectionsToRender.push({
          sectionId: section.id,
          sectionHref: section.href,
          height
        })
      }
      continue
    }

    const canvasSection = options.buildCanvasSection(section, index)
    lastMeasuredWidth = canvasSection.width
    nextSectionEstimatedHeights[index] = canvasSection.estimatedHeight
    measuredSectionHeights[index] = canvasSection.measuredHeight
    sectionsToRender.push({
      sectionId: section.id,
      sectionHref: section.href,
      height: canvasSection.measuredHeight,
      displayList: canvasSection.displayList
    })
  }

  const scrollRenderWindows = assignScrollRenderWindows({
    sectionsToRender,
    measuredSectionHeights,
    viewportTop: options.viewportTop,
    viewportHeight: options.viewportHeight,
    overscanMultiplier: options.overscanMultiplier
  })

  return {
    sectionsToRender,
    measuredSectionHeights,
    sectionEstimatedHeights: nextSectionEstimatedHeights,
    scrollRenderWindows,
    lastMeasuredWidth
  }
}

function assignScrollRenderWindows(input: {
  sectionsToRender: ScrollRenderableSection[]
  measuredSectionHeights: number[]
  viewportTop: number
  viewportHeight: number
  overscanMultiplier: number
}): Map<string, ScrollRenderWindow[]> {
  const scrollRenderWindows = new Map<string, ScrollRenderWindow[]>()
  const overscan = input.viewportHeight * input.overscanMultiplier
  const viewportBottom = input.viewportTop + input.viewportHeight
  let runningTop = 0

  input.sectionsToRender.forEach((entry, index) => {
    const height = input.measuredSectionHeights[index] ?? entry.height
    entry.height = height

    if (entry.displayList) {
      // Render the visible slice plus adjacent slices. This reduces blank flashes
      // during fast scroll without forcing a full-section canvas redraw.
      const currentRenderTop = Math.max(
        0,
        input.viewportTop - overscan - runningTop
      )
      const currentRenderBottom = Math.min(
        height,
        viewportBottom + overscan - runningTop
      )
      if (currentRenderBottom > currentRenderTop) {
        const currentWindow = {
          top: currentRenderTop,
          height: currentRenderBottom - currentRenderTop
        }
        const previousTop = Math.max(
          0,
          currentWindow.top - currentWindow.height
        )
        const previousHeight = Math.max(0, currentWindow.top - previousTop)
        const nextTop = Math.min(
          height,
          currentWindow.top + currentWindow.height
        )
        const nextHeight = Math.max(
          0,
          Math.min(currentWindow.height, height - nextTop)
        )
        entry.renderWindows = dedupeScrollRenderWindows([
          {
            top: previousTop,
            height: previousHeight
          },
          currentWindow,
          {
            top: nextTop,
            height: nextHeight
          }
        ])
        if (entry.renderWindows.length > 0) {
          scrollRenderWindows.set(entry.sectionId, entry.renderWindows)
        }
      }
    }

    runningTop += height
  })

  return scrollRenderWindows
}

function dedupeScrollRenderWindows(
  windows: ScrollRenderWindow[]
): ScrollRenderWindow[] {
  const seen = new Set<string>()
  const deduped: ScrollRenderWindow[] = []

  for (const window of windows) {
    if (window.height <= 0) {
      continue
    }
    const key = `${window.top}:${window.height}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(window)
  }

  return deduped.sort((left, right) => left.top - right.top)
}
