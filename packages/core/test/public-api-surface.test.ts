import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const CORE_SRC = path.resolve(process.cwd(), "packages/core/src")

const STABLE_ROOT_EXPORTS = [
  "./model/types",
  "./runtime/reader",
  "./runtime/bookmark",
  "./runtime/annotation",
  "./runtime/locator",
  "./runtime/preferences",
  "./runtime/publisher-styles",
  "./runtime/reading-language",
  "./runtime/reading-spread",
  "./runtime/accessibility",
  "./runtime/image-render-classification",
  "./container/resource-container",
  "./container/normalize-input",
  "./container/resource-path",
  "./container/resource-mime"
]

const COMPATIBILITY_ROOT_EXPORTS = [
  "./runtime/chapter-preprocess",
  "./runtime/chapter-analysis-input",
  "./runtime/chapter-render-decision",
  "./runtime/chapter-render-input",
  "./runtime/chapter-render-analyzer",
  "./runtime/chapter-render-decision-cache",
  "./parser/book-parser",
  "./parser/container-parser",
  "./parser/nav-parser",
  "./parser/ncx-parser",
  "./parser/opf-parser",
  "./parser/inline-parser",
  "./parser/html-dom-adapter",
  "./parser/css-ast-adapter",
  "./parser/css-resource-loader",
  "./parser/selector-matcher",
  "./parser/style-rule-matcher",
  "./parser/style-resolver",
  "./parser/spine-content-parser",
  "./parser/xhtml-dom-parser",
  "./parser/xhtml-parser",
  "./layout/layout-engine",
  "./renderer/draw-ops",
  "./renderer/display-list-builder",
  "./renderer/canvas-renderer",
  "./renderer/dom-chapter-renderer",
  "./renderer/dom-chapter-style",
  "./renderer/reading-style-profile"
]

const INTERNAL_EXPORT_DENYLIST = [
  "./runtime/reader-annotation-service",
  "./runtime/reader-dom-pagination-service",
  "./runtime/reader-scroll-position-service",
  "./runtime/reader-render-orchestrator",
  "./runtime/reader-render-session",
  "./runtime/reader-navigation-session",
  "./runtime/dom-sanitizer",
  "./runtime/render-flow-types",
  "./model/locator-domain",
  "./utils/url-boundary"
]

describe("core public api surface", () => {
  it("keeps root exports explicitly classified", () => {
    const rootExports = readRootExports()

    expect(rootExports).toEqual([
      ...STABLE_ROOT_EXPORTS.slice(0, 11),
      ...COMPATIBILITY_ROOT_EXPORTS.slice(0, 6),
      ...STABLE_ROOT_EXPORTS.slice(11),
      ...COMPATIBILITY_ROOT_EXPORTS.slice(6)
    ])
  })

  it("does not expose internal refactor modules from the package root", () => {
    const rootExports = readRootExports()

    expect(
      INTERNAL_EXPORT_DENYLIST.filter((specifier) =>
        rootExports.includes(specifier)
      )
    ).toEqual([])
  })
})

function readRootExports(): string[] {
  const source = readFileSync(path.join(CORE_SRC, "index.ts"), "utf8")
  const exports: string[] = []
  const pattern = /export\s+\*\s+from\s+["']([^"']+)["']/g
  let match = pattern.exec(source)
  while (match) {
    if (match[1]) {
      exports.push(match[1])
    }
    match = pattern.exec(source)
  }
  return exports
}
