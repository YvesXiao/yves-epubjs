export type ReadingMode = "scroll" | "paginated";
export type RenderMode = "canvas" | "dom";
export type RenditionLayout = "reflowable" | "pre-paginated";
export type RenditionSpread =
  | "auto"
  | "none"
  | "landscape"
  | "portrait"
  | "both";
export type ReaderSpreadMode = "auto" | "none" | "always";
export type PageSpreadPlacement = "left" | "right" | "center";
export type ChapterRenderReason = string;
export type ChapterRenderDecision = {
  mode: RenderMode;
  score: number;
  reasons: ChapterRenderReason[];
};

export type FixedLayoutViewport = {
  width: number;
  height: number;
};

export type BookMetadata = {
  title: string;
  language?: string;
  identifier?: string;
  creator?: string;
  publisher?: string;
  coverImageHref?: string;
  startHref?: string;
  renditionLayout?: RenditionLayout;
  renditionViewport?: FixedLayoutViewport;
  renditionSpread?: RenditionSpread;
};

export type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

export type SpineItem = {
  idref: string;
  href: string;
  linear: boolean;
  mediaType?: string;
  properties?: string;
  renditionLayout?: RenditionLayout;
  pageSpreadPlacement?: PageSpreadPlacement;
};

export type TocItem = {
  id: string;
  label: string;
  href: string;
  children: TocItem[];
};

export type TextAlign = "start" | "center" | "end" | "justify";

export type TextStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: "normal" | "italic";
  lineHeight?: number;
  color?: string;
  backgroundColor?: string;
  textAlign?: TextAlign;
  letterSpacing?: number;
  whiteSpace?: "normal" | "pre-wrap";
  wordBreak?: "normal" | "keep-all" | "break-word";
  width?: number;
  height?: number;
  verticalAlign?: "baseline" | "middle" | "sub" | "sup";
  marginLeft?: number;
  marginRight?: number;
};

export type NodeAttributes = {
  tagName?: string;
  className?: string;
  role?: string;
  epubType?: string;
  lang?: string;
  dir?: string;
};

export type BlockStyle = TextStyle & {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
};

type InlineBase = NodeAttributes & {
  style?: TextStyle;
};

export type InlineNode =
  | (InlineBase & {
      kind: "text";
      text: string;
    })
  | (InlineBase & {
      kind: "span";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "emphasis";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "strong";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "sub";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "sup";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "small";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "mark";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "del";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "ins";
      children: InlineNode[];
    })
  | (InlineBase & {
      kind: "code";
      text: string;
    })
  | (InlineBase & {
      kind: "link";
      href: string;
      children: InlineNode[];
      title?: string;
    })
  | (InlineBase & {
      kind: "image";
      src: string;
      alt?: string;
      title?: string;
      width?: number;
      height?: number;
    })
  | (InlineBase & {
      kind: "line-break";
    });

export type BaseBlock = NodeAttributes & {
  id: string;
  kind: string;
  style?: BlockStyle;
};

export type TextBlock = BaseBlock & {
  kind: "text";
  inlines: InlineNode[];
};

export type HeadingBlock = BaseBlock & {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  inlines: InlineNode[];
};

export type ImageBlock = BaseBlock & {
  kind: "image";
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
};

export type QuoteBlock = BaseBlock & {
  kind: "quote";
  blocks: BlockNode[];
  attribution?: string;
};

export type CodeBlock = BaseBlock & {
  kind: "code";
  text: string;
  language?: string;
};

export type ListItemBlock = {
  id: string;
  blocks: BlockNode[];
};

export type ListBlock = BaseBlock & {
  kind: "list";
  ordered: boolean;
  start?: number;
  items: ListItemBlock[];
};

export type TableCell = {
  id: string;
  blocks: BlockNode[];
  colSpan?: number;
  rowSpan?: number;
  header?: boolean;
};

export type TableRow = {
  id: string;
  cells: TableCell[];
};

export type TableBlock = BaseBlock & {
  kind: "table";
  rows: TableRow[];
  caption?: BlockNode[];
};

export type FigureBlock = BaseBlock & {
  kind: "figure";
  blocks: BlockNode[];
  caption?: BlockNode[];
};

export type AsideBlock = BaseBlock & {
  kind: "aside";
  blocks: BlockNode[];
};

export type NavBlock = BaseBlock & {
  kind: "nav";
  blocks: BlockNode[];
};

export type DefinitionListItem = {
  id: string;
  term: BlockNode[];
  descriptions: BlockNode[][];
};

export type DefinitionListBlock = BaseBlock & {
  kind: "definition-list";
  items: DefinitionListItem[];
};

export type ThematicBreakBlock = BaseBlock & {
  kind: "thematic-break";
};

export type BlockNode =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | TableBlock
  | FigureBlock
  | AsideBlock
  | NavBlock
  | DefinitionListBlock
  | ThematicBreakBlock;

export type SectionDocument = {
  id: string;
  href: string;
  title?: string;
  lang?: string;
  dir?: ReadingDirection;
  renditionLayout?: RenditionLayout;
  renditionViewport?: FixedLayoutViewport;
  renditionSpread?: RenditionSpread;
  pageSpreadPlacement?: PageSpreadPlacement;
  presentationRole?: "cover" | "image-page";
  blocks: BlockNode[];
  anchors: Record<string, string>;
};

export type Book = {
  metadata: BookMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  toc: TocItem[];
  sections: SectionDocument[];
};

export type Theme = {
  color: string;
  background: string;
};

export type PublisherStylesMode = "enabled" | "disabled";
export type ReadingDirection = "ltr" | "rtl";

export type TypographyOptions = {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily?: string;
  letterSpacing?: number;
  wordSpacing?: number;
};

export type ReaderPreferences = {
  mode?: ReadingMode;
  publisherStyles?: PublisherStylesMode;
  experimentalRtl?: boolean;
  spreadMode?: ReaderSpreadMode;
  theme?: Partial<Theme>;
  typography?: Partial<TypographyOptions>;
};

export type ReaderSettings = {
  mode: ReadingMode;
  publisherStyles: PublisherStylesMode;
  experimentalRtl: boolean;
  spreadMode: ReaderSpreadMode;
  theme: Theme;
  typography: TypographyOptions;
};

export type ReadingLanguageContext = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  bookLanguage?: string;
  sectionLanguage?: string;
  resolvedLanguage?: string;
  contentDirection: ReadingDirection;
  rtlSuggested: boolean;
  rtlActive: boolean;
};

export type ReadingNavigationContext = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  contentDirection: ReadingDirection;
  pageProgression: ReadingDirection;
  rtlActive: boolean;
  previousPageKey: "ArrowLeft" | "ArrowRight";
  nextPageKey: "ArrowLeft" | "ArrowRight";
};

export type ReadingSpreadContext = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  spreadMode: ReaderSpreadMode;
  renditionLayout: RenditionLayout;
  renditionSpread: RenditionSpread;
  pageSpreadPlacement: PageSpreadPlacement;
  syntheticSpreadAllowed: boolean;
  syntheticSpreadActive: boolean;
  viewportSlotCount: 1 | 2;
};

export type AccessibilityContainerKind =
  | "quote"
  | "figure"
  | "aside"
  | "nav"
  | "list-item"
  | "table"
  | "definition-list";

export type AccessibilityEntryKind =
  | "heading"
  | "text"
  | "code"
  | "image"
  | "figure-caption"
  | "table-caption"
  | "definition-term"
  | "definition-description";

export type Locator = {
  spineIndex: number;
  blockId?: string;
  anchorId?: string;
  inlineOffset?: number;
  cfi?: string;
  progressInSection?: number;
};

export type SerializedLocator = {
  spineIndex?: number;
  href?: string;
  blockId?: string;
  anchorId?: string;
  inlineOffset?: number;
  cfi?: string;
  progressInSection?: number;
};

export type LocatorPrecision =
  | "section"
  | "progress"
  | "block"
  | "anchor"
  | "cfi";

export type TextRangePoint = {
  blockId: string;
  inlineOffset: number;
};

export type TextRangeSelector = {
  start: TextRangePoint;
  end: TextRangePoint;
};

export type DecorationStyle =
  | "highlight"
  | "underline"
  | "search-hit"
  | "active";

export type AnnotationStyle = "highlight" | "underline";

export type DecorationRenderHint = "margin-marker" | "note-icon";

export type DecorationExtras = {
  renderHint?: DecorationRenderHint;
  label?: string;
  textRange?: TextRangeSelector;
};

export type Decoration = {
  id: string;
  group: string;
  locator: Locator;
  style: DecorationStyle;
  color?: string;
  extras?: DecorationExtras;
};

export type Bookmark = {
  id: string;
  publicationId: string;
  locator: SerializedLocator;
  createdAt: string;
  label?: string;
  excerpt?: string;
};

export type Annotation = {
  id: string;
  publicationId: string;
  locator: SerializedLocator;
  textRange?: TextRangeSelector;
  quote?: string;
  note?: string;
  style?: AnnotationStyle;
  color?: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnotationViewportSnapshot = {
  annotation: Annotation;
  resolvedLocator: Locator | null;
  rects: VisibleDrawBounds;
  visible: boolean;
};

export type ReaderTextSelectionSnapshot = {
  text: string;
  locator: Locator;
  sectionId: string;
  blockId?: string;
  textRange?: TextRangeSelector;
  rects: VisibleDrawBounds;
  visible: boolean;
};

export type AnnotationActivatedEvent = {
  annotation: Annotation;
  locator: Locator;
  sectionId: string;
  blockId?: string;
  textRange?: TextRangeSelector;
  quote?: string;
  point: Point;
  rects: VisibleDrawBounds;
};

export type SelectionHighlightActionMode = "highlight" | "remove-highlight";

export type ReaderSelectionHighlightState = {
  mode: SelectionHighlightActionMode;
  disabled: boolean;
};

export type AccessibilityEntry = {
  id: string;
  kind: AccessibilityEntryKind;
  blockId: string;
  locator: Locator;
  text: string;
  containerPath: AccessibilityContainerKind[];
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  altText?: string;
};

export type AccessibilityDiagnostics = {
  totalEntries: number;
  imageEntries: number;
  imageAltEntries: number;
  imageMissingAltEntries: number;
  figureCaptionEntries: number;
  tableCaptionEntries: number;
  asideEntries: number;
  definitionTermEntries: number;
  definitionDescriptionEntries: number;
};

export type SectionAccessibilitySnapshot = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  text: string;
  entries: AccessibilityEntry[];
  diagnostics: AccessibilityDiagnostics;
};

export type PublicationAccessibilitySnapshot = {
  publicationId?: string;
  text: string;
  sections: SectionAccessibilitySnapshot[];
  diagnostics: AccessibilityDiagnostics;
};

export type LocatorRestoreDiagnostics = {
  requestedPrecision: LocatorPrecision;
  resolvedPrecision?: LocatorPrecision;
  matchedBy?: "cfi" | "href" | "spineIndex";
  fallbackApplied: boolean;
  status: "restored" | "failed";
  reason?:
    | "book-not-open"
    | "publication-mismatch"
    | "section-not-found"
    | "invalid-locator";
};

export type SearchResult = {
  locator: Locator;
  excerpt: string;
  matchText?: string;
  sectionId: string;
  href: string;
};

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HitTestResult =
  | {
      kind: "link";
      rect: Rect;
      sectionId: string;
      blockId: string;
      href: string;
      locator: Locator | undefined;
      text: string | undefined;
    }
  | {
      kind: "image";
      rect: Rect;
      sectionId: string;
      blockId: string;
      src: string;
      alt: string | undefined;
      locator: Locator | undefined;
    }
  | {
      kind: "block";
      rect: Rect;
      sectionId: string;
      blockId: string;
      locator: Locator | undefined;
      text: string | undefined;
    };

export type VisibleDrawBounds = Rect[];

export type RenderMetrics = {
  backend: "canvas" | "dom";
  visibleSectionCount: number;
  visibleDrawOpCount: number;
  highlightedDrawOpCount: number;
  totalCanvasHeight: number;
};

export type RenderLayoutAuthority = "project-layout" | "browser-layout";

export type RenderGeometrySource = "interaction-map" | "dom-geometry";

export type RenderInteractionModel = "canvas-hit-test" | "dom-events";

export type RenderFlowModel = "scroll-slices" | "paginated-pages" | "dom-flow";

export type ReaderBaselineStyleProfile = "default-reflowable";

export type RenderDiagnostics = {
  mode: RenderMode;
  score: number;
  reasons: string[];
  renditionLayout?: RenditionLayout;
  renditionSpread?: RenditionSpread;
  spreadMode?: ReaderSpreadMode;
  pageSpreadPlacement?: PageSpreadPlacement;
  syntheticSpreadActive?: boolean;
  viewportSlotCount?: 1 | 2;
  publisherStyles?: PublisherStylesMode;
  sectionId?: string;
  sectionHref?: string;
  layoutAuthority?: RenderLayoutAuthority;
  geometrySource?: RenderGeometrySource;
  interactionModel?: RenderInteractionModel;
  flowModel?: RenderFlowModel;
  alignmentTarget?: "dom-baseline";
  styleProfile?: ReaderBaselineStyleProfile;
};

export type VisibleSectionDiagnostics = RenderDiagnostics & {
  isCurrent: boolean;
};

export type ReadingProgressSnapshot = {
  overallProgress: number;
  sectionProgress: number;
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  currentPage?: number;
  totalPages?: number;
};

export type TocTarget = {
  id: string;
  label: string;
  href: string;
  depth: number;
  parentId?: string;
  locator: Locator;
};

export type SectionRenderedEvent = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  mode: ReadingMode;
  backend: "dom" | "canvas";
  diagnostics: RenderDiagnostics | null;
  containerElement?: HTMLElement;
  contentElement?: HTMLElement;
  isCurrent: boolean;
};

export type SectionRelocatedEvent = {
  spineIndex: number;
  sectionId: string;
  sectionHref: string;
  locator: Locator | null;
  mode: ReadingMode;
  backend: "dom" | "canvas";
  diagnostics: RenderDiagnostics | null;
  containerElement?: HTMLElement;
  contentElement?: HTMLElement;
};

export type ReaderEventMap = {
  opened: { book: Book };
  rendered: { mode: ReadingMode };
  relocated: { locator: Locator | null };
  paginatedCenterTapped: {
    locator: Locator | null;
    source: "dom" | "canvas";
    offsetX: number;
    containerWidth: number;
    sectionId?: string;
    sectionHref?: string;
  };
  textSelectionChanged: {
    selection: ReaderTextSelectionSnapshot | null;
  };
  annotationActivated: AnnotationActivatedEvent;
  externalLinkActivated: {
    href: string;
    scheme: string;
    source: "dom" | "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  };
  externalLinkBlocked: {
    href: string;
    scheme: string;
    reason: "unsafe-scheme";
  };
  preferencesChanged: {
    preferences: ReaderPreferences;
    settings: ReaderSettings;
  };
  themeChanged: { theme: Theme };
  typographyChanged: { typography: TypographyOptions };
  searchCompleted: { query: string; results: SearchResult[] };
};

export type ReaderEvent = keyof ReaderEventMap;

export type ReaderOptions = {
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;
  preferences?: ReaderPreferences;
  mode?: ReadingMode;
  theme?: Partial<Theme>;
  typography?: Partial<TypographyOptions>;
  onTextSelectionChanged?: (
    input: ReaderEventMap["textSelectionChanged"]
  ) => void | Promise<void>;
  onAnnotationActivated?: (
    input: ReaderEventMap["annotationActivated"]
  ) => void | Promise<void>;
  onPaginatedCenterTap?: (
    input: ReaderEventMap["paginatedCenterTapped"]
  ) => void | Promise<void>;
  onExternalLink?: (
    input: ReaderEventMap["externalLinkActivated"]
  ) => void | Promise<void>;
  onSectionRendered?: (input: SectionRenderedEvent) => void | Promise<void>;
  onSectionRelocated?: (input: SectionRelocatedEvent) => void | Promise<void>;
  allowExternalEmbeddedResources?: boolean;
};
