---
name: monorepo--turborepo
description: >-
  Scaffold and operate a Yarn + Turborepo monorepo with React (Vite) and Express
  apps: Yarn workspaces, apps/ and packages/ layout, shared package exports, root
  install, filtered dev/build, and single-app deploy. Use when the user asks to
  create a monorepo, set up Turborepo with yarn, add reusable packages, or
  run/deploy one app from a monorepo. Prefer Vite + Express defaults, not Next.js.
---

# Monorepo With Yarn And Turborepo (Vite + Express)

Instruct the agent how to create, structure, and day-to-day operate a monorepo
using **Yarn workspaces** (install + link) and **Turborepo** (ordered, cached
tasks). Default application stack for this skill:

- **`apps/web`** — React + Vite frontend
- **`apps/api`** — Express backend

Do **not** scaffold Next.js apps unless the user explicitly asks for Next.js.

For adding one package or one app later:

- **`monorepo--add-new-package`**
- **`monorepo--add-new-app`**

## Mandatory Trigger

Invoke this skill before scaffolding or restructuring when the user asks to:

- create / scaffold a monorepo with **Yarn** and **Turborepo**
- set up `apps/` + `packages/` with workspace linking
- develop reusable packages consumed by monorepo apps
- run or deploy **one app** from a monorepo without splitting git repos
- explain or fix workspace imports (`@repo/...`) and Turbo filters

## Mental Model (Keep These Roles Separate)

| Role | Tool | Typical commands |
|------|------|------------------|
| Install and link | Yarn | `yarn install`, `yarn workspace web add lodash` |
| Orchestrate tasks | Turborepo | `yarn build`, `yarn turbo run build --filter=web` |

- Yarn owns install, workspaces, and linking local packages.
- Turborepo owns ordered, cached task execution (`build`, `dev`, `lint`, …).
- Turborepo does **not** replace Yarn. Yarn does **not** replace Turbo’s task graph and cache.
- Put **Turbo only at the monorepo root**. Put real work (`vite`, `tsc`, `tsx`, `eslint`) in each package’s scripts. Never nest `turbo run build` inside every package (recursion risk).

## Scaffold A New Monorepo

Prefer a **manual Yarn + Turbo skeleton** with Vite and Express. Official
`create-turbo` often defaults to Next.js apps; do not leave the user on Next.js
when they want Vite + Express.

### 1. Confirm Inputs

Ask only if missing:

- project name / parent directory
- package manager = Yarn (this skill assumes Yarn)
- optional: ports (defaults: web `5173`, api `3001`)
- optional: shared package names (default `@repo/ui` for React components, optional `@repo/typescript-config`)

### 2. Create Root Skeleton

```bash
mkdir <project-name>
cd <project-name>
# init git only if user wants and folder is not already a repo
```

**Root `package.json`:**

```json
{
  "name": "<project-name>",
  "private": true,
  "packageManager": "yarn@1.22.22",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "check-types": "turbo run check-types"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

Use a current Yarn classic or Berry version the environment already prefers;
keep workspaces as `apps/*` and `packages/*`.

**Root `turbo.json`:**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- `dependsOn: ["^build"]` → build workspace dependencies first.
- `dev` is long-running: `cache: false`, `persistent: true`.
- Default build outputs are `dist/**` for Vite and Express (`tsc` / build).

**Root hygiene:**

```text
.gitignore  →  node_modules, dist, .turbo, .env*, coverage, *.log
README.md   →  short: yarn install, yarn dev, filtered commands
```

### 3. Expected Layout

```text
.
├── apps/
│   ├── web/                 # React + Vite, default port 5173
│   └── api/                 # Express API, default port 3001
├── packages/
│   ├── ui/                  # @repo/ui shared React components (optional but recommended)
│   └── typescript-config/   # @repo/typescript-config (optional)
├── package.json
├── turbo.json
└── yarn.lock
```

- `apps/*` → deployable applications only.
- `packages/*` → shared libraries and tooling configs.
- Only directories with a `package.json` are packages.

### 4. Scaffold `apps/web` (React + Vite)

Create `apps/web` as a Vite React TypeScript app.

Preferred approach from monorepo root:

```bash
yarn create vite web --template react-ts
# move into apps/ if created at root, or create under apps/web directly
```

Or hand-write the minimal tree so workspace `name` is correct from the start:

```text
apps/web/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── src/
    ├── main.tsx
    ├── App.tsx
    └── vite-env.d.ts
```

**`apps/web/package.json` (shape):**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 5173",
    "lint": "eslint .",
    "check-types": "tsc -b --pretty false"
  },
  "dependencies": {
    "@repo/ui": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

**`vite.config.ts`:** enable React plugin; if consuming TS source from `@repo/ui`,
ensure Vite can prebundle/transpile workspace packages (default often works;
if not, add `server.fs.allow` / `optimizeDeps.include` for `@repo/ui`).

**Import shared UI by package name:**

```tsx
import { Button } from "@repo/ui/button";
```

Never deep-relative into `../../packages/ui`.

**Dev proxy (optional but recommended):** proxy `/api` to Express during local dev:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

### 5. Scaffold `apps/api` (Express)

```text
apps/api/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

**`apps/api/package.json` (shape):**

```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "check-types": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  }
}
```

**Minimal `src/index.ts`:**

```ts
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
```

**`tsconfig.json`:** `outDir: "dist"`, `rootDir: "src"`, Node-appropriate
`module`/`moduleResolution`, `strict: true`. Emit JS for `build` + `start`.

Optional later: depend on `@repo/types` or `@repo/utils` with `"*"` for shared
contracts between web and api.

### 6. Shared Package Example: `@repo/ui`

```text
packages/ui/
├── package.json
└── src/
    └── button.tsx
```

```json
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./*": "./src/*.tsx"
  },
  "scripts": {
    "lint": "eslint .",
    "check-types": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

Vite app consumes TSX source via workspace link; no separate UI `build` required
unless you choose a compiled `dist/` library style.

### 7. Install From Root

```bash
cd <project-name>
yarn install
```

Always install at monorepo root so workspaces link.

### 8. Optional: Start From create-turbo Then Replace Apps

If the agent uses `npx create-turbo@latest <name> -m yarn` for convenience:

1. Keep root Yarn workspaces + Turbo.
2. **Remove** Next.js apps under `apps/` (e.g. `web`/`docs` Next starters).
3. Add `apps/web` (Vite React) and `apps/api` (Express) as above.
4. Fix root `turbo.json` `build.outputs` from `.next/**` to `dist/**` (and any
   other non-Next outputs).
5. Re-run `yarn install` and verify filters.

Prefer not leaving Next.js in the tree when the user asked for Vite + Express.

## Package Names And Local Dependencies

1. Each package has a unique `name` in its own `package.json`.
2. Apps use short names: `web`, `api`.
3. Shared libs use a scope: `@repo/ui`, `@repo/typescript-config`.
4. Local deps use `"*"` with Yarn classic workspaces:

```json
{
  "name": "web",
  "dependencies": {
    "@repo/ui": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

5. Import by package name only after root `yarn install`.

## Shared Packages Under `packages/`

### Source Vs Compiled

| Package style | App dev | App production build |
|---------------|---------|----------------------|
| Source exports consumed by Vite | No separate package compile | Vite/TS builds include package source |
| Compiled library (`dist/`) | Package `build` or watch | Turbo `^build` builds dependencies first |

Express usually needs **compiled or runtime-transpiled** dependencies; prefer
`@repo/*` packages that either ship `dist/` or are simple TS imported only into
the api’s own `tsx`/`tsc` pipeline. Do not assume Next.js-style automatic
transpile of arbitrary packages inside Express without configuring it.

### Day-To-Day Shared UI Loop

1. Edit `packages/ui/src/button.tsx`.
2. Keep `yarn workspace web dev` running.
3. Vite HMR picks up linked workspace source; no publish step.

## Day-To-Day Commands

```bash
cd <monorepo-root>
yarn install
```

| Goal | Command |
|------|---------|
| Develop all apps | `yarn dev` |
| Develop web only | `yarn workspace web dev` or `yarn turbo run dev --filter=web` |
| Develop api only | `yarn workspace api dev` or `yarn turbo run dev --filter=api` |
| Build all | `yarn build` |
| Build web | `yarn turbo run build --filter=web` |
| Build api | `yarn turbo run build --filter=api` |
| Add dep to web | `yarn workspace web add <pkg>` |
| Add dep to api | `yarn workspace api add <pkg>` |
| Root-only devDep | `yarn add -W -D <pkg>` |

Filter notes:

- `--filter=web` / `--filter=api` use package `name`.
- Trailing `...` includes dependency graphs per Turbo filter docs.

## Individual Deployment

Deploy one app from the monorepo (not a separate git repo by default):

```bash
yarn install --frozen-lockfile
yarn turbo run build --filter=web
# or
yarn turbo run build --filter=api
```

Artifacts:

| App | Typical output |
|-----|----------------|
| `web` | `apps/web/dist` (static files for CDN/nginx/S3/Cloudflare Pages) |
| `api` | `apps/api/dist` + `node dist/index.js` (or container CMD) |

- Install from monorepo root so `@repo/*` resolves.
- Shared packages ship inside each app’s build unless published separately.

## Entering An App Directory

After root install:

```bash
cd apps/web && yarn dev
cd apps/api && yarn dev
```

Prefer root filters for consistency. Imports break if install was only done
inside one app, or if `packages/` was omitted from the checkout.

### Mistakes That Break Imports

| Mistake | Result |
|---------|--------|
| Install only inside `apps/web` | `@repo/ui` may not link |
| Copy only `apps/web` without `packages/` | Shared packages missing |
| Relative imports into `packages/` | Paths break when folders move |
| Leaving Next.js outputs in `turbo.json` for Vite/Express | Wrong cache outputs |

## Agent Workflow Checklist

When creating a new monorepo for the user:

1. Confirm project name, parent directory, Yarn, ports (5173 / 3001 defaults).
2. Create root `package.json` (workspaces + turbo scripts) and `turbo.json` with `dist/**` outputs.
3. Scaffold **`apps/web`** React + Vite TypeScript.
4. Scaffold **`apps/api`** Express TypeScript (`tsx` for dev, `tsc` for build).
5. Optionally add `packages/ui` (`@repo/ui`) and wire into `web` with `"*"`.
6. Optional Vite proxy `/api` → `http://localhost:3001`.
7. Root `yarn install`.
8. Verify:
   - `yarn turbo run dev --filter=api`
   - `yarn turbo run dev --filter=web`
   - `yarn turbo run build --filter=web`
   - `yarn turbo run build --filter=api`
9. Document commands for the user.

When adding more packages/apps later, use the focused skills.

## Anti-Patterns

- Scaffolding Next.js by default (`create-turbo` left as-is) when user wants Vite + Express.
- Putting `turbo run …` inside every package script.
- Deep relative imports across apps/packages.
- Installing only in one app folder.
- Publishing shared packages to npm just for local workspace use.
- Putting libraries under `apps/` or deployable services under `packages/`.

## Quick Verification After Scaffold

```bash
yarn install
yarn turbo run build --filter=api
yarn turbo run build --filter=web
yarn build
yarn build          # expect cache hits when unchanged
yarn turbo run dev --filter=api
yarn turbo run dev --filter=web
```

Hit `http://localhost:3001/api/health` and open `http://localhost:5173`. Edit
`packages/ui` (if present) and confirm Vite reloads. That loop is the core monorepo DX.
