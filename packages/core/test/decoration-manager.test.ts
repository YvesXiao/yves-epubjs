import { describe, expect, it } from "vitest"
import { DecorationManager } from "../src/runtime/decoration-manager"

describe("DecorationManager", () => {
  it("merges explicit and derived groups and exposes block ids by style", () => {
    const manager = new DecorationManager()

    manager.setExplicitGroup("search-results", [
      {
        id: "search-1",
        group: "search-results",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          progressInSection: 0.2
        },
        style: "search-hit"
      }
    ])
    manager.setDerivedGroup("current-location", [
      {
        id: "active-1",
        group: "current-location",
        locator: {
          spineIndex: 0,
          blockId: "text-2",
          progressInSection: 0.5
        },
        style: "active"
      }
    ])

    expect(manager.getGroup("search-results")).toHaveLength(1)
    expect(manager.getAll()).toHaveLength(2)
    expect(Array.from(manager.getBlockIdsForStyles(["search-hit"]))).toEqual([
      "text-1"
    ])
    expect(manager.getFirstLocatorForStyle("active")).toEqual({
      spineIndex: 0,
      blockId: "text-2",
      progressInSection: 0.5
    })
  })

  it("preserves normalized decoration extras and supports underline decorations", () => {
    const manager = new DecorationManager()

    manager.setExplicitGroup("notes", [
      {
        id: " note-1 ",
        group: "notes",
        locator: {
          spineIndex: 1,
          blockId: "text-9",
          progressInSection: 0.4
        },
        style: "underline",
        extras: {
          renderHint: "note-icon",
          label: " Important "
        }
      }
    ])

    expect(manager.getGroup("notes")).toEqual([
      {
        id: "note-1",
        group: "notes",
        locator: {
          spineIndex: 1,
          blockId: "text-9",
          progressInSection: 0.4
        },
        style: "underline",
        extras: {
          renderHint: "note-icon",
          label: "Important"
        }
      }
    ])
    expect(Array.from(manager.getBlockIdsForStyles(["underline"]))).toEqual([
      "text-9"
    ])
  })
})
