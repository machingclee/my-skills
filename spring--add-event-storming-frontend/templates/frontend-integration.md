# Command-Flow Visualizer — Frontend Integration

This module serves the **command-flow / event-storming visualizer**: a React + Vite +
TypeScript single-page app that fetches the command→event→policy flow from a backend
endpoint and renders it as an interactive diagram (@xyflow/react).

> Installed by the `spring--add-event-storming-frontend` skill. See `SKILL.md` for the
> step-by-step (it asks which module and which frontend source to use at install time).

## Source

- **Repo:** `event-storming-component` (separate git repo; typically a sibling of
  this module, e.g. `../../event-storming-component`).
- **App name:** `command-flow-visualizer` (see its `package.json`).
- **Stack:** React 18, Vite 7, TypeScript, Tailwind, @xyflow/react, react-markdown.
- **Build:** `npm run build` → `tsc -b && vite build` → emits `dist/`.

> `domain.util` already bundles a default copy of this frontend in its JAR. This module's
> copy exists because it was customized or needs to own the artifact.

## Where it lives here

```
src/main/resources/META-INF/resources/command-visualization/
  index.html
  vite.svg
  assets/index-<hash>.css
  assets/index-<hash>.js
```

Spring Boot auto-serves `META-INF/resources/` as static content, so the app is reachable at
`/<servlet-context>/command-visualization/index.html`.

## Backend contract

The app does `fetch(<endpoint>)` and reads **`data.result`** — so the endpoint must return:

```json
{
  "result": {
    "commands": [
      { "from": "CreateOrderCommand", "to": ["OrderCreatedEvent"] }
    ],
    "policies": {
      "SalesPolicy": {
        "flows": [
          { "fromEvent": "OrderCreatedEvent", "toCommand": "CancelOrderCommand", "invariant": "<rule text>" }
        ]
      }
    }
  }
}
```

With domain.util, `GET /docs/commands` (`DocController`) already returns this exact wrapped
shape (`APIResponseDTO.success(FlowResponse)`). No backend work needed for a vanilla
domain.util consumer.

## Opening the diagram

Link to (or redirect to):

```
/command-visualization/index.html?url=<api-endpoint>
```

The `?url=` param overrides the default endpoint (`/docs/commands`). Reference impl:
domain.util `DocController.getDiagram` (`GET /docs/commands/diagram`) opens the visualizer
in a new tab with the correct URL.

## Customization points (in the frontend source repo)

| What | Where | Default | Change when |
|---|---|---|---|
| Default API endpoint | `src/App.tsx` — `params.get("url") ?? "/docs/commands"` | `/docs/commands` | Your flow endpoint lives elsewhere |
| Serving-path prefix logic | `src/App.tsx` — `pathname.split("/command-visualization/")` | assumes `…/command-visualization/` | You serve the app under a different path segment |
| Asset base URL | `vite.config.ts` — `base` | `"./"` in production (relative) | App is mounted at a non-relative root |
| Data shape | `src/types.ts` (`Command`, `PolicyFlow`, `FlowData`) | matches domain.util | Your backend emits a different schema |
| Dev fixture | `src/commands.json` | sample booking/sales flows | You want different sample data in `npm start` |

## Rebuild & reinstall (after frontend changes)

From the frontend source repo:

```bash
npm install          # or yarn install   (skip if node_modules exists)
npm run build        # or yarn build
```

Then copy into this module (clear stale hashed assets first):

```bash
DEST=src/main/resources/META-INF/resources/command-visualization
rm -rf "$DEST" && mkdir -p "$DEST" && cp -R <frontend-source>/dist/. "$DEST"/
```

Vite content-hashes `assets/index-<hash>.js|css`, so always remove the old `assets/` —
merging leaves stale chunks that browsers may cache.
