import type { Book } from "../model/types";
import type {
  ReaderDocumentSessionState,
  ReaderResourceReader
} from "./reader-session-state";
import type { SharedChapterRenderInput } from "./chapter-render-input";

export class ReaderDocumentSession {
  constructor(private readonly state: ReaderDocumentSessionState) {}

  get book(): Book | null {
    return this.state.book;
  }

  set book(value: Book | null) {
    this.state.book = value;
  }

  get sourceName(): string | null {
    return this.state.sourceName;
  }

  set sourceName(value: string | null) {
    this.state.sourceName = value;
  }

  get resources(): ReaderResourceReader | null {
    return this.state.resources;
  }

  set resources(value: ReaderResourceReader | null) {
    this.state.resources = value;
  }

  get chapterRenderInputs(): SharedChapterRenderInput[] {
    return this.state.chapterRenderInputs;
  }

  set chapterRenderInputs(value: SharedChapterRenderInput[]) {
    this.state.chapterRenderInputs = value;
  }

  get sectionIndexById(): Map<string, number> {
    return this.state.sectionIndexById;
  }

  resetForOpen(input: {
    book: Book;
    sourceName: string | null;
    resources: ReaderResourceReader;
    chapterRenderInputs: SharedChapterRenderInput[];
  }): void {
    this.state.book = input.book;
    this.state.sourceName = input.sourceName;
    this.state.resources = input.resources;
    this.state.chapterRenderInputs = input.chapterRenderInputs;
    this.rebuildSectionIndex();
  }

  resetForDestroy(): void {
    this.state.book = null;
    this.state.sourceName = null;
    this.state.resources = null;
    this.state.chapterRenderInputs = [];
    this.state.sectionIndexById.clear();
  }

  rebuildSectionIndex(): void {
    this.state.sectionIndexById.clear();
    if (!this.state.book) {
      return;
    }

    this.state.book.sections.forEach((section, index) => {
      this.state.sectionIndexById.set(section.id, index);
    });
  }

  resolveSectionIndexById(sectionId: string): number {
    const indexed = this.state.sectionIndexById.get(sectionId);
    if (typeof indexed === "number") {
      return indexed;
    }

    if (!this.state.book) {
      return -1;
    }

    const fallbackIndex = this.state.book.sections.findIndex(
      (section) => section.id === sectionId
    );
    if (fallbackIndex >= 0) {
      this.state.sectionIndexById.set(sectionId, fallbackIndex);
    }
    return fallbackIndex;
  }
}
