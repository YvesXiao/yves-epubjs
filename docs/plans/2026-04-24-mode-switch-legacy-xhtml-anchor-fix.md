# Scroll/Paginated Legacy XHTML Anchor Fix

**Date**: 2026-04-24

## Problem

The existing mode-switch anchoring flow captures a locator before changing
between `scroll` and `paginated`. It works when the viewport probe lands on a
rendered element with an `id`, `name`, or `data-reader-block-id`.

The `剑指Offer` EPUB exposes a gap in that strategy. Its spine is made of a few
very large XHTML files, and visible paragraphs often look like this:

```html
<span id="filepos0000203096"></span>
<p>...</p>
```

The visible `<p>` has no `id`. The current DOM point mapper only collects
identified targets, so a probe inside that paragraph falls back to
`progressInSection`. With very large sections, that progress fallback can land
many paginated pages away from the visible text.

## Main Flow

`EpubReader.applyPreferences()` remains the only owner of mode switching:

1. Capture a mode-switch locator from the old rendered mode.
2. Apply the new reading mode.
3. Re-render through the existing render orchestrator.
4. Restore using the same locator through the existing paginated/scroll paths.

The fix stays inside core runtime DOM locator mapping. Demo code should not add
its own positioning workaround.

## Fix Plan

### Task 0: Real Book Reproduction

**Status**: `completed`

Run the demo against
`/Users/xyf/Downloads/books/剑指Offer_名企面试官精讲典型编程题_--_何海涛_--_2011_--_电子工业出版社_--_214aa1542d6778be54e208760805863d_--_Anna’s_Archive.epub`
and compare the visible reader text before and after mode switching.

The observed failure was:

1. Scroll mode centered around `常规的解法：把构造函数设为私有函数`.
2. Switching to paginated landed at `目 录 / 第1章 面试的流程`.
3. Switching back to scroll stayed near `1.2.3 现场面试`.

Root cause: during `scroll -> paginated`, the captured locator existed but
`resolveRenderedPage()` preferred `currentPageNumber` for the same section.
In scroll mode `currentPageNumber` is only the section number, so the first large
section was interpreted as paginated page 1.

### Task 1: Extend DOM Point Mapping

**Status**: `completed`

When a point does not hit an identified DOM target, look for a visible block-like
element containing the point, such as `p`, headings, `blockquote`, `pre`,
`figure`, `img`, lists, tables, and related flow content.

If that block-like element has no direct id, resolve the nearest preceding
empty anchor sibling or descendant anchor whose id is known in
`section.anchors`.

### Task 2: Preserve Existing Locator Priority

**Status**: `completed`

Return a locator with `anchorId` and the parser-resolved `blockId` when the
preceding anchor can be matched. This lets the existing `findPageForLocator()`
and `scrollToCurrentLocation()` continue to own recovery.

Do not introduce a separate page-number or scroll-ratio conversion path.

### Task 3: Add Regression Coverage

**Status**: `completed`

Add a focused core test with legacy XHTML markup where a visible paragraph has
no id but is preceded by an empty anchor span. The test must assert that
DOM point mapping returns the anchor and block, not only section
progress.

### Task 4: Verify Targeted Core Behavior

**Status**: `completed`

Run the focused tests that cover DOM viewport mapping and mode-switch anchoring.

### Task 5: Prefer Pending Mode-Switch Locator During Paginated Resolution

**Status**: `completed`

When `pendingModeSwitchLocator` is present, resolve the paginated render page
from that locator before consulting `currentPageNumber`. This keeps the mode
switch transaction anchored to the visible content rather than to the old scroll
section number.

### Task 6: Clear Stale DOM When Reusing Canvas Wrappers

**Status**: `completed`

The real-book screenshot showed table-of-contents/body text visually stacked on
top of later canvas content. The renderer could reuse an `article` that had
previously been rendered as DOM, switch its class to `epub-section-canvas`, and
append canvas/text-layer children without clearing the old DOM children.

When a scroll section wrapper is reused for canvas rendering, clear the wrapper
first unless it was already a canvas wrapper. This keeps same-mode canvas slice
reuse intact while preventing DOM leftovers from being painted underneath the
new canvas layer.

### Task 7: Tighten Paginated-to-Scroll Relocation

**Status**: `completed`

When the viewport center lands between transparent canvas text runs, resolve the
nearest visible `.epub-text-run` instead of falling back to a coarse section
progress locator.

When returning to scroll mode, center the pending mode-switch locator in the
viewport. If that block is outside the currently rendered scroll slices, compute
its position from the full scroll layout before falling back to section
progress. After the relocation, refresh scroll slices immediately so the
viewport is not left on an uncovered virtualized area.

## Verification

Passed:

```bash
pnpm exec vitest run packages/core/test/dom-viewport-mapper.test.ts
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts -t "uses the captured scroll locator"
pnpm exec vitest run packages/core/test/canvas-renderer.test.ts packages/core/test/reader-runtime-navigation.test.ts -t "clears stale DOM children|uses the captured scroll locator"
pnpm exec vitest run packages/core/test/reader-hybrid-navigation.test.ts
pnpm --filter @yves-epub/core typecheck
pnpm --filter @yves-epub/demo build
pnpm lint
```

Real-book browser validation passed:

```bash
BOOK_PATH="/Users/xyf/Downloads/books/剑指Offer_名企面试官精讲典型编程题_--_何海涛_--_2011_--_电子工业出版社_--_214aa1542d6778be54e208760805863d_--_Anna’s_Archive.epub" \
pnpm exec playwright test packages/demo/e2e/external-book-mode-switch.spec.js --reporter=line
```

Observed after the fix:

1. Scroll mode centered around `常规的解法：把构造函数设为私有函数`.
2. Paginated mode visible text still includes that same heading and surrounding
   section text.
3. Switching back to scroll lands around `7.1 案例一：（面试题49）把字符串转换成整数`
   with the original `常规的解法：把构造函数设为私有函数` still visible in the
   same viewport context.
4. The real-book overlap detector reported `overlapCount: 0` before switching,
   in paginated mode, and after switching back.

## Acceptance Criteria

1. A viewport point inside an un-id-ed paragraph preceded by an EPUB filepos
   anchor resolves to `anchorId` plus the parser block id.
2. Existing id-based DOM and canvas locator behavior remains unchanged.
3. Mode switching still uses one captured locator transaction.
4. Focused core tests pass.
5. DOM-to-canvas wrapper reuse does not leave stale visible children behind.
