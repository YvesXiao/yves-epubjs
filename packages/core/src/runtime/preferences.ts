import type {
  PublisherColorOverride,
  ReaderSpreadMode,
  PublisherStylesMode,
  ReaderPreferences,
  ReaderSettings,
  ReadingMode,
  Theme,
  TypographyOptions
} from "../model/types"

export const DEFAULT_THEME: Theme = {
  color: "#1f2328",
  background: "#fffdf7"
}

export const DEFAULT_TYPOGRAPHY: TypographyOptions = {
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: 12,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
  letterSpacing: 0,
  wordSpacing: 0
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  mode: "scroll",
  publisherStyles: "enabled",
  publisherColorOverride: "none",
  experimentalRtl: false,
  spreadMode: "auto",
  theme: { ...DEFAULT_THEME },
  typography: { ...DEFAULT_TYPOGRAPHY }
}

export function normalizeReaderPreferences(
  preferences: ReaderPreferences | null | undefined
): ReaderPreferences {
  if (!preferences) {
    return {}
  }

  const normalized: ReaderPreferences = {}
  if (isReadingMode(preferences.mode)) {
    normalized.mode = preferences.mode
  }
  if (isPublisherStylesMode(preferences.publisherStyles)) {
    normalized.publisherStyles = preferences.publisherStyles
  }
  if (isPublisherColorOverride(preferences.publisherColorOverride)) {
    normalized.publisherColorOverride = preferences.publisherColorOverride
  }
  if (typeof preferences.experimentalRtl === "boolean") {
    normalized.experimentalRtl = preferences.experimentalRtl
  }
  if (isReaderSpreadMode(preferences.spreadMode)) {
    normalized.spreadMode = preferences.spreadMode
  }

  const theme = normalizeThemePreferences(preferences.theme)
  if (theme) {
    normalized.theme = theme
  }

  const typography = normalizeTypographyPreferences(preferences.typography)
  if (typography) {
    normalized.typography = typography
  }

  return normalized
}

export function mergeReaderPreferences(
  base: ReaderPreferences | null | undefined,
  next: ReaderPreferences | null | undefined
): ReaderPreferences {
  const normalizedBase = normalizeReaderPreferences(base)
  const normalizedNext = normalizeReaderPreferences(next)

  return normalizeReaderPreferences({
    ...((normalizedNext.mode ?? normalizedBase.mode)
      ? { mode: normalizedNext.mode ?? normalizedBase.mode }
      : {}),
    ...((normalizedNext.publisherStyles ?? normalizedBase.publisherStyles)
      ? {
          publisherStyles:
            normalizedNext.publisherStyles ?? normalizedBase.publisherStyles
        }
      : {}),
    ...((normalizedNext.publisherColorOverride ??
    normalizedBase.publisherColorOverride)
      ? {
          publisherColorOverride:
            normalizedNext.publisherColorOverride ??
            normalizedBase.publisherColorOverride
        }
      : {}),
    ...((normalizedNext.experimentalRtl ?? normalizedBase.experimentalRtl) !==
    undefined
      ? {
          experimentalRtl:
            normalizedNext.experimentalRtl ?? normalizedBase.experimentalRtl
        }
      : {}),
    ...((normalizedNext.spreadMode ?? normalizedBase.spreadMode)
      ? { spreadMode: normalizedNext.spreadMode ?? normalizedBase.spreadMode }
      : {}),
    theme: {
      ...normalizedBase.theme,
      ...normalizedNext.theme
    },
    typography: {
      ...normalizedBase.typography,
      ...normalizedNext.typography
    }
  })
}

export function resolveReaderSettings(
  preferences: ReaderPreferences | null | undefined,
  defaults: ReaderSettings = DEFAULT_READER_SETTINGS
): ReaderSettings {
  const normalized = normalizeReaderPreferences(preferences)

  return {
    mode: normalized.mode ?? defaults.mode,
    publisherStyles: normalized.publisherStyles ?? defaults.publisherStyles,
    publisherColorOverride:
      normalized.publisherColorOverride ?? defaults.publisherColorOverride,
    experimentalRtl: normalized.experimentalRtl ?? defaults.experimentalRtl,
    spreadMode: normalized.spreadMode ?? defaults.spreadMode,
    theme: {
      ...defaults.theme,
      ...normalized.theme
    },
    typography: {
      ...defaults.typography,
      ...normalized.typography
    }
  }
}

export function serializeReaderPreferences(
  preferences: ReaderPreferences
): string {
  return JSON.stringify(normalizeReaderPreferences(preferences))
}

export function deserializeReaderPreferences(
  value: string | null | undefined
): ReaderPreferences | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as ReaderPreferences
    return normalizeReaderPreferences(parsed)
  } catch {
    return null
  }
}

function normalizeThemePreferences(
  theme: Partial<Theme> | null | undefined
): Partial<Theme> | undefined {
  if (!theme) {
    return undefined
  }

  const normalized: Partial<Theme> = {}
  if (
    typeof theme.background === "string" &&
    theme.background.trim().length > 0
  ) {
    normalized.background = theme.background
  }
  if (typeof theme.color === "string" && theme.color.trim().length > 0) {
    normalized.color = theme.color
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeTypographyPreferences(
  typography: Partial<TypographyOptions> | null | undefined
): Partial<TypographyOptions> | undefined {
  if (!typography) {
    return undefined
  }

  const normalized: Partial<TypographyOptions> = {}
  if (isFinitePositiveNumber(typography.fontSize)) {
    normalized.fontSize = typography.fontSize
  }
  if (isFinitePositiveNumber(typography.lineHeight)) {
    normalized.lineHeight = typography.lineHeight
  }
  if (isFiniteNonNegativeNumber(typography.paragraphSpacing)) {
    normalized.paragraphSpacing = typography.paragraphSpacing
  }
  if (
    typeof typography.fontFamily === "string" &&
    typography.fontFamily.trim().length > 0
  ) {
    normalized.fontFamily = typography.fontFamily.trim()
  }
  if (isFiniteNumber(typography.letterSpacing)) {
    normalized.letterSpacing = typography.letterSpacing
  }
  if (isFiniteNumber(typography.wordSpacing)) {
    normalized.wordSpacing = typography.wordSpacing
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function isFinitePositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isFiniteNonNegativeNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isReadingMode(value: string | undefined): value is ReadingMode {
  return value === "scroll" || value === "paginated"
}

function isPublisherStylesMode(
  value: string | undefined
): value is PublisherStylesMode {
  return value === "enabled" || value === "disabled"
}

function isPublisherColorOverride(
  value: string | undefined
): value is PublisherColorOverride {
  return value === "none" || value === "foreground"
}

function isReaderSpreadMode(
  value: string | undefined
): value is ReaderSpreadMode {
  return value === "auto" || value === "none" || value === "always"
}
