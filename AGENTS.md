# AGENTS.md

Repository guidance for coding agents working in `E:\_Repos\epub-reading`.

## 1) Project Snapshot

- Stack: React 19 + TypeScript + Vite 8.
- UI: Ant Design (`antd`), EPUB rendering via `epubjs`.
- Module system: ESM (`"type": "module"`).
- Main app files: `src/App.tsx`, `src/main.tsx`.
- Build/lint config: `vite.config.ts`, `eslint.config.js`, `tsconfig*.json`.

## 2) Setup and Core Commands

Run all commands from repository root: `E:\_Repos\epub-reading`.

### Install

- `npm ci` (preferred for clean/reproducible installs)
- `npm install` (acceptable for local iteration)

### Daily Development

- `npm run dev` - start Vite dev server with HMR.
- `npm run build` - run `tsc -b && vite build`.
- `npm run lint` - run ESLint across project.
- `npm run preview` - serve production build locally.

## 3) Testing Guidance (Including Single Test)

Current state: there is no test runner configured yet (no Vitest/Jest/Playwright config or test files found).

Use this verification path right now:

1. `npm run lint`
2. `npm run build`

Single-file checks available today:

- `npx eslint src/App.tsx`
- `npx eslint src/main.tsx`

If Vitest is added later, use:

- `npx vitest run src/foo/bar.test.ts` (single test file)
- `npx vitest run src/foo/bar.test.ts -t "test name"` (single named test)
- `npx vitest src/foo/bar.test.ts` (watch one file)

If Jest is added later, use:

- `npx jest src/foo/bar.test.ts` (single test file)
- `npx jest src/foo/bar.test.ts -t "test name"` (single named test)

Agent rule: never claim tests passed unless the command was actually run.

## 4) Lint and TypeScript Constraints

### ESLint (`eslint.config.js`)

- Applies to: `**/*.{ts,tsx}`.
- Extends: `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks` recommended, `react-refresh` Vite config.
- Browser globals enabled.
- `dist/` ignored.

### TypeScript (`tsconfig.app.json`, `tsconfig.node.json`)

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `noUncheckedSideEffectImports: true`
- `moduleResolution: bundler`
- `verbatimModuleSyntax: true`
- `jsx: react-jsx`

Implications for agents:

- Remove unused imports/locals/params immediately.
- Avoid `any`; prefer narrow explicit types.
- Handle switch cases explicitly; no accidental fallthrough.

## 5) Code Style Guidelines

Follow current style in `src/App.tsx`, `src/main.tsx`, `src/App.css`, and `src/index.css`.

### Formatting

- 2-space indentation.
- Single quotes for TS/TSX strings/imports.
- No semicolons.
- Trailing commas in multiline object/array/function literals.
- Prefer multiline formatting when lines get dense.

### Imports

- Group order:
  1. External packages
  2. Type-only imports (`import type`)
  3. Local files/styles
- Keep imports deterministic and tidy.
- Use inline `type` modifiers for mixed imports where appropriate.

### Types

- Prefer explicit domain types (`BookMeta`, `ChapterIndex` style).
- Use unions intentionally (`T | null`, `T | undefined`).
- Use `Record<K, V>` for keyed maps.
- Avoid non-null assertions unless lifecycle guarantees correctness.

### Naming

- Components/types/interfaces: `PascalCase`.
- Variables/functions/hooks: `camelCase`.
- Module constants: `UPPER_SNAKE_CASE`.
- Keep names descriptive and feature-oriented.

### React Patterns

- Functional components + hooks.
- `useMemo` for stable derived data.
- `useCallback` for reusable handlers.
- Cleanup side effects in `useEffect` return functions.
- Keep state minimal; derive where possible.

### Error Handling

- Wrap async UI flows with `try/catch/finally`.
- Show user-friendly fallback messages.
- Narrow unknown errors via `instanceof Error`.
- Reset dependent state on failure to avoid stale UI.
- Guard async race conditions when loading/reloading data.

### CSS and UI Conventions

- Preserve existing `reader-*` class naming.
- Prefer scoped class selectors over global element overrides.
- Respect current responsive breakpoints (`960px`, `640px`).
- Preserve visual language unless redesign is explicitly requested.

## 6) File and Architecture Conventions

- App entry: `src/main.tsx`.
- Main feature implementation: `src/App.tsx`.
- Global styles: `src/index.css`.
- Feature styles: colocated (`src/App.css`).

When adding code:

- Co-locate helpers with their feature first.
- Extract shared utilities only when reused or readability clearly improves.
- Avoid unnecessary folder proliferation in this small codebase.

## 7) Cursor/Copilot Rules

Checked locations requested by user:

- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current result: none of these files exist in this repository.

If they appear later, treat them as high-priority repository instructions and update this file accordingly.

## 8) Agent Completion Checklist

Before concluding substantive code changes:

1. Run `npm run lint`.
2. Report what changed, why, command results, and any remaining gaps.
