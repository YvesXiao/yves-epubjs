import { describe, expect, it } from "vitest";
import type { Annotation, Book, SectionDocument } from "../src/model/types";
import { ReaderAnnotationService } from "../src/runtime/reader-annotation-service";

describe("ReaderAnnotationService", () => {
  it("resolves text-range quotes from section text", () => {
    const section = createTextSection("s1", "Hello world");
    const service = createService({
      book: createBook([section])
    });

    expect(
      service.resolveTextRangeQuote(section, {
        start: {
          blockId: "text-1",
          inlineOffset: 6
        },
        end: {
          blockId: "text-1",
          inlineOffset: 11
        }
      })
    ).toBe("world");
  });

  it("detects when a selection is fully covered by an existing annotation", () => {
    const section = createTextSection("s1", "Hello world");
    const annotation: Annotation = {
      id: "annotation-1",
      publicationId: "book-1",
      locator: {
        spineIndex: 0,
        blockId: "text-1"
      },
      textRange: {
        start: {
          blockId: "text-1",
          inlineOffset: 0
        },
        end: {
          blockId: "text-1",
          inlineOffset: 11
        }
      },
      quote: "Hello world",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z"
    };
    const service = createService({
      book: createBook([section]),
      annotations: [annotation]
    });

    expect(
      service.resolveSelectionHighlightState({
        text: "Hello",
        locator: {
          spineIndex: 0,
          blockId: "text-1",
          inlineOffset: 0
        },
        sectionId: "s1",
        blockId: "text-1",
        textRange: {
          start: {
            blockId: "text-1",
            inlineOffset: 0
          },
          end: {
            blockId: "text-1",
            inlineOffset: 5
          }
        },
        rects: [],
        visible: false
      })
    ).toEqual({
      mode: "remove-highlight",
      disabled: false
    });
  });

  it("resolves annotation activation payloads at viewport points", () => {
    const section = createTextSection("s1", "Hello world");
    const annotation: Annotation = {
      id: "annotation-1",
      publicationId: "book-1",
      locator: {
        spineIndex: 0,
        blockId: "text-1"
      },
      style: "underline",
      textRange: {
        start: {
          blockId: "text-1",
          inlineOffset: 0
        },
        end: {
          blockId: "text-1",
          inlineOffset: 5
        }
      },
      quote: "Hello",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z"
    };
    const service = createService({
      book: createBook([section]),
      annotations: [annotation],
      rects: [{ x: 10, y: 20, width: 120, height: 24 }]
    });

    expect(
      service.resolveAnnotationActivationAtPoint({ x: 30, y: 30 })
    ).toMatchObject({
      annotation: {
        id: "annotation-1",
        style: "underline"
      },
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        inlineOffset: 0
      },
      sectionId: "s1",
      blockId: "text-1",
      quote: "Hello"
    });
  });
});

function createService(input: {
  book: Book;
  annotations?: Annotation[];
  rects?: Array<{ x: number; y: number; width: number; height: number }>;
}): ReaderAnnotationService {
  const container = document.createElement("div");
  return new ReaderAnnotationService({
    getBook: () => input.book,
    getAnnotations: () => input.annotations ?? [],
    getPublicationId: () => "book-1",
    getContainer: () => container,
    getMode: () => "scroll",
    getSectionElement: () => null,
    mapLocatorToViewport: () => input.rects ?? [],
    resolveCanvasTextRangeViewportRects: () => []
  });
}

function createBook(sections: SectionDocument[]): Book {
  return {
    metadata: {
      title: "Test Book",
      identifier: "book-1"
    },
    manifest: [],
    spine: sections.map((section, index) => ({
      idref: `item-${index + 1}`,
      href: section.href,
      linear: true
    })),
    toc: [],
    sections
  };
}

function createTextSection(id: string, text: string): SectionDocument {
  return {
    id,
    href: `${id}.xhtml`,
    anchors: {},
    blocks: [
      {
        id: "text-1",
        kind: "text",
        inlines: [
          {
            kind: "text",
            text
          }
        ]
      }
    ]
  };
}
