# Core Architecture Optimization Roadmap Requirements

Date: 2026-04-24

## Background

`packages/core` now has clearer runtime boundaries than before: pagination,
selection helpers, block-tree lookup, canvas text-layer location, and reader
session defaults have been moved out of `EpubReader`.

The remaining architecture risk is no longer a single missing helper module.
It is mainly about boundary control:

1. `EpubReader` still owns too many runtime responsibilities.
2. Controller and orchestrator modules still depend on broad callback bags.
3. `src/index.ts` exposes many implementation modules as public API.
4. Some low-level modules import from higher-level runtime modules.
5. Layout and display-list construction are large strategy-heavy modules.

This roadmap captures the next architecture and engineering refactor
requirements. It is not a functional feature plan.

## Goals

1. Continue shrinking `EpubReader` into a public facade and lifecycle owner.
2. Replace broad callback-based orchestration with narrower runtime services and
   explicit flow outputs.
3. Reduce accidental public API lock-in by defining a smaller stable export
   surface.
4. Enforce dependency direction from parser/model/layout/renderer up into
   runtime, not the other way around.
5. Split layout and display-list block strategies without changing layout or
   rendering behavior.
6. Add engineering guardrails that prevent the same architectural issues from
   returning.

## Non-Goals

1. Do not change reader behavior, EPUB parsing output, locator semantics,
   rendering decisions, pagination behavior, annotation behavior, or demo UI.
2. Do not introduce new framework dependencies.
3. Do not remove or rename public exports until an explicit API migration plan
   exists.
4. Do not rewrite `EpubReader`, `LayoutEngine`, or `DisplayListBuilder` in one
   all-at-once change.
5. Do not replace existing tests with weaker smoke coverage.

## Current Issues

### 1. EpubReader Remains Too Broad

`packages/core/src/runtime/reader.ts` still owns lifecycle, state mutation,
render wiring, DOM pagination measurement, scroll positioning, annotation,
selection, resource readiness, and event emission.

The class should remain the public facade, but more operational logic should
move into focused services with narrow inputs and outputs.

### 2. Orchestrator Dependencies Are Too Wide

`ReaderRenderOrchestrator` coordinates the high-level render path, but its
dependency interface still contains many callbacks into `EpubReader`. This
means orchestration code moved files, while state ownership and process
authority mostly stayed centralized.

The next iteration should define explicit render-flow services and result
objects instead of passing a large callback bag.

### 3. Public API Surface Is Too Large

`packages/core/src/index.ts` re-exports parser, layout, renderer, and many
runtime internals. That makes internal modules harder to refactor because they
may already be treated as package API.

The package needs a documented public surface and a separate strategy for
testing/internal exports.

### 4. Dependency Direction Is Not Fully Clean

Some lower-level modules import from `runtime`, for example layout importing
locator helpers and parser importing navigation boundary logic. This couples
domain parsing/layout code to runtime policy.

Pure shared logic should move into domain or utility modules that lower layers
can depend on safely.

### 5. Layout and Display Construction Are Strategy-Heavy

`LayoutEngine` and `DisplayListBuilder` are both large and mix several block
strategies: text, image, list, figure, table, preformatted text, and native
fallback behavior. This makes changes to one block type riskier than needed.

Block-specific layout and display strategies should be split behind stable
interfaces.

### 6. Architecture Rules Are Not Enforced

The test suite is broad, but it does not currently prevent:

1. parser/layout importing runtime modules,
2. accidental expansion of public exports,
3. broad callback interfaces growing again,
4. large facade files accumulating new behavior.

Engineering guardrails should catch these issues before review.

## Target Boundaries

### Reader Facade

`EpubReader` owns public methods, lifecycle sequencing, event emission, and
service wiring. It should not own detailed annotation range math, scroll window
geometry, DOM pagination measurement, or block strategy rendering.

### Runtime Services

Focused runtime services own operational behavior:

1. `ReaderAnnotationService` owns annotation range resolution, quote extraction,
   viewport rect resolution, and annotation selection hit testing.
2. `ReaderDomPaginationService` owns DOM page measurement, DOM page positioning,
   and measured page synchronization.
3. `ReaderScrollPositionService` owns scroll anchors, locator-to-scroll
   alignment, scroll window refresh, and scroll-slice preservation.
4. Render flow services own scroll canvas, paginated canvas, paginated DOM, and
   fixed-layout DOM render paths.

### Shared Domain Utilities

Pure rules such as locator normalization, URL classification, block traversal,
and text-range math live outside runtime-specific modules so parser, layout,
renderer, and runtime can share them without reverse dependencies.

### Layout and Render Strategies

`LayoutEngine` and `DisplayListBuilder` remain public entry points for now, but
block-specific logic moves into internal strategy modules for text, image,
list, figure, table, and preformatted content.

### Public API Surface

The root package export should distinguish stable public API from internal and
testing support modules. Internal exports should not expand accidentally.

## Prioritized Requirements

### P0: Reader Runtime Service Extraction

1. Extract annotation and text-range runtime behavior from `EpubReader`.
2. Extract DOM pagination measurement and positioning from `EpubReader`.
3. Extract scroll positioning and scroll window behavior from `EpubReader`.
4. Replace broad orchestration callbacks with explicit service contracts where
   the behavior boundary is stable.

### P1: Dependency Direction Cleanup

1. Move pure locator helpers needed by layout into a domain-level module.
2. Move URL/navigation classification needed by parser into a shared utility.
3. Add an import-boundary guard so parser and layout cannot import runtime.

### P1: Public API Surface Control

1. Define a stable public export list.
2. Move internal-only exports behind an internal entry point or keep them
   unexported from the package root.
3. Add an API snapshot or equivalent test to detect accidental export growth.

### P2: Layout and Display Strategy Split

1. Split block-specific layout behavior out of `LayoutEngine`.
2. Split block-specific draw-op construction out of `DisplayListBuilder`.
3. Keep entry-point behavior and output structures unchanged.

### P2: Test Harness and Architecture Guardrails

1. Expand the reader harness so runtime services can be tested without private
   field mutation.
2. Add focused contract tests for render flows.
3. Add architecture tests for dependency direction and public export surface.

## Acceptance Criteria

1. Each refactor task has a task document before implementation begins.
2. Each task preserves current public behavior and public API unless an API
   migration task explicitly says otherwise.
3. Each extracted service has focused tests covering its public contract.
4. Import-boundary checks prevent parser/layout from importing runtime modules.
5. Root package exports are documented and guarded by a test or snapshot.
6. Full verification passes after each completed implementation tranche:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm lint
pnpm --filter @yves-epub/core test
```

## Open Questions

1. Should internal modules remain importable through a dedicated internal entry
   point for advanced users, or should they be package-private?
2. Should API surface cleanup be done as a breaking change or staged with
   compatibility aliases?
3. Should render-flow services return a single `RenderOutcome` type before or
   after DOM pagination extraction?
