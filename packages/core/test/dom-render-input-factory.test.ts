import { describe, expect, it } from "vitest";
import type { Book, SectionDocument } from "../src/model/types";
import { parseCssStyleSheet } from "../src/parser/css-ast-adapter";
import { parseXhtmlDocument } from "../src/parser/xhtml-parser";
import { createSharedChapterRenderInput } from "../src/runtime/chapter-render-input";
import { createDomChapterRenderInput } from "../src/runtime/dom-render-input-factory";

const THEME = {
  background: "#fffaf0",
  color: "#1f2328"
};

const TYPOGRAPHY = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12
};

describe("dom render input factory", () => {
  it("resolves DOM resource attributes and stylesheet urls", () => {
    const section = createSection(
      `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="images/photo.png" style="background-image: url('images/inline-bg.png')">
          </p>
        </body>
      </html>`,
      "section-1",
      "OPS/chapter.xhtml"
    );
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="images/photo.png" style="background-image: url('images/inline-bg.png')">
          </p>
        </body>
      </html>`,
      linkedStyleSheets: [
        {
          href: "OPS/styles/book.css",
          mediaType: "text/css",
          text: "body { background-image: url('../images/paper.png'); }",
          ast: parseCssStyleSheet(
            "body { background-image: url('../images/paper.png'); }"
          )
        }
      ]
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.linkedStyleSheets?.[0]?.text).toContain(
      "url('asset:OPS/images/paper.png')"
    );
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "src",
        value: "images/photo.png"
      })
    ).toBe("asset:OPS/images/photo.png");
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "style",
        value: "background-image: url('images/inline-bg.png')"
      })
    ).toContain("url('asset:OPS/images/inline-bg.png')");
  });

  it("prefers the cover section image over metadata cover images", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <p><img src="images/xhtml-cover.jpg" alt="XHTML Cover"></p>
        </body>
      </html>`;
    const section: SectionDocument = {
      ...createSection(content, "cover-section", "OPS/Text/cover.xhtml"),
      presentationRole: "cover"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });
    const book: Book = {
      metadata: {
        title: "Factory Book",
        coverImageHref: "OPS/images/metadata-cover.jpg"
      },
      manifest: [],
      spine: [],
      toc: [],
      sections: [section]
    };

    const renderInput = createDomChapterRenderInput({
      book,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationImageSrc).toBe(
      "asset:OPS/Text/images/xhtml-cover.jpg"
    );
    expect(renderInput.presentationImageAlt).toBe("XHTML Cover");
  });

  it("falls back to metadata cover images when cover sections have no single image", () => {
    const section: SectionDocument = {
      ...createSection(
        `<?xml version="1.0"?>
        <html><body><p>Cover</p></body></html>`,
        "cover-section",
        "OPS/cover.xhtml"
      ),
      presentationRole: "cover"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?><html><body><p>Cover</p></body></html>`
    });
    const book: Book = {
      metadata: {
        title: "Factory Book",
        coverImageHref: "OPS/images/cover.jpg"
      },
      manifest: [],
      spine: [],
      toc: [],
      sections: [section]
    };

    const renderInput = createDomChapterRenderInput({
      book,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationImageSrc).toBe("asset:OPS/images/cover.jpg");
    expect(renderInput.presentationImageAlt).toBe("Factory Book");
  });

  it("sanitizes remote metadata cover images by default", () => {
    const section: SectionDocument = {
      ...createSection(
        `<?xml version="1.0"?>
        <html><body><p>Cover</p></body></html>`,
        "cover-section",
        "OPS/cover.xhtml"
      ),
      presentationRole: "cover"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?><html><body><p>Cover</p></body></html>`
    });
    const book: Book = {
      metadata: {
        title: "Remote Cover Book",
        coverImageHref: "https://cdn.example.com/cover.jpg"
      },
      manifest: [],
      spine: [],
      toc: [],
      sections: [section]
    };

    const renderInput = createDomChapterRenderInput({
      book,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationImageSrc).toBe("data:,");
  });

  it("allows remote metadata cover images when explicitly enabled", () => {
    const section: SectionDocument = {
      ...createSection(
        `<?xml version="1.0"?>
        <html><body><p>Cover</p></body></html>`,
        "cover-section",
        "OPS/cover.xhtml"
      ),
      presentationRole: "cover"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?><html><body><p>Cover</p></body></html>`
    });
    const book: Book = {
      metadata: {
        title: "Remote Cover Book",
        coverImageHref: "https://cdn.example.com/cover.jpg"
      },
      manifest: [],
      spine: [],
      toc: [],
      sections: [section]
    };

    const renderInput = createDomChapterRenderInput({
      book,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      allowExternalEmbeddedResources: true,
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationImageSrc).toBe(
      "https://cdn.example.com/cover.jpg"
    );
  });

  it("uses a single inline image for image-page sections", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <p><img src="images/plate.png" alt="Plate"></p>
        </body>
      </html>`;
    const section: SectionDocument = {
      ...createSection(content, "image-page", "OPS/plate.xhtml"),
      presentationRole: "image-page"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationImageSrc).toBe("asset:OPS/images/plate.png");
    expect(renderInput.presentationImageAlt).toBe("Plate");
  });

  it("records the available presentation viewport for cover and single-image pages", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <p><img src="images/plate.png" alt="Plate"></p>
        </body>
      </html>`;
    const section: SectionDocument = {
      ...createSection(content, "image-page", "OPS/plate.xhtml"),
      presentationRole: "image-page"
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      availableWidth: 640,
      availableHeight: 480,
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.presentationViewportWidth).toBe(640);
    expect(renderInput.presentationViewportHeight).toBe(480);
  });

  it("records the available content viewport height for regular sections", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <p><img src="images/chart.png" alt="Chart"></p>
        </body>
      </html>`;
    const section = createSection(
      content,
      "section-regular",
      "OPS/chapter.xhtml"
    );
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      availableHeight: 512,
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.contentViewportHeight).toBe(512);
  });

  it("derives fixed-layout viewport sizing for pre-paginated sections", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <div class="page">Fixed layout page</div>
        </body>
      </html>`;
    const section: SectionDocument = {
      ...createSection(content, "fxl-section", "OPS/fxl.xhtml"),
      renditionLayout: "pre-paginated",
      renditionViewport: {
        width: 1200,
        height: 1600
      }
    };
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      availableWidth: 450,
      availableHeight: 540,
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.renditionLayout).toBe("pre-paginated");
    expect(renderInput.fixedLayoutViewport).toEqual({
      width: 1200,
      height: 1600
    });
    expect(renderInput.fixedLayoutRenderWidth).toBe(405);
    expect(renderInput.fixedLayoutRenderHeight).toBe(540);
    expect(renderInput.fixedLayoutScale).toBe(0.3375);
  });

  it("suppresses linked stylesheet injection and inline styles when publisher styles are disabled", () => {
    const content = `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="images/photo.png" style="background-image: url('images/inline-bg.png')" />
          </p>
        </body>
      </html>`;
    const section = createSection(content, "section-1", "OPS/chapter.xhtml");
    const input = createSharedChapterRenderInput({
      href: section.href,
      content,
      linkedStyleSheets: [
        {
          href: "OPS/styles/book.css",
          mediaType: "text/css",
          text: ".badge { color: red; }",
          ast: parseCssStyleSheet(".badge { color: red; }")
        }
      ]
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "disabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.linkedStyleSheets).toBeUndefined();
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "style",
        value: "background-image: url('images/inline-bg.png')"
      })
    ).toBe("");
  });

  it("passes resolved html and body root attributes only when publisher styles are enabled", () => {
    const content = `<?xml version="1.0"?>
      <html class="book-root">
        <body class="background-img-center custom-theme" style="background-image: url('images/page-bg.png'); padding: 20px;">
          <p>Body themed chapter</p>
        </body>
      </html>`;
    const section = createSection(
      content,
      "section-themed",
      "OPS/chapter.xhtml"
    );
    const input = createSharedChapterRenderInput({
      href: section.href,
      content
    });

    const enabledInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });
    const disabledInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "disabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(enabledInput.htmlAttributes).toEqual({
      class: "book-root"
    });
    expect(enabledInput.bodyAttributes).toEqual({
      class: "background-img-center custom-theme",
      style:
        "background-image: url('asset:OPS/images/page-bg.png'); padding: 20px;"
    });
    expect(disabledInput.htmlAttributes).toBeUndefined();
    expect(disabledInput.bodyAttributes).toBeUndefined();
  });

  it("sanitizes remote dom resources while keeping internal resource resolution", () => {
    const section = createSection(
      `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="https://cdn.example.com/photo.png" style="background-image: url('https://cdn.example.com/inline-bg.png')">
          </p>
        </body>
      </html>`,
      "section-remote",
      "OPS/chapter.xhtml"
    );
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="https://cdn.example.com/photo.png" style="background-image: url('https://cdn.example.com/inline-bg.png')">
          </p>
        </body>
      </html>`,
      linkedStyleSheets: [
        {
          href: "OPS/styles/book.css",
          mediaType: "text/css",
          text: "body { background-image: url('https://cdn.example.com/paper.png'); }",
          ast: parseCssStyleSheet(
            "body { background-image: url('https://cdn.example.com/paper.png'); }"
          )
        }
      ]
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.linkedStyleSheets?.[0]?.text).toContain("url('data:,')");
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "src",
        value: "https://cdn.example.com/photo.png"
      })
    ).toBe("data:,");
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "style",
        value: "background-image: url('https://cdn.example.com/inline-bg.png')"
      })
    ).toContain("url('data:,')");
  });

  it("allows remote dom resources when explicitly enabled", () => {
    const section = createSection(
      `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="https://cdn.example.com/photo.png" style="background-image: url('//cdn.example.com/inline-bg.png')">
          </p>
        </body>
      </html>`,
      "section-remote",
      "OPS/chapter.xhtml"
    );
    const input = createSharedChapterRenderInput({
      href: section.href,
      content: `<?xml version="1.0"?>
      <html>
        <body>
          <p>
            <img src="https://cdn.example.com/photo.png" style="background-image: url('//cdn.example.com/inline-bg.png')">
          </p>
        </body>
      </html>`,
      linkedStyleSheets: [
        {
          href: "OPS/styles/book.css",
          mediaType: "text/css",
          text: "body { background-image: url('http://cdn.example.com/paper.png'); }",
          ast: parseCssStyleSheet(
            "body { background-image: url('http://cdn.example.com/paper.png'); }"
          )
        }
      ]
    });

    const renderInput = createDomChapterRenderInput({
      book: null,
      section,
      input,
      theme: THEME,
      typography: TYPOGRAPHY,
      fontFamily: "serif",
      publisherStyles: "enabled",
      allowExternalEmbeddedResources: true,
      resolveDomResourceUrl: (path) => `asset:${path}`
    });

    expect(renderInput.linkedStyleSheets?.[0]?.text).toContain(
      "url('http://cdn.example.com/paper.png')"
    );
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "src",
        value: "https://cdn.example.com/photo.png"
      })
    ).toBe("https://cdn.example.com/photo.png");
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "style",
        value: "background-image: url('//cdn.example.com/inline-bg.png')"
      })
    ).toContain("url('//cdn.example.com/inline-bg.png')");
    expect(
      renderInput.resolveAttributeValue?.({
        tagName: "img",
        attributeName: "src",
        value: "javascript:alert(1)"
      })
    ).toBe("data:,");
  });
});

function createSection(
  content: string,
  id: string,
  href: string
): SectionDocument {
  return {
    ...parseXhtmlDocument(content, href),
    id
  };
}
