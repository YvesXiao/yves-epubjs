import { describe, expect, it } from "vitest"
import {
  getCssDeclarationValueText,
  getCssRuleDeclarations,
  getCssTopLevelRules,
  parseCssStyleSheet,
  serializeCssNode
} from "../src/parser/css-ast-adapter"

describe("CSS AST adapter", () => {
  it("parses a stylesheet and exposes top-level rules", () => {
    const stylesheet = parseCssStyleSheet(`
      p.note { font-weight: 700; color: #333; }
      a { text-decoration: underline; }
    `)

    const rules = getCssTopLevelRules(stylesheet)
    expect(rules).toHaveLength(2)
    expect(rules[0]?.prelude && serializeCssNode(rules[0].prelude)).toBe(
      "p.note"
    )
    expect(rules[1]?.prelude && serializeCssNode(rules[1].prelude)).toBe("a")
  })

  it("extracts declarations from a CSS rule", () => {
    const stylesheet = parseCssStyleSheet(`
      p.note {
        font-weight: 700;
        color: #333;
      }
    `)

    const rule = getCssTopLevelRules(stylesheet)[0]
    expect(rule).toBeTruthy()

    const declarations = rule ? getCssRuleDeclarations(rule) : []
    expect(
      declarations.map((declaration) => ({
        property: declaration.property,
        value: getCssDeclarationValueText(declaration)
      }))
    ).toEqual([
      { property: "font-weight", value: "700" },
      { property: "color", value: "#333" }
    ])
  })
})
