import { describe, expect, it } from "vitest";
import type { Book, SectionDocument } from "../src/model/types";
import { ReaderDocumentSession } from "../src/runtime/reader-document-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderDocumentSession", () => {
  it("resets opened document state and indexes sections", () => {
    const state = createTestState();
    const session = new ReaderDocumentSession(state.document);
    const book = createBook(["section-a", "section-b"]);
    const resources = {
      readBinary: async () => new Uint8Array([1]),
      exists: () => true
    };

    session.resetForOpen({
      book,
      sourceName: "book.epub",
      resources,
      chapterRenderInputs: []
    });

    expect(session.book).toBe(book);
    expect(session.sourceName).toBe("book.epub");
    expect(session.resources).toBe(resources);
    expect(session.resolveSectionIndexById("section-b")).toBe(1);
  });

  it("clears document state on destroy", () => {
    const state = createTestState();
    const session = new ReaderDocumentSession(state.document);
    session.resetForOpen({
      book: createBook(["section-a"]),
      sourceName: null,
      resources: {
        readBinary: async () => new Uint8Array([1]),
        exists: () => true
      },
      chapterRenderInputs: []
    });

    session.resetForDestroy();

    expect(session.book).toBeNull();
    expect(session.resources).toBeNull();
    expect(session.chapterRenderInputs).toEqual([]);
    expect(session.resolveSectionIndexById("section-a")).toBe(-1);
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

function createBook(sectionIds: string[]): Book {
  return {
    metadata: { title: "Test Book" },
    manifest: [],
    spine: sectionIds.map((id) => ({
      idref: id,
      href: `${id}.xhtml`,
      linear: true
    })),
    sections: sectionIds.map((id) => createSection(id)),
    toc: []
  };
}

function createSection(id: string): SectionDocument {
  return {
    id,
    href: `${id}.xhtml`,
    title: id,
    blocks: [],
    anchors: {}
  };
}
