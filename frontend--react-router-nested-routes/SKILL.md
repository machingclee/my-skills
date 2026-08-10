---
name: frontend--react-router-nested-routes
description: >-
  Prefer React Router nested <Route> trees, <Outlet />, useParams, useMatch, and
  useOutletContext over manual pathname.split / segment-based routing. Use when
  adding feature routes, multi-step wizards, detail/calendar subviews, or when
  refactoring code that parses URL segments by hand.
---

# React Router Nested Routes (not segment parsing)

When routing multi-step or nested UIs in a React app, **declare paths with
`<Route>`** and read state via React Router APIs. Do **not** parse
`location.pathname` with `split('/')`, regex segment maps, or hand-rolled
“parts[1] === 'scheduled-instances'” logic.

## Mandatory Trigger

Invoke this skill when the user asks to:

- Add / change frontend navigation for a feature (booking, wizard, detail page)
- “Use Outlet / nested routes / Route-based routing”
- Refactor “segment-based” or “pathname parsing” routing
- Wire multi-step flows to URLs (`/feature`, `/feature/:id`, `/feature/:id/…`)
- Share layout (header, stepper, status) across sub-pages

Also apply **by default** whenever you write or refactor React Router code in a
project that uses `react-router-dom`.

## Anti-pattern (do not do this)

```tsx
// ❌ WRONG — hand-parsed path segments
const { pathname } = useLocation()
const segments = pathname.replace(/^\/booking\/?/, '')
const parts = segments.split('/').filter(Boolean)
const carModelId = parts[0] ? Number(parts[0]) : null
const scheduledCarId =
  parts[1] === 'scheduled-instances' && parts[2] && parts[3] === 'calendar'
    ? Number(parts[2])
    : null
const isCalendarView = scheduledCarId != null
const currentStep = isCalendarView ? 2 : parts[1] === 'scheduled-instances' ? 2 : 1
```

Problems:

- Route shape is implicit and easy to break
- No single source of truth for valid URLs
- Hard to add steps, optional segments, or redirects
- `useParams` / nested layouts unused

## Correct pattern

### 1. Declare the tree in the app router

```tsx
// router.tsx (or equivalent)
import { Navigate, Route, Routes } from 'react-router-dom'

<Route
  path="/booking"
  element={
    <RequireAuth>
      <Booking />   {/* layout shell */}
    </RequireAuth>
  }
>
  <Route index element={<BookingModelStep />} />
  <Route path=":carModelId" element={<BookingModelStep />} />
  <Route path=":carModelId/scheduled-instances" element={<BookingInstancesStep />} />
  <Route
    path=":carModelId/scheduled-instances/:scheduledCarId/calendar"
    element={<BookingCalendarStep />}
  />
  <Route path="*" element={<Navigate to="/booking" replace />} />
</Route>
```

URL shapes stay explicit and discoverable in one place.

### 2. Layout route renders shared chrome + `<Outlet />`

```tsx
// Booking.tsx — layout only
import { Outlet, useMatch, useNavigate, useOutletContext, useParams } from 'react-router-dom'

export type BookingOutletContext = {
  onStatus: (kind: 'info' | 'success' | 'error', message: string) => void
}

export function useBookingOutlet() {
  return useOutletContext<BookingOutletContext>()
}

export default function Booking() {
  const { carModelId } = useParams<{ carModelId?: string }>()
  const isCalendarView = useMatch({
    path: '/booking/:carModelId/scheduled-instances/:scheduledCarId/calendar',
    end: true,
  }) != null

  // header, stepper, status banner…
  return (
    <div>
      {/* shared UI */}
      <Outlet context={{ onStatus: handleStatus } satisfies BookingOutletContext} />
    </div>
  )
}
```

### 3. Child routes own their step UI; IDs from `useParams`

```tsx
// BookingCalendarStep.tsx
import { useParams } from 'react-router-dom'
import { useBookingOutlet } from './Booking'

export default function BookingCalendarStep() {
  const { onStatus } = useBookingOutlet()
  const { carModelId, scheduledCarId } = useParams<{
    carModelId: string
    scheduledCarId: string
  }>()
  // fetch + render calendar for those ids
}
```

### 4. Detect view/step with `useMatch` (or nested layout routes), not string hacks

```tsx
const calendarMatch = useMatch({
  path: '/booking/:carModelId/scheduled-instances/:scheduledCarId/calendar',
  end: true,
})
const instancesMatch = useMatch({
  path: '/booking/:carModelId/scheduled-instances',
  end: true,
})
const currentStep = calendarMatch || instancesMatch ? 2 : 1
```

Prefer **extra nested layout routes** when step chrome differs a lot, instead of
branching heavily in one layout.

### 5. Navigate with real paths (same as declared routes)

```tsx
navigate(`/booking/${modelId}/scheduled-instances/${scheduledCarId}/calendar`)
// or relative:
navigate(`scheduled-instances/${scheduledCarId}/calendar`)
```

Do not invent segment conventions that are not in the route tree.

## Checklist when adding or refactoring routes

1. **List URL shapes** the product needs (index, entity, nested resource, action view).
2. **Add nested `<Route>` entries** under a layout parent in `router.tsx` (or the app’s route module).
3. **Layout component**: shared header/stepper/status + `<Outlet context={…} />`.
4. **Leaf components**: `useParams` for ids; `useOutletContext` for shared callbacks; own data fetching.
5. **Step / mode detection**: `useMatch` or nested layouts — never `pathname.split`.
6. **Invalid paths**: child `path="*"` → `<Navigate to="…" replace />` or a not-found page.
7. **Auth**: wrap the layout route (or a parent) once; do not re-parse auth from the path.
8. **Remove** any leftover segment-parsing helpers once routes are live.

## Sharing state across nested routes

| Need | Prefer |
|------|--------|
| IDs from URL | `useParams()` |
| “Am I on this path?” | `useMatch()` / `useMatches()` |
| Shared UI callbacks (toast/status) | `Outlet` `context` + typed `useOutletContext` |
| Shared server data | RTK Query (or your cache) keyed by param ids in each leaf |
| Cross-step ephemeral UI state | Lift to layout, or small context — not the URL unless bookmarkable |

Do **not** pass large domain objects only through route context if they already
live in the API cache; pass ids and re-select.

## When a catch-all `path="/feature/*"` is OK

Only as a **temporary** host while migrating, or when a whole subtree still owns
its own inner `<Routes>`. Prefer moving those inner routes into the parent tree
so the app has one authoritative route table.

```tsx
// Acceptable only short-term
<Route path="/legacy/*" element={<LegacyPageWithInternalRoutes />} />

// Preferred
<Route path="/feature" element={<FeatureLayout />}>
  <Route index element={<FeatureIndex />} />
  <Route path=":id" element={<FeatureDetail />} />
</Route>
```

## Naming conventions (suggested)

- Layout: `Feature.tsx` or `FeatureLayout.tsx`
- Steps / leaves: `FeatureModelStep.tsx`, `FeatureDetail.tsx`, `FeatureCalendarStep.tsx`
- Context hook: `useFeatureOutlet()` next to the layout
- Param names: descriptive (`carModelId`, `scheduledCarId`) — same names in path and `useParams`

## Done criteria

- No `pathname.split`, no ad-hoc segment index checks for routing decisions
- Every navigable URL appears as a `<Route path=…>`
- Layout uses `<Outlet />`; leaves use `useParams` / outlet context
- Adding a new step means adding a route + leaf component, not extending a parser
