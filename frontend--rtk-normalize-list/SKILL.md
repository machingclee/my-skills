---
name: frontend--rtk-normalize-list
description: >-
  Normalize RTK Query list endpoints with normalizeUtil (normalizr wrapper)
  into { ids, idToObject }. Teaches transformResponse, parent components that
  pass only IDs, child selectFromResult lookups, and mutation tag invalidation.
  Use when adding a list API, avoiding N+1 per-item fetches, or introducing
  normalization practice for list endpoints in a React + RTK Query project.
---

# RTK Query List Normalization (`normalizeUtil`)

Every **list** endpoint should normalize its response so child components can
select a single item from the cached list via `selectFromResult` instead of
firing a separate per-item API call (N+1 problem).

This skill assumes a store already exists (typically from
**`frontend--rtk-setup`**). It adds `normalize.ts` and the list pattern.

## Mandatory Trigger

Invoke this skill when the user asks to:

- "normalize a list endpoint" / "use normalizeUtil"
- "avoid N+1" for list → child item rendering
- "add ids / idToObject" to an RTK Query list response
- "select one item from list cache" / use `selectFromResult` on a list query
- set up normalization practice for list APIs in this project

## Prerequisites

- RTK Query `baseApi` (or any `createApi`) already in the project
- Feature api files that use `injectEndpoints` (or will)
- Dependency: `"normalizr": "^3.6.0"` in `package.json` (install if missing)

If the store is missing entirely, run **`frontend--rtk-setup`** first, then
this skill.

## What It Produces

```
src/store/api/
└── normalize.ts   # normalizeUtil — normalizr wrapper for list endpoints
```

Optionally update a feature api (e.g. `exampleApi.ts` or a real feature file)
to demonstrate a normalized list endpoint + invalidating mutation.

## How To Use

1. Read `templates/normalize.ts` and write it to `src/store/api/normalize.ts`
   (or the project's equivalent `api/` folder next to `baseApi`).
2. For every list endpoint, apply the three-part pattern below.
3. Install `normalizr` if it is not already a dependency:
   ```bash
   npm install normalizr
   # or: pnpm add normalizr / yarn add normalizr
   ```

## Normalization Pattern (required for list endpoints)

**Every list endpoint must use `transformResponse` with `normalizeUtil`.**

Without it, rendering 10 list items often triggers 10 per-item API calls.
With normalization, all 10 items share one list call and each child selects
its row from the cached `{ ids, idToObject }`.

### Step 1 — Endpoint: `transformResponse` + list tag

```ts
import normalizeUtil from "./normalize";
// or: import normalizeUtil from "@/store/api/normalize";

getList: builder.query<
    { ids: number[]; idToObject: Record<string, MyEntity> },
    number
>({
    query: (parentId) => `/parent/${parentId}/items`,
    transformResponse: (response: MyEntity[]) =>
        normalizeUtil({ targetArr: response, idAttribute: "id" }),
    providesTags: ["MyEntity"],
}),
```

How to call `normalizeUtil`:

| Argument | Meaning |
| --- | --- |
| `targetArr` | The unwrapped list array (after baseApi envelope unwrap, this is already `T[]`) |
| `idAttribute` | The entity primary-key field name, typed as `keyof T & string` |

Rules:

- `idAttribute` is `keyof T & string` — autocomplete + compile error on typos.
- Return type of the query is `{ ids: IdType[]; idToObject: Record<string, T> }`.
- `ids` keeps the original ID type (e.g. `number` for a numeric PK). No cast needed.
- `idToObject` keys are always `string` (JS object keys). Lookups use
  `idToObject[String(myId)]`.
- Envelope unwrapping stays in `baseApi`; list endpoints still need
  `transformResponse` **only** for normalization (not for `{ success, result }`).

If the backend returns a paginated shape, normalize the array field only:

```ts
transformResponse: (response: { items: MyEntity[]; total: number }) => {
    const { ids, idToObject } = normalizeUtil({
        targetArr: response.items,
        idAttribute: "id",
    });
    return { ids, idToObject, total: response.total };
},
```

### Step 2 — Parent: pass only IDs, not full objects

```ts
const { data } = myApi.endpoints.getList.useQuery(parentId);
const ids = data?.ids ?? [];
//  ^? number[] — type flows from the entity's id field
<ScheduleCard scheduledCarIds={ids} scheduleId={parentId} />
```

Do **not** rebuild an array of objects from `idToObject` in the parent.
Pass IDs down; each child selects what it needs.

### Step 3 — Child: `selectFromResult` for one item from cache

```ts
const { data: item } = myApi.endpoints.getList.useQuery(scheduleId, {
    skip: !scheduleId,
    selectFromResult: (result) => ({
        ...result,
        data: result.data?.idToObject[String(myId)],
    }),
});
// item?.description, item?.scheduleLinks, etc.
```

RTK Query deduplicates identical queries: 10 children each calling
`getList.useQuery(sameScheduleId)` still produce **one** network request.

Always:

- Spread `...result` so `isLoading` / `isError` / `error` stay available if needed.
- Use `String(myId)` when indexing `idToObject`.
- Prefer the same query args the parent used so the cache key matches.

### Step 4 — Mutations: invalidate the list tag

Any mutation that creates, updates, or deletes a list item must invalidate
the list's tag so the list refetches and all children re-render:

```ts
updateItem: builder.mutation<void, { id: number; /* fields */ }>({
    query: ({ id, ...body }) => ({
        url: `/items/${id}`,
        method: "PUT",
        body,
    }),
    invalidatesTags: ["MyEntity"], // refetches list; children update via selectFromResult
}),
```

## Full feature-api sketch

```ts
import { baseApi } from "./baseApi";
import normalizeUtil from "./normalize";

type MyEntity = { id: number; name: string };

export const myApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getList: builder.query<
            { ids: number[]; idToObject: Record<string, MyEntity> },
            number
        >({
            query: (parentId) => `/parent/${parentId}/items`,
            transformResponse: (response: MyEntity[]) =>
                normalizeUtil({ targetArr: response, idAttribute: "id" }),
            providesTags: ["MyEntity"],
        }),
        updateItem: builder.mutation<void, { id: number; name: string }>({
            query: ({ id, ...body }) => ({
                url: `/items/${id}`,
                method: "PUT",
                body,
            }),
            invalidatesTags: ["MyEntity"],
        }),
    }),
});
```

Remember project conventions from setup:

- Call hooks via `myApi.endpoints.getList.useQuery(...)` — never re-export
  `useGetListQuery` from the api module.
- Keep each hook call on a single line.

## What `normalizeUtil` does

Template: `templates/normalize.ts` → `src/store/api/normalize.ts`.

1. Builds a `normalizr` `schema.Entity` with the given `idAttribute`.
2. Runs `normalize(targetArr, [entity])`.
3. Returns:
   - `ids` — ordered list of entity ids (same order as the API array)
   - `idToObject` — map of `String(id)` → entity

Use this helper inside `transformResponse` only; do not normalize ad-hoc in
components.

## Checklist when adding a new list API

- [ ] `normalize.ts` exists next to the feature api / `baseApi`
- [ ] `normalizr` is installed
- [ ] List endpoint return type is `{ ids; idToObject }` (plus any meta)
- [ ] `transformResponse` calls `normalizeUtil({ targetArr, idAttribute })`
- [ ] `providesTags` on the list; matching `invalidatesTags` on mutations
- [ ] Parent passes `ids` only
- [ ] Children use `selectFromResult` + `idToObject[String(id)]`
- [ ] Tag type is registered on `baseApi` `tagTypes` if not already present

## Dependencies

```json
"normalizr": "^3.6.0"
```

(`@reduxjs/toolkit` and `react-redux` come from the store setup skill.)
