---
name: monorepo--add-new-package
description: >-
  Add a reusable workspace package under packages/ in an existing Yarn +
  Turborepo monorepo: package.json name/exports/scripts, source or dist layout,
  wire into apps with @repo/* dependencies, root yarn install, and Turbo ^build
  when compiled. Use when the user asks to add a shared package, library, UI
  package, config package, or new packages/* workspace.
---

# Add A New Package To A Yarn + Turborepo Monorepo

Add one reusable package under `packages/` and wire it into the monorepo
correctly. Assume an **existing** Yarn workspaces + Turborepo repo
(`apps/*`, `packages/*`, root `yarn install`, root `turbo.json`).

For full monorepo scaffold, use **`monorepo--turborepo`**.  
For a new deployable app under `apps/`, use **`monorepo--add-new-app`**.

Reference patterns: blog `586-turborepo-yarn-monorepo-reusable-packages`,
https://github.com/machingclee/2026-08-09-turbo-repo-study

## Mandatory Trigger

Invoke before creating files when the user asks to:

- add a shared / reusable package under `packages/`
- create `@repo/ui`, `@repo/utils`, config packages, or any new workspace library
- export components/utilities for apps to import by package name
- fix or set up package `exports` and workspace linking for a new library

## Preconditions

Confirm (or discover) before writing:

1. Repo root has `package.json` with workspaces including `packages/*`.
2. Package manager is **Yarn** (workspaces). Prefer root commands.
3. Target folder name and package `name` (ask if missing).
4. Package kind:
   - **source exports** (consumed/transpiled by Next/Vite/etc.) — default for UI
   - **compiled library** (`build` → `dist/`) — when consumers cannot transpile TS

Do not invent a second monorepo. Work inside the current monorepo root.

## Naming Conventions

| Item | Convention |
|------|------------|
| Directory | `packages/<short-name>/` e.g. `packages/ui`, `packages/utils` |
| Package `name` | Prefer scoped `@repo/<short-name>` e.g. `@repo/ui` |
| Import path | By package name only: `import { x } from "@repo/ui/button"` |
| Never | Deep relatives like `../../packages/ui/src/button` from apps |

`name` must be unique across the monorepo. Apps often use short names (`web`);
libraries use `@repo/...`.

## Checklist: Add Package

### 1. Create Package Directory

```text
packages/<short-name>/
├── package.json
├── src/
│   └── index.ts          # or button.tsx, etc.
└── tsconfig.json         # optional; extend @repo/typescript-config if present
```

Only directories with a `package.json` are workspace packages.

### 2. Write `package.json`

#### Source-export library (default for shared UI / TS consumed by app bundler)

```json
{
  "name": "@repo/<short-name>",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./*": "./src/*.tsx"
  },
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  }
}
```

Adjust `exports` for `.ts` if not React:

```json
"exports": {
  ".": "./src/index.ts",
  "./*": "./src/*.ts"
}
```

With this style, Vite React apps do **not** need a separate package `build`
before `dev` when Vite transpiles dependency source. Express consumers may still
need compiled `dist/` or a runtime that loads TS (e.g. `tsx`) — prefer compiled
or carefully shared TS for API packages.

#### Compiled library (`dist/`)

```json
{
  "name": "@repo/<short-name>",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  }
}
```

Root `turbo.json` must keep `"dependsOn": ["^build"]` on `build` so app builds
run this package’s `build` first.

### 3. Source And Config

- Put public modules under `src/`.
- Prefer explicit files that match `exports` (e.g. `src/button.tsx` → `@repo/ui/button`).
- If the monorepo has `@repo/typescript-config` / `@repo/eslint-config`, extend them
  the same way existing packages do. Mirror a sibling package under `packages/`
  rather than inventing a new config style.

### 4. Wire Into Consuming App(s)

In each app that needs the package, add a normal dependency with Yarn classic
workspace version `"*"`:

```json
{
  "dependencies": {
    "@repo/<short-name>": "*"
  }
}
```

Prefer the CLI from monorepo root:

```bash
# if the package already exists and you only need to link version range,
# edit package.json then:
yarn install
```

Do not publish to npm solely for local monorepo consumption.

### 5. Install From Root

```bash
cd <monorepo-root>
yarn install
```

Never rely on install-only-inside-one-app to create workspace links.

### 6. Import By Package Name

```tsx
import { Button } from "@repo/ui/button";
// or
import { something } from "@repo/<short-name>";
```

### 7. Verify

```bash
# source package + app
yarn workspace web dev
# or
yarn turbo run dev --filter=web

# compiled package
yarn workspace @repo/<short-name> build
yarn turbo run build --filter=web
```

Edit a file under `packages/<short-name>/src/`, confirm the running app picks it
up (source exports) or rebuild package first (compiled).

## Source Vs Compiled Decision

| Package style | App dev | App production build |
|---------------|---------|----------------------|
| Source `exports` → `src/` | No separate package compile (Vite) | Vite/TS build includes package source |
| Compiled → `dist/` | Package `build` or watch | Turbo `^build` builds deps first |

Default to **source exports** for React UI in a Vite monorepo unless the user
needs a publishable JS package or non-transpiling consumers (e.g. plain Node
Express without TS loader — then use compiled `dist/`).

## Shared Config Packages

For eslint/tsconfig-style packages (like starter `@repo/eslint-config`):

- Still live under `packages/<name>/` with unique `name`.
- Often export config files via `exports` or `main`.
- Apps/packages depend on them as `devDependencies` with `"*"`.
- Copy structure from an existing config package in the same monorepo when present.

## Agent Workflow

1. Confirm monorepo root, package directory name, and `@repo/...` name.
2. Choose source-export vs compiled.
3. Create `packages/<short-name>/` with `package.json` + `src/`.
4. Align tsconfig/eslint with existing packages when available.
5. Add `"@repo/<short-name>": "*"` to each consuming app.
6. Run root `yarn install`.
7. Smoke-test import and filtered dev/build.
8. Report: path created, package name, which apps depend on it, and commands to run.

## Anti-Patterns

- Deep relative imports from apps into `packages/`
- Installing only under `apps/<app>` and expecting the new package to link
- Nested `turbo run` inside the package’s only build entry used recursively from root
  (keep Turbo at monorepo root; package scripts run real tools: `tsc`, `eslint`)
- Publishing to npm just for another workspace in the same monorepo
- Putting deployable apps under `packages/` (apps go in `apps/` — use **monorepo--add-new-app**)

## Quick Command Card

```bash
# after creating files
yarn install

# develop consumer app
yarn workspace web dev
yarn turbo run dev --filter=web

# lint / typecheck the new package
yarn workspace @repo/<short-name> lint
yarn workspace @repo/<short-name> check-types

# compiled package build
yarn workspace @repo/<short-name> build
yarn turbo run build --filter=web
```
