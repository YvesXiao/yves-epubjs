import { describe, expect, it, vi } from "vitest";
import type { Book, SectionDocument } from "../src/model/types";
import {
  EpubReader,
  createSharedChapterRenderInput,
  parseCssStyleSheet,
  toCanvasChapterRenderInput
} from "../src";

const SIMPLE_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Simple</title></head>
    <body>
      <section>
        <h1>Simple</h1>
        <p>Plain reading flow.</p>
      </section>
    </body>
  </html>`;

const COMPLEX_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Complex</title></head>
    <body>
      <section>
        <h1>Complex</h1>
        <p><a href="OPS/simple.xhtml">Back to simple</a></p>
        <table>
          <tr><td>Fallback</td></tr>
        </table>
      </section>
    </body>
  </html>`;

describe("EpubReader chapter render routing", () => {
  it("emits section rendered hooks for canvas and dom render paths", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    });
    document.body.appendChild(container);

    const onSectionRendered = vi.fn();
    const simpleInput = createSharedChapterRenderInput({
      href: "OPS/simple.xhtml",
      content: SIMPLE_CHAPTER
    });
    const complexInput = createSharedChapterRenderInput({
      href: "OPS/complex.xhtml",
      content: COMPLEX_CHAPTER
    });
    const simpleSection: SectionDocument = {
      ...toCanvasChapterRenderInput(simpleInput).section,
      id: "section-1"
    };
    const complexSection: SectionDocument = {
      ...toCanvasChapterRenderInput(complexInput).section,
      id: "section-2"
    };

    const book: Book = {
      metadata: { title: "Rendered Hooks" },
      manifest: [],
      spine: [
        { idref: "item-1", href: simpleSection.href, linear: true },
        { idref: "item-2", href: complexSection.href, linear: true }
      ],
      toc: [],
      sections: [simpleSection, complexSection]
    };

    const reader = new EpubReader({
      container,
      mode: "scroll",
      onSectionRendered
    });
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).book = book;
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).chapterRenderInputs = [simpleInput, complexInput];

    await reader.render();

    expect(onSectionRendered).toHaveBeenCalledWith(
      expect.objectContaining({
        spineIndex: 0,
        sectionId: "section-1",
        sectionHref: "OPS/simple.xhtml",
        backend: "canvas",
        mode: "scroll",
        isCurrent: true
      })
    );

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    });

    expect(onSectionRendered).toHaveBeenCalledWith(
      expect.objectContaining({
        spineIndex: 1,
        sectionId: "section-2",
        sectionHref: "OPS/complex.xhtml",
        backend: "dom",
        mode: "scroll",
        isCurrent: true,
        contentElement: expect.any(HTMLElement)
      })
    );
  });

  it("sanitizes active content when a high-risk chapter routes to the dom backend", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    });
    document.body.appendChild(container);

    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/unsafe-dom.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section onclick="alert(1)">
              <h1>Unsafe DOM</h1>
              <p><a href="javascript:alert(1)">Blocked link</a></p>
              <table><tr><td>DOM route</td></tr></table>
              <iframe src="https://cdn.example.com/frame.html"></iframe>
              <object data="https://cdn.example.com/object.swf"></object>
              <embed src="https://cdn.example.com/plugin.swf" />
              <form action="/submit"><input name="q" value="leak" /></form>
              <svg viewBox="0 0 10 10">
                <foreignObject><iframe src="https://bad.example"></iframe></foreignObject>
                <path d="M0 0 L10 10" />
              </svg>
            </section>
          </body>
        </html>`
    });
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-unsafe"
    };
    const book: Book = {
      metadata: { title: "Sanitized DOM" },
      manifest: [],
      spine: [{ idref: "item-unsafe", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    };

    const reader = new EpubReader({ container, mode: "scroll" });
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).book = book;
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).chapterRenderInputs = [sharedInput];

    await reader.render();

    expect(reader.getRenderMetrics().backend).toBe("dom");
    expect(reader.getRenderDiagnostics()).toEqual(
      expect.objectContaining({
        mode: "dom",
        sectionId: "section-unsafe"
      })
    );
    expect(container.dataset.renderMode).toBe("dom");
    expect(container.textContent).toContain("Unsafe DOM");
    expect(container.textContent).toContain("DOM route");
    expect(container.querySelector(".epub-dom-section")).toBeTruthy();
    expect(
      container.querySelector("iframe, object, embed, form, input")
    ).toBeFalsy();
    expect(container.querySelector("script, foreignObject")).toBeFalsy();
    expect(
      container.querySelector("[onclick], [onload], [srcdoc]")
    ).toBeFalsy();
    expect(
      container.querySelector(".epub-dom-section a")?.getAttribute("href")
    ).toBeNull();
    expect(container.querySelector(".epub-dom-section svg path")).toBeTruthy();
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("keeps stylesheet-backed simple chapters on the canvas path", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    });
    document.body.appendChild(container);

    const linkedStyleSheet = {
      href: "OPS/styles/chapter.css",
      mediaType: "text/css",
      text: ".badge { float: right; height: 1.1em; margin-left: 0.1em; }",
      ast: parseCssStyleSheet(
        ".badge { float: right; height: 1.1em; margin-left: 0.1em; }"
      )
    };
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/simple.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <h1>Simple</h1>
              <p>Alpha<img class="badge" src="badge.png" width="20" height="20" alt="Badge" />Omega</p>
            </section>
          </body>
        </html>`,
      linkedStyleSheets: [linkedStyleSheet]
    });
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    };
    const book: Book = {
      metadata: { title: "Canvas First" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    };

    const reader = new EpubReader({ container, mode: "scroll" });
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).book = book;
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).chapterRenderInputs = [sharedInput];

    await reader.render();

    expect(reader.getRenderMetrics().backend).toBe("canvas");
    expect(reader.getRenderDiagnostics()).toEqual(
      expect.objectContaining({
        mode: "canvas",
        score: 15,
        reasons: ["complex-style:float"],
        layoutAuthority: "project-layout",
        geometrySource: "interaction-map",
        interactionModel: "canvas-hit-test",
        flowModel: "scroll-slices",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-1",
        sectionHref: "OPS/simple.xhtml"
      })
    );
    expect(container.dataset.renderMode).toBe("canvas");
    expect(container.querySelector("canvas.epub-canvas-section")).toBeTruthy();
  });

  it("routes different chapters to canvas and dom rendering paths", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    });
    document.body.appendChild(container);

    const simpleInput = createSharedChapterRenderInput({
      href: "OPS/simple.xhtml",
      content: SIMPLE_CHAPTER
    });
    const complexInput = createSharedChapterRenderInput({
      href: "OPS/complex.xhtml",
      content: COMPLEX_CHAPTER
    });
    const simpleSection: SectionDocument = {
      ...toCanvasChapterRenderInput(simpleInput).section,
      id: "section-1"
    };
    const complexSection: SectionDocument = {
      ...toCanvasChapterRenderInput(complexInput).section,
      id: "section-2"
    };

    const book: Book = {
      metadata: { title: "Hybrid Reader" },
      manifest: [],
      spine: [
        { idref: "item-1", href: simpleSection.href, linear: true },
        { idref: "item-2", href: complexSection.href, linear: true }
      ],
      toc: [],
      sections: [simpleSection, complexSection]
    };

    const reader = new EpubReader({ container, mode: "scroll" });
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).book = book;
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).chapterRenderInputs = [simpleInput, complexInput];

    await reader.render();

    expect(reader.getRenderMetrics().backend).toBe("canvas");
    expect(reader.getRenderDiagnostics()).toEqual(
      expect.objectContaining({
        mode: "canvas",
        score: 0,
        reasons: [],
        layoutAuthority: "project-layout",
        geometrySource: "interaction-map",
        interactionModel: "canvas-hit-test",
        flowModel: "scroll-slices",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-1",
        sectionHref: "OPS/simple.xhtml"
      })
    );
    expect(reader.getVisibleSectionDiagnostics()).toEqual([
      expect.objectContaining({
        mode: "canvas",
        score: 0,
        reasons: [],
        layoutAuthority: "project-layout",
        geometrySource: "interaction-map",
        interactionModel: "canvas-hit-test",
        flowModel: "scroll-slices",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-1",
        sectionHref: "OPS/simple.xhtml",
        isCurrent: true
      }),
      expect.objectContaining({
        mode: "dom",
        score: 20,
        reasons: ["high-risk-tag:table"],
        layoutAuthority: "browser-layout",
        geometrySource: "dom-geometry",
        interactionModel: "dom-events",
        flowModel: "dom-flow",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-2",
        sectionHref: "OPS/complex.xhtml",
        isCurrent: false
      })
    ]);
    expect(container.querySelector("canvas.epub-canvas-section")).toBeTruthy();
    expect(
      container.querySelector("article.epub-section-dom .epub-dom-section")
    ).toBeTruthy();
    expect(container.dataset.renderMode).toBe("canvas");

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    });

    expect(reader.getRenderMetrics().backend).toBe("dom");
    expect(reader.getRenderDiagnostics()).toEqual(
      expect.objectContaining({
        mode: "dom",
        score: 20,
        reasons: ["high-risk-tag:table"],
        layoutAuthority: "browser-layout",
        geometrySource: "dom-geometry",
        interactionModel: "dom-events",
        flowModel: "dom-flow",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-2",
        sectionHref: "OPS/complex.xhtml"
      })
    );
    expect(reader.getVisibleSectionDiagnostics()).toEqual([
      expect.objectContaining({
        mode: "canvas",
        score: 0,
        reasons: [],
        layoutAuthority: "project-layout",
        geometrySource: "interaction-map",
        interactionModel: "canvas-hit-test",
        flowModel: "scroll-slices",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-1",
        sectionHref: "OPS/simple.xhtml",
        isCurrent: false
      }),
      expect.objectContaining({
        mode: "dom",
        score: 20,
        reasons: ["high-risk-tag:table"],
        layoutAuthority: "browser-layout",
        geometrySource: "dom-geometry",
        interactionModel: "dom-events",
        flowModel: "dom-flow",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-2",
        sectionHref: "OPS/complex.xhtml",
        isCurrent: true
      })
    ]);
    expect(container.querySelector(".epub-dom-section")).toBeTruthy();
    expect(
      container.querySelector(
        "article.epub-section-canvas canvas.epub-canvas-section"
      )
    ).toBeTruthy();
    expect(container.dataset.renderMode).toBe("dom");

    const domLink = container.querySelector(".epub-dom-section a");
    expect(domLink).toBeTruthy();
    domLink?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true
      })
    );
    await Promise.resolve();

    expect(reader.getRenderMetrics().backend).toBe("canvas");
    expect(container.dataset.renderMode).toBe("canvas");

    await reader.goToLocation({
      spineIndex: 1,
      progressInSection: 0
    });

    const domSection = container.querySelector(
      ".epub-dom-section"
    ) as HTMLElement | null;
    expect(domSection).toBeTruthy();
    Object.defineProperty(domSection!, "scrollHeight", {
      configurable: true,
      value: 400
    });
    domSection!.getBoundingClientRect = () =>
      ({
        top: 20,
        left: 0,
        right: 320,
        bottom: 420,
        width: 320,
        height: 400,
        x: 0,
        y: 20,
        toJSON() {
          return {};
        }
      }) as DOMRect;

    domSection!.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 40,
        clientY: 220
      })
    );

    const relocated = reader.getCurrentLocation();
    expect(relocated?.spineIndex).toBe(1);
    expect(relocated?.progressInSection ?? 0).toBeGreaterThan(0.45);
    expect(relocated?.progressInSection ?? 0).toBeLessThan(0.55);

    const originalGetSelection = window.getSelection;
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        toString: () => "selected text",
        anchorNode: domSection?.firstChild ?? domSection,
        focusNode: domSection?.firstChild ?? domSection
      })
    });

    domSection!.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 180,
        clientY: 380
      })
    );

    expect(reader.getCurrentLocation()?.progressInSection).toBe(
      relocated?.progressInSection
    );

    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: originalGetSelection
    });

    await reader.goToLocation({
      spineIndex: 0,
      progressInSection: 0
    });

    expect(reader.getRenderMetrics().backend).toBe("canvas");
    expect(container.querySelector("canvas.epub-canvas-section")).toBeTruthy();
    expect(container.querySelector(".epub-dom-section")).toBeTruthy();
  });

  it("routes publisher typography chapters with linked stylesheet layout rules to dom", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 320
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 480
    });
    document.body.appendChild(container);

    const linkedStyleSheet = {
      href: "OPS/styles/publisher.css",
      mediaType: "text/css",
      text: `
        p { text-indent: 2em; line-height: 1.5em; }
        .noindent { text-indent: 0; }
        span.dropcap { float: left; font-size: 1.6em; margin-right: 0.3em; }
        b { font-weight: 800; }
      `,
      ast: parseCssStyleSheet(`
        p { text-indent: 2em; line-height: 1.5em; }
        .noindent { text-indent: 0; }
        span.dropcap { float: left; font-size: 1.6em; margin-right: 0.3em; }
        b { font-weight: 800; }
      `)
    };
    const sharedInput = createSharedChapterRenderInput({
      href: "OPS/publisher.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <h3>Styled Chapter</h3>
              <p class="noindent"><b><span class="dropcap">信</span>贷会改变债务周期。</b></p>
            </section>
          </body>
        </html>`,
      linkedStyleSheets: [linkedStyleSheet]
    });
    const section: SectionDocument = {
      ...toCanvasChapterRenderInput(sharedInput).section,
      id: "section-1"
    };
    const book: Book = {
      metadata: { title: "Publisher Styled" },
      manifest: [],
      spine: [{ idref: "item-1", href: section.href, linear: true }],
      toc: [],
      sections: [section]
    };

    const reader = new EpubReader({ container, mode: "scroll" });
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).book = book;
    (
      reader as unknown as {
        book: Book;
        chapterRenderInputs: ReturnType<
          typeof createSharedChapterRenderInput
        >[];
      }
    ).chapterRenderInputs = [sharedInput];

    await reader.render();

    expect(reader.getRenderMetrics().backend).toBe("dom");
    expect(reader.getRenderDiagnostics()).toEqual(
      expect.objectContaining({
        mode: "dom",
        score: 30,
        reasons: ["complex-style:float", "complex-style:text-indent"],
        layoutAuthority: "browser-layout",
        geometrySource: "dom-geometry",
        interactionModel: "dom-events",
        flowModel: "dom-flow",
        alignmentTarget: "dom-baseline",
        publisherStyles: "enabled",
        styleProfile: "default-reflowable",
        sectionId: "section-1",
        sectionHref: "OPS/publisher.xhtml"
      })
    );
    expect(container.dataset.renderMode).toBe("dom");
    expect(container.querySelector(".epub-dom-section")).toBeTruthy();
  });
});
