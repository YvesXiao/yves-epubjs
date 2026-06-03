import type {
  Annotation,
  Book,
  ChapterRenderDecision,
  Locator,
  LocatorRestoreDiagnostics,
  PublisherColorOverride,
  PublisherStylesMode,
  ReaderPreferences,
  ReaderSpreadMode,
  ReaderTextSelectionSnapshot,
  RenderMetrics,
  Theme,
  TypographyOptions,
  VisibleDrawBounds
} from "../model/types";
import type { InteractionRegion } from "../renderer/draw-ops";
import type { IntrinsicImageSize } from "../utils/image-intrinsic-size";
import type { ReaderPage } from "./paginated-render-plan";
import type { SharedChapterRenderInput } from "./chapter-render-input";

export type ReaderResourceReader = {
  readBinary(path: string): Promise<Uint8Array>;
  exists(path: string): boolean;
};

export type ReaderSessionState = {
  document: {
    book: Book | null;
    sourceName: string | null;
    resources: ReaderResourceReader | null;
    chapterRenderInputs: SharedChapterRenderInput[];
    sectionIndexById: Map<string, number>;
  };
  annotations: {
    annotations: Annotation[];
  };
  view: {
    preferences: ReaderPreferences;
    mode: "scroll" | "paginated";
    publisherStyles: PublisherStylesMode;
    publisherColorOverride: PublisherColorOverride;
    experimentalRtl: boolean;
    spreadMode: ReaderSpreadMode;
    debugMode: boolean;
    theme: Theme;
    typography: TypographyOptions;
  };
  position: {
    locator: Locator | null;
    currentSectionIndex: number;
    pages: ReaderPage[];
    currentPageNumber: number;
    pendingModeSwitchLocator: Locator | null;
    preferLocatorOnNextDomPaginationSync: boolean;
  };
  render: {
    lastMeasuredWidth: number;
    lastMeasuredHeight: number;
    sectionEstimatedHeights: number[];
    scrollWindowStart: number;
    scrollWindowEnd: number;
    lastVisibleBounds: VisibleDrawBounds;
    lastInteractionRegions: InteractionRegion[];
    lastRenderedSectionIds: string[];
    lastScrollRenderWindows: Map<
      string,
      Array<{ top: number; height: number }>
    >;
    lastRenderMetrics: RenderMetrics;
    renderVersion: number;
    lastChapterRenderDecision: ChapterRenderDecision | null;
    imageIntrinsicSizeCache: Map<string, IntrinsicImageSize | null>;
    pendingImageIntrinsicSizePaths: Set<string>;
    lastLocatorRestoreDiagnostics: LocatorRestoreDiagnostics | null;
    lastFixedLayoutRenderSignature: string | null;
    lastPresentationRenderSignature: string | null;
  };
  selection: {
    textSelectionSnapshot: ReaderTextSelectionSnapshot | null;
    pinnedTextSelectionSnapshot: ReaderTextSelectionSnapshot | null;
  };
};

export type ReaderNavigationSessionState = ReaderSessionState["position"];
export type ReaderRenderSessionState = ReaderSessionState["render"];
export type ReaderDocumentSessionState = ReaderSessionState["document"];
export type ReaderAnnotationSessionState = ReaderSessionState["annotations"];
export type ReaderViewSessionState = ReaderSessionState["view"];
export type ReaderSelectionSessionState = ReaderSessionState["selection"];

export function createReaderSessionState(input: {
  preferences: ReaderPreferences;
  mode: "scroll" | "paginated";
  publisherStyles: PublisherStylesMode;
  publisherColorOverride: PublisherColorOverride;
  experimentalRtl: boolean;
  spreadMode: ReaderSpreadMode;
  theme: Theme;
  typography: TypographyOptions;
}): ReaderSessionState {
  return {
    document: {
      book: null,
      sourceName: null,
      resources: null,
      chapterRenderInputs: [],
      sectionIndexById: new Map()
    },
    annotations: {
      annotations: []
    },
    view: {
      preferences: input.preferences,
      mode: input.mode,
      publisherStyles: input.publisherStyles,
      publisherColorOverride: input.publisherColorOverride,
      experimentalRtl: input.experimentalRtl,
      spreadMode: input.spreadMode,
      debugMode: false,
      theme: input.theme,
      typography: input.typography
    },
    position: {
      locator: null,
      currentSectionIndex: 0,
      pages: [],
      currentPageNumber: 1,
      pendingModeSwitchLocator: null,
      preferLocatorOnNextDomPaginationSync: false
    },
    render: {
      lastMeasuredWidth: 0,
      lastMeasuredHeight: 0,
      sectionEstimatedHeights: [],
      scrollWindowStart: -1,
      scrollWindowEnd: -1,
      lastVisibleBounds: [],
      lastInteractionRegions: [],
      lastRenderedSectionIds: [],
      lastScrollRenderWindows: new Map(),
      lastRenderMetrics: {
        backend: "canvas",
        visibleSectionCount: 0,
        visibleDrawOpCount: 0,
        highlightedDrawOpCount: 0,
        totalCanvasHeight: 0
      },
      renderVersion: 0,
      lastChapterRenderDecision: null,
      imageIntrinsicSizeCache: new Map(),
      pendingImageIntrinsicSizePaths: new Set(),
      lastLocatorRestoreDiagnostics: null,
      lastFixedLayoutRenderSignature: null,
      lastPresentationRenderSignature: null
    },
    selection: {
      textSelectionSnapshot: null,
      pinnedTextSelectionSnapshot: null
    }
  };
}
