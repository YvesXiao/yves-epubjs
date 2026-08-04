export type EpubInput = File | Blob | ArrayBuffer | Uint8Array

export type NormalizedEpubInput = {
  data: Uint8Array
  sourceName?: string
  mediaType?: string
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  const blobWithArrayBuffer = blob as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>
  }

  if (typeof blobWithArrayBuffer.arrayBuffer === "function") {
    return new Uint8Array(await blobWithArrayBuffer.arrayBuffer())
  }

  if (typeof FileReader !== "undefined") {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader()

      reader.onerror = () => {
        reject(reader.error ?? new TypeError("Failed to read Blob input."))
      }

      reader.onload = () => {
        const result = reader.result

        if (!(result instanceof ArrayBuffer)) {
          reject(new TypeError("Blob input did not resolve to an ArrayBuffer."))
          return
        }

        resolve(new Uint8Array(result))
      }

      reader.readAsArrayBuffer(blob)
    })
  }

  throw new TypeError("Blob input cannot be converted to binary data.")
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob
}

function isFileLike(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File
}

export async function normalizeEpubInput(
  input: EpubInput
): Promise<NormalizedEpubInput> {
  if (input instanceof Uint8Array) {
    return { data: input }
  }

  if (input instanceof ArrayBuffer) {
    return { data: new Uint8Array(input) }
  }

  if (isFileLike(input)) {
    return {
      data: await readBlobBytes(input),
      sourceName: input.name,
      mediaType: input.type || "application/epub+zip"
    }
  }

  if (isBlobLike(input)) {
    return {
      data: await readBlobBytes(input),
      mediaType: input.type || "application/epub+zip"
    }
  }

  throw new TypeError(
    "Unsupported EPUB input. Expected File, Blob, ArrayBuffer, or Uint8Array."
  )
}
