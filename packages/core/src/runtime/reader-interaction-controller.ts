import type {
  HitTestResult,
  Locator,
  Point,
  ReaderTextSelectionSnapshot
} from "../model/types";

type ReaderInteractionControllerDependencies = {
  getContainer: () => HTMLElement | null | undefined;
  getMode: () => "scroll" | "paginated";
  getBook: () => object | null;
  handleScrollEvent: (mode: "scroll" | "paginated") => void;
  hasTextSelectionSnapshot: () => boolean;
  syncTextSelectionState: () => void;
  hasActiveTextSelection: (scope?: Node | null) => boolean;
  handleDomClick: (event: MouseEvent) => void;
  getContainerRelativePoint: (event: MouseEvent) => Point | null;
  resolveAnnotationSelectionAtPoint: (
    point: Point
  ) => ReaderTextSelectionSnapshot | null;
  emitAnnotationActivated: (point: Point) => boolean;
  setPinnedTextSelectionSnapshot: (
    snapshot: ReaderTextSelectionSnapshot | null
  ) => void;
  hasPinnedTextSelectionSnapshot: () => boolean;
  hitTest: (point: Point) => HitTestResult | null;
  resolvePaginatedClickNavigationAction: (input: {
    offsetX: number;
    target: HTMLElement;
  }) => "previous" | "next" | null;
  performPaginatedNavigationAction: (action: "previous" | "next") => void;
  emitPaginatedCenterTapped: (input: {
    source: "canvas";
    offsetX: number;
    locator?: Locator | null;
    sectionId?: string;
  }) => void;
  mapDomViewportPointToLocator: (point: Point) => Locator | null;
  getCurrentLocation: () => Locator | null;
  activateLink: (input: {
    href: string;
    source: "canvas";
    text?: string;
    sectionId?: string;
    blockId?: string;
  }) => Promise<void> | void;
  updateLocator: (locator: Locator) => void;
  setCurrentSectionIndex: (sectionIndex: number) => void;
  syncCurrentPageFromSection: () => void;
  emitRelocated: () => void;
  isEditableTarget: (target: EventTarget | null) => boolean;
  getReadingNavigationContext: () => {
    nextPageKey: string;
    previousPageKey: string;
  } | null;
  next: () => Promise<void> | void;
  prev: () => Promise<void> | void;
};

export class ReaderInteractionController {
  private readonly handleContainerScroll = (): void => {
    this.dependencies.handleScrollEvent(this.dependencies.getMode());
    if (this.dependencies.hasTextSelectionSnapshot()) {
      this.dependencies.syncTextSelectionState();
    }
  };

  private readonly handleContainerClick = (event: MouseEvent): void => {
    const container = this.dependencies.getContainer();
    const target = event.target;
    if (this.dependencies.hasActiveTextSelection(container)) {
      return;
    }

    if (target instanceof HTMLElement && target.closest(".epub-dom-section")) {
      this.dependencies.handleDomClick(event);
      return;
    }

    if (!(target instanceof HTMLElement) || !container) {
      return;
    }

    const point = this.dependencies.getContainerRelativePoint(event);
    if (!point) {
      return;
    }

    const annotationSelection =
      this.dependencies.resolveAnnotationSelectionAtPoint(point);
    if (annotationSelection) {
      event.preventDefault();
      this.dependencies.setPinnedTextSelectionSnapshot(annotationSelection);
      this.dependencies.emitAnnotationActivated(point);
      return;
    }

    if (this.dependencies.hasPinnedTextSelectionSnapshot()) {
      this.dependencies.setPinnedTextSelectionSnapshot(null);
    }

    const hit = this.dependencies.hitTest(point);
    const paginatedClickAction =
      this.dependencies.getMode() === "paginated"
        ? this.dependencies.resolvePaginatedClickNavigationAction({
            offsetX: point.x,
            target
          })
        : null;

    if (paginatedClickAction && hit?.kind !== "link") {
      event.preventDefault();
      this.dependencies.performPaginatedNavigationAction(paginatedClickAction);
      return;
    }

    if (
      this.dependencies.getMode() === "paginated" &&
      !paginatedClickAction &&
      hit?.kind !== "link"
    ) {
      event.preventDefault();
      this.dependencies.emitPaginatedCenterTapped({
        source: "canvas",
        offsetX: point.x,
        locator:
          hit?.locator ??
          this.dependencies.mapDomViewportPointToLocator(point) ??
          this.dependencies.getCurrentLocation(),
        sectionId: hit?.sectionId ?? ""
      });
      return;
    }

    if (!hit) {
      return;
    }

    if (hit.kind === "link" && hit.href) {
      event.preventDefault();
      const activateLinkInput: {
        href: string;
        source: "canvas";
        text?: string;
        sectionId?: string;
        blockId?: string;
      } = {
        href: hit.href,
        source: "canvas"
      };
      if (hit.text) {
        activateLinkInput.text = hit.text;
      }
      if (hit.sectionId) {
        activateLinkInput.sectionId = hit.sectionId;
      }
      if (hit.blockId) {
        activateLinkInput.blockId = hit.blockId;
      }
      void this.dependencies.activateLink(activateLinkInput);
      return;
    }

    if (hit.locator) {
      this.dependencies.updateLocator({
        ...hit.locator,
        ...(hit.blockId ? { blockId: hit.blockId } : {})
      });
      const spineIndex = (hit.locator as { spineIndex?: number }).spineIndex;
      if (typeof spineIndex === "number") {
        this.dependencies.setCurrentSectionIndex(spineIndex);
      }
      this.dependencies.syncCurrentPageFromSection();
      this.dependencies.emitRelocated();
    }
  };

  private readonly handleContainerKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      this.dependencies.getMode() !== "paginated" ||
      !this.dependencies.getBook()
    ) {
      return;
    }

    if (this.dependencies.isEditableTarget(event.target)) {
      return;
    }

    const navigationContext = this.dependencies.getReadingNavigationContext();
    if (!navigationContext) {
      return;
    }

    if (event.key === navigationContext.nextPageKey) {
      event.preventDefault();
      void this.dependencies.next();
      return;
    }

    if (event.key === navigationContext.previousPageKey) {
      event.preventDefault();
      void this.dependencies.prev();
    }
  };

  constructor(
    private readonly dependencies: ReaderInteractionControllerDependencies
  ) {}

  attachScrollListener(): void {
    this.dependencies
      .getContainer()
      ?.addEventListener("scroll", this.handleContainerScroll);
  }

  detachScrollListener(): void {
    this.dependencies
      .getContainer()
      ?.removeEventListener("scroll", this.handleContainerScroll);
  }

  attachPointerListener(): void {
    this.dependencies
      .getContainer()
      ?.addEventListener("click", this.handleContainerClick);
  }

  detachPointerListener(): void {
    this.dependencies
      .getContainer()
      ?.removeEventListener("click", this.handleContainerClick);
  }

  attachKeyboardListener(): void {
    const container = this.dependencies.getContainer();
    if (!container) {
      return;
    }

    if (!container.hasAttribute("tabindex")) {
      container.tabIndex = 0;
    }

    container.addEventListener("keydown", this.handleContainerKeyDown);
  }

  detachKeyboardListener(): void {
    this.dependencies
      .getContainer()
      ?.removeEventListener("keydown", this.handleContainerKeyDown);
  }
}
