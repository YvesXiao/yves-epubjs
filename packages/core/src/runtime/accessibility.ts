import type {
  AccessibilityContainerKind,
  AccessibilityDiagnostics,
  AccessibilityEntry,
  AccessibilityEntryKind,
  BlockNode,
  Book,
  PublicationAccessibilitySnapshot,
  SectionAccessibilitySnapshot,
  SectionDocument
} from "../model/types"
import { extractBlockText } from "../utils/block-text"
import { createBlockLocator } from "./navigation-target"

export function buildSectionAccessibilitySnapshot(input: {
  section: SectionDocument
  spineIndex: number
}): SectionAccessibilitySnapshot {
  const entries = input.section.blocks.flatMap((block) =>
    collectAccessibilityEntries({
      section: input.section,
      spineIndex: input.spineIndex,
      block,
      containerPath: []
    })
  )

  return {
    spineIndex: input.spineIndex,
    sectionId: input.section.id,
    sectionHref: input.section.href,
    text: joinAccessibilityText(entries),
    entries,
    diagnostics: summarizeAccessibilityEntries(entries)
  }
}

export function buildPublicationAccessibilitySnapshot(input: {
  book: Book
  publicationId?: string
}): PublicationAccessibilitySnapshot {
  const sections = input.book.sections.map((section, spineIndex) =>
    buildSectionAccessibilitySnapshot({
      section,
      spineIndex
    })
  )
  const entries = sections.flatMap((section) => section.entries)

  return {
    ...(input.publicationId ? { publicationId: input.publicationId } : {}),
    text: joinAccessibilityText(entries),
    sections,
    diagnostics: summarizeAccessibilityEntries(entries)
  }
}

function collectAccessibilityEntries(input: {
  section: SectionDocument
  spineIndex: number
  block: BlockNode
  containerPath: AccessibilityContainerKind[]
  leafKindOverride?: AccessibilityEntryKind
}): AccessibilityEntry[] {
  switch (input.block.kind) {
    case "quote":
      return input.block.blocks.flatMap((block) =>
        collectAccessibilityEntries({
          ...input,
          block,
          containerPath: [...input.containerPath, "quote"]
        })
      )
    case "figure":
      return [
        ...input.block.blocks.flatMap((block) =>
          collectAccessibilityEntries({
            ...input,
            block,
            containerPath: [...input.containerPath, "figure"]
          })
        ),
        ...(input.block.caption ?? []).flatMap((block) =>
          collectAccessibilityEntries({
            ...input,
            block,
            containerPath: [...input.containerPath, "figure"],
            leafKindOverride: "figure-caption"
          })
        )
      ]
    case "aside":
      return input.block.blocks.flatMap((block) =>
        collectAccessibilityEntries({
          ...input,
          block,
          containerPath: [...input.containerPath, "aside"]
        })
      )
    case "nav":
      return input.block.blocks.flatMap((block) =>
        collectAccessibilityEntries({
          ...input,
          block,
          containerPath: [...input.containerPath, "nav"]
        })
      )
    case "list":
      return input.block.items.flatMap((item) =>
        item.blocks.flatMap((block) =>
          collectAccessibilityEntries({
            ...input,
            block,
            containerPath: [...input.containerPath, "list-item"]
          })
        )
      )
    case "table":
      return [
        ...(input.block.caption ?? []).flatMap((block) =>
          collectAccessibilityEntries({
            ...input,
            block,
            containerPath: [...input.containerPath, "table"],
            leafKindOverride: "table-caption"
          })
        ),
        ...input.block.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.blocks.flatMap((block) =>
              collectAccessibilityEntries({
                ...input,
                block,
                containerPath: [...input.containerPath, "table"]
              })
            )
          )
        )
      ]
    case "definition-list":
      return input.block.items.flatMap((item) => [
        ...item.term.flatMap((block) =>
          collectAccessibilityEntries({
            ...input,
            block,
            containerPath: [...input.containerPath, "definition-list"],
            leafKindOverride: "definition-term"
          })
        ),
        ...item.descriptions.flatMap((description) =>
          description.flatMap((block) =>
            collectAccessibilityEntries({
              ...input,
              block,
              containerPath: [...input.containerPath, "definition-list"],
              leafKindOverride: "definition-description"
            })
          )
        )
      ])
    case "thematic-break":
      return []
    default:
      return createAccessibilityLeafEntry(input)
  }
}

function createAccessibilityLeafEntry(input: {
  section: SectionDocument
  spineIndex: number
  block: BlockNode
  containerPath: AccessibilityContainerKind[]
  leafKindOverride?: AccessibilityEntryKind
}): AccessibilityEntry[] {
  const kind = resolveAccessibilityLeafKind(input.block, input.leafKindOverride)
  const text = normalizeAccessibilityText(extractBlockText(input.block))

  if (kind !== "image" && !text) {
    return []
  }

  return [
    {
      id: `${kind}:${input.block.id}`,
      kind,
      blockId: input.block.id,
      locator: createBlockLocator({
        section: input.section,
        spineIndex: input.spineIndex,
        blockId: input.block.id
      }),
      text,
      containerPath: [...input.containerPath],
      ...(input.block.kind === "heading"
        ? { headingLevel: input.block.level }
        : {}),
      ...(kind === "image" && text ? { altText: text } : {})
    }
  ]
}

function resolveAccessibilityLeafKind(
  block: BlockNode,
  override?: AccessibilityEntryKind
): AccessibilityEntryKind {
  if (override) {
    return override
  }

  switch (block.kind) {
    case "heading":
      return "heading"
    case "code":
      return "code"
    case "image":
      return "image"
    default:
      return "text"
  }
}

function joinAccessibilityText(entries: AccessibilityEntry[]): string {
  return entries
    .map((entry) => entry.text)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeAccessibilityText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function summarizeAccessibilityEntries(
  entries: AccessibilityEntry[]
): AccessibilityDiagnostics {
  const summary: AccessibilityDiagnostics = {
    totalEntries: entries.length,
    imageEntries: 0,
    imageAltEntries: 0,
    imageMissingAltEntries: 0,
    figureCaptionEntries: 0,
    tableCaptionEntries: 0,
    asideEntries: 0,
    definitionTermEntries: 0,
    definitionDescriptionEntries: 0
  }

  for (const entry of entries) {
    if (entry.kind === "image") {
      summary.imageEntries += 1
      if (entry.altText) {
        summary.imageAltEntries += 1
      } else {
        summary.imageMissingAltEntries += 1
      }
    }

    if (entry.kind === "figure-caption") {
      summary.figureCaptionEntries += 1
    }

    if (entry.kind === "table-caption") {
      summary.tableCaptionEntries += 1
    }

    if (entry.kind === "definition-term") {
      summary.definitionTermEntries += 1
    }

    if (entry.kind === "definition-description") {
      summary.definitionDescriptionEntries += 1
    }

    if (entry.containerPath.includes("aside")) {
      summary.asideEntries += 1
    }
  }

  return summary
}
