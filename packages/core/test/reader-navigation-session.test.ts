import { describe, expect, it } from "vitest";
import type { Locator } from "../src";
import { ReaderNavigationSession } from "../src/runtime/reader-navigation-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderNavigationSession", () => {
  it("resets open state from a start locator", () => {
    const state = createSessionState();
    const session = new ReaderNavigationSession(state.position);
    const startLocator: Locator = {
      spineIndex: 2,
      progressInSection: 0.4
    };

    session.currentSectionIndex = 1;
    session.currentPageNumber = 7;
    session.pages = [
      {
        pageNumber: 7,
        pageNumberInSection: 1,
        totalPagesInSection: 1,
        spineIndex: 1,
        sectionId: "section-1",
        sectionHref: "OPS/one.xhtml",
        blocks: []
      }
    ];
    session.pendingModeSwitchLocator = {
      spineIndex: 1,
      progressInSection: 0.2
    };
    session.preferLocatorOnNextDomPaginationSync = true;

    session.resetForOpen(startLocator);

    expect(session.locator).toEqual(startLocator);
    expect(session.currentSectionIndex).toBe(2);
    expect(session.pages).toEqual([]);
    expect(session.currentPageNumber).toBe(1);
    expect(session.pendingModeSwitchLocator).toBeNull();
    expect(session.preferLocatorOnNextDomPaginationSync).toBe(false);
  });

  it("clears navigation state on destroy", () => {
    const state = createSessionState();
    const session = new ReaderNavigationSession(state.position);

    session.locator = {
      spineIndex: 3,
      progressInSection: 0.8
    };
    session.currentSectionIndex = 3;
    session.currentPageNumber = 5;
    session.preferLocatorOnNextDomPaginationSync = true;

    session.resetForDestroy();

    expect(session.locator).toBeNull();
    expect(session.currentSectionIndex).toBe(0);
    expect(session.pages).toEqual([]);
    expect(session.currentPageNumber).toBe(1);
    expect(session.pendingModeSwitchLocator).toBeNull();
    expect(session.preferLocatorOnNextDomPaginationSync).toBe(false);
  });
});

function createSessionState() {
  return createReaderSessionState({
    preferences: {},
    mode: "scroll",
    publisherStyles: "enabled",
    publisherColorOverride: "none",
    experimentalRtl: false,
    spreadMode: "auto",
    theme: {
      color: "#1f2328",
      background: "#fffdf7"
    },
    typography: {
      fontSize: 18,
      lineHeight: 1.6,
      paragraphSpacing: 12
    }
  });
}
