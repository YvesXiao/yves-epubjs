import type {
  Book,
  ReadingDirection,
  ReadingNavigationContext,
  ReadingLanguageContext,
  SectionDocument
} from "../model/types"

const RTL_LANGUAGE_PREFIXES = new Set([
  "ar",
  "dv",
  "fa",
  "he",
  "ku",
  "ps",
  "ug",
  "ur",
  "yi"
])

export function resolveReadingLanguageContext(input: {
  book: Book
  section: SectionDocument
  spineIndex: number
  experimentalRtl: boolean
}): ReadingLanguageContext {
  const resolvedLanguage = input.section.lang ?? input.book.metadata.language
  const contentDirection =
    input.section.dir ??
    inferReadingDirectionFromLanguage(resolvedLanguage) ??
    "ltr"
  const rtlSuggested = contentDirection === "rtl"

  return {
    spineIndex: input.spineIndex,
    sectionId: input.section.id,
    sectionHref: input.section.href,
    ...(input.book.metadata.language
      ? { bookLanguage: input.book.metadata.language }
      : {}),
    ...(input.section.lang ? { sectionLanguage: input.section.lang } : {}),
    ...(resolvedLanguage ? { resolvedLanguage } : {}),
    contentDirection,
    rtlSuggested,
    rtlActive: input.experimentalRtl && rtlSuggested
  }
}

export function resolveReadingNavigationContext(input: {
  languageContext: ReadingLanguageContext
}): ReadingNavigationContext {
  const pageProgression = input.languageContext.rtlActive ? "rtl" : "ltr"

  return {
    spineIndex: input.languageContext.spineIndex,
    sectionId: input.languageContext.sectionId,
    sectionHref: input.languageContext.sectionHref,
    contentDirection: input.languageContext.contentDirection,
    pageProgression,
    rtlActive: input.languageContext.rtlActive,
    previousPageKey: pageProgression === "rtl" ? "ArrowRight" : "ArrowLeft",
    nextPageKey: pageProgression === "rtl" ? "ArrowLeft" : "ArrowRight"
  }
}

export function inferReadingDirectionFromLanguage(
  language: string | undefined
): ReadingDirection | undefined {
  if (!language) {
    return undefined
  }

  const normalized = language.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  const prefix = normalized.split(/[-_]/)[0]
  return prefix && RTL_LANGUAGE_PREFIXES.has(prefix) ? "rtl" : "ltr"
}
