export type IntrinsicImageSize = {
  width: number
  height: number
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function extractIntrinsicImageSize(
  binary: Uint8Array,
  path?: string
): IntrinsicImageSize | null {
  if (binary.length < 10) {
    return null
  }

  return (
    extractPngIntrinsicSize(binary) ??
    extractGifIntrinsicSize(binary) ??
    extractJpegIntrinsicSize(binary) ??
    extractWebpIntrinsicSize(binary) ??
    extractSvgIntrinsicSize(binary, path)
  )
}

function extractPngIntrinsicSize(
  binary: Uint8Array
): IntrinsicImageSize | null {
  if (binary.length < 24) {
    return null
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (binary[index] !== PNG_SIGNATURE[index]) {
      return null
    }
  }

  if (
    String.fromCharCode(
      binary[12] ?? 0,
      binary[13] ?? 0,
      binary[14] ?? 0,
      binary[15] ?? 0
    ) !== "IHDR"
  ) {
    return null
  }

  const width = readUint32(binary, 16)
  const height = readUint32(binary, 20)
  return isValidIntrinsicImageSize(width, height) ? { width, height } : null
}

function extractGifIntrinsicSize(
  binary: Uint8Array
): IntrinsicImageSize | null {
  if (binary.length < 10) {
    return null
  }

  const header = String.fromCharCode(
    binary[0] ?? 0,
    binary[1] ?? 0,
    binary[2] ?? 0,
    binary[3] ?? 0,
    binary[4] ?? 0,
    binary[5] ?? 0
  )
  if (header !== "GIF87a" && header !== "GIF89a") {
    return null
  }

  const width = readUint16(binary, 6)
  const height = readUint16(binary, 8)
  return isValidIntrinsicImageSize(width, height) ? { width, height } : null
}

function extractJpegIntrinsicSize(
  binary: Uint8Array
): IntrinsicImageSize | null {
  if (binary[0] !== 0xff || binary[1] !== 0xd8) {
    return null
  }

  let offset = 2
  while (offset + 8 < binary.length) {
    while (binary[offset] === 0xff) {
      offset += 1
    }

    const marker = binary[offset]
    if (typeof marker !== "number") {
      return null
    }

    if (marker === 0xd9 || marker === 0xda) {
      return null
    }

    const segmentLength = readUint16(binary, offset + 1)
    if (segmentLength < 2 || offset + 1 + segmentLength > binary.length) {
      return null
    }

    if (isJpegStartOfFrameMarker(marker)) {
      const height = readUint16(binary, offset + 4)
      const width = readUint16(binary, offset + 6)
      return isValidIntrinsicImageSize(width, height) ? { width, height } : null
    }

    offset += 1 + segmentLength
  }

  return null
}

function extractWebpIntrinsicSize(
  binary: Uint8Array
): IntrinsicImageSize | null {
  if (binary.length < 30) {
    return null
  }

  const riff = readAscii(binary, 0, 4)
  const webp = readAscii(binary, 8, 4)
  if (riff !== "RIFF" || webp !== "WEBP") {
    return null
  }

  const chunkType = readAscii(binary, 12, 4)
  if (chunkType === "VP8X") {
    const width = 1 + readUint24(binary, 24)
    const height = 1 + readUint24(binary, 27)
    return isValidIntrinsicImageSize(width, height) ? { width, height } : null
  }

  if (chunkType === "VP8 ") {
    const width = readUint16(binary, 26)
    const height = readUint16(binary, 28)
    return isValidIntrinsicImageSize(width, height) ? { width, height } : null
  }

  if (chunkType === "VP8L") {
    const value =
      (binary[21] ?? 0) |
      ((binary[22] ?? 0) << 8) |
      ((binary[23] ?? 0) << 16) |
      ((binary[24] ?? 0) << 24)
    const width = (value & 0x3fff) + 1
    const height = ((value >> 14) & 0x3fff) + 1
    return isValidIntrinsicImageSize(width, height) ? { width, height } : null
  }

  return null
}

function extractSvgIntrinsicSize(
  binary: Uint8Array,
  path?: string
): IntrinsicImageSize | null {
  const normalizedPath = path?.toLowerCase()
  const looksLikeSvgPath = normalizedPath?.endsWith(".svg") ?? false
  const preview = new TextDecoder().decode(binary.slice(0, 4096))
  if (!looksLikeSvgPath && !preview.includes("<svg")) {
    return null
  }

  const svgTagMatch = preview.match(/<svg\b[^>]*>/i)
  if (!svgTagMatch) {
    return null
  }

  const svgTag = svgTagMatch[0]
  const width = parseSvgLength(svgTag, "width")
  const height = parseSvgLength(svgTag, "height")
  if (isValidIntrinsicImageSize(width, height)) {
    return { width: width as number, height: height as number }
  }

  const viewBoxMatch = svgTag.match(
    /\bviewBox\s*=\s*["']\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*["']/i
  )
  if (!viewBoxMatch) {
    return null
  }

  const viewBoxWidth = Number(viewBoxMatch[1])
  const viewBoxHeight = Number(viewBoxMatch[2])
  return isValidIntrinsicImageSize(viewBoxWidth, viewBoxHeight)
    ? { width: viewBoxWidth, height: viewBoxHeight }
    : null
}

function parseSvgLength(
  svgTag: string,
  attributeName: "width" | "height"
): number | null {
  const match = svgTag.match(
    new RegExp(`\\b${attributeName}\\s*=\\s*["']\\s*([-+]?\\d*\\.?\\d+)`, "i")
  )
  if (!match) {
    return null
  }

  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}

function readUint16(binary: Uint8Array, offset: number): number {
  return ((binary[offset] ?? 0) << 8) | (binary[offset + 1] ?? 0)
}

function readUint24(binary: Uint8Array, offset: number): number {
  return (
    ((binary[offset] ?? 0) << 16) |
    ((binary[offset + 1] ?? 0) << 8) |
    (binary[offset + 2] ?? 0)
  )
}

function readUint32(binary: Uint8Array, offset: number): number {
  return (
    (binary[offset] ?? 0) * 2 ** 24 +
    ((binary[offset + 1] ?? 0) << 16) +
    ((binary[offset + 2] ?? 0) << 8) +
    (binary[offset + 3] ?? 0)
  )
}

function readAscii(binary: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...binary.slice(offset, offset + length))
}

function isValidIntrinsicImageSize(
  width: number | null | undefined,
  height: number | null | undefined
): width is number {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  )
}
