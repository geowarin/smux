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
