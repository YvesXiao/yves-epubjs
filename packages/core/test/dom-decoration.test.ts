import { describe, expect, it } from "vitest";
import {
  applyDomDecorations,
  clearDomDecorations
} from "../src/runtime/dom-decoration";

describe("dom decorations", () => {
  it("applies highlight classes to anchor and block targets", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <h2 id="details">Details</h2>
        <p id="text-2">Body</p>
      </div>
    `;
    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    expect(sectionElement).toBeTruthy();

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      decorations: [
        {
          id: "highlight-1",
          group: "manual",
          locator: {
            spineIndex: 0,
            anchorId: "details",
            progressInSection: 0.1
          },
          style: "highlight"
        },
        {
          id: "search-1",
          group: "search-results",
          locator: {
            spineIndex: 0,
            blockId: "text-2",
            progressInSection: 0.4
          },
          style: "search-hit"
        }
      ]
    });

    expect(
      container.querySelector("style[data-epub-dom-decorations='true']")
    ).toBeTruthy();
    expect(
      container
        .querySelector("#details")
        ?.classList.contains("epub-dom-decoration-highlight")
    ).toBe(true);
    expect(
      container
        .querySelector("#text-2")
        ?.classList.contains("epub-dom-decoration-search-hit")
    ).toBe(true);

    clearDomDecorations(container);

    expect(
      container
        .querySelector("#details")
        ?.classList.contains("epub-dom-decoration-highlight")
    ).toBe(false);
    expect(
      container
        .querySelector("#text-2")
        ?.classList.contains("epub-dom-decoration-search-hit")
    ).toBe(false);
  });

  it("preserves decorations across multiple spread sections", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-spread">
        <div class="epub-dom-spread-slot" data-spread-slot="left">
          <div class="epub-dom-section" data-section-id="section-1">
            <p id="left-target">Left</p>
          </div>
        </div>
        <div class="epub-dom-spread-slot" data-spread-slot="right">
          <div class="epub-dom-section" data-section-id="section-2">
            <p id="right-target">Right</p>
          </div>
        </div>
      </div>
    `;
    const leftSection = container.querySelector<HTMLElement>(
      '.epub-dom-section[data-section-id="section-1"]'
    );
    const rightSection = container.querySelector<HTMLElement>(
      '.epub-dom-section[data-section-id="section-2"]'
    );
    expect(leftSection).toBeTruthy();
    expect(rightSection).toBeTruthy();

    applyDomDecorations({
      container,
      sectionElement: leftSection!,
      decorations: [
        {
          id: "search-left",
          group: "search-results",
          locator: {
            spineIndex: 0,
            blockId: "left-target",
            progressInSection: 0.2
          },
          style: "search-hit"
        }
      ]
    });
    applyDomDecorations({
      container,
      sectionElement: rightSection!,
      decorations: [
        {
          id: "annotation-right",
          group: "annotations",
          locator: {
            spineIndex: 1,
            blockId: "right-target",
            progressInSection: 0.5
          },
          style: "highlight"
        }
      ]
    });

    expect(
      container
        .querySelector("#left-target")
        ?.classList.contains("epub-dom-decoration-search-hit")
    ).toBe(true);
    expect(
      container
        .querySelector("#right-target")
        ?.classList.contains("epub-dom-decoration-highlight")
    ).toBe(true);
  });

  it("applies underline decorations and reserved hint classes", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p id="annotated-target">Annotated text</p>
      </div>
    `;
    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    expect(sectionElement).toBeTruthy();

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      decorations: [
        {
          id: "underline-1",
          group: "annotations",
          locator: {
            spineIndex: 0,
            blockId: "annotated-target",
            progressInSection: 0.4
          },
          style: "underline",
          color: "#2563eb",
          extras: {
            renderHint: "note-icon",
            label: "Inline note"
          }
        }
      ]
    });

    const target = container.querySelector<HTMLElement>("#annotated-target");
    expect(target?.classList.contains("epub-dom-decoration-underline")).toBe(
      true
    );
    expect(target?.style.getPropertyValue("--epub-decoration-color")).toBe(
      "#2563eb"
    );
    expect(
      target?.classList.contains("epub-dom-decoration-hint-note-icon")
    ).toBe(true);
    expect(target?.dataset.epubDecorationLabel).toBe("Inline note");

    clearDomDecorations(container);

    expect(target?.classList.contains("epub-dom-decoration-underline")).toBe(
      false
    );
    expect(target?.style.getPropertyValue("--epub-decoration-color")).toBe("");
    expect(
      target?.classList.contains("epub-dom-decoration-hint-note-icon")
    ).toBe(false);
    expect(target?.dataset.epubDecorationLabel).toBeUndefined();
  });

  it("renders precise text-range underline overlays with custom color", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p id="text-1">Precise underline target</p>
      </div>
    `;
    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    expect(sectionElement).toBeTruthy();

    Object.defineProperty(sectionElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 480, 120)
    });

    const originalCreateRange = document.createRange.bind(document);
    document.createRange = (() => ({
      setStart: () => undefined,
      setEnd: () => undefined,
      getClientRects: () => [new DOMRect(24, 32, 140, 28)]
    })) as unknown as typeof document.createRange;

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      decorations: [
        {
          id: "annotation-range-1",
          group: "annotations",
          locator: {
            spineIndex: 0,
            blockId: "text-1",
            progressInSection: 0.2
          },
          style: "underline",
          color: "#ef4444",
          extras: {
            textRange: {
              start: {
                blockId: "text-1",
                inlineOffset: 0
              },
              end: {
                blockId: "text-1",
                inlineOffset: 7
              }
            }
          }
        }
      ]
    });

    const overlay = container.querySelector<HTMLElement>(
      ".epub-dom-decoration-overlay-rect.is-underline"
    );
    expect(overlay).toBeTruthy();
    expect(overlay?.style.background).toBe("rgb(239, 68, 68)");
    expect(overlay?.style.height).toBe("2px");
    expect(overlay?.dataset.epubDecorationId).toBe("annotation-range-1");
    expect(overlay?.dataset.epubDecorationGroup).toBe("annotations");
    expect(overlay?.dataset.epubDecorationStyle).toBe("underline");

    document.createRange = originalCreateRange;
  });

  it("renders precise overlay rects for text-range highlights instead of whole-block classes", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p id="text-1">Precise decoration target</p>
      </div>
    `;
    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    const textTarget = container.querySelector<HTMLElement>("#text-1");
    expect(sectionElement).toBeTruthy();
    expect(textTarget).toBeTruthy();

    Object.defineProperty(sectionElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 480, 120)
    });

    const originalCreateRange = document.createRange.bind(document);
    document.createRange = (() => ({
      setStart: () => undefined,
      setEnd: () => undefined,
      getClientRects: () => [
        new DOMRect(24, 32, 140, 28),
        new DOMRect(24, 64, 88, 28)
      ]
    })) as unknown as typeof document.createRange;

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      decorations: [
        {
          id: "annotation-range-1",
          group: "annotations",
          locator: {
            spineIndex: 0,
            blockId: "text-1",
            progressInSection: 0.2
          },
          style: "highlight",
          extras: {
            textRange: {
              start: {
                blockId: "text-1",
                inlineOffset: 0
              },
              end: {
                blockId: "text-1",
                inlineOffset: 7
              }
            }
          }
        }
      ]
    });

    const overlayRects = container.querySelectorAll(
      ".epub-dom-decoration-overlay-rect"
    );
    expect(overlayRects).toHaveLength(2);
    expect(
      textTarget?.classList.contains("epub-dom-decoration-highlight")
    ).toBe(false);

    clearDomDecorations(container, sectionElement!);
    expect(
      container.querySelectorAll(".epub-dom-decoration-overlay-rect")
    ).toHaveLength(0);

    document.createRange = originalCreateRange;
  });

  it("positions precise text-range overlays correctly in scroll mode", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 90
    });
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      value: 0
    });
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 480, 240)
    });
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p id="text-1">Precise decoration target</p>
      </div>
    `;

    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    expect(sectionElement).toBeTruthy();
    Object.defineProperty(sectionElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 40, 480, 120)
    });

    const originalCreateRange = document.createRange.bind(document);
    document.createRange = (() => ({
      setStart: () => undefined,
      setEnd: () => undefined,
      getClientRects: () => [new DOMRect(24, 70, 140, 28)]
    })) as unknown as typeof document.createRange;

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      mode: "scroll",
      decorations: [
        {
          id: "annotation-range-1",
          group: "annotations",
          locator: {
            spineIndex: 0,
            blockId: "text-1",
            progressInSection: 0.2
          },
          style: "highlight",
          extras: {
            textRange: {
              start: {
                blockId: "text-1",
                inlineOffset: 0
              },
              end: {
                blockId: "text-1",
                inlineOffset: 7
              }
            }
          }
        }
      ]
    });

    const overlayRect = container.querySelector<HTMLElement>(
      ".epub-dom-decoration-overlay-rect"
    );
    expect(overlayRect).toBeTruthy();
    expect(overlayRect?.style.top).toBe("30px");

    document.createRange = originalCreateRange;
  });

  it("resolves highlight targets from synthetic data-reader-block-id markers", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="epub-dom-section" data-section-id="section-1">
        <p data-reader-block-id="text-1">Synthetic target</p>
      </div>
    `;
    const sectionElement =
      container.querySelector<HTMLElement>(".epub-dom-section");
    const textTarget = container.querySelector<HTMLElement>(
      "[data-reader-block-id='text-1']"
    );
    expect(sectionElement).toBeTruthy();
    expect(textTarget).toBeTruthy();

    applyDomDecorations({
      container,
      sectionElement: sectionElement!,
      decorations: [
        {
          id: "annotation-1",
          group: "annotations",
          locator: {
            spineIndex: 0,
            blockId: "text-1",
            progressInSection: 0.2
          },
          style: "highlight"
        }
      ]
    });

    expect(
      textTarget?.classList.contains("epub-dom-decoration-highlight")
    ).toBe(true);
  });
});
