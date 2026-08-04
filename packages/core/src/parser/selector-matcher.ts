import { is as matchesSelector, selectAll, selectOne } from "css-select"
import type {
  HtmlDomDocument,
  HtmlDomElement,
  HtmlDomNode
} from "./html-dom-adapter"

export type HtmlSelectorQueryRoot =
  | HtmlDomDocument
  | HtmlDomElement
  | HtmlDomNode[]

const SELECTOR_OPTIONS = {
  xmlMode: true
} as const

export function selectHtmlElements(
  selector: string,
  root: HtmlSelectorQueryRoot
): HtmlDomElement[] {
  return selectAll(selector, root, SELECTOR_OPTIONS)
}

export function selectFirstHtmlElement(
  selector: string,
  root: HtmlSelectorQueryRoot
): HtmlDomElement | null {
  return selectOne(selector, root, SELECTOR_OPTIONS)
}

export function matchesHtmlSelector(
  element: HtmlDomElement,
  selector: string
): boolean {
  return matchesSelector(element, selector, SELECTOR_OPTIONS)
}
