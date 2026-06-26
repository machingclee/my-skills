---
name: minimize-props-tree
description: >-
  Refactor React components to own their RTK Query hooks directly instead
  of receiving data through props. Only cross-component state (selected IDs,
  active IDs) is passed as props. Eliminates prop-drilling and keeps the
  parent orchestrator minimal.
---

# Minimize Props Tree

When a parent component fetches data via RTK Query and passes it down as
props to child components, refactor so each child calls its own
`useQuery`/`useMutation` hooks directly. RTK Query caches results, so calling
the same endpoint in multiple components does **not** cause duplicate network
requests.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "minimize props" / "reduce prop drilling" / "clean up props"
- "move queries into the component" / "each component owns its data"
- Any refactoring where RTK Query data is passed through multiple layers of props

## The Pattern

### Before (anti-pattern)

```
Parent
  ├─ useQuery()         ← all data fetched here
  ├─ useMutation()
  ├─ handlers
  └─ passes data + handlers as props →
       ChildA ({ data, isLoading, onSave, ... })
       ChildB ({ data, onDelete, ... })
```

### After

```
Parent                      ← only cross-component state + status
  ├─ selectedId / onSelectId
  ├─ activeId / onSetActiveId
  ├─ onStatus(kind, msg)
  └─ children →
       ChildA ({ selectedId, onStatus })   ← own useQuery, useMutation
       ChildB ({ activeId, onStatus })     ← own useQuery, useMutation
```

## Rules

### 1. Each component owns its queries and mutations

```tsx
// ✅ CORRECT — query and mutation live in the component that renders the data
export default function Step2ScheduleDetail({ selectedCarModelId, onStatus }: Props) {
    const { data, isLoading } = bookingApi.endpoints.getSchedulesByCarModel.useQuery(
        selectedCarModelId!,
        { skip: selectedCarModelId === null },
    )
    const [updateSchedule, { isLoading: updating }] =
        bookingApi.endpoints.updateSchedule.useMutation()
    // ... render using data directly
}
```

```tsx
// ❌ WRONG — data fetched in parent, passed down as props
export default function Parent() {
    const { data } = api.endpoints.getSomething.useQuery()
    return <Child data={data} />
}
```

### 2. Only cross-component state is passed as props

The only props that should remain are IDs that one component sets and another
reads, plus a status callback:

| Prop | Why it stays |
|---|---|
| `selectedCarModelId` | Step1 sets it, Step2 query depends on it |
| `activeScheduledVehicleId` | Step2 sets it, Step3 query depends on it |
| `onStatus(kind, msg)` | Page-level status bar, set by any step |

### 3. Local UI state stays in the component

State that only one component cares about (expand/collapse, edit mode,
delete confirmation, form inputs) is declared locally with `useState`.

### 4. Use `key` to force remount when ID changes

When a component uses `skip` based on an ID that can change, add a `key`
prop so React unmounts/remounts it. This clears stale cache data and resets
local UI state:

```tsx
<Step2ScheduleDetail
    key={selectedCarModelId ?? 'no-car-model'}
    selectedCarModelId={selectedCarModelId}
    onStatus={handleStatus}
/>
```

### 5. Page-level status uses a callback

Instead of passing `setStatusMessage`/`setStatusKind` directly (or passing
the status as props), use a single `onStatus` callback:

```tsx
// In parent:
function handleStatus(kind: 'info' | 'success' | 'error', message: string) {
    setStatusKind(kind)
    setStatusMessage(message)
}

// In child:
onStatus('success', 'Schedule updated.')
```

### 6. Mutations use tag invalidation, not prop callbacks

Don't pass mutation triggers as props. Each component calls its own
mutations. RTK Query's tag invalidation ensures all subscribed queries
refetch automatically:

```tsx
// ✅ Mutations invalidate tags → queries refetch automatically
createSchedule: builder.mutation({
    invalidatesTags: (_result, _error, { carModelId }) => [
        { type: "Schedule", id: carModelId },
    ],
}),
```

## Before/After Example

### Before — 62-line Booking.tsx with all queries/mutations/handlers

```tsx
export default function Booking() {
    // ~15 state variables
    // 3 useQuery calls
    // 7 useMutation calls
    // 8 handler functions
    // passes 20+ props to each child
    return (
        <Step1CarModelSelect
            carModels={carModels}
            carModelsLoading={carModelsLoading}
            selectedCarModelId={selectedCarModelId}
            onSelectCarModel={setSelectedCarModelId}
            selectedCarModel={selectedCarModel}
            maxBookingNum={maxBookingNum}
            onMaxBookingNumChange={setMaxBookingNum}
            creatingSchedule={creatingSchedule}
            onCreateSchedule={handleCreateSchedule}
        />
        <Step2ScheduleDetail
            schedulesLoading={schedulesLoading}
            schedule={schedule}
            scheduledVehicles={scheduledVehicles}
            // ... 15 more props
        />
        // ...
    )
}
```

### After — 15-line Booking.tsx with only shared state

```tsx
export default function Booking() {
    const [selectedCarModelId, setSelectedCarModelId] = useState<number | null>(null)
    const [activeScheduledVehicleId, setActiveScheduledVehicleId] = useState<number | null>(null)
    const [statusMessage, setStatusMessage] = useState('')
    const [statusKind, setStatusKind] = useState<'info' | 'success' | 'error'>('info')

    function handleStatus(kind, message) { setStatusKind(kind); setStatusMessage(message) }

    return (
        <>
            {statusMessage && <StatusBanner ... />}
            <Step1CarModelSelect
                selectedCarModelId={selectedCarModelId}
                onSelectCarModel={setSelectedCarModelId}
                onStatus={handleStatus}
            />
            <Step2ScheduleDetail
                key={selectedCarModelId ?? 'no-car-model'}
                selectedCarModelId={selectedCarModelId}
                activeScheduledVehicleId={activeScheduledVehicleId}
                onSetActiveVehicle={setActiveScheduledVehicleId}
                onStatus={handleStatus}
            />
            {activeScheduledVehicleId !== null && (
                <Step3TimeslotManager
                    activeScheduledVehicleId={activeScheduledVehicleId}
                    onStatus={handleStatus}
                />
            )}
        </>
    )
}
```

## File Structure

Group related components in a directory named after the page:

```
src/component/Page/Booking/
├── Booking.tsx               ← orchestrator (shared state + status only)
├── bookingHelpers.ts         ← shared utilities & constants
├── Step1CarModelSelect.tsx   ← owns getCarModels query + createSchedule mutation
├── Step2ScheduleDetail.tsx   ← owns schedules query + edit/delete mutations
└── Step3TimeslotManager.tsx  ← owns timeslots query + create/select mutations
```
