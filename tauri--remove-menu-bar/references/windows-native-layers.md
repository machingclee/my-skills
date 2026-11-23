# Windows Native Layers Above A Tauri Webview

Reference for `tauri--remove-menu-bar`. Read this when the bar you removed
exposed another strip, when "visually seamless" is not enough, or when you need to
prove which layer owns the pixels instead of guessing. Measurements here were
taken on Windows 11 25H2 (build 26200) at 100% DPI against a Tauri 2 window whose
`WS_CAPTION` had already been cleared.

## The Four Layers And Who Owns Them

| Layer | Owner | Symptom | API |
| --- | --- | --- | --- |
| Native caption `WS_CAPTION` | Win32 style | icon, title, minimax/close | `GetWindowLongW` / `SetWindowLongW` + `SWP_FRAMECHANGED` |
| Native app menu `HMENU` | Tauri menu / `muda` | light bar reading `App File Edit` | gate the install; `AppHandle::hide_menu` / `remove_menu` |
| Resize frame `WS_THICKFRAME` | Win32 style | 4–8 px grab margin; native resize, snap, shadow | keep it, or `decorations: false` |
| DWM caption/border colour | DWM | pale mint band at the top; 1 px outline; corner rounding | `DWMWA_CAPTION_COLOR` (35), `DWMWA_BORDER_COLOR` (34), `DWMWA_WINDOW_CORNER_PREFERENCE` (33) |
| Client background | WebView2 / CSS | white flash, white behind the page | `background_color`, `html, body, #root` |

The distinction that matters: **style bits**, **DWM attributes** and **HTML/CSS**
operate on three different surfaces. CSS cannot reach the non-client area;
`WS_CAPTION` does not own the menu; `DWMWA_BORDER_COLOR` does not remove the
caption band.

## Measured Example

Window with the caption already stripped, menu already gated off:

```text
window rect        (78, 78) – (1294, 977)   = 1216 × 899
client origin      (85, 85)
client size        1202 × 885
non-client         7 px on every side
```

The webview began 7 px below the window's top edge, so the band was real pixels
the webview never owned. `DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS)`
reported `(84, 78) – (1288, 971)`: 6 px of invisible frame on left/right/bottom,
**0 px on top** — DWM treats the top band as visible caption area rather than
invisible resize margin, which is why only the top reads as a light strip.

Conclusive tests:

- Clearing `WS_THICKFRAME` + `SWP_FRAMECHANGED` → the band disappeared. It belongs
  to the thick frame.
- `DWMWA_BORDER_COLOR = DWMWA_COLOR_NONE` → band unchanged. It is not the border.
- `DWMWA_CAPTION_COLOR = red` → the band turned red. It is the DWM caption colour.

## Diagnostics

Non-client thickness (Python `ctypes`, run against a debug build):

```python
import ctypes, ctypes.wintypes as w

u = ctypes.windll.user32
hwnd = w.HWND(<hwnd>)

class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

wr = RECT(); u.GetWindowRect(hwnd, ctypes.byref(wr))
origin = POINT(0, 0); u.ClientToScreen(hwnd, ctypes.byref(origin))
cr = RECT(); u.GetClientRect(hwnd, ctypes.byref(cr))

print("non-client top", origin.y - wr.top)
print("non-client left", origin.x - wr.left)
print("non-client right", wr.right - (origin.x + cr.right))
print("non-client bottom", wr.bottom - (origin.y + cr.bottom))
```

Window style:

```python
GWL_STYLE = -16
style = u.GetWindowLongW(hwnd, GWL_STYLE) & 0xFFFFFFFF
print(hex(style), "caption", bool(style & 0x00C00000),
      "thick", bool(style & 0x00040000), "sysmenu", bool(style & 0x00080000))
```

Identify the top band:

```python
dwm = ctypes.windll.dwmapi
red = ctypes.c_uint(0x000000FF)  # COLORREF: 0x00BBGGRR
dwm.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(red), 4)  # DWMWA_CAPTION_COLOR
# Band turns red -> DWM caption colour. Unchanged -> it is the menu or CSS.
```

Getting the `HWND` from the app side: `webview.window().hwnd()` on the Rust side,
or list top-level windows by title from Python when the app is already running.

## Option A: `decorations: false` (whole frame gone)

Entire window becomes client area; webview fills it. Simplest physical removal.

Windows only — never put it in the shared `tauri.conf.json`, or macOS loses its
traffic lights:

```rust
#[cfg(windows)]
if let Some(main) = app.get_webview_window("main") {
    main.set_decorations(false)?;
}
```

Or a platform config file. Tauri merges `tauri.windows.conf.json` over the base
file, but arrays are replaced rather than merged, so repeat the whole window
object:

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "My App",
        "width": 1200,
        "height": 860,
        "minWidth": 720,
        "minHeight": 480,
        "decorations": false
      }
    ]
  }
}
```

What has to be rebuilt by hand:

- **Resize** — eight edge/corner hit areas plus `startResizeDragging`:

  ```tsx
  import { getCurrentWindow, type ResizeDirection } from "@tauri-apps/api/window";

  function ResizeEdge({ direction, className }: { direction: ResizeDirection; className: string }) {
    return (
      <div
        className={className}
        onPointerDown={(event) => {
          event.preventDefault();
          void getCurrentWindow().startResizeDragging(direction).catch(console.error);
        }}
      />
    );
  }
  ```

  ```css
  .resize-edge { position: fixed; z-index: 100; }
  .resize-edge.n { top: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
  .resize-edge.e { top: 8px; right: 0; bottom: 8px; width: 6px; cursor: ew-resize; }
  /* …and the other six edges/corners */
  ```

  Capability: `core:window:allow-start-resize-dragging`.

- **Drag** — keep `data-tauri-drag-region="deep"` on the strip and
  `core:window:allow-start-dragging`.
- **Window buttons** — app-drawn (minimise/maximise/restore/close).
- **Lost:** native drop shadow, Windows snap, native resize hit-testing,
  `Alt+Space` system menu.
- **Menu** — still separate; gate it (see the skill).

## Option B: Keep `WS_THICKFRAME`, Neutralise `WM_NCCALCSIZE`

The "have both" route: native resize, snap and shadow stay, but Windows is told the
whole window is client area, so the webview starts at the window's top edge. The
resize hit-testing the non-client area used to provide must be restored by hand.
This is what custom-titlebar Win32 apps and `tauri-plugin-decorum`-style plugins
do.

```rust
use std::ffi::c_void;

type HWND = *mut c_void;
type LRESULT = isize;
type WPARAM = usize;
type LPARAM = isize;

const WM_NCCALCSIZE: u32 = 0x0083;
const WM_NCHITTEST: u32 = 0x0084;
const HTCLIENT: LRESULT = 1;
const HTLEFT: LRESULT = 10;
const HTRIGHT: LRESULT = 11;
const HTTOP: LRESULT = 12;
const HTTOPLEFT: LRESULT = 13;
const HTTOPRIGHT: LRESULT = 14;
const HTBOTTOM: LRESULT = 15;
const HTBOTTOMLEFT: LRESULT = 16;
const HTBOTTOMRIGHT: LRESULT = 17;

#[derive(Clone, Copy)]
#[repr(C)]
struct RECT { left: i32, top: i32, right: i32, bottom: i32 }

#[repr(C)]
struct NCCALCSIZE_PARAMS {
    rgrc: [RECT; 3],      // [0] proposed client, [1] window, [2] old client
    lppos: *mut c_void,   // WINDOWPOS*
}

#[link(name = "comctl32")]
unsafe extern "system" {
    fn SetWindowSubclass(
        hwnd: HWND,
        proc: Option<unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM, usize, usize) -> LRESULT>,
        id: usize,
        data: usize,
    ) -> i32;
    fn DefSubclassProc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT;
}

#[link(name = "user32")]
unsafe extern "system" {
    fn GetWindowRect(hwnd: HWND, rect: *mut RECT) -> i32;
    fn IsZoomed(hwnd: HWND) -> i32;
}

const SUBCLASS_ID: usize = 0x5749_4E43; // "WINC"

unsafe extern "system" fn chrome_proc(
    hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize,
) -> LRESULT {
    match msg {
        WM_NCCALCSIZE if wparam != 0 => {
            let params = lparam as *mut NCCALCSIZE_PARAMS;
            if !params.is_null() && IsZoomed(hwnd) == 0 {
                // Client area == window rect: no non-client strip at all.
                (*params).rgrc[0] = (*params).rgrc[1];
            }
            // When maximised, leave the default rect: the frame is already
            // off-screen and overriding it leaves a screen-edge gap.
            0
        }
        WM_NCHITTEST => {
            let hit = DefSubclassProc(hwnd, msg, wparam, lparam);
            if hit == HTCLIENT && IsZoomed(hwnd) == 0 {
                // lParam is screen coordinates as two packed signed 16-bit values.
                let x = (lparam as i32 & 0xFFFF) as i16 as i32;
                let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
                let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                GetWindowRect(hwnd, &mut rect);
                let border = 7; // scale by DPI, see below
                let (left, right) = (x < rect.left + border, x >= rect.right - border);
                let (top, bottom) = (y < rect.top + border, y >= rect.bottom - border);
                if top && left { return HTTOPLEFT; }
                if top && right { return HTTOPRIGHT; }
                if bottom && left { return HTBOTTOMLEFT; }
                if bottom && right { return HTBOTTOMRIGHT; }
                if left { return HTLEFT; }
                if right { return HTRIGHT; }
                if top { return HTTOP; }
                if bottom { return HTBOTTOM; }
            }
            hit
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

pub fn install_borderless_resize(hwnd: HWND) {
    unsafe { SetWindowSubclass(hwnd, Some(chrome_proc), SUBCLASS_ID, 0); }
}
```

Things that bite:

- **Idempotence** — `SetWindowSubclass` with the same ID on the same HWND fails;
  treat the failure as "already installed". `on_page_load` fires again on reload.
- **Main thread** — window-proc work must run on the UI thread. `setup` and
  `on_page_load` are fine; from an async task wrap in `app.run_on_main_thread`.
- **`SWP_FRAMECHANGED`** — after changing style or installing the subclass, call
  `SetWindowPos(hwnd, null, 0,0,0,0, SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE|SWP_FRAMECHANGED)`.
- **Maximised** — a maximised Win32 window is larger than the monitor; either skip
  the override when `IsZoomed`, or set `rgrc[0]` from the work area
  (`MonitorFromWindow` + `GetMonitorInfoW`).
- **DPI** — the 7 px is device pixels. Use `GetDpiForWindow` and
  `GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi) + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi)`.
- **Top edge: resize or drag?** Once the top band is client area, the React drag
  region will move the window there unless `WM_NCHITTEST` says `HTTOP`. The
  hit-test above makes the top edge resize (usual borderless behaviour); the rest
  of the strip still drags.
- **DWM unchanged** — `WM_NCCALCSIZE` does not remove the 1 px border or the
  rounding. Set `DWMWA_BORDER_COLOR` to the strip colour (or
  `DWMWA_COLOR_NONE`) and `DWMWA_WINDOW_CORNER_PREFERENCE = 2` (round) or `1`
  (`DONOTROUND`).
- **Child webview** — no NCCALCSIZE of its own; the top-level client rect is what
  gives the webview the extra pixels.
- **Menu** — unaffected; gate it separately.

## What "Removed" Should Mean

| Goal | Test | Recipe |
| --- | --- | --- |
| Visually seamless | no light pixels above the app's strip | menu gated + `WS_CAPTION` off + DWM tint |
| Physically borderless, native behaviour kept | `ClientToScreen(0,0).y == GetWindowRect().top`, resize/snap/shadow still work | `WM_NCCALCSIZE` + `WM_NCHITTEST` (option B) |
| Physically borderless, simplest | entire window is client area | `decorations: false` + custom resize/drag (option A) |
| Menu gone, frame kept | no `HMENU` | menu gate or `hide_menu` |

State which row you are delivering. Teams consistently ask for the second and
accept the first once they see what the third costs.

## Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `GWL_STYLE` | `-16` | style index for `GetWindowLongW` |
| `WS_CAPTION` | `0x00C00000` | `WS_BORDER \| WS_DLGFRAME` |
| `WS_THICKFRAME` | `0x00040000` | resizable frame; native resize + snap + shadow |
| `WS_SYSMENU` | `0x00080000` | system menu (`Alt+Space`) |
| `WS_MINIMIZEBOX` / `WS_MAXIMIZEBOX` | `0x00020000` / `0x00010000` | caption buttons' capabilities |
| `SWP_FRAMECHANGED` | `0x0020` | recompute non-client metrics |
| `WM_NCCALCSIZE` | `0x0083` | non-client size calculation |
| `WM_NCHITTEST` | `0x0084` | hit testing (`HTCLIENT` 1, `HTLEFT`…`HTBOTTOMRIGHT` 10–17) |
| `DWMWA_BORDER_COLOR` | `34` | 1 px DWM border |
| `DWMWA_CAPTION_COLOR` | `35` | DWM caption area — the band above the webview |
| `DWMWA_WINDOW_CORNER_PREFERENCE` | `33` | `1` do not round, `2` round |
| `DWMWA_COLOR_DEFAULT` / `DWMWA_COLOR_NONE` | `0xFFFFFFFF` / `0xFFFFFFFE` | attribute-dependent |
| `COLORREF` | `0x00BBGGRR` | note the byte order; `#323237` → `0x00373232` |
