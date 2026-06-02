import {
  getHtmlNodeChildren,
  getHtmlTagName,
  isHtmlElementNode,
  isHtmlTextNode,
  type HtmlDomElement,
  type HtmlDomNode
} from "../parser/html-dom-adapter";
import { parseXhtmlDomDocument } from "../parser/xhtml-dom-parser";
import { DomSanitizer, type DomSanitizerNamespace } from "./dom-sanitizer";

export type PreprocessedChapterNode =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "element";
      tagName: string;
      attributes: Record<string, string>;
      children: PreprocessedChapterNode[];
    };

export type PreprocessedChapter = {
  href: string;
  title?: string;
  lang?: string;
  dir?: "ltr" | "rtl";
  rootTagName?: string;
  htmlAttributes?: Record<string, string>;
  bodyAttributes?: Record<string, string>;
  nodes: PreprocessedChapterNode[];
};

const domSanitizer = new DomSanitizer();

export function preprocessChapterDocument(input: {
  href: string;
  content: string;
}): PreprocessedChapter {
  const parsed = parseXhtmlDomDocument(input.content);
  const root = parsed.bodyElement ?? parsed.htmlElement;
  const htmlAttributes = parsed.htmlElement
    ? domSanitizer.sanitizeRootAttributes(parsed.htmlElement.attribs)
    : {};
  const bodyAttributes = parsed.bodyElement
    ? domSanitizer.sanitizeRootAttributes(parsed.bodyElement.attribs)
    : {};

  return {
    href: input.href,
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.lang ? { lang: parsed.lang } : {}),
    ...(parsed.dir ? { dir: parsed.dir } : {}),
    ...(root ? { rootTagName: getHtmlTagName(root).toLowerCase() } : {}),
    ...(Object.keys(htmlAttributes).length > 0 ? { htmlAttributes } : {}),
    ...(Object.keys(bodyAttributes).length > 0 ? { bodyAttributes } : {}),
    nodes: root ? preprocessChapterChildren(root) : []
  };
}

function preprocessChapterChildren(
  node: HtmlDomElement,
  namespace: DomSanitizerNamespace = "html"
): PreprocessedChapterNode[] {
  const normalizedChildren: PreprocessedChapterNode[] = [];

  for (const child of getHtmlNodeChildren(node)) {
    const normalizedChild = preprocessChapterNode(child, namespace);
    if (normalizedChild) {
      normalizedChildren.push(normalizedChild);
    }
  }

  return normalizedChildren;
}

function preprocessChapterNode(
  node: HtmlDomNode,
  namespace: DomSanitizerNamespace
): PreprocessedChapterNode | null {
  if (isHtmlTextNode(node)) {
    if (!node.data.trim()) {
      return null;
    }

    return {
      kind: "text",
      text: node.data
    };
  }

  if (!isHtmlElementNode(node)) {
    return null;
  }

  const tagName = domSanitizer.sanitizeElementTagName(getHtmlTagName(node), {
    namespace
  });
  if (!tagName) {
    return null;
  }
  const childNamespace = tagName === "svg" ? "svg" : namespace;

  return {
    kind: "element",
    tagName,
    attributes: domSanitizer.sanitizeAttributes({
      tagName,
      attributes: node.attribs
    }),
    children: preprocessChapterChildren(node, childNamespace)
  };
}
