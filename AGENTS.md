# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace with two main packages:

- `packages/core`: EPUB parsing, layout, runtime, and tests.
- `packages/demo`: Vite-based browser demo UI and Playwright smoke tests.

Source code lives under `packages/*/src`. Core tests are in `packages/core/test`. Demo end-to-end checks are in `packages/demo/e2e`. Shared fixtures and sample books live in `test-fixtures`. Generated outputs such as `dist/`, coverage, and Playwright reports should not be edited manually.

## Build, Test, and Development Commands
- `pnpm dev`: run the demo locally with Vite.
- `pnpm build`: build all workspace packages.
- `pnpm test`: run Vitest suites.
- `pnpm test:e2e`: run Playwright tests.
- `pnpm typecheck`: run TypeScript checks across the workspace.
- `pnpm lint`: run ESLint on `.ts` files.
- `pnpm ci:check`: full local verification (`typecheck`, `lint`, `test`, `build`).

Use `pnpm --filter @yves-epub/demo build` or `pnpm --filter @yves-epub/core test` for package-specific work.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and semicolons omitted, matching the existing codebase. Prefer clear, small functions and explicit types for public APIs. File names use kebab-case for modules (for example `book-parser.ts`), while exported types and classes use `PascalCase`. Follow existing naming such as `renderCurrentSection`, `PaginationInfo`, and `SectionDocument`.

Formatting and linting are enforced with Prettier and ESLint. Run `pnpm format` before large changes.

## Testing Guidelines
Vitest is used for unit and integration tests; Playwright is used for demo smoke tests. Add tests near the affected package:

- Core behavior: `packages/core/test/*.test.ts`
- Demo browser behavior: `packages/demo/e2e/*.spec.ts`

Name tests after observable behavior, for example `scroll mode updates current page`.

## Commit & Pull Request Guidelines
Git history is minimal (`Initial commit`), so use short, imperative commit messages such as `Fix scroll-mode page sync` or `Refine demo sidebar layout`. Keep one logical change per commit when possible.

Pull requests should include:
- A concise summary of user-visible behavior changes
- Testing performed (`pnpm ci:check`, focused package commands, screenshots for demo UI changes)
- Linked issue or task reference when relevant

## Agent Notes
Prefer modifying source files over generated `dist/` output. When changing scroll, pagination, or TOC behavior, update both `packages/core` tests and demo behavior checks together.
