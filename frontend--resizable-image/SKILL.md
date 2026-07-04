---
name: frontend--resizable-image
description: >-
  Create a ResizableImage React component that renders an inline image with
  horizontal mouse-drag resizing. Hover to reveal a blue outline; click and
  drag left/right to resize (min 50 px). Fires an onWidthChange callback with
  the final width on mouse-up. Use when adding user-adjustable images to any
  React UI — markdown previewers, rich-text editors, image galleries.
---

# ResizableImage

A self-contained React component: an image the user resizes by clicking
anywhere on it and dragging horizontally. No drag-handle UI — the whole image
is the drag surface.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add a resizable image" / "make images resizable" to a component.
- "add drag-to-resize" / "horizontal image resize" to a React view.
- "make images user-adjustable width" in a markdown previewer or editor.
- "let users resize images by dragging".

## What It Produces

One file copied into the target directory:

```
<target-dir>/
└── ResizableImage.tsx   # inline-block image with drag-to-resize
```

Copy the template from `templates/ResizableImage.tsx` in this skill folder.

## Props

| Prop | Type | Required | Default | Notes |
|---|---|---|---|---|
| `src` | `string` | ✓ | – | Image URL |
| `alt` | `string` | ✓ | – | Alt text |
| `initialWidth` | `number \| undefined` | | `undefined` | Starting pixel width; when absent the image fills its container at 100 % |
| `onWidthChange` | `(width: number) => void` | | `undefined` | Callback fired on mouse-up with the final pixel width |

## How It Works

1. The wrapper `<div>` is `display: inline-block` so it shrink-wraps to content
   unless a width is set.
2. On **hover** the outline transitions to `3px solid #3e6df1` (blue) and the
   cursor changes to `nesw-resize`.
3. On **mousedown** anywhere on the image, the component records the starting
   mouse x-coordinate and current container width (the DOM `getBoundingClientRect`
   if no explicit width, falling back to 300 px). It then attaches global
   `mousemove`/`mouseup` listeners so drags can leave the element without
   cancelling.
4. On **mousemove** the width updates live via React state (clamped to ≥ 50 px).
   A horizontal-bias delta formula subtracts vertical movement to keep the
   resize intuitive for mostly-horizontal drags.
5. On **mouseup** the final clamped width is passed to `onWidthChange`, the
   listeners are cleaned up, and the drag ref is reset.
6. If `initialWidth` is provided (e.g. parsed from a URL `?width=` query param),
   the image starts at that width; otherwise it renders at `width: 100%`.

## Wiring Notes (tell the user once)

- The component uses **only React hooks** (`useState`, `useRef`) — no extra
  dependencies beyond React itself.
- The outline color `#3e6df1` is hardcoded; swap if the project uses a
  different accent color or CSS variable.
- The minimum width (50 px) is a magic number in the template — adjust if your
  images need a different floor.
- `draggable={false}` on the `<img>` prevents the browser's native image drag
  ghost from interfering with the resize drag.
- The delta calculation `ev.clientX - startRef.current!.x - (ev.clientY - e.clientY)`
  subtracts any vertical movement so the resize feels precise even when the
  mouse drifts diagonally. The formula is the one from this author's canonical
  implementation in `MarkdownPreviewer.tsx` — keep it verbatim.

## Template Specialisation

Copy `templates/ResizableImage.tsx`, then adjust these project-specific details:

1. **Import path** — resolve `React` import to the project's convention
   (`import React from "react"` → `import { useState, useRef } from "react"` if
   not using the default namespace import).
2. **Accent colour** — replace `#3e6df1` with the project's primary/accent
   colour or a CSS variable.
3. **Min width** — change `50` to a different floor if the use case needs it.
4. **Inline styles** — if the project prefers CSS modules or Tailwind, extract
   the inline styles; but the inline approach keeps the component zero-dependency
   and self-contained, which is the point.
