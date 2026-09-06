---
name: frontend--focus-strip
description: >-
  Install a reusable React FocusStrip: a parked horizontal reading window with a
  70% dark veil, adjustable veil backdrop-blur (0–25px toolbox slider),
  Focus/height/blur toolbox, and keyboard shortcuts. Press F (or the Focus
  button) to park the strip at a fixed viewport Y; Esc turns it off; drag the
  band or arrows move it; drag the top/bottom borders (or [ ]) resize. Do not
  enable on double-click — that fires too often on the web. Use when adding a
  focus reading strip, reading ruler, or focus-mode overlay to a React web page,
  article reader, or PDF viewer. Do not add follow-cursor mode. Do not lock the
  hole to a content node — it stays at a fixed vertical screen position while
  the page scrolls. Do not blur the reading hole. Keep the toolbox above the
  veil in z-index.
---

# Focus Strip

A self-contained **parked reading strip** for React + TypeScript. A horizontal
window stays locked to a **fixed vertical position in the viewport**. Everything
above and below is covered by a 70% dark veil with an adjustable
`backdrop-filter` blur. The hole stays sharp. The page scrolls underneath.

The strip **does not follow the cursor**. Following the pointer looks clever and
then fights the user while they read. Park it, move it on purpose, or turn it off.

Canonical behaviour: this blog (`src/components/common/FocusStrip/FocusStrip.tsx`).
The templates are the generic reusable form of that overlay.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add a focus strip" / "reading strip" / "reading ruler" / "focus mode overlay"
- "toggle focus mode" with a horizontal attention window
- port the PDF Focus Viewer strip into a **web** React app
- add a toolbox to toggle focus, change strip height, or change veil blur

Do **not** add a "follow cursor" option or toggle. Enable with the Focus
button or `F`; disable with `Esc` (or `F` again). Do **not** enable on
double-click — that is too common on the web and turns the strip on by
mistake. Move by dragging the gray band or with arrow keys. Resize by
dragging the **top or bottom border** of the band (opposite edge stays put),
or with `[` / `]`.

## What It Produces

Copy these files from `templates/` in this skill folder into the target directory
(same folder so the CSS import resolves):

```
<target-dir>/
├── FocusStrip.tsx      # provider, viewport, toolbox, default export
└── focus-strip.css     # overlay, band, toolbox, edge handles
```

## Dependencies

| Package | Required | Notes |
|---------|----------|--------|
| `react` | yes | hooks only; no other libraries |

No Tailwind required. Tokens are CSS custom properties on `.focus-strip`.

## How It Works

1. **Fixed viewport Y.** Press `F` (or the Focus button) to turn the strip
   on at the last pointer Y (or the stage center). The hole is stored as
   `parkedCenterY` in stage coordinates (`clientY - stageRect.top`).
   Scrolling the page does **not** move the strip; text slides under a
   fixed window. Do **not** park on double-click.
2. **Do not park on a content node.** Do not store the hole as
   `node + fracY` / `[data-page]` / `[data-focus-lock]`. That rides the
   document when the user scrolls. A raw screen Y is also wrong if the
   overlay is inside a moving stage — use stage-relative Y.
3. **Toolbox.** `Focus` toggles the overlay. `Strip` is a range for height.
   `Blur` is a range for veil `backdrop-filter` radius, **0–25px**, default
   **5px**. Height and blur are remembered even while focus is off
   (`[` / `]` still change height).
4. **Veil blur.** Apply `backdrop-filter: blur(var(--focus-strip-blur))`
   (and `-webkit-backdrop-filter`) on `.focus-strip-mask` only. The gray
   band / hole must stay sharp. Do not blur the toolbox — keep it above
   the veil in z-index.
5. **Move.** Drag the gray band (middle), or `↑` / `↓`. These move the
   window; they do not scroll the page and they do not change height.
   While dragging, pin the hole to the pointer (`dragLock`) and only
   commit `parkedCenterY` on release — otherwise the first move snaps.
6. **Resize from the borders.** Drag the **top** or **bottom** edge of the
   band (`ns-resize`). The opposite edge stays put. Keep a grab offset so
   the border does not jump to the cursor. The slider / `[` / `]` still
   change height from the center.
7. **Height vs scale.** `height` is in content units. On-screen hole is
   `height * scale`. For a normal article leave `scale={1}` (default). For a
   zoomable PDF/canvas pass `scale={zoom}` so `50` always covers the same
   number of content units (1 unit = 1 CSS px at 100% zoom).
8. **Z-index.** CSS `z-index` is a signed 32-bit int (max `2147483647`).
   Values above that clamp to the same number, so a later portal (the
   veil) paints over an earlier one (the toolbox). Keep
   `content overlay < veil < toolbox < drawers`, all in range. Set the
   toolbox z-index inline as well as in CSS.

## Shortcuts

Skip these while the user is typing in an input / textarea / contenteditable.
`⌘F` is **not** bound (leave it for Find).

| Action | Keys |
| --- | --- |
| Toggle focus | `F` |
| Turn off | `Esc` (or `F` again) |
| Strip taller / shorter | `]` / `[` |
| Height ±1 | `⌥[` / `⌥]` |
| Height ×3 | `⌘[` / `⌘]` or `⇧[` / `⇧]` |
| Height ×9 | `⌘⇧[` / `⌘⇧]` |
| Move one strip height | `↑` / `↓` (focus on; does not scroll) |
| Nudge 1 CSS px | `⌥↑` / `⌥↓` |
| Resize from an edge | Drag the top or bottom border of the band |

`[` / `]` work even when focus mode is off; they change the remembered size.

## Props

`FocusStrip` accepts the provider props plus layout flags:

| Prop | Type | Default | Notes |
|------|------|---------|--------|
| `children` | `ReactNode` | – | Reading content |
| `toolbox` | `boolean` | `true` | Render Focus + height + blur controls above the viewport |
| `disabled` | `boolean` | `false` | Greys out toolbox + ignores shortcuts |
| `height` / `onHeightChange` | `number` | uncontrolled | Controlled height |
| `defaultHeight` | `number` | `160` | Uncontrolled initial height |
| `minHeight` / `maxHeight` | `number` | `10` / `640` | Clamp |
| `blurRadius` / `onBlurRadiusChange` | `number` | uncontrolled | Controlled veil blur in CSS px |
| `defaultBlurRadius` | `number` | `5` | Uncontrolled initial blur |
| `minBlurRadius` / `maxBlurRadius` | `number` | `0` / `25` | Clamp |
| `parkedCenterY` / `onParkedCenterYChange` | `number \| null` | uncontrolled | Stage-relative Y of the strip center |
| `scale` | `number` | `1` | Screen px = height × scale (pass zoom for PDFs) |
| `unit` | `string` | `"px"` | Height readout label (`"pt"` in the PDF app) |
| `shortcuts` | `boolean` | `true` | Window-level key handler |
| `parkOnDoubleClick` | `boolean` | `false` | Opt-in only. Double-click is too easy to fire by accident. |
| `storageKey` | `string` | – | Persist height in `localStorage` (generic template) |
| `blurStorageKey` | `string` | – | Persist blur radius in `localStorage` (generic template) |
| `onFocusChange` | `(on: boolean) => void` | – | Overlay visibility |
| `scrollerRef` | `RefObject<HTMLElement>` | – | Use a host scrollport; skip the inner scroller |
| `className` / `toolboxClassName` / `viewportClassName` | `string` | – | |

`FocusStripToolbox` also accepts `focusLabel` / `stripLabel` / `blurLabel` for i18n.

Also exported: `FocusStripProvider`, `FocusStripViewport`, `FocusStripToolbox`,
`useFocusStrip()`, `MIN_STRIP`, `MAX_STRIP`, `DEFAULT_STRIP`, `STRIP_STEP`,
`MIN_BLUR`, `MAX_BLUR`, `DEFAULT_BLUR`.

**Persistence.** The generic template may write height / blur to `localStorage`.
On this blog, do **not** add those keys. Drive `height`, `blurRadius`, and
`parkedCenterY` from `persistSlice` (`state.persist.focusStrip`) so they
survive reloads with the rest of user prefs.

## Usage

### Article / web page (common case)

Give the root a bounded height (`height: 100%` on a filled parent, or an explicit
`h-screen`). The inner scroller is created for you.

```tsx
import FocusStrip from "./FocusStrip"

export function Reader({ html }: { html: string }) {
  return (
    <div style={{ height: "100vh" }}>
      <FocusStrip
        storageKey="reader.stripHeight"
        blurStorageKey="reader.stripBlur"
        defaultHeight={160}
        defaultBlurRadius={5}
      >
        <article dangerouslySetInnerHTML={{ __html: html }} />
      </FocusStrip>
    </div>
  )
}
```

### Toolbox in an existing app toolbar

```tsx
import FocusStrip, {
  FocusStripProvider,
  FocusStripToolbox,
  FocusStripViewport,
} from "./FocusStrip"

<FocusStripProvider
  storageKey="reader.stripHeight"
  blurStorageKey="reader.stripBlur"
>
  <header>
    <FocusStripToolbox />
  </header>
  <FocusStripViewport>
    <article>{children}</article>
  </FocusStripViewport>
</FocusStripProvider>
```

Or hide the built-in bar and drop the toolbox wherever:

```tsx
<FocusStrip toolbox={false}>
  <article />
</FocusStrip>
```

### Host already owns scrolling

If the document already has a scrollport, pass `scrollerRef`. The overlay still
parks at a **viewport Y** on the stage, not on a content node.

```tsx
<FocusStrip
  scale={zoom}
  unit="pt"
  height={stripHeight}
  onHeightChange={setStripHeight}
  blurRadius={stripBlur}
  onBlurRadiusChange={setStripBlur}
  parkedCenterY={parkedCenterY}
  onParkedCenterYChange={setParkedCenterY}
  disabled={!pdf}
  scrollerRef={scrollerRef}
>
  {/* host owns scrolling */}
</FocusStrip>
```

## CSS tokens

Override on `.focus-strip` (or `:root`) if the host theme needs it:

| Variable | Role | Default |
|----------|------|---------|
| `--focus-strip-veil` | Dimmed regions | `rgba(8, 8, 8, 0.7)` |
| `--focus-strip-blur` | Veil `backdrop-filter` radius | `5px` (set from `blurRadius`) |
| `--focus-strip-edge` | Band inset / resize handles | `rgba(128, 128, 128, 0.9)` |
| `--focus-strip-accent` | Button / slider | `#808080` |
| `--focus-strip-bg` | Toolbox background | `canvas` mix |
| `--focus-strip-line` | Toolbox border | `currentColor` 12% |

Keep the band and range slider **gray**. Do not use gold / yellow accents.

## Install checklist

1. Copy `templates/FocusStrip.tsx` and `templates/focus-strip.css` into the same
   target folder.
2. Wrap the **reading surface** (not the whole app chrome) with `<FocusStrip>`.
3. Give that wrapper a real height so `.focus-strip-viewport` can fill it.
4. Leave follow-the-mouse **out**. Enable with Focus / `F`; dismiss with `Esc`.
   Do **not** enable on double-click.
5. Park at a **fixed viewport Y**. Do not lock the hole to a content node.
6. Add top/bottom **edge handles** so the user can drag a border to resize.
   Middle of the band moves; edges resize; opposite edge stays put.
7. Blur the **veil only** (`backdrop-filter` on `.focus-strip-mask`). Keep
   the hole sharp. Default 5px; toolbox slider 0–25px.
8. Keep the **toolbox above the veil** in z-index (signed 32-bit range;
   never `1e11`). If the overlay is portaled/`position: fixed`, set toolbox
   z-index inline.
9. Optional: `storageKey` / `blurStorageKey`, or controlled
   `height` + `blurRadius` + `parkedCenterY` from the host persist store;
   `scale` (PDF zoom); `scrollerRef`; host toolbar via `FocusStripToolbox`.

## Do not

- Follow the cursor with the strip, or add a control that enables that.
- Enable the strip on double-click. Leave `parkOnDoubleClick` false. Double-click
  is too common on the web and turns the strip on by accident. Enable with
  Focus / `F` only.
- Bind `⌘F` / `Ctrl+F` (Find in page / in document).
- Scroll the page when `↑` / `↓` nudge the strip.
- Store the hole as a content node + `fracY` (or PDF `data-page` + fraction).
  That makes the strip ride the document when the user scrolls. Store a
  stage-relative Y instead so `offsetTop` stays put.
- Snap the band to the pointer on the first drag frame. Keep a grab offset /
  `dragLock` and commit the parked Y on pointer-up.
- Put `pointer-events` on the veil; only the gray band (and its edge handles)
  capture drag.
- Blur the reading hole or the toolbox. Blur belongs on `.focus-strip-mask`.
- Let the veil paint over the toolbox. If both z-indexes overflow
  `2147483647` they clamp equal and the later portal (the veil) wins.
- Use gold / yellow for the band or the sliders.
