# Junie Project Guidelines

## Repository tooling

- Package manager: pnpm
- Formatter: Prettier
- Linter: Oxlint
- Test runner: Vitest (coverage via @vitest/coverage-v8)

## Mandatory workflow for every task

1. Implement minimal changes to satisfy the issue.

2. Checks and tests (must run on every task)
   - Run checks (fix format, typecheck, and lint): `pnpm check`
   - Run tests (non-watch): `pnpm test`
   - If any step fails, fix the problems or ask the user for clarification when truly blocked.

3. Optional checks (useful but not mandatory unless requested)
   - Test with coverage: `pnpm test:coverage`
   - Build: `pnpm build`

4. Before submitting
   - Ensure no obvious console errors in tests or type errors if build was run.
   - Summarize the minimal changes and confirm formatting, linting, and tests passed.

## Command reference

- `pnpm prettier:write` # applies Prettier to the repo
- `pnpm lint` # runs Oxlint
- `pnpm typecheck` # fast TS type-check using ts-go (@typescript/native-preview)
- `pnpm test` # runs Vitest (single run)
- `pnpm test:watch` # runs Vitest in watch mode (useful locally)
- `pnpm test:coverage` # runs Vitest with coverage
- `pnpm build` # builds the project

## When to ask for help

- If tests are failing due to unclear requirements or contradictory behavior, ask the user whether to adjust tests or implementation.
- If lint rules conflict with the coding guideline section below, clarify with the user which takes precedence.

## coding guidelines

- Do not add code comments unless they are absolutely necessary.
- Use functional React components only; no class components.
- Add a minimal test for each new public function or component behavior.
- Avoid default exports in new modules; use named exports.
- Use named function declarations at the top level, but arrow functions for callbacks.
- Write explicit check against `null` and `undefined`, do not rely on truthiness.
- Imports must include file extensions.
- Prefer interfaces to types.
- Always add brackets after if statements and for loops.
- Use descriptive variable names without being too lengthy, no abbreviations.

## Notes for Junie

- Favor minimal diffs: only touch files necessary to satisfy the issue.
- Keep the user informed with brief status updates and an explicit plan.
- Use the existing scripts whenever running formatting, linting, or tests.
