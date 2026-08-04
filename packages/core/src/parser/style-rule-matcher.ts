import type { CssAstRule, CssAstStyleSheet } from "./css-ast-adapter"
import { getCssTopLevelRules, serializeCssNode } from "./css-ast-adapter"
import type { HtmlDomElement } from "./html-dom-adapter"
import { matchesHtmlSelector } from "./selector-matcher"

export type CssSelectorSpecificity = readonly [
  idCount: number,
  classCount: number,
  elementCount: number
]

export type MatchedCssRule = {
  selector: string
  specificity: CssSelectorSpecificity
  sourceOrder: number
  rule: CssAstRule
}

export function computeSelectorSpecificity(
  selector: string
): CssSelectorSpecificity {
  const normalizedSelector = selector.trim()
  if (!normalizedSelector) {
    return [0, 0, 0]
  }

  const idCount = (normalizedSelector.match(/#[A-Za-z0-9_-]+/g) ?? []).length
  const classCount = (normalizedSelector.match(/\.[A-Za-z0-9_-]+/g) ?? [])
    .length
  const elementCount = normalizedSelector
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((part) =>
      part.split(/(?=[#.])/)[0] ? [part.split(/(?=[#.])/)[0] as string] : []
    )
    .filter(
      (part) => part !== "*" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(part)
    ).length

  return [idCount, classCount, elementCount]
}

export function compareSelectorSpecificity(
  left: CssSelectorSpecificity,
  right: CssSelectorSpecificity
): number {
  const idDifference = left[0] - right[0]
  if (idDifference !== 0) {
    return idDifference
  }

  const classDifference = left[1] - right[1]
  if (classDifference !== 0) {
    return classDifference
  }

  const elementDifference = left[2] - right[2]
  if (elementDifference !== 0) {
    return elementDifference
  }

  return 0
}

export function splitRuleSelectors(rule: CssAstRule): string[] {
  const selectorText = rule.prelude ? serializeCssNode(rule.prelude) : ""
  return selectorText
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean)
}

export function collectMatchedCssRules(
  element: HtmlDomElement,
  stylesheets: CssAstStyleSheet[]
): MatchedCssRule[] {
  const matches: MatchedCssRule[] = []
  let sourceOrder = 0

  for (const stylesheet of stylesheets) {
    for (const rule of getCssTopLevelRules(stylesheet)) {
      const matchingSelectors = splitRuleSelectors(rule).filter((selector) =>
        safelyMatchesHtmlSelector(element, selector)
      )

      if (matchingSelectors.length === 0) {
        sourceOrder += 1
        continue
      }

      const mostSpecificSelector = matchingSelectors.reduce(
        (currentBest, nextSelector) => {
          if (!currentBest) {
            return nextSelector
          }

          return compareSelectorSpecificity(
            computeSelectorSpecificity(nextSelector),
            computeSelectorSpecificity(currentBest)
          ) > 0
            ? nextSelector
            : currentBest
        },
        "" as string
      )

      matches.push({
        selector: mostSpecificSelector,
        specificity: computeSelectorSpecificity(mostSpecificSelector),
        sourceOrder,
        rule
      })
      sourceOrder += 1
    }
  }

  return matches.sort((left, right) => {
    const specificityComparison = compareSelectorSpecificity(
      left.specificity,
      right.specificity
    )
    if (specificityComparison !== 0) {
      return specificityComparison
    }

    return left.sourceOrder - right.sourceOrder
  })
}

function safelyMatchesHtmlSelector(
  element: HtmlDomElement,
  selector: string
): boolean {
  try {
    return matchesHtmlSelector(element, selector)
  } catch {
    return false
  }
}
