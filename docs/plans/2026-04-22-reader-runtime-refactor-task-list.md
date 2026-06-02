# Reader Runtime Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce `packages/core/src/runtime/reader.ts` engineering risk without changing reader behavior.

**Architecture:** Keep `EpubReader` as the public facade and extract internal runtime domains in phases. Each phase must preserve existing behavior, land with focused tests, and keep `scroll`, `paginated`, `dom`, and `canvas` paths stable.

**Tech Stack:** TypeScript, Vitest, DOM/Canvas runtime, existing `EpubReader` tests

---

## Constraints

- Do not change public `EpubReader` API semantics.
- Complete one task at a time.
- Every task must end with targeted verification before the next task starts.
- Prefer extraction by state domain, not by file size.
- Preserve current render, navigation, interaction, and annotation behavior.

## State Matrix

| State | Operation | Expected Result |
| --- | --- | --- |
| `idle` | `open()` | Initialize runtime state and register listeners once |
| `opened` | `render()` | Dispatch to render orchestration without duplicate side effects |
| `rendered-scroll` | `scroll` | Update visible window and locator, no duplicate listeners |
| `rendered-paginated` | `click/keydown` | Navigate or emit center-tap exactly once |
| `rendered-*` | `goToHref/goToProgress/goToLocation` | Update locator and render target consistently |
| `rendered-*` | `destroy()` | Remove all listeners, clear container state, stop further interaction |
| `destroyed` | DOM events | No side effects, no duplicate callbacks |

## Task 1: Close Reader Lifecycle Event Symmetry

**Status:** `completed`

**Why:** This is the highest-confidence engineering risk in the current file. Container listeners are attached with anonymous handlers and are not symmetrically removed on `destroy()`.

**Files:**
- Modify: `packages/core/src/runtime/reader.ts`
- Add Test: `packages/core/test/reader-lifecycle.test.ts`

**Implementation:**
1. Replace anonymous `scroll`, `click`, and `keydown` listeners with named handler fields on `EpubReader`.
2. Add explicit `detachScrollListener()`, `detachPointerListener()`, `detachKeyboardListener()`, and call them from `destroy()`.
3. Keep listener registration timing unchanged.

**Verification:**
```powershell
pnpm.cmd vitest run packages/core/test/reader-lifecycle.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
```

**Done When:**
- Recreating a reader on the same container does not duplicate interaction callbacks.
- `destroy()` fully disables container-driven navigation and interaction.

## Task 2: Extract Reader Interaction Controller

**Status:** `completed`

**Why:** Input handling currently mixes DOM hit-testing, paginated click navigation, link activation, annotation selection, and keyboard handling in `reader.ts`.

**Files:**
- Add: `packages/core/src/runtime/reader-interaction-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Update Test: `packages/core/test/reader-runtime-navigation.test.ts`
- Update Test: `packages/core/test/reader-chapter-render-routing.test.ts`
- Update Test: `packages/core/test/reader-lifecycle.test.ts`

**Implementation:**
1. Move container event handling entrypoints and listener attach/detach logic into `ReaderInteractionController`.
2. Keep `EpubReader` as the owner of public APIs and runtime state.
3. Pass only the dependencies needed by interaction logic instead of the full reader instance.
4. Keep DOM click and canvas click behavior identical.

**Verification:**
```powershell
pnpm.cmd vitest run packages/core/test/reader-lifecycle.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-chapter-render-routing.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
```

**Done When:**
- `reader.ts` no longer owns raw `click` / `keydown` / `scroll` event bodies.
- Existing paginated click, link activation, and keyboard navigation behavior remains unchanged.

## Task 3: Extract Reader Navigation Controller

**Status:** `completed`

**Why:** Locator, href, page, and progress transitions form a distinct state domain and currently share a file with rendering and interaction concerns.

**Files:**
- Add: `packages/core/src/runtime/reader-navigation-controller.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Update Test: `packages/core/test/reader-navigation.test.ts`
- Update Test: `packages/core/test/reader-runtime-navigation.test.ts`
- Update Test: `packages/core/test/reader-hybrid-navigation.test.ts`
- Update Test: `packages/core/test/reader-hybrid-progress.test.ts`
- Update Test: `packages/core/test/navigation-target.test.ts`

**Implementation:**
1. Move `goToLocation`, `restoreLocation`, `goToPage`, `goToProgress`, `goToHref`, `resolveHrefLocator`, and progress snapshot logic into `ReaderNavigationController`.
2. Keep state writes explicit through reader-owned callbacks.
3. Preserve current scroll and paginated progress semantics.

**Verification:**
```powershell
pnpm.cmd vitest run packages/core/test/reader-navigation.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-hybrid-progress.test.ts packages/core/test/navigation-target.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
```

**Done When:**
- Navigation and progress logic is isolated from raw render code.
- Existing locator, href, and progress tests remain green.

## Task 4: Extract Reader Render Orchestrator

**Status:** `completed`

**Why:** `renderCurrentSection()` currently mixes orchestration, render mode choice, layout, DOM/canvas branching, and post-render locator syncing.

**Files:**
- Add: `packages/core/src/runtime/reader-render-orchestrator.ts`
- Modify: `packages/core/src/runtime/reader.ts`
- Update Test: `packages/core/test/reader-chapter-render-routing.test.ts`
- Update Test: `packages/core/test/dom-chapter-renderer.test.ts`
- Update Test: `packages/core/test/reader-hybrid-progress.test.ts`
- Update Test: `packages/core/test/reader-runtime-navigation.test.ts`

**Implementation:**
1. Move `renderCurrentSection()` orchestration into `ReaderRenderOrchestrator`.
2. Keep low-level render helpers in `EpubReader` for this phase if needed; only orchestration moves.
3. Preserve `preserve` render behavior and scroll anchor restoration.

**Verification:**
```powershell
pnpm.cmd vitest run packages/core/test/reader-chapter-render-routing.test.ts packages/core/test/dom-chapter-renderer.test.ts packages/core/test/reader-hybrid-progress.test.ts packages/core/test/reader-runtime-navigation.test.ts
pnpm.cmd --filter @yves-epub/core typecheck
```

**Done When:**
- `reader.ts` delegates render orchestration to a dedicated runtime component.
- Resize-triggered preserve renders and page syncing still behave the same.

## Final Regression

**Status:** `completed`

Run after all tasks complete:

```powershell
pnpm.cmd --filter @yves-epub/core typecheck
pnpm.cmd vitest run packages/core/test/reader-lifecycle.test.ts packages/core/test/reader-navigation.test.ts packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-hybrid-progress.test.ts packages/core/test/navigation-target.test.ts packages/core/test/reader-chapter-render-routing.test.ts packages/core/test/dom-chapter-renderer.test.ts
```

## Delivery Criteria

- Runtime behavior remains unchanged from the caller perspective.
- `reader.ts` no longer directly owns all event handling, navigation transitions, and render orchestration logic.
- Every extracted task lands with targeted verification.
