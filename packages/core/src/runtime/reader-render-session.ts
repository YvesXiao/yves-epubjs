import type {
  ChapterRenderDecision,
  LocatorRestoreDiagnostics,
  RenderMetrics,
  VisibleDrawBounds
} from "../model/types";
import type { InteractionRegion } from "../renderer/draw-ops";
import type { IntrinsicImageSize } from "../utils/image-intrinsic-size";
import type { ReaderRenderSessionState } from "./reader-session-state";

export class ReaderRenderSession {
  constructor(private readonly state: ReaderRenderSessionState) {}

  get lastMeasuredWidth(): number {
    return this.state.lastMeasuredWidth;
  }

  set lastMeasuredWidth(value: number) {
    this.state.lastMeasuredWidth = value;
  }

  get lastMeasuredHeight(): number {
    return this.state.lastMeasuredHeight;
  }

  set lastMeasuredHeight(value: number) {
    this.state.lastMeasuredHeight = value;
  }

  get sectionEstimatedHeights(): number[] {
    return this.state.sectionEstimatedHeights;
  }

  set sectionEstimatedHeights(value: number[]) {
    this.state.sectionEstimatedHeights = value;
  }

  get scrollWindowStart(): number {
    return this.state.scrollWindowStart;
  }

  set scrollWindowStart(value: number) {
    this.state.scrollWindowStart = value;
  }

  get scrollWindowEnd(): number {
    return this.state.scrollWindowEnd;
  }

  set scrollWindowEnd(value: number) {
    this.state.scrollWindowEnd = value;
  }

  get lastVisibleBounds(): VisibleDrawBounds {
    return this.state.lastVisibleBounds;
  }

  set lastVisibleBounds(value: VisibleDrawBounds) {
    this.state.lastVisibleBounds = value;
  }

  get lastInteractionRegions(): InteractionRegion[] {
    return this.state.lastInteractionRegions;
  }

  set lastInteractionRegions(value: InteractionRegion[]) {
    this.state.lastInteractionRegions = value;
  }

  get lastRenderedSectionIds(): string[] {
    return this.state.lastRenderedSectionIds;
  }

  set lastRenderedSectionIds(value: string[]) {
    this.state.lastRenderedSectionIds = value;
  }

  get lastScrollRenderWindows(): Map<
    string,
    Array<{ top: number; height: number }>
  > {
    return this.state.lastScrollRenderWindows;
  }

  set lastScrollRenderWindows(
    value: Map<string, Array<{ top: number; height: number }>>
  ) {
    this.state.lastScrollRenderWindows = value;
  }

  get lastRenderMetrics(): RenderMetrics {
    return this.state.lastRenderMetrics;
  }

  set lastRenderMetrics(value: RenderMetrics) {
    this.state.lastRenderMetrics = value;
  }

  get renderVersion(): number {
    return this.state.renderVersion;
  }

  set renderVersion(value: number) {
    this.state.renderVersion = value;
  }

  get lastChapterRenderDecision(): ChapterRenderDecision | null {
    return this.state.lastChapterRenderDecision;
  }

  set lastChapterRenderDecision(value: ChapterRenderDecision | null) {
    this.state.lastChapterRenderDecision = value;
  }

  get imageIntrinsicSizeCache(): Map<string, IntrinsicImageSize | null> {
    return this.state.imageIntrinsicSizeCache;
  }

  get pendingImageIntrinsicSizePaths(): Set<string> {
    return this.state.pendingImageIntrinsicSizePaths;
  }

  get lastLocatorRestoreDiagnostics(): LocatorRestoreDiagnostics | null {
    return this.state.lastLocatorRestoreDiagnostics;
  }

  set lastLocatorRestoreDiagnostics(value: LocatorRestoreDiagnostics | null) {
    this.state.lastLocatorRestoreDiagnostics = value;
  }

  get lastFixedLayoutRenderSignature(): string | null {
    return this.state.lastFixedLayoutRenderSignature;
  }

  set lastFixedLayoutRenderSignature(value: string | null) {
    this.state.lastFixedLayoutRenderSignature = value;
  }

  get lastPresentationRenderSignature(): string | null {
    return this.state.lastPresentationRenderSignature;
  }

  set lastPresentationRenderSignature(value: string | null) {
    this.state.lastPresentationRenderSignature = value;
  }

  nextRenderVersion(): number {
    this.state.renderVersion += 1;
    return this.state.renderVersion;
  }

  invalidateRenderVersion(): void {
    this.state.renderVersion += 1;
  }

  isCurrentRenderVersion(renderVersion: number): boolean {
    return renderVersion === this.state.renderVersion;
  }

  resetForOpen(): void {
    this.imageIntrinsicSizeCache.clear();
    this.pendingImageIntrinsicSizePaths.clear();
    this.resetTransientRenderState();
    this.invalidateRenderVersion();
  }

  resetForDestroy(): void {
    this.imageIntrinsicSizeCache.clear();
    this.pendingImageIntrinsicSizePaths.clear();
    this.resetTransientRenderState();
  }

  private resetTransientRenderState(): void {
    this.state.lastMeasuredWidth = 0;
    this.state.lastMeasuredHeight = 0;
    this.state.sectionEstimatedHeights = [];
    this.state.scrollWindowStart = -1;
    this.state.scrollWindowEnd = -1;
    this.state.lastVisibleBounds = [];
    this.state.lastInteractionRegions = [];
    this.state.lastRenderedSectionIds = [];
    this.state.lastScrollRenderWindows.clear();
    this.state.lastRenderMetrics = createInitialRenderMetrics();
    this.state.lastChapterRenderDecision = null;
    this.state.lastLocatorRestoreDiagnostics = null;
    this.state.lastFixedLayoutRenderSignature = null;
    this.state.lastPresentationRenderSignature = null;
  }
}

function createInitialRenderMetrics(): RenderMetrics {
  return {
    backend: "canvas",
    visibleSectionCount: 0,
    visibleDrawOpCount: 0,
    highlightedDrawOpCount: 0,
    totalCanvasHeight: 0
  };
}
