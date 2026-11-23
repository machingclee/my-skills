---
name: tauri--remove-menu-bar
description: >-
  Remove the standard desktop application menu bar from a Tauri v2 app; macOS and
  Windows need different mechanisms. macOS: the bar is the system-wide NSMenu Tauri
  creates by default — drop it with enable_macos_default_menu(false), replace it with
  a minimal menu, or hide menu bar and Dock icon with ActivationPolicy::Accessory.
  Windows: the same menu becomes a real Win32 HMENU inside the window — gate
  Menu.setAsAppMenu() by platform, or call AppHandle::remove_menu / hide_menu in
  Rust, remembering every window created later inherits it. Also separates the menu
  bar from the three other native strips that look like "the app bar" (caption,
  thick-frame DWM caption colour, 1px DWM border), because removing the menu exposes
  the next one. Use when a Tauri app shows a menu bar or unstyleable white/mint strip
  above the webview, when setAsAppMenu adds an unwanted bar on Windows, when a
  Mac-clean window looks wrong on Windows, or when asked to remove the top
  application bar / menu bar / title bar.
---

# Remove The Desktop App Menu Bar In Tauri

"Remove the menu bar" is four different jobs wearing one name, and two of them are
not the menu bar at all. In a Tauri v2 window on Windows, from the outside in:

```text
DWM 1px border / rounded corners     DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE
non-client area:
  caption   (WS_CAPTION)             icon, title, minimax/close        ~31 px
  menu bar  (HMENU)                  File, Edit, …                     ~26 px
  frame     (WS_THICKFRAME)          invisible grab margin, DWM tints  ~4–7 px
client area:                         the webview — React/HTML/CSS only here
```

On macOS there is no menu bar inside the window at all: the menu belongs to the
system, at the top of the screen. So the two platforms need two different
answers, and a fix for one is a no-op on the other.

## When To Use

- The user says the app has a "top bar", "application bar", "menu bar", "title
  bar" or "white strip" they did not design and cannot restyle.
- A Tauri app that looks right on macOS shows an unstyleable light strip on
  Windows reading `AppName File Edit`.
- `Menu.setAsAppMenu()` is in the code and a bar appears inside the Windows
  window.
- The bar was removed once and "came back" or changed colour — that is the next
  layer down, not a regression.

## Step 1: Identify Which Bar Before Changing Anything

Do not start with CSS and do not start with `decorations`. Establish which layer
owns the pixels, because each layer has a different API and none of them can
paint over the others.

| Strip | How to recognise it | Owner | Fixed by |
| --- | --- | --- | --- |
| Native app menu | Reads `AppName File Edit …`, sits directly above the webview, has keyboard accelerators | Tauri menu / `muda` `HMENU` | do not install it; or `AppHandle::hide_menu` / `remove_menu` |
| Native caption | Icon + title + minimise/maximise/close | `WS_CAPTION` style bit | clear `WS_CAPTION` + `SWP_FRAMECHANGED`; or `decorations: false` |
| Residual top band | 4–8 px, no text, light/mint, appears exactly at the window's top edge, vanishes when `WS_THICKFRAME` is cleared | DWM caption colour over `WS_THICKFRAME` | tint it (`DWMWA_CAPTION_COLOR`), or remove the frame (`decorations: false`, or `WM_NCCALCSIZE`) |
| Thin outline | 1 px around the whole window | DWM border | `DWMWA_BORDER_COLOR` (`DWMWA_COLOR_NONE` or a colour match) |
| White flash / white behind content | Only while loading, or around the page | WebView2 / CSS | `background_color` in config, `html, body, #root` background |

Two rules that save a lot of time:

- **CSS cannot paint the non-client area.** `border-top`, `padding-top` and
  `box-shadow` all draw inside the client area. If the strip survives a
  `body { border: 4px solid red }`, it is not CSS.
- **The menu and the caption are separate.** Clearing `WS_CAPTION` cannot remove
  an `HMENU`, and `SetMenu(NULL)` cannot remove a caption.

To measure instead of guess, see
[references/windows-native-layers.md](references/windows-native-layers.md)
(`GetWindowRect` vs `ClientToScreen` + `GetClientRect` gives the exact non-client
thickness per side, and the DWM colour test identifies the band conclusively).

## macOS: The Menu Bar Is The System Menu

The bar lives outside the window and belongs to the application, so "removing" it
means the app has no menu bar while it is the active app. Tauri builds
`Menu::default()` for you on macOS at `Builder::build` time unless a menu was set
(`enable_macos_default_menu`, on by default). Pick one of three:

### A. Keep a minimal menu (recommended for real apps)

Removing every item also removes ⌘Q, ⌘H, ⌘W, ⌘Z/⌘C/⌘V/⌘A and Services, so a
window with no menu is usually a worse app. Set a small menu instead:

```rust
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

let app_menu = Submenu::with_items(
    app, "MyApp", true,
    &[
        &PredefinedMenuItem::about(app, None, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, None)?,
    ],
)?;
let edit_menu = Submenu::with_items(
    app, "Edit", true,
    &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ],
)?;
app.set_menu(Menu::with_items(app, &[&app_menu, &edit_menu])?)?;
```

Do this in `setup` (or `Builder::menu`). The app-wide menu also applies to every
window opened later — that is the behaviour you want on macOS.

### B. No menu bar at all

```rust
tauri::Builder::default()
    .enable_macos_default_menu(false)   // the auto-created default menu
    // …and if anything else set one:
    // app.remove_menu()?;              // remove_for_nsapp(); returns the old Menu
```

`AppHandle::remove_menu` is app-wide and is the only removal that works on macOS:
the menu there belongs to the application, so `Window::set_menu` and both
`hide_menu` variants are documented *Unsupported* on macOS and only the app-wide
call reaches the system menu (`remove_for_nsapp()`). Whatever the menu's
accelerators used to provide must move into the
webview or a global shortcut: quit, close window, undo/redo, find, and the
clipboard items — WebKit handles ⌘C/⌘V/⌘A inside editable content, nothing else.

### C. No menu bar and no Dock icon

For tray / menu-bar-style utilities that should never look like a regular app:

```rust
.setup(|app| {
    #[cfg(target_os = "macos")]
    app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory)?;
    Ok(())
})
```

`Accessory` apps have no Dock icon and no menu bar; they can still be activated by
clicking a window or from the tray. Verify focus behaviour and every shortcut
before shipping — this is a product decision, not just a chrome change.

### Also on macOS

`titleBarStyle: "Overlay"` + `hiddenTitle: true` in `tauri.conf.json` are what
take the *window's* title bar away while leaving the traffic lights floating. That
is a caption story, not a menu story, and the two settings do nothing on Windows.

## Windows: The Menu Is An `HMENU` Inside Every Window

`Menu::setAsAppMenu()` (JS) or `Builder::menu()` (Rust) calls `muda`'s
`init_for_hwnd_with_theme`, which installs a real Win32 menu bar in the window,
above the webview. It is not styled by the app, it does not follow the dark theme,
and no window style change touches it.

The trap: the app-wide menu is assigned to **every window that does not have its
own**, including windows created later (window creation falls back to
`app_handle.menu()` and marks them `is_app_wide`). Hiding it once in `main` is
therefore not a fix; each new notes window, viewer window or second app window
comes back with the bar.

### Option 1: Do not install it on Windows (preferred)

Gate the install at the source, not at one window:

```ts
// src/appMenu.ts — the menu is a macOS affordance; on Windows it would become a
// native bar inside the window, so it is never built there.
import { PLATFORM } from "./platform";

export async function installAppMenu(handlers: AppMenuHandlers): Promise<void> {
  if (PLATFORM !== "macos") return;
  // …build the menu and await Menu.setAsAppMenu()
}
```

Then make sure every accelerator the menu carried has another home:

| Was provided by the menu | Windows replacement |
| --- | --- |
| Open, Find, Find next/previous, undo/redo, view switch | the app's own keyboard handlers |
| File → Open in New Window | add e.g. `Ctrl+N` (the menu's chord was the only place it lived) |
| Cut / copy / paste / select all | WebView2 handles them natively |
| Close window | `Alt+F4` (the predefined `CloseWindow` accelerator is `Alt+F4` outside macOS) |
| About / Hide / Quit | OS-level or not applicable on Windows |

Whatever installed it must also be gated, not just the builder — e.g. a
`window.onFocus` listener that re-installs the menu on macOS only.

### Option 2: Keep the menu object, hide the bar

Useful when you want the accelerators but not the bar. Rust only; the JS API has
`Menu.setAsAppMenu()` and no way to remove it.

```rust
// non-macOS only; `hide_menu` is documented Unsupported on macOS
#[tauri::command]
fn hide_window_menu(app: tauri::AppHandle) -> Result<(), String> {
    app.hide_menu().map_err(|error| error.to_string())
}
```

`AppHandle::hide_menu` hides it for every window that has the app-wide menu;
`Window::hide_menu` does one window. It calls `SetMenu(hwnd, NULL)` +
`DrawMenuBar`, so the bar disappears while the `HMENU` and the event loop's
`HACCEL` table survive — accelerators usually keep working, but verify on your
Tauri version. It returns `NotInitialized` for a window the menu was never
initialised on, so hide after the menu is installed (or ignore that error).
Combine with a capability for the command.

### Option 3: Remove the menu entirely

```rust
app.remove_menu()?;   // also drops the accelerators
```

`Window::remove_menu()` / `AppHandle::remove_menu()`. Choose this only when the
app supplies all shortcuts itself. Prefer the Tauri API over raw
`SetMenu(hwnd, null)` + `DrawMenuBar`, which does not update Tauri's bookkeeping
and will confuse every later menu call.

### Then look again

With the menu gone, a strip above the webview means you are now looking at the
next layer. Two are common next: the caption, and the thick frame's DWM caption
colour. Neither is removable by menu code.

## Windows: The Layers That Hide Behind The Menu

### The caption

```rust
const WS_CAPTION: i32 = 0x00C0_0000; // WS_BORDER | WS_DLGFRAME, not WS_THICKFRAME
const GWL_STYLE: i32 = -16;

let style = GetWindowLongW(hwnd, GWL_STYLE);
if style & WS_CAPTION != 0 {
    SetWindowLongW(hwnd, GWL_STYLE, style & !WS_CAPTION);
    // Without SWP_FRAMECHANGED Windows keeps its cached non-client metrics and
    // the caption's height stays reserved above the webview.
    SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
}
```

Apply it per window, from both `setup` (before the main window is first painted)
and `on_page_load` (every window created later), via
`webview.window().hwnd()`. Keep `WS_THICKFRAME` if you want native resize, snap
and shadow; the app must then draw its own minimise/maximise/close buttons and
the strip becomes the drag region (`data-tauri-drag-region="deep"`).

### The residual top band: tint it, or remove the frame

Clearing the caption does not clear the frame. Windows still reserves the thick
frame as non-client area (7 *device* pixels on the machine that produced this
skill), and DWM paints the top part with the caption colour — a pale mint under
the default theme, which reads as a white line above a dark app. CSS cannot
reach it.

Colour-match it (keeps native resize/snap/shadow; cheapest correct answer):

```rust
const DWMWA_BORDER_COLOR: u32 = 34;
const DWMWA_CAPTION_COLOR: u32 = 35;
// COLORREF: 0x00BBGGRR — #323237 here, i.e. the title strip's own colour
let color: u32 = 0x0037_3232;
DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &color as *const u32 as *const c_void, 4);
DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &color as *const u32 as *const c_void, 4);
```

Both attributes are Windows 11; on Windows 10 the calls fail harmlessly and the
system colour stays. Re-apply on every page load — that is the call that lands
after DWM has created the frame it colours.

To make the pixels disappear rather than match, there are two routes, both
written up with code in
[references/windows-native-layers.md](references/windows-native-layers.md):
`decorations: false` plus hand-built resize handles (`startResizeDragging`), or
keep `WS_THICKFRAME` and neutralise the non-client area with `WM_NCCALCSIZE` +
`WM_NCHITTEST`. Both cost behaviour that the tint keeps.

### The 1px border and rounded corners

`DWMWA_BORDER_COLOR` (`34`, or `DWMWA_COLOR_NONE = 0xFFFFFFFE`) and
`DWMWA_WINDOW_CORNER_PREFERENCE` (`33`, `DWMWCP_DONOTROUND = 1`) are separate
attributes. None of them remove the caption band; do not confuse the three.

## Layout Consequence: The Title Stops Being Centred

Removing the left gutter (traffic lights) while adding right-hand buttons
unbalances any `flex: 1` centre pane: it centres in the *leftover* space, not in
the window. On Windows the window buttons plus a view switch can be ~239 px
against an 8 px gutter, which puts a "centred" title ~120 px left of centre.

Either mirror the right-hand furniture with a left spacer, or pad symmetrically:

```css
@media (min-width: 720px) {
  html[data-os="windows"] .titlebar:has(.window-controls)::before {
    content: "";
    flex: 0 0 240px; /* tabs + gap + controls; keep in step if they grow */
  }
}
```

Scope it away from narrow windows (notes windows can be 280 px wide), where a
240 px spacer would squeeze the title to nothing.

## Capabilities To Add

Menu work itself needs `core:menu:default`. The chrome that replaces the removed
bar needs these in `src-tauri/capabilities/default.json`:

```json
"core:window:allow-start-dragging",
"core:window:allow-internal-toggle-maximize",
"core:window:allow-minimize",
"core:window:allow-toggle-maximize",
"core:window:allow-is-maximized",
"core:window:allow-close",
"core:window:allow-start-resize-dragging"
```

Only the last one is for the `decorations: false` route. A missing permission is
silent: the button renders and does nothing.

## Verification

- **Menu gone:** no `HMENU` bar on any window label — main, `notes`,
  `notes-app-*`, `viewer-note-*`, `app-*` — including windows opened after the
  first one.
- **Caption gone:** style has `WS_CAPTION` clear and `WS_THICKFRAME` still set.
- **Frame accounted for:** measure the non-client inset (see the reference) and
  decide whether a few pixels of matching colour are acceptable or the job is a
  physical removal.
- **Behaviour kept:** all edges/corners resize, snap works, maximise/restore,
  double-click the strip toggles maximise, drag moves the window, `Alt+F4` and
  `Alt+Space` work, the buttons work, and every former menu accelerator still
  fires or is knowingly dropped.
- **Matrix:** Windows 10 and 11, 100–200% DPI, moved between monitors, active and
  inactive, light/dark/high-contrast, restored/maximised/snapped.
- **macOS unchanged:** traffic lights still float (`titleBarStyle: "Overlay"`,
  `hiddenTitle: true`) and the system menu bar is still there — do not gate the
  macOS menu off by accident while fixing Windows.

## Pitfalls

- `WS_CAPTION` is `WS_BORDER | WS_DLGFRAME`, not `WS_THICKFRAME`.
- Clearing a style bit without `SetWindowPos(..., SWP_FRAMECHANGED)` changes
  nothing visible.
- The menu is an `HMENU`; style bits and DWM attributes never touch it.
- `DWMWA_BORDER_COLOR` colours a 1 px border; the band above the webview is
  `DWMWA_CAPTION_COLOR`.
- `DWMWA_COLOR_NONE` is not a universal "remove chrome" switch; its effect
  depends on the attribute.
- `decorations: false` takes the resize frame, the native shadow and snapping
  with it, and still does not remove an `HMENU`.
- `hide_menu` is unsupported on macOS; only app-wide `remove_menu` / not creating
  the menu works there.
- Window-proc code must not panic across FFI; keep subclass bodies total.
- Re-check everything per window label, not only `main`: the app-wide menu and the
  caption strip both apply to every window.

## Worked Example

`~/Repos/Javascript/2026-08-23-tauri-pdf-focus-viewer` is the app this skill came
from, with the full investigation in `docs/windows-app-bar.md`, the gate in
`src/appMenu.ts`, the caption/tint code in `src-tauri/src/win32.rs`, the per-window
hookup in `src-tauri/src/lib.rs`, and the platform read in `src/platform.ts`. That
project is deliberately only *visually* seamless (menu gated, caption stripped,
frame tinted); the doc's option A/B sections are the physically borderless routes.
