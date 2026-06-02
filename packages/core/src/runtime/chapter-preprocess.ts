import {
  getHtmlNodeChildren,
  getHtmlTagName,
  isHtmlElementNode,
  isHtmlTextNode,
  type HtmlDomElement,
  type HtmlDomNode
} from "../parser/html-dom-adapter";
import { parseXhtmlDomDocument } from "../parser/xhtml-dom-parser";
import { sanitizeEmbeddedResourceUrl } from "../utils/url-boundary";

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

const UNSAFE_CHAPTER_TAGS = new Set([
  "applet",
  "audio",
  "base",
  "button",
  "canvas",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "meta",
  "object",
  "optgroup",
  "option",
  "param",
  "portal",
  "script",
  "select",
  "style",
  "template",
  "textarea",
  "video",
  "foreignobject"
]);

const UNSAFE_ATTRIBUTE_NAMES = new Set(["srcdoc", "srcset"]);

export function preprocessChapterDocument(input: {
  href: string;
  content: string;
}): PreprocessedChapter {
  const parsed = parseXhtmlDomDocument(input.content);
  const root = parsed.bodyElement ?? parsed.htmlElement;
  const htmlAttributes = parsed.htmlElement
    ? normalizeRootAttributes(parsed.htmlElement.attribs)
    : {};
  const bodyAttributes = parsed.bodyElement
    ? normalizeRootAttributes(parsed.bodyElement.attribs)
    : {};

  return {
    href: input.href,
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.lang ? { lang: parsed.lang } : {}),
    ...(parsed.dir ? { dir: parsed.dir } : {}),
    ...(root ? { rootTagName: getHtmlTagName(root) } : {}),
    ...(Object.keys(htmlAttributes).length > 0 ? { htmlAttributes } : {}),
    ...(Object.keys(bodyAttributes).length > 0 ? { bodyAttributes } : {}),
    nodes: root ? preprocessChapterChildren(root) : []
  };
}

function preprocessChapterChildren(node: HtmlDomElement): PreprocessedChapterNode[] {
  const normalizedChildren: PreprocessedChapterNode[] = [];

  for (const child of getHtmlNodeChildren(node)) {
    const normalizedChild = preprocessChapterNode(child);
    if (normalizedChild) {
      normalizedChildren.push(normalizedChild);
    }
  }

  return normalizedChildren;
}

function preprocessChapterNode(node: HtmlDomNode): PreprocessedChapterNode | null {
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

  if (isUnsafeChapterTag(getHtmlTagName(node))) {
    return null
  }

  return {
    kind: "element",
    tagName: getHtmlTagName(node),
    attributes: normalizeAttributes(node.attribs, getHtmlTagName(node)),
    children: preprocessChapterChildren(node)
  };
}

function normalizeAttributes(
  attributes: Record<string, string>,
  tagName?: string
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(attributes)) {
    if (isUnsafeAttributeName(name)) {
      continue
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      continue;
    }

    const normalizedName = name.toLowerCase();
    if (isUnsafeAttributeValue(normalizedName, trimmedValue, tagName)) {
      continue;
    }

    normalized[normalizedName] = trimmedValue;
  }

  return normalized;
}

function normalizeRootAttributes(attributes: Record<string, string>): Record<string, string> {
  const normalized = normalizeAttributes(attributes);
  const safeRootAttributes: Record<string, string> = {};

  for (const [name, value] of Object.entries(normalized)) {
    if (isSupportedRootAttributeName(name)) {
      safeRootAttributes[name] = value;
    }
  }

  return safeRootAttributes;
}

function isUnsafeChapterTag(tagName: string): boolean {
  return UNSAFE_CHAPTER_TAGS.has(tagName.trim().toLowerCase())
}

function isUnsafeAttributeName(attributeName: string): boolean {
  const normalized = attributeName.trim().toLowerCase()
  return normalized.startsWith("on") || UNSAFE_ATTRIBUTE_NAMES.has(normalized)
}

function isUnsafeAttributeValue(
  attributeName: string,
  value: string,
  tagName?: string
): boolean {
  const normalizedTagName = tagName?.trim().toLowerCase()

  if (
    isEmbeddedResourceAttributeName(normalizedTagName, attributeName) &&
    sanitizeEmbeddedResourceUrl(value, {
      allowExternalEmbeddedResources: true
    }) !== value.trim()
  ) {
    return true
  }

  return false
}

function isEmbeddedResourceAttributeName(
  tagName: string | undefined,
  attributeName: string
): boolean {
  if (attributeName === "src" && (tagName === "img" || tagName === "source")) {
    return true
  }

  return (
    (attributeName === "href" || attributeName === "xlink:href") &&
    (tagName === "image" || tagName === "use")
  )
}

function isSupportedRootAttributeName(attributeName: string): boolean {
  const normalized = attributeName.trim().toLowerCase();
  return (
    normalized === "id" ||
    normalized === "class" ||
    normalized === "style" ||
    normalized === "lang" ||
    normalized === "xml:lang" ||
    normalized === "dir"
  );
}
