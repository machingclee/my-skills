---
name: frontend--fade-transition
description: >-
  Fade in/out elements with Tailwind CSS — opacity transition for state toggles,
  keyframe animation for mount effects. Use when adding show/hide or entrance
  animations to any element.
---

# Fade Transition

## Toggle fade (state-driven)

`pointer-events-none` prevents clicks when hidden.

```html
<div class="transition-opacity duration-300
  ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}">
  <!-- content -->
</div>
```

## Mount fade (on first render)

Define keyframes in global CSS:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInOpacity {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

Then use via Tailwind arbitrary `animate`:

```html
<!-- With slide-up -->
<div class="animate-[fadeIn_0.3s_ease]">...</div>

<!-- Opacity only (for backdrops, overlays) -->
<div class="animate-[fadeInOpacity_0.2s_ease]">...</div>
```
