import { describe, expect, it } from "vitest"
import {
  normalizeEpubInput,
  type NormalizedEpubInput
} from "../src/container/normalize-input"

const encoder = new TextEncoder()

function toArray(data: Uint8Array): number[] {
  return Array.from(data)
}

async function expectBytes(
  resultPromise: Promise<NormalizedEpubInput>,
  expected: number[]
): Promise<NormalizedEpubInput> {
  const result = await resultPromise
  expect(toArray(result.data)).toEqual(expected)
  return result
}

describe("normalizeEpubInput", () => {
  it("normalizes Uint8Array input", async () => {
    const input = new Uint8Array([1, 2, 3])
    const result = await expectBytes(normalizeEpubInput(input), [1, 2, 3])

    expect(result.sourceName).toBeUndefined()
  })

  it("normalizes ArrayBuffer input", async () => {
    const input = Uint8Array.from([4, 5, 6]).buffer
    await expectBytes(normalizeEpubInput(input), [4, 5, 6])
  })

  it("normalizes Blob input", async () => {
    const input = new Blob(["epub"], {
      type: "application/epub+zip"
    })
    const result = await expectBytes(
      normalizeEpubInput(input),
      toArray(encoder.encode("epub"))
    )

    expect(result.mediaType).toBe("application/epub+zip")
  })

  it("normalizes File input and preserves its name", async () => {
    const input = new File(["chapter"], "alice.epub", {
      type: "application/epub+zip"
    })
    const result = await expectBytes(
      normalizeEpubInput(input),
      toArray(encoder.encode("chapter"))
    )

    expect(result.sourceName).toBe("alice.epub")
    expect(result.mediaType).toBe("application/epub+zip")
  })

  it("rejects unsupported input", async () => {
    await expect(normalizeEpubInput("book.epub" as never)).rejects.toThrowError(
      "Unsupported EPUB input. Expected File, Blob, ArrayBuffer, or Uint8Array."
    )
  })
})
