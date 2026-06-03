import { resolveResourcePath } from "../container/resource-path";
import type {
  Book,
  PublisherColorOverride,
  PublisherStylesMode,
  SectionDocument,
  Theme,
  TypographyOptions
} from "../model/types";
import type { DomChapterRenderInput } from "../renderer/dom-chapter-renderer";
import type { SharedChapterRenderInput } from "./chapter-render-input";
import { resolveEmbeddedResourceUrl } from "./external-boundary";
import { stripPublisherStylesFromPreprocessedNodes } from "./publisher-styles";

type DomRenderInputFactoryOptions = {
  book: Book | null;
  section: SectionDocument;
  input: SharedChapterRenderInput;
  theme: Theme;
  typography: TypographyOptions;
  fontFamily: string;
  publisherStyles: PublisherStylesMode;
  publisherColorOverride?: PublisherColorOverride;
  availableWidth?: number;
  availableHeight?: number;
  allowExternalEmbeddedResources?: boolean;
  resolveDomResourceUrl: (path: string) => string;
};

export type FixedLayoutFrame = {
  viewport: NonNullable<SectionDocument["renditionViewport"]>;
  width: number;
  height: number;
  scale: number;
};

type PresentationViewport = {
  width: number;
  height: number;
};

export function createDomChapterRenderInput(
  options: DomRenderInputFactoryOptions
): DomChapterRenderInput {
  const allowExternalEmbeddedResources =
    options.allowExternalEmbeddedResources === true;
  const htmlAttributes =
    options.publisherStyles === "enabled"
      ? resolveDomRootAttributes({
          sectionHref: options.section.href,
          attributes: options.input.preprocessed.htmlAttributes,
          resolveDomResourceUrl: options.resolveDomResourceUrl,
          allowExternalEmbeddedResources
        })
      : undefined;
  const bodyAttributes =
    options.publisherStyles === "enabled"
      ? resolveDomRootAttributes({
          sectionHref: options.section.href,
          attributes: options.input.preprocessed.bodyAttributes,
          resolveDomResourceUrl: options.resolveDomResourceUrl,
          allowExternalEmbeddedResources
        })
      : undefined;
  const fixedLayoutFrame = resolveFixedLayoutFrame({
    section: options.section,
    ...(typeof options.availableWidth === "number"
      ? { availableWidth: options.availableWidth }
      : {}),
    ...(typeof options.availableHeight === "number"
      ? { availableHeight: options.availableHeight }
      : {})
  });
  const renderInput: DomChapterRenderInput = {
    sectionId: options.section.id,
    sectionHref: options.section.href,
    ...(options.section.lang ? { sectionLanguage: options.section.lang } : {}),
    ...(options.section.renditionLayout
      ? { renditionLayout: options.section.renditionLayout }
      : {}),
    ...(options.section.presentationRole
      ? { presentationRole: options.section.presentationRole }
      : {}),
    ...(htmlAttributes ? { htmlAttributes } : {}),
    ...(bodyAttributes ? { bodyAttributes } : {}),
    ...(options.publisherStyles === "enabled"
      ? {
          linkedStyleSheets: (options.input.linkedStyleSheets ?? []).map(
            (stylesheet) => ({
              href: stylesheet.href,
              text: resolveDomStyleSheetText(
                stylesheet.href,
                stylesheet.text,
                options.resolveDomResourceUrl,
                allowExternalEmbeddedResources
              )
            })
          )
        }
      : {}),
    nodes:
      options.publisherStyles === "enabled"
        ? options.input.preprocessed.nodes
        : stripPublisherStylesFromPreprocessedNodes(
            options.input.preprocessed.nodes
          ),
    theme: options.theme,
    publisherColorOverride: options.publisherColorOverride ?? "none",
    typography: options.typography,
    fontFamily: options.fontFamily,
    ...(typeof options.availableHeight === "number"
      ? { contentViewportHeight: options.availableHeight }
      : {}),
    resolveAttributeValue: ({ tagName, attributeName, value }) =>
      resolveDomAttributeValue({
        sectionHref: options.section.href,
        tagName,
        attributeName,
        value,
        publisherStyles: options.publisherStyles,
        resolveDomResourceUrl: options.resolveDomResourceUrl,
        allowExternalEmbeddedResources
      })
  };
  if (fixedLayoutFrame) {
    renderInput.fixedLayoutViewport = fixedLayoutFrame.viewport;
    renderInput.fixedLayoutScale = fixedLayoutFrame.scale;
    renderInput.fixedLayoutRenderWidth = fixedLayoutFrame.width;
    renderInput.fixedLayoutRenderHeight = fixedLayoutFrame.height;
  }

  const presentationViewport = resolvePresentationViewport({
    section: options.section,
    fixedLayoutFrame,
    ...(typeof options.availableWidth === "number"
      ? { availableWidth: options.availableWidth }
      : {}),
    ...(typeof options.availableHeight === "number"
      ? { availableHeight: options.availableHeight }
      : {})
  });
  if (presentationViewport) {
    renderInput.presentationViewportWidth = presentationViewport.width;
    renderInput.presentationViewportHeight = presentationViewport.height;
  }

  const presentationImage = resolvePresentationSectionImage(
    options.book,
    options.section
  );
  if (!presentationImage) {
    return renderInput;
  }

  return {
    ...renderInput,
    presentationImageSrc: resolveEmbeddedResourceUrl(presentationImage.src, {
      allowExternalEmbeddedResources,
      resolveInternalResourceUrl: options.resolveDomResourceUrl
    }),
    ...(presentationImage.alt
      ? { presentationImageAlt: presentationImage.alt }
      : {})
  };
}

function resolveDomRootAttributes(input: {
  sectionHref: string;
  attributes: Record<string, string> | undefined;
  resolveDomResourceUrl: (path: string) => string;
  allowExternalEmbeddedResources?: boolean;
}): Record<string, string> | undefined {
  if (!input.attributes) {
    return undefined;
  }

  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.attributes)) {
    const resolvedValue =
      name === "style"
        ? resolveDomCssUrlValues(
            input.sectionHref,
            value,
            input.resolveDomResourceUrl,
            input.allowExternalEmbeddedResources
          )
        : value;
    if (resolvedValue.trim()) {
      resolved[name] = resolvedValue;
    }
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function resolveFixedLayoutFrame(input: {
  section: SectionDocument;
  availableWidth?: number;
  availableHeight?: number;
}): FixedLayoutFrame | null {
  if (
    input.section.renditionLayout !== "pre-paginated" ||
    !input.section.renditionViewport
  ) {
    return null;
  }

  const viewport = input.section.renditionViewport;
  const availableWidth =
    typeof input.availableWidth === "number" && input.availableWidth > 0
      ? input.availableWidth
      : viewport.width;
  const availableHeight =
    typeof input.availableHeight === "number" && input.availableHeight > 0
      ? input.availableHeight
      : viewport.height;
  const scale = Math.min(
    availableWidth / viewport.width,
    availableHeight / viewport.height
  );
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  return {
    viewport,
    width: Math.round(viewport.width * normalizedScale),
    height: Math.round(viewport.height * normalizedScale),
    scale: Number(normalizedScale.toFixed(4))
  };
}

function resolvePresentationViewport(input: {
  section: SectionDocument;
  fixedLayoutFrame: FixedLayoutFrame | null;
  availableWidth?: number;
  availableHeight?: number;
}): PresentationViewport | null {
  if (
    input.section.presentationRole !== "cover" &&
    input.section.presentationRole !== "image-page"
  ) {
    return null;
  }

  const width =
    input.fixedLayoutFrame?.width ??
    (typeof input.availableWidth === "number" && input.availableWidth > 0
      ? Math.round(input.availableWidth)
      : null);
  const height =
    input.fixedLayoutFrame?.height ??
    (typeof input.availableHeight === "number" && input.availableHeight > 0
      ? Math.round(input.availableHeight)
      : null);

  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  return { width, height };
}

function resolveDomAttributeValue(input: {
  sectionHref: string;
  tagName: string;
  attributeName: string;
  value: string;
  publisherStyles: PublisherStylesMode;
  resolveDomResourceUrl: (path: string) => string;
  allowExternalEmbeddedResources?: boolean;
}): string {
  const normalizedTagName = input.tagName.toLowerCase();
  const normalizedAttributeName = input.attributeName.toLowerCase();

  if (
    input.publisherStyles === "disabled" &&
    normalizedAttributeName === "style"
  ) {
    return "";
  }

  if (normalizedAttributeName === "style") {
    return resolveDomCssUrlValues(
      input.sectionHref,
      input.value,
      input.resolveDomResourceUrl,
      input.allowExternalEmbeddedResources
    );
  }

  if (
    !shouldResolveDomResourceAttribute(
      normalizedTagName,
      normalizedAttributeName
    )
  ) {
    return input.value;
  }

  return resolveEmbeddedResourceUrl(input.value, {
    allowExternalEmbeddedResources:
      input.allowExternalEmbeddedResources === true,
    resolveInternalResourceUrl: (path) =>
      input.resolveDomResourceUrl(resolveResourcePath(input.sectionHref, path))
  });
}

function shouldResolveDomResourceAttribute(
  tagName: string,
  attributeName: string
): boolean {
  if (attributeName === "src" && (tagName === "img" || tagName === "source")) {
    return true;
  }

  if (
    (attributeName === "href" || attributeName === "xlink:href") &&
    (tagName === "image" || tagName === "use")
  ) {
    return true;
  }

  return false;
}

function resolveDomStyleSheetText(
  sectionHref: string,
  value: string,
  resolveDomResourceUrl: (path: string) => string,
  allowExternalEmbeddedResources?: boolean
): string {
  return resolveDomCssUrlValues(
    sectionHref,
    value,
    resolveDomResourceUrl,
    allowExternalEmbeddedResources
  );
}

function resolveDomCssUrlValues(
  sectionHref: string,
  value: string,
  resolveDomResourceUrl: (path: string) => string,
  allowExternalEmbeddedResources?: boolean
): string {
  return value.replace(
    /url\(\s*(['"]?)([^)"']+)\1\s*\)/gi,
    (match, quote: string, path: string) => {
      const resolved = resolveEmbeddedResourceUrl(path, {
        allowExternalEmbeddedResources: allowExternalEmbeddedResources === true,
        resolveInternalResourceUrl: (resourcePath) =>
          resolveDomResourceUrl(resolveResourcePath(sectionHref, resourcePath))
      });
      const wrappedQuote = quote || '"';
      return `url(${wrappedQuote}${resolved}${wrappedQuote})`;
    }
  );
}

function resolvePresentationSectionImage(
  book: Book | null,
  section: SectionDocument
): { src: string; alt?: string } | null {
  if (section.presentationRole === "cover") {
    const sectionImage = extractSingleSectionImage(section);
    if (sectionImage) {
      return sectionImage;
    }

    const coverImageHref = book?.metadata.coverImageHref;
    if (coverImageHref) {
      return {
        src: coverImageHref,
        ...(book?.metadata.title ? { alt: book.metadata.title } : {})
      };
    }
  }

  if (section.presentationRole === "image-page") {
    return extractSingleSectionImage(section);
  }

  return null;
}

function extractSingleSectionImage(
  section: SectionDocument
): { src: string; alt?: string } | null {
  if (section.blocks.length !== 1) {
    return null;
  }

  const [block] = section.blocks;
  if (!block) {
    return null;
  }

  if (block.kind === "image") {
    return {
      src: block.src,
      ...(block.alt ? { alt: block.alt } : {})
    };
  }

  if (
    block.kind === "text" &&
    block.inlines.length === 1 &&
    block.inlines[0]?.kind === "image"
  ) {
    const image = block.inlines[0];
    return {
      src: image.src,
      ...(image.alt ? { alt: image.alt } : {})
    };
  }

  return null;
}
