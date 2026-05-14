import { describe, expect, it } from "vitest";
import {
  DomChapterRenderer,
  buildDomChapterNormalizationCss,
  serializeDomPageViewportAttributes
} from "../src";

describe("DomChapterRenderer", () => {
  it("mounts and clears a dom chapter section", () => {
    const container = document.createElement("div");
    const renderer = new DomChapterRenderer();

    renderer.render(container, {
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "section",
          attributes: {},
          children: [
            {
              kind: "element",
              tagName: "p",
              attributes: {},
              children: [{ kind: "text", text: "Hello" }]
            }
          ]
        }
      ]
    });

    expect(container.querySelector(".epub-dom-section")).toBeTruthy();
    expect(
      container.querySelector("style[data-epub-dom-normalization='true']")
    ).toBeTruthy();
    expect(container.textContent).toContain("Hello");

    renderer.clear(container);

    expect(container.querySelector(".epub-dom-section")).toBeFalsy();
    expect(
      container.querySelector("style[data-epub-dom-normalization='true']")
    ).toBeFalsy();
  });

  it("injects linked stylesheet text before normalization css and clears it", () => {
    const container = document.createElement("div");
    const renderer = new DomChapterRenderer();

    renderer.render(container, {
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      linkedStyleSheets: [
        {
          href: "OPS/styles/chapter.css",
          text: "@font-face { font-family: Demo; src: url(fonts/demo.woff2); } .badge { height: 1.1em; }"
        }
      ],
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "p",
          attributes: {},
          children: [{ kind: "text", text: "Hello" }]
        }
      ]
    });

    const sourceStyle = container.querySelector(
      "style[data-epub-dom-source='OPS/styles/chapter.css']"
    );
    const normalizationStyle = container.querySelector(
      "style[data-epub-dom-normalization='true']"
    );

    expect(sourceStyle?.textContent).toContain(".epub-dom-section .badge");
    expect(sourceStyle?.textContent).toContain("height:1.1em");
    expect(sourceStyle?.textContent).not.toContain("@font-face");
    expect(sourceStyle?.compareDocumentPosition(normalizationStyle!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    renderer.clear(container);

    expect(container.querySelector("style[data-epub-dom-source]")).toBeFalsy();
  });

  it("maps html and body root attributes onto the rendered dom section", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      htmlAttributes: {
        class: "book-root"
      },
      bodyAttributes: {
        id: "page-body",
        class: "background-img-center custom-theme",
        style: "background-color: rgb(102, 61, 31); padding: 20px;"
      },
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "main",
          attributes: {},
          children: [{ kind: "text", text: "Hello" }]
        }
      ]
    });

    expect(markup).toContain(
      'class="epub-dom-section book-root background-img-center custom-theme"'
    );
    expect(markup).toContain('id="page-body"');
    expect(markup).toContain(
      "background-color: rgb(102, 61, 31); padding: 20px"
    );
  });

  it("scopes body-qualified selectors onto the rendered dom section itself", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      linkedStyleSheets: [
        {
          href: "OPS/styles/chapter.css",
          text: [
            "body.background-img-center-custom-theme { background: #663d1f; }",
            "body.background-img-center-custom-theme > main { width: 600px; }",
            "html.book-root body.custom-theme .title { color: #321; }"
          ].join("\n")
        }
      ],
      bodyAttributes: {
        class: "background-img-center-custom-theme custom-theme"
      },
      htmlAttributes: {
        class: "book-root"
      },
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "main",
          attributes: {},
          children: [{ kind: "text", text: "Hello" }]
        }
      ]
    });

    expect(markup).toContain(
      ".epub-dom-section.background-img-center-custom-theme{background:#663d1f}"
    );
    expect(markup).toContain(
      ".epub-dom-section.background-img-center-custom-theme>main{width:600px}"
    );
    expect(markup).toContain(
      ".epub-dom-section.book-root.custom-theme .title{color:#321}"
    );
  });

  it("also routes paginated root background selectors to the page viewport", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup(
      {
        sectionId: "section-1",
        sectionHref: "OPS/chapter.xhtml",
        linkedStyleSheets: [
          {
            href: "OPS/styles/chapter.css",
            text: [
              "body.background-img-center-custom-theme { background: #663d1f; }",
              "body.background-img-center-custom-theme > main { width: 600px; }"
            ].join("\n")
          }
        ],
        bodyAttributes: {
          class: "background-img-center-custom-theme custom-theme"
        },
        theme: {
          color: "#1f2328",
          background: "#fffdf7"
        },
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          paragraphSpacing: 12
        },
        fontFamily: '"Iowan Old Style", serif',
        nodes: [
          {
            kind: "element",
            tagName: "main",
            attributes: {},
            children: [{ kind: "text", text: "Hello" }]
          }
        ]
      },
      {
        rootBackgroundTarget: "page-viewport"
      }
    );

    expect(markup).toContain(
      ".epub-dom-section.background-img-center-custom-theme,.epub-dom-page-viewport.background-img-center-custom-theme{background:#663d1f}"
    );
    expect(markup).toContain(
      ".epub-dom-section.background-img-center-custom-theme>main{width:600px}"
    );
  });

  it("serializes page viewport root classes and background inline style only", () => {
    const attributes = serializeDomPageViewportAttributes(
      {
        sectionId: "section-1",
        sectionHref: "OPS/chapter.xhtml",
        htmlAttributes: {
          class: "book-root",
          style: "background-image: url(data:image/svg+xml;utf8,<svg></svg>);"
        },
        bodyAttributes: {
          class: "background-img-center custom-theme",
          style: "background-color: rgb(102, 61, 31); padding: 20px;"
        },
        theme: {
          color: "#1f2328",
          background: "#fffdf7"
        },
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          paragraphSpacing: 12
        },
        fontFamily: '"Iowan Old Style", serif',
        nodes: []
      },
      {
        pageHeight: 720,
        pageNumberInSection: 3
      }
    );

    expect(attributes).toContain(
      'class="epub-dom-page-viewport book-root background-img-center custom-theme"'
    );
    expect(attributes).toContain('data-page-viewport="true"');
    expect(attributes).toContain('data-page-number-in-section="3"');
    expect(attributes).toContain("height: 720px");
    expect(attributes).toContain(
      "background-image: url(data:image/svg+xml;utf8,&lt;svg&gt;&lt;/svg&gt;)"
    );
    expect(attributes).toContain("background-color: rgb(102, 61, 31)");
    expect(attributes).not.toContain("padding: 20px");
  });

  it("scopes inline style tags to the rendered chapter root", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "style",
          attributes: {},
          children: [
            {
              kind: "text",
              text: "@import url('theme.css'); body > main { margin: 0; } @media (min-width: 600px) { h2 { color: red; } }"
            }
          ]
        },
        {
          kind: "element",
          tagName: "main",
          attributes: {},
          children: [{ kind: "text", text: "Hello" }]
        }
      ]
    });

    expect(markup).not.toContain("@import");
    expect(markup).toContain(".epub-dom-section>main{margin:0}");
    expect(markup).toContain(
      "@media (min-width:600px){.epub-dom-section h2{color:red}}"
    );
  });

  it("builds normalized css for theme and typography constraints", () => {
    const css = buildDomChapterNormalizationCss({
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif'
    });

    expect(css).toContain("font-size: 18px;");
    expect(css).toContain("line-height: 1.6;");
    expect(css).toContain("position: relative;");
    expect(css).toContain('font-family: "Iowan Old Style", serif;');
    expect(css).toContain("--reader-side-padding: 8px;");
    expect(css).toContain("--reader-link-color: #1b4b72;");
    expect(css).toContain("--reader-caption-color: #475569;");
    expect(css).toContain(".epub-dom-section table {");
    expect(css).toContain(".epub-dom-section a {");
    expect(css).toContain(
      ".epub-dom-section figcaption, .epub-dom-section caption {"
    );
    expect(css).toContain(".epub-dom-section mark {");
    expect(css).toContain(".epub-dom-section hr {");
    expect(css).toContain("padding-left: var(--reader-quote-accent-gap);");
    expect(css).toContain(
      "max-height: min(900px, calc(var(--reader-content-viewport-height, 100vh) * 0.78));"
    );
    const generalMediaSelector =
      ".epub-dom-section:not(.epub-dom-section-fxl) :where(img, svg, object, video, canvas) {";
    expect(css).toContain(generalMediaSelector);
    const generalImageRule =
      css.match(
        /\.epub-dom-section:not\(\.epub-dom-section-fxl\) :where\(img, svg, object, video, canvas\) \{[^}]+\}/
      )?.[0] ?? "";
    expect(generalImageRule).not.toContain("height: auto;");
    expect(generalImageRule).not.toContain("display: block;");
    expect(generalImageRule).not.toContain("margin: 0 auto;");
    expect(css).toContain(
      ".epub-dom-section:not(.epub-dom-section-fxl) :where(p, div, figure) > :where(img, svg, object, video, canvas):only-child {"
    );
    expect(css).toContain("height: auto;");
    expect(css).toContain("display: block;");
    expect(css).toContain("margin: 0 auto;");
    const paragraphInlineImageSelector =
      ".epub-dom-section:not(.epub-dom-section-fxl) :where(p, li, dt, dd, th, td, figcaption, caption) img:not(:only-child) {";
    expect(css).toContain(paragraphInlineImageSelector);
    expect(css).toContain("width: auto;");
    expect(css).toContain("vertical-align: middle;");
    const inlineImageSelector =
      '.epub-dom-section:not(.epub-dom-section-fxl) :is(a.footnote, a.noteref, a[epub\\:type~="noteref"], a[role="doc-noteref"], sup, sub, small) img {';
    expect(css).toContain(inlineImageSelector);
    expect(css).not.toContain(
      '.epub-dom-section :where(a.footnote, a.noteref, a[epub\\:type~="noteref"], a[role="doc-noteref"], sup, sub, small) img {'
    );
    expect(css.indexOf(generalMediaSelector)).toBeLessThan(
      css.indexOf(inlineImageSelector)
    );
    expect(css.indexOf(paragraphInlineImageSelector)).toBeLessThan(
      css.indexOf(inlineImageSelector)
    );
    expect(css).toContain("display: inline-block;");
    expect(css).toContain("max-height: 1.5em;");
  });

  it("can override publisher foreground colors while preserving reader semantic colors", () => {
    const css = buildDomChapterNormalizationCss({
      theme: {
        color: "#ecf4ff",
        background: "#182028"
      },
      publisherColorOverride: "foreground",
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif'
    });

    expect(css).toContain("color: #ecf4ff;");
    expect(css).toContain("color: inherit !important;");
    expect(css).toContain(
      ".epub-dom-section a {\n  color: var(--reader-link-color);"
    );
    expect(css).toContain(
      ".epub-dom-section figcaption, .epub-dom-section caption {"
    );
    expect(css).toContain("color: var(--reader-caption-color);");
    expect(css).toContain(".epub-dom-section :where(svg text, svg tspan) {");
    expect(css).toContain("fill: currentColor !important;");
  });

  it("keeps publisher foreground colors intact by default", () => {
    const css = buildDomChapterNormalizationCss({
      theme: {
        color: "#ecf4ff",
        background: "#182028"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif'
    });

    expect(css).not.toContain("color: inherit !important;");
    expect(css).not.toContain("fill: currentColor !important;");
  });

  it("keeps fixed-layout section images out of reflowable image normalization", () => {
    const css = buildDomChapterNormalizationCss({
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      renditionLayout: "pre-paginated"
    });

    expect(css).toContain(
      ".epub-dom-section:not(.epub-dom-section-fxl) :where(img, svg, object, video, canvas) {"
    );
    expect(css).not.toContain(".epub-dom-section img {");
    expect(css).toContain(".epub-dom-section-fxl {");
  });

  it("rewrites resolved attribute values while serializing dom chapters", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      resolveAttributeValue: ({ tagName, attributeName, value }) =>
        tagName === "img" && attributeName === "src" ? `blob:${value}` : value,
      nodes: [
        {
          kind: "element",
          tagName: "img",
          attributes: {
            src: "OPS/images/cover.jpg",
            alt: "Cover"
          },
          children: []
        }
      ]
    });

    expect(markup).toContain('src="blob:OPS/images/cover.jpg"');
    expect(markup).toContain('alt="Cover"');
  });

  it("adds cover styling hooks for cover sections", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-cover",
      sectionHref: "OPS/cover.xhtml",
      presentationRole: "cover",
      presentationImageSrc: "blob:cover-image",
      presentationViewportWidth: 480,
      presentationViewportHeight: 720,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "img",
          attributes: {
            src: "OPS/images/cover.jpg",
            alt: "Cover"
          },
          children: []
        }
      ]
    });

    expect(markup).toContain(
      "epub-dom-section epub-dom-section-cover epub-dom-cover"
    );
    expect(markup).toContain('class="epub-dom-presentation-image"');
    expect(markup).toContain('src="blob:cover-image"');
    expect(markup).toContain('data-presentation-width="480"');
    expect(markup).toContain('data-presentation-height="720"');
    expect(markup).toContain("--reader-presentation-height: 720px");
    expect(markup).toContain(".epub-dom-cover .epub-dom-presentation-image");
    expect(markup).toContain("max-height: 100%;");
  });

  it("renders standalone image pages as centered presentation images", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-image-page",
      sectionHref: "OPS/title.xhtml",
      presentationRole: "image-page",
      presentationImageSrc: "blob:title-image",
      presentationViewportWidth: 420,
      presentationViewportHeight: 560,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: []
    });

    expect(markup).toContain("epub-dom-section-image-page epub-dom-image-page");
    expect(markup).toContain('src="blob:title-image"');
    expect(markup).toContain('data-presentation-width="420"');
    expect(markup).toContain('data-presentation-height="560"');
    expect(markup).toContain("object-fit: contain;");
  });

  it("adds fixed-layout sizing hooks for pre-paginated sections", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-fxl",
      sectionHref: "OPS/fxl.xhtml",
      renditionLayout: "pre-paginated",
      fixedLayoutViewport: {
        width: 1200,
        height: 1600
      },
      fixedLayoutRenderWidth: 405,
      fixedLayoutRenderHeight: 540,
      fixedLayoutScale: 0.3375,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "div",
          attributes: {},
          children: [{ kind: "text", text: "Fixed layout page" }]
        }
      ]
    });

    expect(markup).toContain("epub-dom-section-fxl");
    expect(markup).toContain('data-rendition-layout="pre-paginated"');
    expect(markup).toContain('data-fxl-viewport-width="1200"');
    expect(markup).toContain("--fxl-render-width: 405px");
    expect(markup).toContain("--fxl-render-height: 540px");
    expect(markup).toContain(".epub-dom-section-fxl {");
  });

  it("serializes the content viewport height hook for regular sections", () => {
    const renderer = new DomChapterRenderer();

    const markup = renderer.createMarkup({
      sectionId: "section-1",
      sectionHref: "OPS/chapter.xhtml",
      contentViewportHeight: 640,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      fontFamily: '"Iowan Old Style", serif',
      nodes: [
        {
          kind: "element",
          tagName: "p",
          attributes: {},
          children: [{ kind: "text", text: "Hello" }]
        }
      ]
    });

    expect(markup).toContain('data-content-height="640"');
    expect(markup).toContain("--reader-content-viewport-height: 640px");
  });
});
