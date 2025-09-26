# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some fast linting via OXC (oxlint).

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Linting with OXC (oxlint)

This project uses oxlint instead of ESLint for faster static analysis.

- Run lint: `pnpm run lint` (or `npm run lint` / `yarn lint` depending on your package manager)
- By default, oxlint runs with its built-in recommended rules.

If you need advanced configuration, see the oxlint docs: https://oxc-project.github.io/docs/guide/usage/oxlint.html

## Testing with Vitest

This project includes Vitest configured with a JSDOM environment.

- Run all tests once: `pnpm run test`
- Watch mode: `pnpm run test:watch`
- Coverage: `pnpm run test:coverage`

A minimal example test exists at `src/example.test.ts`. You can place tests alongside source files using `*.test.ts` or `*.test.tsx` patterns.

## Code formatting with Prettier + OXC plugin

If you prefer using Prettier, this project also supports it via the OXC Prettier plugin.

- Format all files: `pnpm run prettier:write`
- Check formatting only (CI-friendly): `pnpm run prettier:check`
- Print formatted content to stdout: `pnpm run prettier`

The Prettier configuration loads the OXC plugin from `.prettierrc.json`. You typically don't need any extra config; Prettier will use the plugin automatically when installed.
