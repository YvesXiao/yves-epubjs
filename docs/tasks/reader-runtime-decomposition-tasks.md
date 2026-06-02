# Reader Runtime Decomposition Tasks

Date: 2026-04-24

## Workflow

Each task must preserve public behavior and be verified before moving to the
next task.

## Task 1: Requirements Document

Status: `completed`

Create `docs/requirements/reader-runtime-decomposition.md`.

Verification: document exists and scope excludes functional behavior changes.

## Task 2: Task Document

Status: `completed`

Create this task document with concrete, testable decomposition steps.

## Task 3: Reader Session State Factory

Status: `completed`

Add a runtime state module that owns default construction for grouped reader
state. Wire `EpubReader` fields to those defaults without changing field names
or public behavior.

Verification:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm exec vitest run packages/core/test/reader-lifecycle.test.ts packages/core/test/reader-runtime-navigation.test.ts
```

Result: passed on 2026-04-24.

## Task 4: Reader Pagination Module

Status: `completed`

Move pagination and spread helper logic out of `reader.ts`:

1. Current-page lookup.
2. Locator-to-page lookup.
3. Rendered page resolution.
4. Synthetic spread resolution.
5. Visible spread traversal.
6. Display-page-to-leaf-page mapping.
7. Spread navigation target resolution.
8. Page-derived locator and progress helpers.

`EpubReader` keeps thin wrappers or delegates directly where needed.
Shared block-tree lookup remains a single implementation used by both reader
and pagination code.

Verification:

```bash
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-spread.test.ts packages/core/test/reader-pagination-compat.test.ts
```

Result: passed on 2026-04-24. Re-run after shared block-tree extraction.

## Task 5: Reader Selection Utilities Module

Status: `completed`

Move pure text-selection snapshot and text-range helper logic out of
`reader.ts`. Keep `EpubReader` responsible for DOM event orchestration and
state updates.

Verification:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm exec vitest run packages/core/test/reader-annotation.test.ts packages/core/test/reader-runtime-navigation.test.ts
```

Result: passed on 2026-04-24.

## Task 6: Final Verification

Status: `completed`

Run:

```bash
pnpm --filter @yves-epub/core typecheck
pnpm lint
pnpm exec vitest run packages/core/test/reader-runtime-navigation.test.ts packages/core/test/reader-spread.test.ts packages/core/test/reader-pagination-compat.test.ts packages/core/test/reader-annotation.test.ts
pnpm --filter @yves-epub/core test
```

Expected result: all commands pass.

Result: passed on 2026-04-24.
