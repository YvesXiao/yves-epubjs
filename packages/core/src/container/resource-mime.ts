const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  gif: "image/gif",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "application/javascript",
  json: "application/json",
  ncx: "application/x-dtbncx+xml",
  opf: "application/oebps-package+xml",
  otf: "font/otf",
  png: "image/png",
  smil: "application/smil+xml",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xml: "application/xml"
}

export function getExtension(path: string): string | null {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? ""
  const fileName = cleanPath.split("/").pop() ?? ""
  const extension = fileName.split(".").pop()

  if (!extension || extension === fileName) {
    return null
  }

  return extension.toLowerCase()
}

export function getMimeTypeFromPath(path: string): string | null {
  const extension = getExtension(path)

  if (!extension) {
    return null
  }

  return MIME_BY_EXTENSION[extension] ?? null
}
