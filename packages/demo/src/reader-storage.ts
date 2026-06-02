import {
  deserializeBookmark,
  deserializeReaderPreferences,
  mergeReaderPreferences,
  normalizeReaderPreferences,
  serializeBookmark,
  type Bookmark,
  type ReaderPreferences
} from "@yves-epub/core";

const DEMO_GLOBAL_PREFERENCES_STORAGE_KEY = "yves-epub:preferences:global";
const LEGACY_GLOBAL_PREFERENCES_STORAGE_KEY =
  "pretext-epub:preferences:global";

export function defaultFontFamily(): string {
  return '"Iowan Old Style", "Palatino Linotype", serif';
}

export function persistBookmark(bookmark: Bookmark): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    bookmarkStorageKey(bookmark.publicationId),
    serializeBookmark(bookmark)
  );
}

export function loadBookmark(publicationId: string): Bookmark | null {
  if (typeof window === "undefined") {
    return null;
  }

  return deserializeBookmark(
    getStorageItemWithLegacy(
      bookmarkStorageKey(publicationId),
      legacyBookmarkStorageKey(publicationId)
    )
  );
}

export function persistReaderPreferences(input: {
  preferences: ReaderPreferences;
  publicationId?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeReaderPreferences(input.preferences);
  const globalPreferences = pickGlobalReaderPreferences(normalized);
  const bookPreferences = pickPublicationReaderPreferences(normalized);

  window.localStorage.setItem(
    DEMO_GLOBAL_PREFERENCES_STORAGE_KEY,
    JSON.stringify(globalPreferences)
  );

  if (input.publicationId) {
    window.localStorage.setItem(
      readerPreferenceStorageKey(input.publicationId),
      JSON.stringify(bookPreferences)
    );
  }
}

export function loadStoredGlobalReaderPreferences(): ReaderPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  return deserializeReaderPreferences(
    getStorageItemWithLegacy(
      DEMO_GLOBAL_PREFERENCES_STORAGE_KEY,
      LEGACY_GLOBAL_PREFERENCES_STORAGE_KEY
    )
  );
}

export function loadStoredReaderPreferences(
  publicationId?: string
): ReaderPreferences | null {
  const globalPreferences = loadStoredGlobalReaderPreferences();
  if (typeof window === "undefined" || !publicationId) {
    return globalPreferences;
  }

  const bookPreferences = deserializeReaderPreferences(
    getStorageItemWithLegacy(
      readerPreferenceStorageKey(publicationId),
      legacyReaderPreferenceStorageKey(publicationId)
    )
  );
  return mergeReaderPreferences(globalPreferences, bookPreferences);
}

function bookmarkStorageKey(publicationId: string): string {
  return `yves-epub:bookmark:${publicationId}`;
}

function legacyBookmarkStorageKey(publicationId: string): string {
  return `pretext-epub:bookmark:${publicationId}`;
}

function readerPreferenceStorageKey(publicationId: string): string {
  return `yves-epub:preferences:book:${publicationId}`;
}

function legacyReaderPreferenceStorageKey(publicationId: string): string {
  return `pretext-epub:preferences:book:${publicationId}`;
}

function getStorageItemWithLegacy(
  storageKey: string,
  legacyStorageKey: string
): string | null {
  const value = window.localStorage.getItem(storageKey);
  if (value !== null) {
    return value;
  }

  const legacyValue = window.localStorage.getItem(legacyStorageKey);
  if (legacyValue !== null) {
    window.localStorage.setItem(storageKey, legacyValue);
  }
  return legacyValue;
}

function pickGlobalReaderPreferences(
  preferences: ReaderPreferences
): ReaderPreferences {
  return normalizeReaderPreferences({
    ...(preferences.theme ? { theme: preferences.theme } : {}),
    ...(preferences.typography ? { typography: preferences.typography } : {})
  });
}

function pickPublicationReaderPreferences(
  preferences: ReaderPreferences
): ReaderPreferences {
  return normalizeReaderPreferences({
    ...(preferences.mode ? { mode: preferences.mode } : {}),
    ...(preferences.publisherStyles
      ? { publisherStyles: preferences.publisherStyles }
      : {}),
    ...(preferences.publisherColorOverride
      ? { publisherColorOverride: preferences.publisherColorOverride }
      : {}),
    ...(preferences.experimentalRtl !== undefined
      ? { experimentalRtl: preferences.experimentalRtl }
      : {}),
    ...(preferences.spreadMode ? { spreadMode: preferences.spreadMode } : {})
  });
}
