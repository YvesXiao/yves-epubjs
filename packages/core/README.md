# @yves-epub/core

English | [简体中文](README.zh-CN.md)

Browser EPUB reader engine with parsing, normalized book models, hybrid rendering, navigation, search, bookmarks, annotations, preferences, and diagnostics.

This package only provides the reader core. The host application owns bookshelf UX, accounts, file sourcing, persistence, permissions, external-link policy, and product UI.

## Install

```bash
npm install @yves-epub/core
```

With pnpm:

```bash
pnpm add @yves-epub/core
```

## Capabilities

- Input: `File`, `Blob`, `ArrayBuffer`, and `Uint8Array`.
- Parsing: `container.xml`, OPF, NAV, NCX, XHTML, manifest, spine, metadata, and TOC.
- Model: `Book`, `SectionDocument`, `Locator`, `Bookmark`, `Annotation`, and related domain objects.
- Reading modes: `scroll` and `paginated`.
- Rendering: per-section `canvas` or `dom` backend selection. Simple reflowable sections prefer `canvas`; complex structures, fixed-layout content, covers, and single-image pages can fall back to `dom`.
- Navigation: next and previous page, page number jumps, TOC jumps, href jumps, search result jumps, and progress jumps.
- Runtime state: reading progress, pagination info, preferences, bookmark restore, and location restore diagnostics.
- Markup: decorations, search highlights, text selection snapshots, annotation creation, and annotation viewport snapshots.
- Diagnostics: render backend, fallback reasons, layout authority, interaction model, and visible-section diagnostics.

## Minimal Usage

```ts
import { EpubReader } from "@yves-epub/core"

const container = document.getElementById("reader")
const file = fileInput.files?.[0]

if (!container || !file) {
  throw new Error("Missing reader container or EPUB file")
}

const reader = new EpubReader({
  container,
  preferences: {
    mode: "scroll",
    publisherStyles: "enabled",
    typography: {
      fontSize: 18,
      lineHeight: 1.6
    }
  },
  allowExternalEmbeddedResources: true,
  onExternalLink: ({ href }) => {
    window.open(href, "_blank", "noopener,noreferrer")
  }
})

const offRelocated = reader.on("relocated", ({ locator }) => {
  localStorage.setItem("lastLocator", JSON.stringify(locator))
})

await reader.open(file)
await reader.render()

const results = await reader.search("keyword")
if (results[0]) {
  await reader.goToSearchResult(results[0])
}

const bookmark = reader.createBookmark({ label: "last read" })
if (bookmark) {
  localStorage.setItem(
    `bookmark:${bookmark.publicationId}`,
    JSON.stringify(bookmark)
  )
}

offRelocated()
reader.destroy()
```

## Recommended Host Wrapper

For product use, wrap `EpubReader` behind a host-side controller instead of spreading the instance across UI components.

1. Lifecycle layer: create the reader, subscribe to events, open a book, render the first view, and destroy the instance.
2. State sync layer: mirror `getCurrentLocation()`, `getPaginationInfo()`, `getRenderMetrics()`, and `getSettings()` into host state.
3. Persistence layer: store preferences, bookmark, last locator, and annotations by `publicationId`.
4. UI action layer: map toolbar, TOC, search, typography, theme, and annotation controls to reader methods.
5. Error boundary layer: catch failures from `open()`, `render()`, location restore, search, and preference changes.

The repository demo includes a React reference controller at `packages/demo/src/use-reader-controller.ts`.

## Main API

Lifecycle:

- `open(input)`: opens EPUB input and returns `Book`.
- `render()`: renders the current location.
- `destroy()`: destroys the instance and cleans resources.
- `getBook()`: returns the current `Book`.
- `getPublicationId()`: returns the derived publication identity.

Navigation and location:

- `next()` and `prev()`: move to the next or previous page. In scroll mode, these move by section.
- `goToPage(pageNumber)`: jumps to a paginated page.
- `goToLocation(locator)`: jumps to a precise location.
- `restoreLocation(locator)`: restores from `Locator` or `SerializedLocator`.
- `goToTocItem(id)`: jumps by TOC id.
- `goToHref(href)`: jumps by internal book href.
- `goToProgress(progress)`: jumps by whole-book progress.
- `getCurrentLocation()`: returns the current locator.
- `getReadingProgress()`: returns whole-book and section progress.
- `getPaginationInfo()`: returns `currentPage` and `totalPages`.

Search, bookmarks, and annotations:

- `search(query)`: searches the whole book and writes search decorations.
- `goToSearchResult(result)`: jumps to a search result.
- `createBookmark(input?)`: creates a bookmark from the current location.
- `restoreBookmark(bookmark)`: restores a bookmark.
- `createAnnotation(input?)`: creates an annotation from a locator.
- `createAnnotationFromSelection(input?)`: creates an annotation from the current text selection.
- `setAnnotations(annotations)`: replaces runtime annotations.
- `getAnnotationViewportSnapshots()`: returns annotation viewport mappings.

Preferences and diagnostics:

- `submitPreferences(preferences)`: merges and applies preferences.
- `restorePreferences(preferencesOrString)`: restores preferences from an object or serialized string.
- `getSettings()`: returns preferences merged with defaults.
- `hitTest(point)`: resolves a viewport point to a link, image, or text block.
- `mapLocatorToViewport(locator)`: maps a locator to viewport rectangles.
- `mapViewportToLocator(point)`: maps a viewport point to a locator.
- `getRenderMetrics()`: returns render metrics.
- `getRenderDiagnostics()`: returns current section render diagnostics.
- `getVisibleSectionDiagnostics()`: returns visible section diagnostics.

## Types

```ts
import type {
  Annotation,
  Bookmark,
  Book,
  Locator,
  ReaderPreferences,
  ReaderSettings,
  SearchResult,
  SectionDocument,
  Theme,
  TypographyOptions
} from "@yves-epub/core"
```

`Locator` is the main location protocol:

```ts
type Locator = {
  spineIndex: number
  blockId?: string
  anchorId?: string
  inlineOffset?: number
  cfi?: string
  progressInSection?: number
}
```

## Best Practices

Lifecycle: keep one `EpubReader` instance per reading container. Reuse the instance for a new book by running `open()` and `render()` again. In React, unsubscribe every `on()` listener before `destroy()`.

Persistence: the engine returns persistable objects and does not write to localStorage or a database. Store `preferences`, `lastLocator`, `bookmark`, and `annotations` by `publicationId`.

Remote images: embedded resources default to packaged EPUB resources, `data:`, and `blob:`. Remote `http:` and `https:` image URLs are replaced with `data:,` unless `allowExternalEmbeddedResources: true` is set. When enabled, the DOM backend allows `http:`, `https:`, and protocol-relative URLs. Other schemes remain blocked.

Diagnostics: when debugging real EPUB files, start with `getRenderMetrics()`, `getRenderDiagnostics()`, and `getVisibleSectionDiagnostics()`.

## Current Boundaries

- DRM and LCP: no license handling, decryption, or protected content pipeline.
- OPDS: no online catalog discovery, distribution, or download protocol.
- Media Overlay: no audio and text timeline synchronization.
- TTS: no built-in speech engine.
- Full bookshelf product: the repository demo is for engine validation.
- Full fixed-layout product experience: fixed-layout, cover, image-page, and spread support exist, but real-book regression remains necessary.
