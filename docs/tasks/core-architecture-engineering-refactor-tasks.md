# Core Architecture Engineering Refactor Tasks

Date: 2026-04-24

## Main Flow

This iteration keeps `EpubReader` as the public facade and changes only internal
engineering structure:

1. Document the current architecture issues and non-functional constraints.
2. Add a shared test harness for synthetic reader setup.
3. Move canvas text-layer locator utilities out of `EpubReader`.
4. Verify that behavior is unchanged with focused and package-level checks.

## Task 1: Requirements Document

Status: `completed`

Create `docs/requirements/core-architecture-engineering-refactor.md` with
goals, non-goals, boundary rules, and acceptance criteria.

## Task 2: Task Document

Status: `completed`

Create this task document and keep task scope limited to work that can be
implemented and verified in one iteration without changing feature behavior.

## Task 3: Reader Test Harness

Status: `completed`

Add `packages/core/test/helpers/reader-harness.ts` with helpers for:

1. Creating a mock reader container with stable dimensions.
2. Creating a simple `Book` from sections.
3. Installing a synthetic book and optional chapter render inputs into an
   `EpubReader`.

Refactor `reader-runtime-navigation.test.ts` to use the harness for synthetic
book installation.

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts
```

## Task 4: Canvas Text Locator Module

Status: `completed`

Add `packages/core/src/runtime/canvas-text-locator.ts` and move the following
browser/canvas text-layer helpers out of `reader.ts`:

1. Resolve a `.epub-text-run` from a DOM hit target.
2. Find the nearest visible text run when the center point lands in line
   whitespace.
3. Convert a text run plus client point into a normalized locator.
4. Resolve a canvas text position from section/block/inline offset.

`EpubReader` should call the module but remain responsible for reader state and
mode-switch orchestration.

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts
pnpm exec vitest run packages/core/test/reader-annotation.test.ts
```

## Task 5: Final Verification

Status: `completed`

Run:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-annotation.test.ts
pnpm --filter @yves-epub/core test
```

Expected result: all commands pass with no public behavior changes.

Result: passed. Full core test completed with 83 test files and 384 tests.
