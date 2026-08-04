import type { Rect, SectionDocument, VisibleDrawBounds } from "../model/types"
import type {
  InteractionRegion,
  SectionDisplayList
} from "../renderer/draw-ops"

export type ScrollAnchor = {
  sectionId: string
  offsetWithinSection: number
  fallbackScrollTop: number
}

export type ScrollWindowBounds = {
  start: number
  end: number
}

type RenderedSectionEntry = {
  sectionId: string
  top: number
  height: number
}

export class ReaderScrollPositionService {
  resolveScrollWindowBounds(input: {
    currentSectionIndex: number
    sectionCount: number
    radius: number
  }): ScrollWindowBounds {
    return {
      start: Math.max(0, input.currentSectionIndex - input.radius),
      end: Math.min(
        input.sectionCount - 1,
        input.currentSectionIndex + input.radius
      )
    }
  }

  shouldRefreshScrollWindow(input: {
    currentSectionIndex: number
    sectionCount: number
    radius: number
    scrollWindowStart: number
    scrollWindowEnd: number
  }): ScrollWindowBounds | null {
    if (
      input.scrollWindowStart >= 0 &&
      input.scrollWindowEnd >= 0 &&
      input.currentSectionIndex >= input.scrollWindowStart &&
      input.currentSectionIndex <= input.scrollWindowEnd
    ) {
      return null
    }

    const next = this.resolveScrollWindowBounds(input)
    return next.start === input.scrollWindowStart &&
      next.end === input.scrollWindowEnd
      ? null
      : next
  }

  findRenderedSectionIndexForOffset(input: {
    container: HTMLElement | null | undefined
    sections: SectionDocument[]
    offset: number
  }): number {
    if (!input.container || input.sections.length === 0) {
      return -1
    }

    const renderedSections = collectRenderedSectionEntries(input.container, {
      includeVirtual: true
    })
      .map((entry) => {
        const sectionIndex = input.sections.findIndex(
          (section) => section.id === entry.sectionId
        )
        return sectionIndex >= 0
          ? {
              sectionIndex,
              top: entry.top,
              height: entry.height
            }
          : null
      })
      .filter(
        (
          entry
        ): entry is {
          sectionIndex: number
          top: number
          height: number
        } => entry !== null
      )
      .sort((left, right) => left.top - right.top)

    if (renderedSections.length === 0) {
      return -1
    }

    const firstSection = renderedSections[0]
    if (firstSection && input.offset < firstSection.top) {
      return firstSection.sectionIndex
    }

    for (let index = 0; index < renderedSections.length; index += 1) {
      const entry = renderedSections[index]
      if (!entry) {
        continue
      }
      const next = renderedSections[index + 1] ?? null
      if (input.offset < entry.top + entry.height) {
        return entry.sectionIndex
      }
      if (next && input.offset < next.top) {
        return entry.sectionIndex
      }
    }

    return renderedSections[renderedSections.length - 1]?.sectionIndex ?? -1
  }

  findSectionIndexForOffset(input: {
    container: HTMLElement | null | undefined
    sections: SectionDocument[]
    offset: number
    getSectionHeight: (sectionId: string) => number
  }): number {
    const renderedSectionIndex = this.findRenderedSectionIndexForOffset(input)
    if (renderedSectionIndex >= 0) {
      return renderedSectionIndex
    }

    if (input.sections.length === 0) {
      return -1
    }

    let start = 0
    for (let index = 0; index < input.sections.length; index += 1) {
      const section = input.sections[index]
      if (!section) {
        continue
      }
      const end = start + input.getSectionHeight(section.id)
      if (input.offset >= start && input.offset < end) {
        return index
      }
      start = end
    }

    return input.sections.length - 1
  }

  captureScrollAnchor(input: {
    container: HTMLElement | null | undefined
  }): ScrollAnchor | null {
    if (!input.container) {
      return null
    }

    const scrollTop = input.container.scrollTop
    const renderedSections = collectRenderedSectionEntries(input.container)

    const renderedMatch =
      renderedSections.find(
        (entry) =>
          scrollTop >= entry.top && scrollTop < entry.top + entry.height
      ) ?? null

    if (renderedMatch) {
      return {
        sectionId: renderedMatch.sectionId,
        offsetWithinSection: Math.max(0, scrollTop - renderedMatch.top),
        fallbackScrollTop: scrollTop
      }
    }

    return {
      sectionId: "",
      offsetWithinSection: 0,
      fallbackScrollTop: scrollTop
    }
  }

  resolveScrollTopForAnchor(input: {
    anchor: ScrollAnchor | null
    currentScrollTop: number
    getSectionTop: (sectionId: string) => number
  }): number {
    if (!input.anchor || !input.anchor.sectionId) {
      return input.anchor?.fallbackScrollTop ?? input.currentScrollTop
    }

    return Math.max(
      0,
      input.getSectionTop(input.anchor.sectionId) +
        input.anchor.offsetWithinSection
    )
  }

  offsetInteractionRegionsForScroll(input: {
    sections: Array<{
      sectionId: string
      interactions: InteractionRegion[]
    }>
    getSectionTop: (sectionId: string) => number
  }): InteractionRegion[] {
    const regions: InteractionRegion[] = []
    for (const section of input.sections) {
      const sectionTop = input.getSectionTop(section.sectionId)
      for (const interaction of section.interactions) {
        regions.push({
          ...interaction,
          rect: {
            ...interaction.rect,
            y: interaction.rect.y + sectionTop
          }
        })
      }
    }
    return regions
  }

  collectVisibleBoundsForScroll(input: {
    sectionsToRender: Array<{
      sectionId: string
      displayList?: SectionDisplayList
      renderWindows?: Array<{
        top: number
        height: number
      }>
    }>
    getSectionTop: (sectionId: string) => number
  }): VisibleDrawBounds {
    const bounds: VisibleDrawBounds = []
    for (const section of input.sectionsToRender) {
      if (!section.displayList) {
        continue
      }
      const sectionTop = input.getSectionTop(section.sectionId)
      const renderWindows = section.renderWindows?.length
        ? section.renderWindows
        : [{ top: 0, height: section.displayList.height }]
      for (const op of section.displayList.ops) {
        if (!rectIntersectsAnyWindow(op.rect, renderWindows)) {
          continue
        }
        bounds.push({
          ...op.rect,
          y: op.rect.y + sectionTop
        })
      }
    }
    return bounds
  }
}

function collectRenderedSectionEntries(
  container: HTMLElement,
  options: {
    includeVirtual?: boolean
  } = {}
): RenderedSectionEntry[] {
  const selector = options.includeVirtual
    ? "article[data-section-id]"
    : "article[data-section-id]:not(.epub-section-virtual)"
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .map((element) => {
      const sectionId = element.dataset.sectionId
      if (!sectionId) {
        return null
      }

      const height = getRenderedSectionHeight(element)
      if (height <= 0) {
        return null
      }

      return {
        sectionId,
        top: element.offsetTop,
        height
      }
    })
    .filter((entry): entry is RenderedSectionEntry => entry !== null)
    .sort((left, right) => left.top - right.top)
}

function getRenderedSectionHeight(element: HTMLElement): number {
  const domSection = element.querySelector<HTMLElement>(".epub-dom-section")
  if (domSection) {
    return Math.max(
      domSection.scrollHeight || 0,
      domSection.offsetHeight || 0,
      element.offsetHeight || 0
    )
  }

  return element.offsetHeight || 0
}

function rectIntersectsAnyWindow(
  rect: Rect,
  renderWindows: Array<{ top: number; height: number }>
): boolean {
  const opBottom = rect.y + rect.height
  return renderWindows.some((window) => {
    const renderTop = window.top
    const renderBottom = window.top + window.height
    return opBottom > renderTop && rect.y < renderBottom
  })
}
