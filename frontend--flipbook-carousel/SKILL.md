---
name: frontend--flipbook-carousel
description: >-
  Install a reusable React FlipbookCarousel: stacked 3D cards with drag, optional
  loop, autoplay + progress bar, and arbitrary ReactNode content per card. Use when
  adding a flipbook / card-deck carousel, image stack gallery, or "front peels under
  next" carousel UI in React + TypeScript + Tailwind projects.
---

# Flipbook Carousel

A self-contained **stacked flipbook** carousel: cards share one centered slot,
the front peels on an arc and settles behind the next card. Works with **any
`ReactNode`** per card (images, custom components, video, etc.).

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add a flipbook carousel" / "stacked card carousel" / "deck carousel"
- "front peels under next" / "page-turn image gallery"
- "reusable flipbook" with drag, loop, or autoplay
- wire multi-image ad / product media as a flipbook stack

## What It Produces

Copy these files from `templates/` in this skill folder into the target directory
(e.g. `src/component/shared/` or the feature folder):

```
<target-dir>/
├── FlipbookCarousel.tsx    # component (default export + FlipbookCard type)
└── flipbook-carousel.css   # styles (imported by the TSX next to it)
```

Keep the CSS file **next to** the TSX so `import "./flipbook-carousel.css"` resolves.

## Dependencies

| Package | Required | Notes |
|---------|----------|--------|
| `react` | yes | hooks only |
| `lucide-react` | yes | `ChevronLeft` / `ChevronRight` nav icons |
| Tailwind (optional) | recommended | dots / some utility classes on the root; core layout is plain CSS |

If the project has no `lucide-react`, either install it or swap the icons in the template.

## CSS design tokens used

The CSS expects these custom properties (already present in the HKEV eSales
`index.css` `@theme`). Map or define them in the target project:

| Variable | Role |
|----------|------|
| `--radius-card` | Clip + card corner radius |
| `--color-border-faint` | Stage background, track, borders |
| `--color-surface` | Card content surface, nav background |
| `--color-brand` | Autoplay fill, active dot (via Tailwind `bg-brand` too) |
| `--color-brand-tint` | Nav hover |
| `--color-ink` | Nav icon color |

Tailwind classes used on the component: `relative`, `w-full`, `flex`, `items-center`,
`justify-center`, `gap-1.5`, `mt-2`, `h-1.5`, `rounded-full`, `cursor-pointer`,
`w-4`, `w-1.5`, `bg-brand`, `bg-border-strong/40`, `hover:bg-border-strong`,
`w-4`, `h-4` on icons. Ensure the theme exposes `brand` / `border-strong` or
replace with project equivalents when installing.

## Props

| Prop | Type | Default | Notes |
|------|------|---------|--------|
| `cards` | `FlipbookCard[]` | – | **Required.** `{ id, content }` per slide |
| `className` | `string` | – | Extra class on root |
| `ariaLabel` | `string` | `"Carousel"` | Region label |
| `loop` | `boolean` | `true` | Wrap end↔start; when `false`, clamps + disables edge arrows |
| `autoplay` | `boolean` | `false` | Auto-advance to next card |
| `autoplayIntervalMs` | `number` | `5000` | Delay between advances (clamped to ≥ ~570ms so the flip can finish) |

```ts
export interface FlipbookCard {
  id: number | string
  content: ReactNode
}
```

## Tunable constants (in the TSX)

Edit near the top of `FlipbookCarousel.tsx` after copy:

| Constant | Default | Meaning |
|----------|---------|---------|
| `SIDE_BLUR_PX` | `100` | Max blur on side/rear cards → `0` at center |
| `DRAG_DISTANCE_FRACTION` | `0.42` | Fraction of stage width for one full slide of drag |
| `SNAP_DISTANCE_THRESHOLD` | `0.18` | Drag distance (in slides) to commit next/prev |
| `COMMIT_TURN_MS` | `520` | Fixed duration of the front→rear commit flip |
| `DEFAULT_AUTOPLAY_INTERVAL_MS` | `5000` | Default autoplay delay |

Side cards also get a slight `brightness` boost (`1 + sideT * 0.18`) that eases
to normal at center.

## How It Works (short)

1. **DOM-driven poses** — transforms/filter/z-index painted from a continuous
   `progress` ref (no React re-render per drag frame).
2. **Width-aware stack** — measures each card’s content width so neighbors sit
   past half the selected card (wide images don’t fully hide the deck).
3. **Front→rear arc** — outgoing card swings sideways (width-scaled), then dives
   in Z; z-index follows depth continuously (no midpoint pop).
4. **Commit animation** — on release/nav, a fixed-duration ease finishes the flip
   so the handoff is readable (not matched to finger speed).
5. **Autoplay** — single rAF clock fills a progress bar; advances via `goBy(1)`;
   paused while dragging or mid-commit; restarts only when the flip ends.

## Usage examples

### Minimal images

```tsx
import FlipbookCarousel from "./FlipbookCarousel"

<FlipbookCarousel
  ariaLabel="Product photos"
  cards={urls.map((url, i) => ({
    id: i,
    content: <img src={url} alt="" draggable={false} />,
  }))}
/>
```

### Loop off + autoplay with custom interval

```tsx
<FlipbookCarousel
  cards={cards}
  loop={false}
  autoplay
  autoplayIntervalMs={8000}
/>
```

### Custom ReactNode cards

```tsx
const cards = items.map((item) => ({
  id: item.id,
  content: (
    <div className="p-4 max-w-sm">
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </div>
  ),
}))

<FlipbookCarousel cards={cards} autoplay loop />
```

## Install checklist

1. Copy `templates/FlipbookCarousel.tsx` and `templates/flipbook-carousel.css`
   into the target folder (same directory).
2. Ensure `lucide-react` is installed (or replace chevrons).
3. Align CSS variables / Tailwind theme tokens (or substitute project tokens).
4. Import and pass `cards: { id, content }[]`.
5. Optional: set `loop`, `autoplay`, `autoplayIntervalMs`, `ariaLabel`.

## Wiring notes

- Prefer **one carousel instance per media group**; keys on cards should be
  stable (`id` from data, not array index when reordering).
- Nested `img` / `video` load events remeasure widths so spacing updates after
  media decodes.
- Clip shell (`.flipbook-clip`) is separate from the 3D stage so `overflow: hidden`
  actually clips filter blur bleed.
- Nav arrows live **outside** the clip so they stay clickable and unclipped.
- Do not put interactive controls that need pointer events *inside* card content
  without adjusting `pointer-events` — cards are non-interactive by default
  (drag is owned by the stage).

## Do not

- Reintroduce drag-velocity-matched commit timing for the flip (it kills the
  readable front→rear handoff).
- Put `overflow: hidden` only on the same node as `perspective` / `preserve-3d`
  and expect blur to clip.
- Hardcode image-only APIs (`url`/`alt` slides) — always use `content: ReactNode`.
