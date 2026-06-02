# Core Architecture Optimization Roadmap Tasks

Date: 2026-04-24

## Workflow

This task plan implements
`docs/requirements/core-architecture-optimization-roadmap.md`.

Every task is architecture and engineering-only. Public behavior must remain
unchanged unless a later API migration task explicitly changes that rule. Each
task must be verified before the next implementation task starts.

## Task 1: Requirements Document

Status: `completed`

Create `docs/requirements/core-architecture-optimization-roadmap.md`.

Verification: document exists and defines goals, non-goals, target boundaries,
priorities, and acceptance criteria.

## Task 2: Task Document

Status: `completed`

Create this task document with phased, independently verifiable work.

Verification: document exists and every implementation task has scoped
verification.

## Task 3: Architecture Guardrail Baseline

Status: `completed`

Add low-cost engineering guardrails before doing more code movement:

1. Add an architecture test or lint-like test that prevents parser and layout
   modules from importing `runtime/*`.
2. Add an architecture test that tracks root package exports from
   `packages/core/src/index.ts`.
3. Document which exports are considered stable public API and which are
   currently compatibility/internal exports.

Expected files:

1. `packages/core/test/architecture-boundaries.test.ts`
2. `docs/architecture/core-public-api.md`

Verification:

```bash
pnpm exec vitest run packages/core/test/architecture-boundaries.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 4: Dependency Direction Cleanup

Status: `completed`

Remove current reverse dependencies from lower layers into runtime:

1. Move pure locator normalization needed by `layout` out of runtime into a
   domain or model-level module.
2. Move URL/navigation classification needed by parser out of runtime into a
   shared utility module.
3. Update imports so parser/layout do not import runtime modules.
4. Keep existing runtime public exports working through compatibility
   re-exports if needed.

Verification:

```bash
pnpm exec vitest run packages/core/test/architecture-boundaries.test.ts packages/core/test/locator.test.ts packages/core/test/xhtml-parser.test.ts packages/core/test/navigation-target.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 5: Reader Annotation Service

Status: `completed`

Extract annotation and text-range operational behavior from `EpubReader` into a
focused runtime service.

Scope:

1. Annotation range resolution.
2. Full-block text-range resolution.
3. Text-range quote extraction.
4. Annotation viewport rect resolution.
5. Annotation selection hit testing.
6. Selection highlight-state calculation where it depends on annotation
   overlap.

`EpubReader` remains responsible for public annotation APIs, event emission, and
service wiring.

Expected files:

1. `packages/core/src/runtime/reader-annotation-service.ts`
2. Focused tests in `packages/core/test/reader-annotation-service.test.ts` or
   expanded annotation reader tests.

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-annotation.test.ts packages/core/test/reader-annotation-service.test.ts packages/core/test/reader-runtime-navigation.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 6: Reader DOM Pagination Service

Status: `completed`

Extract DOM pagination measurement and positioning from `EpubReader`.

Scope:

1. DOM page offset measurement.
2. DOM page index resolution.
3. Paginated DOM section transform/viewport positioning.
4. Measured DOM page synchronization into `ReaderPage[]`.
5. DOM pagination tests for reflowable DOM chapters.

`EpubReader` remains responsible for invoking the service during render flow
and updating reader state from service output.

Expected files:

1. `packages/core/src/runtime/reader-dom-pagination-service.ts`
2. `packages/core/test/reader-dom-pagination-service.test.ts`

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-spread.test.ts packages/core/test/reader-pagination-compat.test.ts packages/core/test/reader-dom-pagination-service.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 7: Reader Scroll Position Service

Status: `completed`

Extract scroll positioning and scroll window behavior from `EpubReader`.

Scope:

1. Scroll anchor capture and restoration.
2. Locator-to-scroll alignment.
3. Scroll window bounds and refresh decisions.
4. Scroll slice preservation during re-render.
5. Programmatic scroll coordination remains delegated through
   `ScrollCoordinator`.

Expected files:

1. `packages/core/src/runtime/reader-scroll-position-service.ts`
2. `packages/core/test/reader-scroll-position-service.test.ts`

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-hybrid-navigation.test.ts packages/core/test/reader-hybrid-progress.test.ts packages/core/test/reader-scroll-position-service.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 8: Render Flow Contracts

Status: `completed`

Replace the broad render orchestrator callback bag with narrower render-flow
contracts.

Scope:

1. Define a `RenderOutcome` type for state updates produced by render flows.
2. Split render paths into explicit flow modules where stable:
   scroll canvas, paginated canvas, paginated DOM, fixed-layout DOM.
3. Keep `ReaderRenderOrchestrator` as a small flow selector or remove it if the
   selector becomes trivial.
4. Remove `as unknown as ReaderPage` bridge casts from reader/orchestrator
   wiring.

Expected files:

1. `packages/core/src/runtime/render-flow-types.ts`
2. One or more `packages/core/src/runtime/*-render-flow.ts` modules.

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-chapter-render-routing.test.ts packages/core/test/reader-spread.test.ts packages/core/test/reader-image.test.ts packages/core/test/reader-runtime-navigation.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 9: Public API Surface Control

Status: `completed`

Constrain accidental public API expansion without breaking current consumers in
this tranche.

Scope:

1. Classify current root exports as stable, compatibility, or internal.
2. Add a snapshot-style test for `src/index.ts` exports.
3. If needed, add comments or docs explaining compatibility exports that should
   not receive new consumers.
4. Do not remove exports in this task unless a separate migration decision is
   made.

Expected files:

1. `packages/core/test/public-api-surface.test.ts`
2. Updates to `docs/architecture/core-public-api.md`

Verification:

```bash
pnpm exec vitest run packages/core/test/public-api-surface.test.ts
pnpm --filter @yves-epub/core build
```

Result: passed on 2026-04-24.

## Task 10: Layout Strategy Split

Status: `completed`

Split block-specific layout behavior out of `LayoutEngine` while preserving
the current `LayoutEngine.layout` entry point and `LayoutResult` shape.

Scope:

1. Text/heading pretext layout strategy.
2. Native image/list/figure/table height estimation strategies.
3. Shared compiled inline cache ownership remains explicit.
4. Existing layout tests must continue to pass unchanged.

Expected files:

1. `packages/core/src/layout/text-block-layout.ts`
2. `packages/core/src/layout/native-block-layout.ts`
3. Additional strategy modules as needed.

Verification:

```bash
pnpm exec vitest run packages/core/test/pretext-layout.test.ts packages/core/test/image-layout.test.ts packages/core/test/structured-layout.test.ts packages/core/test/paginated-render-plan.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 11: Display Strategy Split

Status: `completed`

Split block-specific draw-op construction out of `DisplayListBuilder` while
preserving `DisplayListBuilder.buildSection` output.

Scope:

1. Pretext block draw ops.
2. Image/media draw ops.
3. List draw ops.
4. Figure draw ops.
5. Table draw ops.
6. Shared style profile and highlight handling remain single-owner concepts.

Expected files:

1. `packages/core/src/renderer/display-list-text.ts`
2. `packages/core/src/renderer/display-list-native-blocks.ts`
3. Additional strategy modules as needed.

Verification:

```bash
pnpm exec vitest run packages/core/test/canvas-renderer.test.ts packages/core/test/dom-viewport-mapper.test.ts packages/core/test/reader-image.test.ts packages/core/test/canvas-style-alignment.test.ts
pnpm --filter @yves-epub/core typecheck
```

Result: passed on 2026-04-24.

## Task 12: Final Verification

Status: `completed`

Run the full verification suite after all completed tasks in this roadmap
tranche:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm lint
pnpm --filter @yves-epub/core test
pnpm --filter @yves-epub/core build
```

Expected result: all commands pass.

Result: passed on 2026-04-24.

## Implementation Notes

1. Tasks 3 and 4 should happen before further service extraction so dependency
   direction does not regress while code is being moved.
2. Tasks 5, 6, and 7 can be implemented independently if their write scopes stay
   separate.
3. Tasks 10 and 11 should not start until reader runtime service extraction has
   stabilized, because they touch different architectural layers and should not
   be mixed into reader refactors.
4. Public API cleanup is intentionally guarded before removal. Export removal
   requires a separate migration decision.
