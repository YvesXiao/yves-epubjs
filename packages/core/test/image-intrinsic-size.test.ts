import { describe, expect, it } from "vitest"
import { extractIntrinsicImageSize } from "../src/utils/image-intrinsic-size"

describe("extractIntrinsicImageSize", () => {
  it("reads png dimensions from the binary header", () => {
    const binary = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 44,
      0, 0, 0, 200, 8, 6, 0, 0, 0, 0, 0, 0, 0
    ])

    expect(extractIntrinsicImageSize(binary, "OPS/image.png")).toEqual({
      width: 300,
      height: 200
    })
  })

  it("reads jpeg dimensions from a start-of-frame segment", () => {
    const binary = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
      0x03, 0x11, 0x00, 0xff, 0xd9
    ])

    expect(extractIntrinsicImageSize(binary, "OPS/image.jpg")).toEqual({
      width: 600,
      height: 300
    })
  })

  it("falls back to svg attributes when the image is vector-based", () => {
    const binary = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"></svg>'
    )

    expect(extractIntrinsicImageSize(binary, "OPS/diagram.svg")).toEqual({
      width: 640,
      height: 480
    })
  })
})
