import { nanoid } from "nanoid"
import type { Bookmark, Book, Locator, SerializedLocator } from "../model/types"
import { deserializeLocator, serializeLocator } from "./locator"

export function createBookmark(input: {
  publicationId: string
  locator: Locator
  book?: Book
  label?: string
  excerpt?: string
  createdAt?: string
}): Bookmark {
  return {
    id: nanoid(),
    publicationId: input.publicationId,
    locator: serializeLocator({
      locator: input.locator,
      generateCfi: true,
      ...(input.book ? { book: input.book } : {})
    }),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.excerpt?.trim() ? { excerpt: input.excerpt.trim() } : {})
  }
}

export function serializeBookmark(bookmark: Bookmark): string {
  return JSON.stringify(bookmark)
}

export function deserializeBookmark(raw: unknown): Bookmark | null {
  const value = parseBookmarkValue(raw)
  if (!value || typeof value !== "object") {
    return null
  }

  const id =
    typeof value.id === "string" && value.id.trim() ? value.id.trim() : null
  const publicationId =
    typeof value.publicationId === "string" && value.publicationId.trim()
      ? value.publicationId.trim()
      : null
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim()
      ? value.createdAt.trim()
      : null
  const locator = deserializeLocator(value.locator)

  if (!id || !publicationId || !createdAt || !locator) {
    return null
  }

  return {
    id,
    publicationId,
    locator,
    createdAt,
    ...(typeof value.label === "string" && value.label.trim()
      ? { label: value.label.trim() }
      : {}),
    ...(typeof value.excerpt === "string" && value.excerpt.trim()
      ? { excerpt: value.excerpt.trim() }
      : {})
  }
}

export function derivePublicationId(input: {
  book: Book
  sourceName?: string
}): string {
  const identifier = input.book.metadata.identifier?.trim()
  if (identifier) {
    return `identifier:${identifier}`
  }

  const title = input.book.metadata.title?.trim() || "untitled"
  const sourceName = input.sourceName?.trim()
  return sourceName ? `title:${title}::source:${sourceName}` : `title:${title}`
}

function parseBookmarkValue(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }

  return raw && typeof raw === "object"
    ? (raw as Record<string, unknown>)
    : null
}

export type { SerializedLocator }
