import { describe, expect, it } from "vitest";
import { ReaderRenderSession } from "../src/runtime/reader-render-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderRenderSession", () => {
  it("owns render version changes and late result checks", () => {
    const state = createSessionState();
    const session = new ReaderRenderSession(state.render);

    expect(session.renderVersion).toBe(0);

    const renderVersion = session.nextRenderVersion();

    expect(renderVersion).toBe(1);
    expect(session.isCurrentRenderVersion(renderVersion)).toBe(true);

    session.invalidateRenderVersion();

    expect(session.renderVersion).toBe(2);
    expect(session.isCurrentRenderVersion(renderVersion)).toBe(false);
  });

  it("resets transient render state while preserving the render session container", () => {
    const state = createSessionState();
    const session = new ReaderRenderSession(state.render);

    session.lastMeasuredWidth = 320;
    session.lastMeasuredHeight = 480;
    session.sectionEstimatedHeights = [1200];
    session.scrollWindowStart = 1;
    session.scrollWindowEnd = 2;
    session.lastRenderedSectionIds = ["section-1"];
    session.lastScrollRenderWindows.set("section-1", [{ top: 0, height: 100 }]);
    session.imageIntrinsicSizeCache.set("cover.jpg", { width: 10, height: 20 });
    session.pendingImageIntrinsicSizePaths.add("cover.jpg");
    session.lastRenderMetrics = {
      backend: "dom",
      visibleSectionCount: 1,
      visibleDrawOpCount: 2,
      highlightedDrawOpCount: 1,
      totalCanvasHeight: 100
    };

    session.resetForOpen();

    expect(session.renderVersion).toBe(1);
    expect(session.lastMeasuredWidth).toBe(0);
    expect(session.lastMeasuredHeight).toBe(0);
    expect(session.sectionEstimatedHeights).toEqual([]);
    expect(session.scrollWindowStart).toBe(-1);
    expect(session.scrollWindowEnd).toBe(-1);
    expect(session.lastRenderedSectionIds).toEqual([]);
    expect(session.lastScrollRenderWindows.size).toBe(0);
    expect(session.imageIntrinsicSizeCache.size).toBe(0);
    expect(session.pendingImageIntrinsicSizePaths.size).toBe(0);
    expect(session.lastRenderMetrics).toEqual({
      backend: "canvas",
      visibleSectionCount: 0,
      visibleDrawOpCount: 0,
      highlightedDrawOpCount: 0,
      totalCanvasHeight: 0
    });
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
