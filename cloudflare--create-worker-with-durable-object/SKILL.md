---
name: cloudflare--create-worker-with-durable-object
description: >-
  Scaffold a new Cloudflare Worker with Hono and a placeholder Durable Object
  (wrangler v4, wrangler.jsonc, SQLite-backed `exports`). Always use this when
  creating, initializing, or cloning a Cloudflare Worker / Workers project —
  never start from a bare Worker, a Worker-only C3 template, or Hono without a
  Durable Object. Use when the user asks to create/init/scaffold a Worker, a
  Hono Worker, a Durable Object Worker, `npm create hono` / `create-cloudflare`
  for Workers, or to add the standard Worker + Hono + DO shell.
---

# Cloudflare Worker + Hono + placeholder Durable Object

A TypeScript Worker that serves HTTP through **Hono** and already has a
**placeholder Durable Object** wired end-to-end (binding, class export, SQLite
`exports` entry, and a sample Hono route that stubs it). Drop domain logic into
the placeholder class; do not start from a Worker-only or Hono-only skeleton.

Reference implementation (domain code stripped): `comment-socket/` in the blog
repo — Hono entry + Durable Object class exported from the Worker entrypoint,
`wrangler.jsonc` with `durable_objects.bindings` **and** `exports`.

## Mandatory trigger

Invoke this skill **before writing any Worker bootstrap code** when the user asks to:

- create / init / scaffold a new Cloudflare Worker
- `npm create hono`, `create-cloudflare`, `wrangler init` for a Worker
- add Hono to a Worker, or add a Durable Object to a new project
- "Worker + Durable Object", "Hono Worker", "new workers project"

**Never** init a new Worker as:

- Worker-only (`create-cloudflare` "Worker only", no DO)
- Hono-only (no Durable Object class / binding / `exports`)
- wrangler.toml (use `wrangler.jsonc`)
- legacy `migrations` / `new_sqlite_classes` (use `exports`)

If a new Worker is needed, this skill is the whole init path.

## Architecture

```
        wrangler dev / deploy
                  │
                  ▼
        src/index.ts  (Hono default export)
                  │
                  ├── GET /            → "Hello Hono!"
                  └── GET /do/:name    → stub.fetch(request)
                                        │
                                        ▼
                              Placeholder Durable Object
                              (one instance per name)
```

Two TypeScript files — know which is which:

| File                    | Role                                                      | Must export          |
|-------------------------|-----------------------------------------------------------|----------------------|
| `src/index.ts`          | Hono app (HTTP). Default export is the Worker handler.    | `Placeholder`, `default app` |
| `src/Placeholder.ts`    | Durable Object class. Replace this with the real DO.      | `class Placeholder`  |

Durable Object classes **must** be re-exported from the Worker entrypoint
(`src/index.ts`). A class that only lives in its own file is invisible to
Cloudflare.

## Inputs

Collect (or infer) before generating:

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | folder to create the project in | `./my-worker` |
| `workerName` | `package.json` `name` + `wrangler.jsonc` `name` | `my-worker` |
| `doClass` | Durable Object class name (PascalCase) | `Placeholder` |
| `doBinding` | wrangler binding / `env` key (SCREAMING_SNAKE) | `PLACEHOLDER` |

If the user already named the DO (e.g. `ChatRoom`, `COUNTER`), use that for
`doClass` / `doBinding` instead of the placeholder names. Otherwise keep
`Placeholder` / `PLACEHOLDER` so the wiring is obvious and easy to rename.

## Scaffold a new project

Copy the files from this skill's `templates/` directory into `targetDir`
(the `templates/src/` subfolder maps to `./src/`), then replace placeholders
and run setup. **Do not** run `npm create hono` / `create-cloudflare` and then
try to add a DO on top — the templates already are the Hono Cloudflare Workers
starter plus the DO wiring from `comment-socket`.

```bash
mkdir my-worker && cd my-worker

# 1. Copy templates/ contents into the project root, preserving the src/ layout:
#    package.json  tsconfig.json  wrangler.jsonc  .gitignore  README.md
#    src/index.ts  src/Placeholder.ts

# 2. Install dependencies
npm install            # or: yarn

# 3. Generate Env types from wrangler.jsonc
npm run cf-typegen     # writes worker-configuration.d.ts (CloudflareBindings)

# 4. Run locally
npm run dev            # wrangler dev → http://localhost:8787
```

Smoke-check before handing the project over:

```bash
curl http://localhost:8787/
# Hello Hono!

curl http://localhost:8787/do/demo
# {"ok":true,"name":"demo"}
```

## Replace the placeholders

- `package.json` → `"name"`
- `wrangler.jsonc` → `"name"`, and `compatibility_date` (use **today's** date)
- If the user named the DO: rename `Placeholder` / `PLACEHOLDER` in
  `src/Placeholder.ts`, `src/index.ts`, and `wrangler.jsonc` together
  (class, binding `name`, `class_name`, `exports` key — all four)

Do **not** add `jose`, Google auth, WebSocket rooms, or comment events. Those
belong to `comment-socket`, not this skeleton.

## Local dev & deploy

```bash
npm run dev             # wrangler dev
npm run deploy          # wrangler deploy --minify
npm run cf-typegen      # regenerate worker-configuration.d.ts after config changes
```

## Adding a Hono route that talks to the DO

Resolve a named stub from the binding, then `fetch` (or RPC) it. Same pattern
as `comment-socket` `src/index.ts`:

```ts
app.get('/do/:name', (c) => {
  const name = c.req.param('name')
  const stub = c.env.PLACEHOLDER.getByName(name)
  return stub.fetch(c.req.raw)
})
```

Use `getByName` (not the older `idFromName` + `get` pair).

## Template files

- `templates/src/index.ts` — Hono app, re-exports the DO class, sample `/do/:name` route
- `templates/src/Placeholder.ts` — SQLite-backed Durable Object with a JSON `fetch`
- `templates/wrangler.jsonc` — Worker name, DO binding, `exports` (`type: durable-object`, `storage: sqlite`)
- `templates/package.json` — `hono` + `wrangler` + `@cloudflare/workers-types`
- `templates/tsconfig.json` — ESNext / Bundler / `hono/jsx` (Hono Workers starter)
- `templates/.gitignore` — `node_modules/`, `.wrangler`, `.dev.vars`
- `templates/README.md` — install / dev / deploy / cf-typegen

## Gotchas (non-obvious — read before debugging)

1. **Re-export the DO class from `src/index.ts`.** Cloudflare only provisions
   classes the Worker module exports. `export { Placeholder }` next to
   `export default app` is required. Forgetting it looks like a wrangler config
   bug (`Class Placeholder not found`) but is an entrypoint export miss.
2. **Declare the class in BOTH `durable_objects.bindings` AND `exports`.**
   The binding is how the Worker reaches the namespace (`env.PLACEHOLDER`).
   `exports` is how Cloudflare provisions the namespace (SQLite storage,
   lifecycle). New projects use `exports` — **do not** add a legacy
   `migrations` array / `new_sqlite_classes`.
3. **`storage: "sqlite"` for every new DO.** New key-value-backed namespaces
   are not supported on accounts that do not already have one. SQLite DOs
   still have the sync KV API.
4. **`wrangler.jsonc`, not `wrangler.toml`.** Newer features land JSON-first.
5. **`compatibility_date` must be recent** (today, or within ~30 days). Do not
   copy a stale date from the template without updating it.
6. **Run `npm run cf-typegen` after any wrangler config change** so
   `CloudflareBindings` matches the bindings. The Hono app is typed as
   `Hono<{ Bindings: Env }>` where `Env` lives next to the DO class (same as
   `comment-socket`); keep that `Env` in sync with `wrangler.jsonc` even if
   you also use generated types.
7. **Do not copy `comment-socket`'s `ChatRoom` / `googleAuth` / `events`.**
   This skill is the empty shell. WebSocket hibernation, per-message Google
   auth, and fan-out live in that project — copy from there only when the
   user is building that feature.
8. **One instance per name.** `getByName("demo")` always hits the same object.
   Distinct names → distinct instances (and distinct SQLite files).
