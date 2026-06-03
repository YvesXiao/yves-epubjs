import { describe, expect, it } from "vitest";
import { ReaderViewSession } from "../src/runtime/reader-view-session";
import { createReaderSessionState } from "../src/runtime/reader-session-state";

describe("ReaderViewSession", () => {
  it("applies resolved settings and returns defensive snapshots", () => {
    const state = createReaderSessionState({
      preferences: {},
      mode: "paginated",
      publisherStyles: "enabled",
      publisherColorOverride: "none",
      experimentalRtl: false,
      spreadMode: "auto",
      theme: { background: "#fff", color: "#000" },
      typography: { fontSize: 16, lineHeight: 1.5, paragraphSpacing: 1 }
    });
    const session = new ReaderViewSession(state.view);

    session.applySettings({
      preferences: { mode: "scroll" },
      settings: {
        mode: "scroll",
        publisherStyles: "disabled",
        publisherColorOverride: "foreground",
        experimentalRtl: true,
        spreadMode: "none",
        theme: { background: "#111", color: "#eee" },
        typography: { fontSize: 20, lineHeight: 1.7, paragraphSpacing: 1.2 }
      }
    });

    const snapshot = session.snapshotSettings();
    snapshot.theme.background = "#changed";

    expect(session.preferences).toEqual({ mode: "scroll" });
    expect(session.mode).toBe("scroll");
    expect(session.publisherStyles).toBe("disabled");
    expect(session.publisherColorOverride).toBe("foreground");
    expect(session.experimentalRtl).toBe(true);
    expect(session.spreadMode).toBe("none");
    expect(session.theme.background).toBe("#111");
  });
});
