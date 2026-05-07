import { describe, expect, it } from "vitest";
import type { Book, SectionDocument } from "../src/model/types";
import {
  createAnnotation,
  deserializeAnnotation,
  mapAnnotationToDecoration,
  mapAnnotationsToDecorations,
  serializeAnnotation
} from "../src/runtime/annotation";

function createBook(section: SectionDocument): Book {
  return {
    metadata: {
      title: "Annotation Test",
      identifier: "urn:uuid:annotation-test"
    },
    manifest: [],
    spine: [
      {
        idref: "item-1",
        href: section.href,
        linear: true
      }
    ],
    toc: [],
    sections: [section]
  };
}

describe("annotation helpers", () => {
  it("creates serializable annotations from locators", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Target paragraph" }]
        }
      ]
    };
    const book = createBook(section);

    const annotation = createAnnotation({
      publicationId: "identifier:urn:uuid:annotation-test",
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        progressInSection: 0.25
      },
      book,
      quote: "Target paragraph",
      note: "Important line",
      color: "#f59e0b",
      createdAt: "2026-04-18T11:00:00.000Z",
      updatedAt: "2026-04-18T11:05:00.000Z"
    });

    expect(annotation.locator).toEqual({
      spineIndex: 0,
      href: "OPS/chapter-1.xhtml",
      blockId: "text-1",
      cfi: "epubcfi(/6/2!/2[text-1])",
      progressInSection: 0.25
    });
    expect(deserializeAnnotation(serializeAnnotation(annotation))).toEqual(
      annotation
    );
  });

  it("maps annotations into highlight decorations", () => {
    const annotation = {
      id: "annotation-1",
      publicationId: "identifier:urn:uuid:annotation-test",
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        progressInSection: 0.25
      },
      quote: "Target paragraph",
      note: "Important line",
      color: "#f59e0b",
      createdAt: "2026-04-18T11:00:00.000Z",
      updatedAt: "2026-04-18T11:05:00.000Z"
    } as const;

    const decoration = mapAnnotationToDecoration(annotation);

    expect(decoration).toEqual({
      id: "annotation:annotation-1",
      group: "annotations",
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        progressInSection: 0.25
      },
      style: "highlight",
      color: "#f59e0b"
    });
    expect(mapAnnotationsToDecorations([annotation])).toEqual([decoration]);
  });

  it("preserves underline annotation style and maps it to underline decorations", () => {
    const annotation = createAnnotation({
      publicationId: "identifier:urn:uuid:annotation-test",
      locator: {
        spineIndex: 0,
        blockId: "text-1",
        progressInSection: 0.25
      },
      style: "underline",
      color: "#2563eb",
      createdAt: "2026-04-18T11:00:00.000Z"
    });

    expect(deserializeAnnotation(serializeAnnotation(annotation))?.style).toBe(
      "underline"
    );
    expect(mapAnnotationToDecoration(annotation)).toMatchObject({
      style: "underline",
      color: "#2563eb"
    });
  });
});
