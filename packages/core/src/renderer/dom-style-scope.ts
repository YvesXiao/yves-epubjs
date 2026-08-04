import { generate, parse } from "css-tree"
import type { CssAstNode } from "../parser/css-ast-adapter"

const DOM_STYLE_SCOPE_SELECTOR = ".epub-dom-section"
const DOM_PAGE_VIEWPORT_SELECTOR = ".epub-dom-page-viewport"
const KEYFRAME_SELECTOR_PATTERN = /^(?:from|to|\d+(?:\.\d+)?%)$/i
const GLOBAL_AT_RULES_TO_DROP = new Set([
  "charset",
  "font-face",
  "font-feature-values",
  "font-palette-values",
  "import",
  "namespace",
  "page",
  "property",
  "counter-style"
])
type MutableCssNode = CssAstNode & {
  name?: string
  prelude?: CssAstNode
  block?: {
    children?: {
      toArray?(): CssAstNode[]
    }
  }
  children?: {
    toArray?(): CssAstNode[]
    clear?(): void
    appendData?(value: CssAstNode): void
  }
}

export function scopeDomStyleSheetCss(
  value: string,
  scopeSelector = DOM_STYLE_SCOPE_SELECTOR,
  options: {
    rootBackgroundSelector?: string
  } = {}
): string {
  if (!value.trim()) {
    return value
  }

  try {
    const stylesheet = parse(value, {
      context: "stylesheet",
      parseAtrulePrelude: true,
      parseRulePrelude: true,
      parseValue: true
    }) as MutableCssNode

    pruneGlobalAtRules(stylesheet)
    scopeCssNode(
      stylesheet,
      false,
      scopeSelector,
      options.rootBackgroundSelector
    )
    return generate(stylesheet)
  } catch {
    return value
  }
}

function pruneGlobalAtRules(root: MutableCssNode): void {
  const children = root.children?.toArray?.() ?? []
  if (!root.children?.clear || !root.children?.appendData) {
    return
  }

  root.children.clear()
  for (const child of children) {
    const candidate = child as MutableCssNode
    if (candidate.type === "Atrule" && shouldDropGlobalAtRule(candidate.name)) {
      continue
    }
    root.children.appendData(candidate)
  }
}

function scopeCssNode(
  node: MutableCssNode | undefined,
  insideKeyframes: boolean,
  scopeSelector: string,
  rootBackgroundSelector: string | undefined
): void {
  if (!node) {
    return
  }

  if (node.type === "Atrule") {
    const atruleName =
      typeof node.name === "string" ? node.name.toLowerCase() : ""
    const nextInsideKeyframes =
      insideKeyframes ||
      atruleName === "keyframes" ||
      atruleName.endsWith("keyframes")

    for (const child of getCssNodeListChildren(node.block)) {
      scopeCssNode(
        child,
        nextInsideKeyframes,
        scopeSelector,
        rootBackgroundSelector
      )
    }
    return
  }

  if (node.type === "Rule") {
    if (!insideKeyframes && isSelectorListNode(node.prelude)) {
      const shouldRouteRootBackground =
        Boolean(rootBackgroundSelector) && hasRootBackgroundDeclarations(node)
      const selectorText = getCssNodeListChildren(node.prelude)
        .flatMap((selectorNode: unknown) =>
          scopeCssSelectorText(
            generate(selectorNode as Parameters<typeof generate>[0]),
            scopeSelector,
            shouldRouteRootBackground ? rootBackgroundSelector : undefined
          )
        )
        .join(", ")
      node.prelude = parse(selectorText, {
        context: "selectorList"
      }) as MutableCssNode
    }

    for (const child of getCssNodeListChildren(node.block)) {
      scopeCssNode(
        child,
        insideKeyframes,
        scopeSelector,
        rootBackgroundSelector
      )
    }
    return
  }

  for (const child of getCssChildren(node)) {
    scopeCssNode(child, insideKeyframes, scopeSelector, rootBackgroundSelector)
  }
}

export function getDomPageViewportSelector(): string {
  return DOM_PAGE_VIEWPORT_SELECTOR
}

function getCssChildren(node: MutableCssNode): MutableCssNode[] {
  const directChildren = getCssNodeListChildren(node)
  const blockChildren = getCssNodeListChildren(node.block)

  return [...directChildren, ...blockChildren]
}

function getCssNodeListChildren(
  node:
    | {
        children?: {
          toArray?(): CssAstNode[]
        }
      }
    | undefined
): MutableCssNode[] {
  return (node?.children?.toArray?.() as MutableCssNode[] | undefined) ?? []
}

function isSelectorListNode(
  node: CssAstNode | undefined
): node is MutableCssNode & { type: "SelectorList" } {
  return Boolean(node && node.type === "SelectorList")
}

function scopeCssSelectorText(
  selectorText: string,
  scopeSelector: string,
  rootBackgroundSelector: string | undefined
): string[] {
  const normalized = selectorText.trim()
  if (!normalized || KEYFRAME_SELECTOR_PATTERN.test(normalized)) {
    return [normalized]
  }

  if (normalized.startsWith(scopeSelector)) {
    return [normalized]
  }

  const rootScopedSelector = scopeRootSelectorPrefix(normalized, scopeSelector)
  if (rootScopedSelector) {
    if (rootBackgroundSelector && rootScopedSelector.rootOnly) {
      return [
        rootScopedSelector.selector,
        rootScopedSelector.selector.replace(
          scopeSelector,
          rootBackgroundSelector
        )
      ]
    }
    return [rootScopedSelector.selector]
  }

  return [`${scopeSelector} ${normalized}`]
}

function scopeRootSelectorPrefix(
  selectorText: string,
  scopeSelector: string
): { selector: string; rootOnly: boolean } | null {
  let remaining = selectorText
  let rootQualifiers = ""
  let matchedRoot = false

  let match = remaining.match(
    /^\s*(html|body|:root)((?:[#.][a-zA-Z0-9_-]+|\[[^\]]+\]|:[a-zA-Z-]+(?:\([^)]*\))?)*)/i
  )
  while (match) {
    matchedRoot = true
    rootQualifiers += match[2] ?? ""
    remaining = remaining.slice(match[0].length)
    match = remaining.match(
      /^\s*(html|body|:root)((?:[#.][a-zA-Z0-9_-]+|\[[^\]]+\]|:[a-zA-Z-]+(?:\([^)]*\))?)*)/i
    )
  }

  if (!matchedRoot) {
    return null
  }

  const remainder = remaining.trimStart()
  if (!remainder) {
    return {
      selector: `${scopeSelector}${rootQualifiers}`,
      rootOnly: true
    }
  }

  if (
    remainder.startsWith(">") ||
    remainder.startsWith("+") ||
    remainder.startsWith("~")
  ) {
    return {
      selector: `${scopeSelector}${rootQualifiers} ${remainder}`,
      rootOnly: false
    }
  }

  return {
    selector: `${scopeSelector}${rootQualifiers} ${remainder}`.trim(),
    rootOnly: false
  }
}

function hasRootBackgroundDeclarations(rule: MutableCssNode): boolean {
  const blockText = rule.block
    ? generate(rule.block as Parameters<typeof generate>[0])
    : ""
  return /(?:^|[{\s;])background(?:-|:)/i.test(blockText)
}

function shouldDropGlobalAtRule(name: unknown): boolean {
  return (
    typeof name === "string" && GLOBAL_AT_RULES_TO_DROP.has(name.toLowerCase())
  )
}
