# Junie Project Guidelines

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

## When to ask for help

- If tests are failing due to unclear requirements or contradictory behavior, ask the user whether to adjust tests or implementation.
- If lint rules conflict with the coding guideline section below, clarify with the user which takes precedence.

## Coding Guidelines

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
- Do not use `any` or `unknown` types unless absolutely necessary.

## Notes for Junie

- Favor minimal diffs: only touch files necessary to satisfy the issue.
- Keep the user informed with brief status updates and an explicit plan.
- Use the existing scripts whenever running formatting, linting, or tests.

## Repository tooling

The project is a monorepo using pnpm workspaces and containing two projects:
  - a state machine library, smux in packages/smux 
  - a demo React project, using smux in packages/react-app

However: this is not relevant most of the time as all the commands you need are available from the parent package.json.

- Package manager: pnpm
- Formatter: Prettier
- Linter: Oxlint
- Test runner: Vitest (coverage via @vitest/coverage-v8)

