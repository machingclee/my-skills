---
name: frontend--rtk-optimistic-update
description: >-
  Implement optimistic cache updates on RTK Query mutations using
  onQueryStarted + updateQueryData + patchResult.undo(). Updates the
  cached query data immediately and rolls back if the server rejects.
---

# RTK Query Optimistic Update

When a mutation changes data that is already displayed in the UI via a
cached query, apply the change to the cache immediately so the user sees
the result without waiting for a refetch. If the server rejects the
mutation, roll back to the previous state.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "add optimistic update" / "optimistic cache update" to a mutation
- "update the cache immediately" / "apply changes before server responds"
- "rollback if mutation fails" on an RTK Query endpoint

## The Pattern

```ts
endpointName: builder.mutation<ResponseType, ArgType>({
    query: (arg) => ({ url: `/path/${arg.id}`, method: "PUT", body: arg }),
    invalidatesTags: (_result, _error, arg) => [
        { type: "Tag", id: arg.id },
    ],
    onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
            apiName.util.updateQueryData('queryName', queryArg, (draft) => {
                // Mutate the cached draft to reflect the expected new state
                const item = draft.find((x) => x.id === arg.id)
                if (item) Object.assign(item, arg)
            }),
        )
        try {
            await queryFulfilled
        } catch {
            patchResult.undo()
        }
    },
}),
```

## How It Works

1. `updateQueryData(queryName, queryArg, updater)` takes a snapshot of
   the current cached data for that query, then runs the updater function
   on an Immer draft. It returns a `patchResult` object.

2. `patchResult.undo()` reverts the cache to the snapshot. Call it in the
   `catch` block so a failed mutation leaves the cache unchanged.

3. `queryFulfilled` is a promise that resolves when the mutation succeeds
   and rejects on failure. Do not call `.unwrap()` — the promise already
   reflects success/failure.

4. The `invalidatesTags` still runs on success, which eventually refetches
   the real data from the server. The optimistic update fills the gap
   between the button click and the refetch.

## Finding Properly

`queryName` must be the query name as declared on the same api, e.g.
`'getCategories'` or `'getCarModels'`.

`queryArg` must be the argument the query was called with. For queries
that take no argument (like `builder.query<X[], void>`), pass the
argument that was used when subscribing — typically `undefined`:

```ts
api.util.updateQueryData('getCategories', undefined, (draft) => { ... })
```

For queries that take an argument, pass the same value that the
subscribing component used:

```ts
// Query: getSchedulesByCarModel(carModelId)
api.util.updateQueryData('getSchedulesByCarModel', carModelId, (draft) => { ... })
```

## Updating a Single Item vs a List

**List of items** — find by id and merge:

```ts
const item = draft.find((x) => x.id === arg.id)
if (item) Object.assign(item, arg)
```

**Single item** — merge directly onto the draft:

```ts
if (draft) Object.assign(draft, arg)
```

**Delete** — remove from list optimistically:

```ts
const index = draft.findIndex((x) => x.id === arg)
if (index >= 0) draft.splice(index, 1)
```

## Examples

### Update a category (list query, void arg)

```ts
updateCategory: builder.mutation<CarModelCategory, { id: number } & UpdateDTO>({
    query: (body) => ({ url: `/categories/${body.id}`, method: "PUT", body }),
    invalidatesTags: (_r, _e, body) => [{ type: "CarModelCategory", id: body.id }],
    onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
            carModelApi.util.updateQueryData('getCategories', undefined, (draft) => {
                const item = draft.find((c) => c.id === arg.id)
                if (item) Object.assign(item, arg)
            }),
        )
        try { await queryFulfilled } catch { patch.undo() }
    },
}),
```

### Update a schedule (single-item query with arg)

```ts
updateSchedule: builder.mutation<BookingSchedule, { id: number } & UpdateDTO>({
    query: (body) => ({ url: `/schedules/${body.id}`, method: "PUT", body }),
    invalidatesTags: (_r, _e, body) => [{ type: "Schedule", id: body.id }],
    onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
            bookingApi.util.updateQueryData('getSchedulesByCarModel', carModelId, (draft) => {
                if (draft?.schedule) Object.assign(draft.schedule, arg)
            }),
        )
        try { await queryFulfilled } catch { patch.undo() }
    },
}),
```

### Delete a car row (list query with arg)

```ts
deleteScheduledCar: builder.mutation<void, number>({
    query: (id) => ({ url: `/cars/${id}`, method: "DELETE" }),
    invalidatesTags: (_r, _e, id) => [{ type: "ScheduledVehicle", id }],
    onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
            bookingApi.util.updateQueryData('getSchedulesByCarModel', carModelId, (draft) => {
                if (draft) {
                    draft.scheduledVehicles = draft.scheduledVehicles.filter((c) => c.id !== id)
                }
            }),
        )
        try { await queryFulfilled } catch { patch.undo() }
    },
}),
```

## Caveats

- The optimistic update only patches the **cache**. If the query has
  multiple subscribers with different arguments, each cache entry needs
  its own call to `updateQueryData`.
- `invalidatesTags` still refetches on success, which overwrites the
  optimistic patch with the real server data. This is the desired
  behavior — the optimistic update is a visual bridge, not the source of
  truth.
- If a mutation has no `invalidatesTags`, the optimistic patch becomes
  the permanent cache until the next refetch or unmount/remount cycle.
