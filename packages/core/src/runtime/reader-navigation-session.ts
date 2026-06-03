import type { Locator } from "../model/types";
import type { ReaderPage } from "./paginated-render-plan";
import type { ReaderNavigationSessionState } from "./reader-session-state";

export class ReaderNavigationSession {
  constructor(private readonly state: ReaderNavigationSessionState) {}

  get locator(): Locator | null {
    return this.state.locator;
  }

  set locator(value: Locator | null) {
    this.state.locator = value;
  }

  get currentSectionIndex(): number {
    return this.state.currentSectionIndex;
  }

  set currentSectionIndex(value: number) {
    this.state.currentSectionIndex = value;
  }

  get pages(): ReaderPage[] {
    return this.state.pages;
  }

  set pages(value: ReaderPage[]) {
    this.state.pages = value;
  }

  get currentPageNumber(): number {
    return this.state.currentPageNumber;
  }

  set currentPageNumber(value: number) {
    this.state.currentPageNumber = value;
  }

  get pendingModeSwitchLocator(): Locator | null {
    return this.state.pendingModeSwitchLocator;
  }

  set pendingModeSwitchLocator(value: Locator | null) {
    this.state.pendingModeSwitchLocator = value;
  }

  get preferLocatorOnNextDomPaginationSync(): boolean {
    return this.state.preferLocatorOnNextDomPaginationSync;
  }

  set preferLocatorOnNextDomPaginationSync(value: boolean) {
    this.state.preferLocatorOnNextDomPaginationSync = value;
  }

  resetForOpen(startLocator: Locator | null): void {
    this.state.locator = startLocator;
    this.state.currentSectionIndex = startLocator?.spineIndex ?? 0;
    this.state.pages = [];
    this.state.currentPageNumber = 1;
    this.state.pendingModeSwitchLocator = null;
    this.state.preferLocatorOnNextDomPaginationSync = false;
  }

  resetForDestroy(): void {
    this.state.locator = null;
    this.state.currentSectionIndex = 0;
    this.state.pages = [];
    this.state.currentPageNumber = 1;
    this.state.pendingModeSwitchLocator = null;
    this.state.preferLocatorOnNextDomPaginationSync = false;
  }
}
