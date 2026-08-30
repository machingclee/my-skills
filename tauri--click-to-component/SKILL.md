---
name: tauri--click-to-component
description: >-
  Add click-to-component to a Tauri + React app: hold Option and click any UI
  element in the running app to jump straight to its JSX source (file:line:col)
  in VS Code. Use when asked for a "click-to-component", "click-to-source", or
  "open in editor" dev tool, or when porting react-click-to-component /
  click-to-react-component behavior into a Tauri project.
---

# Tauri Click-to-Component

A dev-mode tool for Tauri + React: **hold Option (Alt) and click any UI
element** in the running app → the JSX that rendered it opens in VS Code at
the exact `file:line:col`. This is the Tauri-native equivalent of
`react-click-to-component` / `click-to-react-component` (same fiber-walking
technique, different opener).

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add click-to-component" / "click-to-source" / "click element → open source"
- "open component source in editor when I click it"
- port `react-click-to-component` or `click-to-react-component` into a Tauri app
- build a dev tool that jumps from a UI element to the React component that rendered it

## Why Tauri Is Different (the key design decision)

Chromium webviews can navigate to `vscode://` URLs with
`window.location.assign(...)` (that's how `click-to-react-component` works).
**WKWebView (macOS Tauri) cannot** — the navigation is blocked. So instead of
navigating the page, the frontend:

1. resolves the clicked element's source location in JS,
2. calls a Tauri command `invoke("open_in_vscode", { path: "/abs/File.tsx:12:3" })`,
3. the Rust side opens `vscode://file/...` via the opener plugin (OS-level open, not webview navigation).

## What It Produces

Copy from `templates/` in this skill folder:

| File | Destination | Purpose |
|------|-------------|---------|
| `templates/TauriClickToComponent.tsx` | `src/components/TauriClickToComponent.tsx` | The React component (returns `null`, attaches global listeners) |
| `templates/open_in_vscode.rs` | snippet into `src-tauri/src/lib.rs` | The `open_in_vscode` Tauri command + registration notes |

## Architecture (3 pieces)

### 1. Rust command — `open_in_vscode`

```rust
#[tauri::command]
async fn open_in_vscode(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = path.replace('\\', "/");
    let url = if path.starts_with('/') {
        format!("vscode://file{}", path)
    } else {
        format!("vscode://file/{}", path)
    };
    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|e| e.to_string())
}
```

Wiring (all four, or the command won't exist):

- `src-tauri/Cargo.toml`: `tauri-plugin-opener = "2"`
- builder: `.plugin(tauri_plugin_opener::init())`
- import: `use tauri_plugin_opener::OpenerExt;`
- register: add `open_in_vscode,` to the existing `tauri::generate_handler![...]`

The `path` payload is `filePath:lineNumber:columnNumber`
(e.g. `/Users/me/app/src/App.tsx:42:7`) — VS Code interprets `vscode://file/path:line:col`.

### 2. Vite — inject `__VITE_ROOT__`

Vite dev-server module URLs look like `http://localhost:1420/src/App.tsx?t=...`.
The component needs the project root to convert those back to absolute
filesystem paths. In `vite.config.ts`:

```ts
export default defineConfig(() => ({
    define: {
        __VITE_ROOT__: JSON.stringify(process.cwd().replace(/\\/g, "/")),
    },
    // ...
}));
```

Forward slashes are required: Windows `C:\proj` concatenated with Vite's `/src/App.tsx` produces a mixed path VS Code will not open.

TypeScript needs the declaration in the component (already in the template):
`declare const __VITE_ROOT__: string;`

### 3. React component — `TauriClickToComponent`

Mount once at the app root (in `src/main.tsx`), gate to dev:

```tsx
import { TauriClickToComponent } from "./components/TauriClickToComponent";
// ...
{import.meta.env.DEV && <TauriClickToComponent />}
```

It renders `null`; all behavior is global window listeners. Requires
`@vitejs/plugin-react` so the dev JSX transform embeds debug source info.

## How Source Resolution Works (the core algorithm)

1. **Find the React fiber for the DOM element**, in order:
   - `window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` → `findFiberByHostInstance(element)`
   - `element._reactRootContainer._internalRoot.current.child` (legacy root)
   - expando keys on the element: `__reactInternalInstance$<n>` / `__reactFiber$<n>`
2. **Read source info off the fiber**:
   - React ≤ 18: `fiber._debugSource = { fileName, lineNumber, columnNumber }`
   - React 19+: `_debugSource` is gone; `fiber._debugStack` is an `Error` whose
     `.stack` contains the JSX callsite. Parse each stack line, skipping frames
     that contain `node_modules`:
     - JavaScriptCore (WKWebView): `fnName@URL:line:col` or `@URL:line:col`
     - V8 fallback: `at fnName (URL:line:col)`
3. **Walk `_debugOwner`** (component *ownership* chain — who rendered this
   fiber — not the DOM parent chain) until a fiber with source info is found.
   This is what maps a low-level DOM node (e.g. a `<div>`) to the user component
   that wrote it.
4. **Convert to absolute path**: `new URL(filePath)`; if `hostname === "localhost"`
   strip the query string and prepend `__VITE_ROOT__`; if `file:` decode the
   pathname (strip the extra `/` before `C:` on Windows); keep if already
   `/`-absolute or a `C:\` / `C:/` drive path.
5. **Invoke Rust**: `invoke("open_in_vscode", { path: "/abs/File.tsx:12:3" })`.

## Component behavior (what the template does)

- **Alt held** → hover mode on. Detect it from **`mousemove`/`click` `e.altKey`**,
  not only `keydown`/`keyup`. Unfocused and `focusable: false` Tauri windows
  never receive key events; mouse events still report the physical Alt key.
- **`mousemove`** tracks the hovered element. On every `target` change, **strip
  `data-ctc-target` from every element that isn't the current target**, then
  set it on the current one. The attribute is sticky — adding it without
  clearing the previous node leaves every hovered element outlined.
- **`mousedown` / `selectstart`** (capture) `preventDefault()` while Alt is
  held, plus `user-select: none` on `[data-ctc-hover]`, so Alt-drag does not
  start a native text selection (looks like multi-select).
- **`click`** (registered with `{ capture: true }`, then `preventDefault()` +
  `stopPropagation()` so app handlers never see it) → resolve + invoke.
  Accept `e.altKey` even if hover state missed keydown.
- **`blur`** (window loses focus) exits hover mode.
- Injects one `<style id="tauri-click-to-component-style">`:

  ```css
  [data-ctc-hover],
  [data-ctc-hover] * {
    pointer-events: auto !important;
    user-select: none !important;
  }
  [data-ctc-target] {
    cursor: context-menu !important;
    outline: -webkit-focus-ring-color auto 1px !important;
  }
  ```

  `pointer-events: auto` on children matters: during hover mode, child elements
  of the target must still receive `mousemove` so the highlight follows the
  deepest hovered element.

## Install checklist

1. Add `tauri-plugin-opener = "2"` to `src-tauri/Cargo.toml`.
2. Copy `templates/open_in_vscode.rs` command into `src-tauri/src/lib.rs`,
   add `.plugin(tauri_plugin_opener::init())` + `use tauri_plugin_opener::OpenerExt;`,
   and register `open_in_vscode,` in `invoke_handler`.
3. Add the `define: { __VITE_ROOT__ }` block to `vite.config.ts`.
4. Copy `templates/TauriClickToComponent.tsx` to `src/components/`.
5. Mount `{import.meta.env.DEV && <TauriClickToComponent />}` in `src/main.tsx`.
6. Verify: `tauri dev`, hold **Option**, click an element → console logs
   `[TauriClickToComponent] Opening: /abs/File.tsx:12:3` and VS Code opens there.

## Gotchas

- **Dev-mode only.** Production React builds strip `_debugSource`/`_debugStack`,
  so the component would log "No source found". Always gate the mount on
  `import.meta.env.DEV`. (Note: the original project mounts it unconditionally —
  that is a latent bug; don't copy that part.)
- **Don't import `click-to-react-component`.** Its `package.json` `exports` block
  prevents direct imports of the fiber helpers; that's why they are inlined in
  the template. Inlining is the standard, dependency-free approach.
- **Requires `@vitejs/plugin-react`** — without it there is no debug source info.
- **Other editors**: swap the URL scheme in the Rust command, e.g. `idea://`,
  `editor://`, or run `code --goto` as a subprocess instead of `open_url`.
- **StrictMode**: harmless — the component returns `null` and only adds/removes
  listeners; double-mounting just re-registers the same handlers.
- If the app has a global link interceptor that calls `e.preventDefault()` on
  all clicks, the capture-phase listener here still fires first, so it works.
- **Highlight must be exclusive.** `data-ctc-target` is a sticky data attribute.
  If you only add it on the new node and only remove it when hover mode ends,
  every element the pointer crossed stays outlined.
- **Don't rely on keydown for Alt.** Overlays and `focusable: false` windows
  never get keyboard events. `MouseEvent.altKey` is the reliable signal.
- **Windows paths.** `__VITE_ROOT__` must use forward slashes; the Rust command
  must `replace('\\', "/")` before building `vscode://file/...`. Drive-letter
  and `file:` URLs must be accepted in `toAbsolutePath`, not only `/`-absolute.

## Do not

- Do not try `window.location.assign("vscode://...")` on macOS/WKWebView — it
  silently does nothing. Always go through the Tauri command.
- Do not walk the DOM parent tree (`element.parentElement`) to find the source —
  that finds DOM wrappers, not the component that wrote the JSX. Walk
  `fiber._debugOwner`.
- Do not rely on `_debugSource` alone — React 19 removed it; the
  `_debugStack` parser is required for modern React.
- Do not ship it in production builds (see gotchas).
