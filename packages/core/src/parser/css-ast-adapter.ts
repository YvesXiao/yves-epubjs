import { generate, parse } from "css-tree"

export type CssAstNode = {
  type: string
  [key: string]: unknown
}

type CssAstList<T = CssAstNode> = {
  toArray(): T[]
}

export type CssAstStyleSheet = CssAstNode & {
  type: "StyleSheet"
  children: CssAstList<CssAstNode>
}

export type CssAstRule = CssAstNode & {
  type: "Rule"
  prelude?: CssAstNode
  block?: {
    children?: CssAstList<CssAstNode>
  }
}

export type CssAstDeclaration = CssAstNode & {
  type: "Declaration"
  property: string
  value?: CssAstNode
}

export function parseCssStyleSheet(source: string): CssAstStyleSheet {
  return parse(source, {
    context: "stylesheet",
    parseAtrulePrelude: true,
    parseRulePrelude: true,
    parseValue: true
  }) as CssAstStyleSheet
}

export function getCssTopLevelRules(
  stylesheet: CssAstStyleSheet
): CssAstRule[] {
  return stylesheet.children
    .toArray()
    .filter((node): node is CssAstRule => node.type === "Rule")
}

export function getCssRuleDeclarations(rule: CssAstRule): CssAstDeclaration[] {
  const children = rule.block?.children?.toArray() ?? []
  return children.filter(
    (node): node is CssAstDeclaration => node.type === "Declaration"
  )
}

export function getCssAllDeclarations(
  stylesheet: CssAstStyleSheet
): CssAstDeclaration[] {
  return collectCssDeclarations(stylesheet)
}

export function serializeCssNode(node: CssAstNode): string {
  return generate(node)
}

export function getCssDeclarationValueText(
  declaration: CssAstDeclaration
): string {
  return declaration.value ? serializeCssNode(declaration.value) : ""
}

function collectCssDeclarations(
  node: CssAstNode | undefined
): CssAstDeclaration[] {
  if (!node) {
    return []
  }

  if (node.type === "Declaration") {
    return [node as CssAstDeclaration]
  }

  return getCssChildNodes(node).flatMap((child) =>
    collectCssDeclarations(child)
  )
}

function getCssChildNodes(node: CssAstNode): CssAstNode[] {
  const directChildren = getCssNodeListChildren(
    node as CssAstNode & {
      children?: {
        toArray(): CssAstNode[]
      }
    }
  )
  const blockChildren = getCssNodeListChildren(
    (
      node as CssAstNode & {
        block?: {
          children?: {
            toArray(): CssAstNode[]
          }
        }
      }
    ).block
  )

  return [...directChildren, ...blockChildren]
}

function getCssNodeListChildren(
  node:
    | {
        children?: {
          toArray(): CssAstNode[]
        }
      }
    | undefined
): CssAstNode[] {
  return node?.children?.toArray() ?? []
}
