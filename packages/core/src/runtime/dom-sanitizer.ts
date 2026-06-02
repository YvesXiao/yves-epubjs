import { sanitizeEmbeddedResourceUrl } from "../utils/url-boundary";

export type DomSanitizerAttributeInput = {
  tagName?: string;
  attributes: Record<string, string>;
};

export type DomSanitizerNamespace = "html" | "svg";

export class DomSanitizer {
  sanitizeElementTagName(
    tagName: string,
    options: {
      namespace?: DomSanitizerNamespace;
    } = {}
  ): string | null {
    const normalizedTagName = normalizeName(tagName);
    if (!normalizedTagName) {
      return null;
    }

    return isAllowedElementTag(normalizedTagName, options.namespace ?? "html")
      ? normalizedTagName
      : null;
  }

  sanitizeAttributes(
    input: DomSanitizerAttributeInput
  ): Record<string, string> {
    const tagName = input.tagName ? normalizeName(input.tagName) : undefined;
    const context = tagName && SVG_ELEMENT_TAGS.has(tagName) ? "svg" : "html";
    const normalized: Record<string, string> = {};

    for (const [name, value] of Object.entries(input.attributes)) {
      const normalizedName = normalizeName(name);
      const trimmedValue = value.trim();
      if (!normalizedName || !trimmedValue) {
        continue;
      }

      if (!isAllowedAttributeName(normalizedName, tagName, context)) {
        continue;
      }

      if (
        !isAllowedAttributeValue(normalizedName, trimmedValue, tagName, context)
      ) {
        continue;
      }

      normalized[normalizedName] = trimmedValue;
    }

    return normalized;
  }

  sanitizeRootAttributes(
    attributes: Record<string, string>
  ): Record<string, string> {
    const normalized = this.sanitizeAttributes({ attributes });
    const safeRootAttributes: Record<string, string> = {};

    for (const [name, value] of Object.entries(normalized)) {
      if (ROOT_ATTRIBUTE_NAMES.has(name)) {
        safeRootAttributes[name] = value;
      }
    }

    return safeRootAttributes;
  }
}

const HTML_ELEMENT_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "aside",
  "b",
  "bdi",
  "bdo",
  "big",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "rb",
  "rp",
  "rt",
  "rtc",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr"
]);

const SVG_ELEMENT_TAGS = new Set([
  "circle",
  "clippath",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "lineargradient",
  "mask",
  "path",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "svg",
  "text",
  "title",
  "tspan",
  "use"
]);

const ROOT_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "style",
  "lang",
  "xml:lang",
  "dir"
]);

const GLOBAL_HTML_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "style",
  "title",
  "lang",
  "xml:lang",
  "dir",
  "role",
  "epub:type"
]);

const TAG_ATTRIBUTE_NAMES = new Map<string, Set<string>>([
  ["a", new Set(["href", "name", "target", "rel"])],
  ["blockquote", new Set(["cite"])],
  ["col", new Set(["span", "width"])],
  ["colgroup", new Set(["span", "width"])],
  ["del", new Set(["cite", "datetime"])],
  ["img", new Set(["src", "alt", "width", "height", "loading", "decoding"])],
  ["ins", new Set(["cite", "datetime"])],
  ["li", new Set(["value"])],
  ["ol", new Set(["start", "type"])],
  ["q", new Set(["cite"])],
  [
    "table",
    new Set(["summary", "width", "border", "cellspacing", "cellpadding"])
  ],
  [
    "td",
    new Set([
      "colspan",
      "rowspan",
      "headers",
      "scope",
      "align",
      "valign",
      "width",
      "height"
    ])
  ],
  [
    "th",
    new Set([
      "colspan",
      "rowspan",
      "headers",
      "scope",
      "align",
      "valign",
      "width",
      "height"
    ])
  ],
  ["time", new Set(["datetime"])],
  ["tr", new Set(["align", "valign"])]
]);

const SVG_ATTRIBUTE_NAMES = new Set([
  "aria-hidden",
  "class",
  "clip-path",
  "clip-rule",
  "cx",
  "cy",
  "d",
  "dx",
  "dy",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "height",
  "id",
  "mask",
  "offset",
  "opacity",
  "points",
  "preserveaspectratio",
  "r",
  "role",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "style",
  "text-anchor",
  "transform",
  "version",
  "viewbox",
  "width",
  "x",
  "x1",
  "x2",
  "href",
  "xlink:href",
  "xmlns",
  "y",
  "y1",
  "y2"
]);

const SAFE_NAVIGATION_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

function isAllowedElementTag(
  tagName: string,
  namespace: DomSanitizerNamespace
): boolean {
  if (namespace === "svg") {
    return SVG_ELEMENT_TAGS.has(tagName);
  }

  return HTML_ELEMENT_TAGS.has(tagName) || SVG_ELEMENT_TAGS.has(tagName);
}

function isAllowedAttributeName(
  attributeName: string,
  tagName: string | undefined,
  context: DomSanitizerNamespace
): boolean {
  if (
    attributeName.startsWith("on") ||
    attributeName === "srcdoc" ||
    attributeName === "srcset"
  ) {
    return false;
  }

  if (attributeName.startsWith("aria-")) {
    return true;
  }

  if (context === "svg") {
    return SVG_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (GLOBAL_HTML_ATTRIBUTE_NAMES.has(attributeName)) {
    return true;
  }

  return Boolean(
    tagName && TAG_ATTRIBUTE_NAMES.get(tagName)?.has(attributeName)
  );
}

function isAllowedAttributeValue(
  attributeName: string,
  value: string,
  tagName: string | undefined,
  context: DomSanitizerNamespace
): boolean {
  if (attributeName === "style") {
    return !isUnsafeStyleAttributeValue(value);
  }

  if (context === "svg") {
    return isAllowedSvgAttributeValue(attributeName, value, tagName);
  }

  if (attributeName === "src" && tagName === "img") {
    return (
      sanitizeEmbeddedResourceUrl(value, {
        allowExternalEmbeddedResources: true
      }) === value.trim()
    );
  }

  if (attributeName === "href" && tagName === "a") {
    return isSafeNavigationUrl(value);
  }

  if (
    attributeName === "cite" &&
    (tagName === "blockquote" ||
      tagName === "del" ||
      tagName === "ins" ||
      tagName === "q")
  ) {
    return isSafeNavigationUrl(value);
  }

  return true;
}

function isAllowedSvgAttributeValue(
  attributeName: string,
  value: string,
  tagName: string | undefined
): boolean {
  if (attributeName !== "href" && attributeName !== "xlink:href") {
    return true;
  }

  if (tagName === "use") {
    return value.trim().startsWith("#");
  }

  if (tagName === "image") {
    return sanitizeEmbeddedResourceUrl(value) === value.trim();
  }

  return value.trim().startsWith("#");
}

function isSafeNavigationUrl(value: string): boolean {
  const normalized = stripUrlControlAndWhitespace(value.trim());
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("#") || normalized.startsWith("//")) {
    return true;
  }

  const schemeMatch = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!schemeMatch) {
    return true;
  }

  return SAFE_NAVIGATION_SCHEMES.has(schemeMatch[1]!.toLowerCase());
}

function isUnsafeStyleAttributeValue(value: string): boolean {
  return /(?:@import\b|expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding)/i.test(
    value
  );
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function stripUrlControlAndWhitespace(value: string): string {
  let normalized = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) {
      continue;
    }
    normalized += char;
  }
  return normalized;
}
