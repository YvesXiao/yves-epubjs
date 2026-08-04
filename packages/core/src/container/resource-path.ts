const ABSOLUTE_URL_PATTERN = /^([a-zA-Z][a-zA-Z\d+.-]*):/
const PRESERVED_EMBEDDED_RESOURCE_SCHEMES = new Set([
  "http",
  "https",
  "data",
  "blob"
])

export function normalizeResourcePath(path: string): string {
  return path.replace(/^\.?\//, "").replace(/\\/g, "/")
}

export function resolveResourcePath(base: string, relative: string): string {
  if (!relative) {
    return normalizeResourcePath(base)
  }

  if (relative.startsWith("#")) {
    return `${normalizeResourcePath(base).split("#", 1)[0] ?? normalizeResourcePath(base)}${relative}`
  }

  if (isPreservedEmbeddedResourceUrl(relative)) {
    return relative.trim()
  }

  if (relative.startsWith("/")) {
    return normalizeResourcePath(relative)
  }

  const [relativePath, suffix = ""] = relative.split(/(?=[?#])/, 2)
  const normalizedBase = normalizeResourcePath(base)
  const baseParts = normalizeResourcePath(base).split("/").slice(0, -1)
  const nextParts = (relativePath || "").split("/")

  for (const part of nextParts) {
    if (!part || part === ".") {
      continue
    }

    if (part === "..") {
      baseParts.pop()
      continue
    }

    baseParts.push(part)
  }

  const resolvedPath = relativePath
    ? normalizeResourcePath(baseParts.join("/"))
    : normalizedBase
  return `${resolvedPath}${suffix}`
}

function isPreservedEmbeddedResourceUrl(value: string): boolean {
  const normalized = value.trim()
  if (normalized.startsWith("//")) {
    return true
  }

  const scheme = normalized.match(ABSOLUTE_URL_PATTERN)?.[1]?.toLowerCase()
  return Boolean(scheme && PRESERVED_EMBEDDED_RESOURCE_SCHEMES.has(scheme))
}
