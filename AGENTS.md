# Repository Guidelines

## Project Structure & Module Organization
The Expo Router entry point lives in `app/`, with each route as a `.tsx` file and a nested layout in `app/(tabs)/`. Shared UI sits under `src/components`, reusable logic and stores in `src/lib`, and theming primitives in `src/theme`. Static assets (fonts, images, sounds) belong in `assets/`. Respect the existing `@/` path alias when importing across folders to keep relative paths shallow.

## Build, Test, and Development Commands
Use pnpm for all scripts to stay in sync with the lockfile: `pnpm start` launches the Expo dev server, while `pnpm android`, `pnpm ios`, and `pnpm web` produce platform-specific builds. Run `pnpm lint` before submitting changes to catch style issues early. `pnpm reset-project` reinitialises caches and dependencies when the Metro bundler behaves unexpectedly; run it sparingly because it deletes local state.

## Coding Style & Naming Conventions
TypeScript is required and compiled in strict mode via `expo/tsconfig.base`; fix type errors instead of suppressing them. Follow the Expo ESLint ruleset (`eslint-config-expo`); align with the default 2-space indentation, trailing commas, and double-quoted JSX attributes found in existing files. Name React components with PascalCase, hooks with `use` prefixes, Zustand stores with `[name]Store`, and keep file names lowercase with dashes where multiple words are needed (e.g., `log-entry-card.tsx`).

## Testing Guidelines
No automated tests are present yet, but new features should include component or hook tests using `@testing-library/react-native` and Jest. Co-locate spec files next to the implementation using the `.test.tsx` or `.test.ts` suffix (e.g., `log-screen.test.tsx`). Ensure tests can run via a future `pnpm test` script; include that command in PR notes until the script is wired up. Aim for coverage on stateful hooks and navigation guards, especially when touching reminders or notification flows.

## Commit & Pull Request Guidelines
Match the existing Conventional Commit style (`chore: …`, `feat: …`, `fix: …`) so changelog tooling remains viable. Keep commits focused and reference ticket IDs when available. Pull requests must explain the user-facing impact, list manual test steps (device + platform), and attach screenshots or screen recordings for UI changes under `app/(tabs)/`. Tag reviewers who maintain the affected area (components, lib, or theme) and confirm Expo Go builds when relevant before requesting approval.
