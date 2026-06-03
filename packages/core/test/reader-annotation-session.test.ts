import { describe, expect, it } from "vitest";
import type { Annotation } from "../src/model/types";
import { ReaderAnnotationSession } from "../src/runtime/reader-annotation-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderAnnotationSession", () => {
  it("appends annotations immutably and resets them", () => {
    const state = createReaderSessionState({
      preferences: {},
      mode: "paginated",
      publisherStyles: "enabled",
      publisherColorOverride: "none",
      experimentalRtl: false,
      spreadMode: "auto",
      theme: { background: "#fff", color: "#000" },
      typography: { fontSize: 16, lineHeight: 1.5, paragraphSpacing: 1 }
    });
    const session = new ReaderAnnotationSession(state.annotations);
    const original = session.annotations;

    session.append(createAnnotation("a1"));

    expect(session.annotations).toHaveLength(1);
    expect(session.annotations).not.toBe(original);

    session.reset();

    expect(session.annotations).toEqual([]);
  });
});

function createAnnotation(id: string): Annotation {
  return {
    id,
    publicationId: "pub",
    locator: {
      spineIndex: 0,
      progressInSection: 0
    },
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  };
}
