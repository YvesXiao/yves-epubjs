import type { Decoration, DecorationStyle, Locator } from "../model/types"
import { normalizeLocator } from "./locator"

export class DecorationManager {
  private readonly explicitGroups = new Map<string, Decoration[]>()
  private readonly derivedGroups = new Map<string, Decoration[]>()

  setExplicitGroup(group: string, decorations: Decoration[]): void {
    this.explicitGroups.set(group, normalizeDecorations(group, decorations))
  }

  clearExplicitGroup(group: string): void {
    this.explicitGroups.delete(group)
  }

  clearAllExplicit(): void {
    this.explicitGroups.clear()
  }

  setDerivedGroup(group: string, decorations: Decoration[]): void {
    this.derivedGroups.set(group, normalizeDecorations(group, decorations))
  }

  clearDerivedGroup(group: string): void {
    this.derivedGroups.delete(group)
  }

  clearAll(): void {
    this.explicitGroups.clear()
    this.derivedGroups.clear()
  }

  getGroup(group: string): Decoration[] {
    return [
      ...(this.explicitGroups.get(group) ?? []),
      ...(this.derivedGroups.get(group) ?? [])
    ]
  }

  getAll(): Decoration[] {
    return [
      ...Array.from(this.explicitGroups.values()).flat(),
      ...Array.from(this.derivedGroups.values()).flat()
    ]
  }

  getForSpineIndex(spineIndex: number): Decoration[] {
    return this.getAll().filter(
      (decoration) => decoration.locator.spineIndex === spineIndex
    )
  }

  getBlockIdsForStyles(styles: DecorationStyle[]): Set<string> {
    const accepted = new Set(styles)
    return new Set(
      this.getAll()
        .filter((decoration) => accepted.has(decoration.style))
        .map((decoration) => decoration.locator.blockId)
        .filter((blockId): blockId is string => Boolean(blockId))
    )
  }

  getFirstLocatorForStyle(style: DecorationStyle): Locator | undefined {
    return this.getAll().find((decoration) => decoration.style === style)
      ?.locator
  }
}

function normalizeDecorations(
  group: string,
  decorations: Decoration[]
): Decoration[] {
  return decorations.map((decoration, index) => ({
    id: decoration.id.trim() || `${group}:${index + 1}`,
    group,
    locator: normalizeLocator(decoration.locator),
    style: decoration.style,
    ...(decoration.color?.trim() ? { color: decoration.color.trim() } : {}),
    ...(decoration.extras
      ? { extras: normalizeDecorationExtras(decoration.extras) }
      : {})
  }))
}

function normalizeDecorationExtras(
  extras: NonNullable<Decoration["extras"]>
): NonNullable<Decoration["extras"]> {
  return {
    ...(extras.renderHint ? { renderHint: extras.renderHint } : {}),
    ...(extras.label?.trim() ? { label: extras.label.trim() } : {}),
    ...(extras.textRange
      ? {
          textRange: {
            start: {
              blockId: extras.textRange.start.blockId.trim(),
              inlineOffset: Math.max(
                0,
                Math.trunc(extras.textRange.start.inlineOffset)
              )
            },
            end: {
              blockId: extras.textRange.end.blockId.trim(),
              inlineOffset: Math.max(
                0,
                Math.trunc(extras.textRange.end.inlineOffset)
              )
            }
          }
        }
      : {})
  }
}
