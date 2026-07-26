---
name: spring--add-event-storming-frontend
description: >-
  Build the command-flow / event-storming visualizer frontend (the
  event-storming-component React+Vite+TS app) and install its built dist/
  into a chosen Java module's src/main/resources/META-INF/resources/ so Spring Boot
  serves it. ASKS the user which target module to install into and which frontend
  source repo to build from at run time — nothing is hardcoded. Use when adding the
  command/event/policy flow diagram to a module, bringing in a customized copy of the
  visualizer, or refreshing a module's bundled frontend after frontend changes. Note:
  domain.util already bundles a default copy, so this is mainly for customized or
  per-module copies.
---

# Add the event-storming frontend to a Java module

Installs the **command-flow visualizer** — the React + Vite + TS app in the
`event-storming-component` repo — into a Java module's static resources so
Spring Boot serves the command→event→policy diagram. The frontend fetches a flow JSON
from a backend endpoint and renders it with @xyflow/react.

**Scope.** `domain.util` already bundles a default copy of this frontend in its JAR
(`META-INF/resources/command-visualization/`), so every consumer gets the visualizer
automatically. Use THIS skill when a module wants its **own** copy — to customize the
endpoint, styling, or data shape, or to own the artifact locally.

## Mandatory Trigger

Invoke this skill before building/copying the frontend when the user asks to:

- "add the event-storming frontend to this module" / "install the command-flow visualizer".
- "bring the frontend into the java module's META-INF".
- "customize the flow diagram frontend" / "point the visualizer at my endpoint".
- "refresh / rebuild the bundled frontend" for a specific module.

## User path registry — check first, ask once

This skill maintains `paths.json` alongside this SKILL.md — a registry mapping git user
names to their `domainUtil` and `frontendSource` paths. Each user is asked once; their
answer is saved so they never have to re-enter paths on that machine.

**Before asking the user anything**, resolve paths in this order:

1. **Identify the current user** — run `git config user.name`. Use that as the lookup key.
2. **Read `paths.json`** — check two locations in order:
   - `.claude/skills/paths.json` in the current project (if it exists).
   - `paths.json` alongside this SKILL.md (`~/.claude/skills/spring--add-event-storming-frontend/paths.json`).
   Look up the user's entry in whichever file is found.
3. **If found** — confirm the paths still exist on disk (`src/main/resources/META-INF/resources/`
   for `domainUtil`, `package.json` + `vite.config.ts` for `frontendSource`). If valid, use
   them directly (no prompt needed). If they look stale (directories missing), tell the user
   and fall through to step 4.
4. **If not found (or stale)** — ask for:
   - **Target module** — which Java module should receive the frontend?
     - Default: the module rooted at the current working directory.
     - Confirm the absolute path of its `src/main/resources/META-INF/resources/`.
   - **Frontend source repo** — path to the `event-storming-component` repo.
     - Try to locate a sibling `event-storming-component` (e.g.
       `../../event-storming-component` relative to the target module) and confirm
       it has `package.json` + `vite.config.ts`.
     - If not found or ambiguous, ask.
   - After the user answers, **save** their entry to `paths.json`:
     ```json
     "<git-user>": {
       "domainUtil": "<absolute-path-to-target-module>",
       "frontendSource": "<absolute-path-to-frontend-repo>"
     }
     ```
     Use `Write` to create/update the file if it doesn't exist, or `Edit` to add the new
     entry to the existing JSON object.

Also confirm (ask if unclear) two customization choices — see `templates/frontend-integration.md`:

- **Serving path** — default `command-visualization/`. The frontend hard-assumes it is
  served under a path ending in `/command-visualization/` (`App.tsx`); changing it requires
  editing that prefix logic, so prefer the default unless the user says otherwise.
- **Endpoint** — default the backend serves `/docs/commands` (domain.util `DocController`).
  If the target module exposes the flow under a different path (or a different JSON shape),
  note it — the user may want to edit `App.tsx`'s default URL.

## What it produces

```
<target-module>/src/main/resources/META-INF/resources/command-visualization/
  index.html
  vite.svg
  assets/index-<hash>.css
  assets/index-<hash>.js
<target-module>/docs/frontend-integration.md   ← optional, from templates/frontend-integration.md
```

## How to use

1. **Ask** for target module + frontend source (and serving path / endpoint) per above.
2. **(Optional) customize** the frontend source: edit `src/App.tsx` (endpoint default,
   serving-path prefix), `vite.config.ts` (base), or `src/types.ts` (data shape). Only do
   this if the user asked for changes.
3. **Build** in the frontend source dir:
   ```bash
   cd <frontend-source>
   npm install            # or: yarn install   (skip if node_modules exists)
   npm run build          # or: yarn build      (runs `tsc -b && vite build` → dist/)
   ```
4. **Install** — replace the destination wholesale (Vite emits new `index-<hash>` files
   each build, so clear stale assets, don't merge):
   ```bash
   DEST=<target-module>/src/main/resources/META-INF/resources/command-visualization
   rm -rf "$DEST" && mkdir -p "$DEST" && cp -R <frontend-source>/dist/. "$DEST"/
   ```
5. **Rebuild the Java module** — `cd` into the target module and run `mvn install` so the
   JAR picks up the new frontend assets. Skip tests with `-DskipTests` if the user wants a
   faster turnaround:
   ```bash
   cd <target-module>
   mvn install -DskipTests
   ```
6. **Verify** the visualizer loads (see Verify below).

## Backend contract the frontend expects

The visualizer does `fetch(<endpoint>).then(r => r.json())` and reads **`data.result`**,
so the backend must wrap the flow in `{ "result": { ... } }` (domain.util's
`APIResponseDTO.success(...)` does exactly this). `result` shape:

```json
{
  "commands": [ { "from": "CreateOrderCommand", "to": ["OrderCreatedEvent"] } ],
  "policies": {
    "SalesPolicy": {
      "flows": [
        { "fromEvent": "OrderCreatedEvent", "toCommand": "CancelOrderCommand", "invariant": "..." }
      ]
    }
  }
}
```

domain.util's `DocController` (`GET /docs/commands`) already returns this wrapped shape, so
a vanilla domain.util consumer needs no backend work — just install the frontend and open it.

## Notes

- **Open the diagram** by linking to `/command-visualization/index.html?url=<endpoint>`
  (the `?url=` query param overrides the default `/docs/commands`). domain.util's
  `DocController.getDiagram` (`GET /docs/commands/diagram`) is the reference implementation
  of this redirect.
- **Serving-path assumption.** `App.tsx` derives an nginx/forwarded prefix by splitting on
  `/command-visualization/`. Keep that path segment, or edit `App.tsx`.
- **Hashed filenames.** Vite content-hashes `assets/index-<hash>.js|css`; always clear the
  old `assets/` before copying or browsers will fetch stale chunks.
- **Companion skill.** `spring--init-command-event-policy` scaffolds the command/event/policy
  backend that feeds this visualizer; this skill adds the frontend on top.

## Verify

- `index.html` and `assets/*` exist under the target module's
  `META-INF/resources/command-visualization/`.
- Start the module and open
  `http://localhost:<port>/command-visualization/index.html?url=/docs/commands` — the diagram
  renders the module's real command/event/policy flow (not the dev fixture).
- Tailing the network tab: one `GET /docs/commands` returning `{ result: { commands, policies } }`.
