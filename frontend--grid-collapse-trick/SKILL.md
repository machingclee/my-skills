---
name: frontend--grid-collapse-trick
description: >-
  Animate height or width collapse/expand in Tailwind using CSS grid `0fr`/`1fr`
  instead of `max-h`/`max-w` hacks. Use when adding collapsible sections, drawers,
  accordions, or any animated show/hide that needs smooth height/width transitions
  without guessing pixel values.
---

# Grid Collapse Trick

CSS `grid-template-rows` / `grid-template-columns` with `0fr` and `1fr` values
animate natively via `transition-all`. Unlike `max-h-0` → `max-h-96` hacks, the
`fr` unit works for any content size — no guessing `max-*` values.

## Pattern

```
<div class="grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}">
  <div class="overflow-hidden">
    <!-- collapsible content -->
  </div>
</div>
```

- Outer: `grid` + `transition-all` + toggle between `grid-rows-[0fr]` (collapsed) and `grid-rows-[1fr]` (expanded)
- Inner: `overflow-hidden` clips content during collapse

## Vertical (height)

```html
<div class="grid transition-all duration-300 ease-in-out
  ${open ? 'grid-rows-[1fr] pt-3 border-t' : 'grid-rows-[0fr]'}">
  <div class="overflow-hidden">
    <!-- content -->
  </div>
</div>
```

## Horizontal (width)

```html
<div class="grid transition-all duration-300
  ${open ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'}">
  <div class="overflow-hidden">
    <!-- content -->
  </div>
</div>
```

