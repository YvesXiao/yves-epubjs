import { describe, expect, it } from "vitest"
import {
  deserializeReaderPreferences,
  mergeReaderPreferences,
  resolveReaderSettings,
  serializeReaderPreferences
} from "../src/runtime/preferences"

describe("reader preferences helpers", () => {
  it("merges nested preferences and drops invalid values", () => {
    const preferences = mergeReaderPreferences(
      {
        theme: {
          background: "#fffaf0"
        },
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          fontFamily: "Georgia, serif"
        }
      },
      {
        mode: "paginated",
        publisherStyles: "disabled",
        publisherColorOverride: "foreground",
        experimentalRtl: true,
        spreadMode: "always",
        theme: {
          color: "#1f2328"
        },
        typography: {
          fontSize: 22,
          paragraphSpacing: 16,
          lineHeight: -1,
          letterSpacing: 0.4,
          wordSpacing: 2
        }
      }
    )

    expect(preferences).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#fffaf0",
        color: "#1f2328"
      },
      typography: {
        fontSize: 22,
        lineHeight: 1.6,
        paragraphSpacing: 16,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.4,
        wordSpacing: 2
      }
    })
  })

  it("serializes, deserializes, and resolves settings against defaults", () => {
    const serialized = serializeReaderPreferences({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 20,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })

    const restored = deserializeReaderPreferences(serialized)
    expect(restored).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 20,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })

    expect(resolveReaderSettings(restored)).toEqual({
      mode: "paginated",
      publisherStyles: "disabled",
      publisherColorOverride: "foreground",
      experimentalRtl: true,
      spreadMode: "always",
      theme: {
        background: "#182028",
        color: "#ecf4ff"
      },
      typography: {
        fontSize: 20,
        lineHeight: 1.6,
        paragraphSpacing: 12,
        fontFamily: "Georgia, serif",
        letterSpacing: 0.5,
        wordSpacing: 3
      }
    })
    expect(deserializeReaderPreferences("{bad json")).toBeNull()
  })
})
