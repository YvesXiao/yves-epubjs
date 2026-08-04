import { afterEach, describe, expect, it, vi } from "vitest"

describe("text wrap measurement", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("prefers canvas text metrics when a browser measurement context is available", async () => {
    const measureText = vi.fn((text: string) => ({
      width: text === "在C#中，StringBuilder" ? 200 : text.length * 10
    }))
    const originalCreateElement = document.createElement.bind(document)

    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions
    ) => {
      if (tagName === "canvas") {
        return {
          getContext: () => ({
            font: "",
            measureText
          })
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName, options)
    }) as typeof document.createElement)

    const { approximateTextWidth } = await import("../src/utils/text-wrap")

    expect(
      approximateTextWidth(
        "在C#中，StringBuilder",
        '400 18px "Iowan Old Style", serif'
      )
    ).toBe(200)
    expect(measureText).toHaveBeenCalledWith("在C#中，StringBuilder")
  })
})
