---
name: monorepo--add-new-app
description: >-
  Add a new deployable app under apps/ in an existing Yarn + Turborepo monorepo:
  React+Vite web app or Express api, package.json scripts, workspace deps on
  @repo/* packages, ports, Turbo filter dev/build, and single-app deploy. Use
  when the user asks to add a new app, Vite app, React app, Express API, or
  apps/* workspace. Prefer Vite/Express over Next.js unless user asks for Next.
---

# Add A New App To A Yarn + Turborepo Monorepo

Add one deployable application under `apps/` and wire it into Yarn workspaces
and Turborepo. Assume an **existing** monorepo (`apps/*`, `packages/*`, root
`yarn install`, root `turbo.json`).

Default stacks for this skill:

| Kind | Directory example | Stack |
|------|-------------------|--------|
| Frontend | `apps/web`, `apps/admin` | **React + Vite** |
| Backend | `apps/api`, `apps/worker-api` | **Express** |

Do **not** add Next.js unless the user explicitly requests it.

For full monorepo scaffold: **`monorepo--turborepo`**.  
For a shared library under `packages/`: **`monorepo--add-new-package`**.

## Mandatory Trigger

Invoke before creating files when the user asks to:

- add a new app under `apps/`
- create another React/Vite frontend or Express API in the monorepo
- add `apps/admin`, `apps/web`, `apps/api`, etc.
- wire a new app to existing `@repo/*` packages and Turbo filters

## Preconditions

Confirm (or discover) before writing:

1. Monorepo root has workspaces `apps/*` and `packages/*`.
2. Package manager is **Yarn**.
3. App directory name and package `name` (often the same short name).
4. **Kind**: `web` (Vite React) or `api` (Express). Default by name:
   - names like `web`, `admin`, `dashboard` → Vite React
   - names like `api`, `server`, `backend` → Express
5. Dev port (avoid clashes). Defaults: Vite `5173` (+1 per extra web app), Express `3001` (+1 per extra api).
6. Which shared packages to depend on (`@repo/ui` for frontends, optional `@repo/types` for apis).

Do not create a new monorepo. Add inside the current one.

## Naming Conventions

| Item | Convention |
|------|------------|
| Directory | `apps/<app-name>/` |
| Package `name` | Short unique name: `web`, `api`, `admin` |
| Shared libs | `"@repo/...": "*"` |
| Turbo filter | `--filter=<package-name>` |

Prefer short app names (not `@repo/web`) so filters stay simple.

## Checklist: Add App

### 1. Prefer Mirroring An Existing Sibling

If a similar app already exists (`apps/web` or `apps/api`):

1. Copy its structure (config, tsconfig, eslint patterns).
2. Reset app-specific routes/UI.
3. Change `package.json` `name`, ports, and deps.
4. Point at existing `@repo/*` packages.

If none exists, scaffold from the templates below.

### 2A. React + Vite App Layout

```text
apps/<app-name>/
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

**`package.json` shape:**

```json
{
  "name": "<app-name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port <port>",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port <port>",
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

Align React/Vite versions with sibling web apps when present.

Optional Vite proxy to monorepo Express:

```ts
server: {
  port: <port>,
  proxy: {
    "/api": { target: "http://localhost:3001", changeOrigin: true }
  }
}
```

### 2B. Express App Layout

```text
apps/<app-name>/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

**`package.json` shape:**

```json
{
  "name": "<app-name>",
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

**Minimal entry:**

```ts
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT) || <port>;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "<app-name>" });
});

app.listen(port, () => {
  console.log(`<app-name> listening on http://localhost:${port}`);
});
```

`tsconfig`: `outDir: "dist"`, `rootDir: "src"`, emit for production `start`.

### 3. Wire Shared Packages

```tsx
import { Button } from "@repo/ui/button";
```

Never:

```tsx
import { Button } from "../../packages/ui/src/button";
```

Create missing libraries with **`monorepo--add-new-package`** first.

### 4. TypeScript / ESLint

Mirror sibling apps and monorepo config packages (`@repo/typescript-config`,
`@repo/eslint-config`) when they exist.

### 5. Ports

| Existing typical | New suggestion |
|------------------|----------------|
| web 5173 | 5174, 5175, … |
| api 3001 | 3002, 3003, … |

Document the chosen port for the user.

### 6. Root Workspaces And Turbo

Root should already have:

```json
"workspaces": ["apps/*", "packages/*"]
```

Root `turbo.json` tasks should include `dev`, `build`, `lint`, `check-types`.
New apps only need matching **script names**.

Prefer build outputs that include Vite/Express artifacts:

```json
"build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**"]
}
```

If root still has only `.next/**` from an old Next starter, update outputs so
Vite/Express cache correctly.

### 7. Install From Root

```bash
cd <monorepo-root>
yarn install
```

### 8. Verify

```bash
yarn workspace <app-name> dev
yarn turbo run dev --filter=<app-name>
yarn turbo run build --filter=<app-name>
yarn workspace <app-name> lint
```

Confirm port, `@repo/*` resolution, and `dist/` (or expected) output.

## Individual Deploy

```bash
yarn install --frozen-lockfile
yarn turbo run build --filter=<app-name>
```

| Kind | Artifact |
|------|----------|
| Vite | `apps/<app-name>/dist` static assets |
| Express | `apps/<app-name>/dist` + `node dist/index.js` |

Install from monorepo root so workspaces resolve.

## Optional: Add Dependencies Later

```bash
yarn workspace <app-name> add lodash
yarn workspace <app-name> add -D vitest
yarn add -W -D prettier
```

## Agent Workflow

1. Confirm monorepo root, app name, **web vs api**, port, shared packages.
2. Mirror sibling app or scaffold Vite/Express template.
3. Set unique `name` and scripts (no nested `turbo run`).
4. Depend on `@repo/*` with `"*"`.
5. Align tsconfig/eslint.
6. Root `yarn install`.
7. Smoke-test filtered `dev` and `build`.
8. Report path, package name, port, filter, deploy command.

## Anti-Patterns

- Defaulting to Next.js when user did not ask for it
- App under `packages/`
- Nested `turbo run` in app scripts
- Relative imports into `packages/`
- Install-only-in-app-folder
- Reusing an existing package `name`
- Port collision with existing apps

## Quick Command Card

```bash
yarn install
yarn workspace <app-name> dev
yarn turbo run dev --filter=<app-name>
yarn turbo run build --filter=<app-name>
yarn workspace <app-name> add <npm-pkg>
yarn install --frozen-lockfile && yarn turbo run build --filter=<app-name>
```

## Relationship To Other Monorepo Skills

| Skill | When |
|-------|------|
| `monorepo--turborepo` | Create whole monorepo (Vite web + Express api) |
| `monorepo--add-new-package` | Add shared library under `packages/` |
| `monorepo--add-new-app` | Add deployable app under `apps/` (this skill) |
