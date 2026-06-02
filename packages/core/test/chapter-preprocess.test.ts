import { describe, expect, it } from "vitest";
import { preprocessChapterDocument, type PreprocessedChapter } from "../src";

describe("chapter preprocess", () => {
  it("filters whitespace-only text nodes while preserving meaningful text", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/whitespace.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <div>
              
              <p>Hello</p>
              
            </div>
          </body>
        </html>`
    });

    expect(chapter.nodes).toEqual([
      {
        kind: "element",
        tagName: "div",
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
    ]);
  });

  it("normalizes common chapter structure, metadata, and attributes", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/chapter-1.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" dir="rtl">
          <head>
            <title>Chapter 1</title>
          </head>
          <body>
            <section id="ch1" class="chapter lead">
              <p style="font-size: 18px;">
                Hello <a href="#note-1">note</a>
              </p>
            </section>
          </body>
        </html>`
    });

    expect(chapter).toEqual({
      href: "OPS/chapter-1.xhtml",
      title: "Chapter 1",
      lang: "en",
      dir: "rtl",
      rootTagName: "body",
      htmlAttributes: {
        "xml:lang": "en",
        dir: "rtl"
      },
      nodes: [
        {
          kind: "element",
          tagName: "section",
          attributes: {
            id: "ch1",
            class: "chapter lead"
          },
          children: [
            {
              kind: "element",
              tagName: "p",
              attributes: {
                style: "font-size: 18px;"
              },
              children: [
                { kind: "text", text: "\n                Hello " },
                {
                  kind: "element",
                  tagName: "a",
                  attributes: {
                    href: "#note-1"
                  },
                  children: [{ kind: "text", text: "note" }]
                }
              ]
            }
          ]
        }
      ]
    } satisfies PreprocessedChapter);
  });

  it("preserves safe html and body root attributes for dom rendering", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/themed.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" class="book-root" style="background: #fff;">
          <body id="page-body" class="background-img-center custom-theme" style="background-image: url('../images/bg.png'); padding: 20px;" onclick="alert(1)">
            <main>Content</main>
          </body>
        </html>`
    });

    expect(chapter.htmlAttributes).toEqual({
      class: "book-root",
      style: "background: #fff;"
    });
    expect(chapter.bodyAttributes).toEqual({
      id: "page-body",
      class: "background-img-center custom-theme",
      style: "background-image: url('../images/bg.png'); padding: 20px;"
    });
  });

  it("drops script nodes and inline event handler attributes from DOM preprocessing", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/unsafe.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section onclick="window.__hostLeak = true">
              <script>window.__hostLeak = true</script>
              <a href="#note" onmouseover="alert(1)">Safe link</a>
            </section>
          </body>
        </html>`
    });

    expect(chapter.nodes).toEqual([
      {
        kind: "element",
        tagName: "section",
        attributes: {},
        children: [
          {
            kind: "element",
            tagName: "a",
            attributes: {
              href: "#note"
            },
            children: [{ kind: "text", text: "Safe link" }]
          }
        ]
      }
    ] satisfies PreprocessedChapter["nodes"]);
  });

  it("keeps allowlisted content while dropping active content and unsafe URL attributes", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/active-content.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <section>
              <custom-widget data-mode="unsafe"><p>Dropped custom wrapper</p></custom-widget>
              <iframe src="https://cdn.example.com/frame.html"></iframe>
              <object data="https://cdn.example.com/object.swf"></object>
              <form action="/submit"><input name="q" value="leak" /></form>
              <video src="https://cdn.example.com/movie.mp4"></video>
              <canvas></canvas>
              <style>@import url("https://cdn.example.com/book.css");</style>
              <p>
                <a href="javascript:alert(1)">Unsafe link</a>
                <img src="javascript:alert(1)" srcset="https://cdn.example.com/bad.png 2x" alt="Bad" />
                <img src="https://cdn.example.com/remote.png" alt="Remote" />
              </p>
            </section>
          </body>
        </html>`
    });

    expect(chapter.nodes).toEqual([
      {
        kind: "element",
        tagName: "section",
        attributes: {},
        children: [
          {
            kind: "element",
            tagName: "p",
            attributes: {},
            children: [
              {
                kind: "element",
                tagName: "a",
                attributes: {},
                children: [{ kind: "text", text: "Unsafe link" }]
              },
              {
                kind: "element",
                tagName: "img",
                attributes: {
                  alt: "Bad"
                },
                children: []
              },
              {
                kind: "element",
                tagName: "img",
                attributes: {
                  src: "https://cdn.example.com/remote.png",
                  alt: "Remote"
                },
                children: []
              }
            ]
          }
        ]
      }
    ] satisfies PreprocessedChapter["nodes"]);
  });

  it("preserves a minimal non-interactive SVG subset without external links", () => {
    const chapter = preprocessChapterDocument({
      href: "OPS/svg.xhtml",
      content: `<?xml version="1.0" encoding="utf-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml">
          <body>
            <figure>
              <svg viewBox="0 0 20 20" onclick="alert(1)" aria-label="Diagram">
                <title>Diagram</title>
                <foreignObject><iframe src="https://bad.example/frame.html"></iframe></foreignObject>
                <script>alert(1)</script>
                <a href="javascript:alert(1)"><text x="1" y="1">Bad link</text></a>
                <use href="#shape" xlink:href="https://cdn.example.com/shape.svg#shape"></use>
                <image href="https://cdn.example.com/remote.svg" xlink:href="../images/local.png"></image>
                <path id="shape" d="M0 0 L20 20" stroke="currentColor" />
              </svg>
            </figure>
          </body>
        </html>`
    });

    expect(chapter.nodes).toEqual([
      {
        kind: "element",
        tagName: "figure",
        attributes: {},
        children: [
          {
            kind: "element",
            tagName: "svg",
            attributes: {
              viewbox: "0 0 20 20",
              "aria-label": "Diagram"
            },
            children: [
              {
                kind: "element",
                tagName: "title",
                attributes: {},
                children: [{ kind: "text", text: "Diagram" }]
              },
              {
                kind: "element",
                tagName: "use",
                attributes: {
                  href: "#shape"
                },
                children: []
              },
              {
                kind: "element",
                tagName: "image",
                attributes: {
                  "xlink:href": "../images/local.png"
                },
                children: []
              },
              {
                kind: "element",
                tagName: "path",
                attributes: {
                  id: "shape",
                  d: "M0 0 L20 20",
                  stroke: "currentColor"
                },
                children: []
              }
            ]
          }
        ]
      }
    ] satisfies PreprocessedChapter["nodes"]);
  });
});
