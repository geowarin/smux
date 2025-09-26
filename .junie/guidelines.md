Junie Project Guidelines

Purpose

- This document tells Junie how to work on this repository by default. It defines the standard workflow per task and gives you a place to add your own coding guidelines for Junie to follow.

Repository tooling

- Package manager: pnpm
- Formatter: Prettier
- Linter: Oxlint
- Test runner: Vitest (with jsdom and coverage via @vitest/coverage-v8)

Mandatory workflow for every task

1. Prepare the workspace
   - If dependencies might be missing or after pulling fresh changes, run: pnpm install

2. Implement minimal changes to satisfy the issue.

3. Formatting, linting, typechecking, and tests (must run on every task)
   - Format code (write changes): pnpm prettier:write
   - Lint code: pnpm lint
   - Type check (ts-go): pnpm typecheck
   - Run tests (non-watch): pnpm test
   - If any step fails, fix the problems or ask the user for clarification when truly blocked.

4. Optional checks (useful but not mandatory unless requested)
   - Test with coverage: pnpm test:coverage
   - Type check/build: pnpm build

5. Before submitting
   - Ensure no obvious console errors in tests or type errors if build was run.
   - Summarize the minimal changes and confirm formatting, linting, and tests passed.

Command reference

- pnpm prettier:write # applies Prettier to the repo
- pnpm prettier:check # checks formatting without writing
- pnpm lint # runs Oxlint
- pnpm typecheck # fast TS type-check using ts-go (@typescript/native-preview)
- pnpm test # runs Vitest (single run)
- pnpm test:watch # runs Vitest in watch mode (useful locally)
- pnpm test:coverage # runs Vitest with coverage
- pnpm build # type-checks and builds with Vite

When to ask for help

- If tests are failing due to unclear requirements or contradictory behavior, ask the user whether to adjust tests or implementation.
- If lint rules conflict with the coding guideline section below, clarify with the user which takes precedence.

coding guidelines

- Do not add code comments unless they are absolutely necessary.
- Use functional React components only; no class components.
- Add a minimal test for each new public function or component behavior.
- Avoid default exports in new modules; use named exports.
- Favor function declarations over arrow functions at the top level, but arrow functions for callbacks
- Write explicit check against `null` and `undefined`, do not rely on truthiness.
- Exports must include file extension.
- prefer interfaces to types.

Notes for Junie

- Favor minimal diffs: only touch files necessary to satisfy the issue.
- Keep the user informed with brief status updates and an explicit plan.
- Use the existing scripts whenever running formatting, linting, or tests.
