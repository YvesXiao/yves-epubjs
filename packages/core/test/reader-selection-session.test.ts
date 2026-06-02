import { describe, expect, it } from "vitest";
import type { ReaderTextSelectionSnapshot } from "../src/model/types";
import { ReaderSelectionSession } from "../src/runtime/reader-selection-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderSelectionSession", () => {
  it("tracks changed state for text selection updates", () => {
    const session = new ReaderSelectionSession(createTestState().selection);
    const selection = createSelection("block-a");

    expect(session.updateTextSelectionSnapshot(selection).changed).toBe(true);
    expect(session.updateTextSelectionSnapshot(selection).changed).toBe(false);

    selection.locator.blockId = "mutated";
    expect(session.textSelectionSnapshot?.locator.blockId).toBe("block-a");
  });

  it("pins selection and resets current and pinned snapshots together", () => {
    const session = new ReaderSelectionSession(createTestState().selection);
    const selection = createSelection("block-a");

    const pinned = session.setPinnedTextSelectionSnapshot(selection);
    expect(pinned.changed).toBe(true);
    expect(session.pinnedTextSelectionSnapshot?.locator.blockId).toBe(
      "block-a"
    );

    session.reset();

    expect(session.textSelectionSnapshot).toBeNull();
    expect(session.pinnedTextSelectionSnapshot).toBeNull();
  });
});

function createTestState() {
  return createReaderSessionState({
    preferences: {},
    mode: "paginated",
    publisherStyles: "enabled",
    publisherColorOverride: "none",
    experimentalRtl: false,
    spreadMode: "auto",
    theme: { background: "#fff", color: "#000" },
    typography: { fontSize: 16, lineHeight: 1.5, paragraphSpacing: 1 }
  });
}

function createSelection(blockId: string): ReaderTextSelectionSnapshot {
  return {
    text: "Selected text",
    locator: {
      spineIndex: 0,
      blockId,
      progressInSection: 0
    },
    sectionId: "section",
    blockId,
    rects: [],
    visible: false
  };
}
