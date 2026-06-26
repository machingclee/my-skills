---
name: setup-rtk
description: >-
  Scaffold a Redux Toolkit + RTK Query store folder (src/store/): a
  configureStore entry point, typed React-Redux hooks, an appSlice boilerplate
  that stores accessToken and refreshToken, a baseApi, and a feature api with a
  dummy endpoint that extends the baseApi via injectEndpoints. Use when setting
  up Redux state management for a React app, scaffolding the store folder, or
  creating a new appSlice / baseApi boilerplate.
---

# Redux Store Scaffold

This skill scaffolds a minimal, clear Redux Toolkit + RTK Query store folder.
It mirrors the conventions used in this author's React projects:
`store.ts` (configureStore) → typed `hooks.ts` → `slices/` (createSlice) and
`api/` (createApi + `injectEndpoints`).

## Mandatory Trigger

Invoke this skill before writing any store code when the user asks to:

- "set up Redux" / "scaffold the store folder" / "create a store" for a React app.
- "create an appSlice" that stores tokens (accessToken / refreshToken).
- "create a baseApi" or a feature api with a dummy endpoint extending it.
- "add RTK Query" / "set up Redux Toolkit" boilerplate.

## What It Produces

Create this folder tree under the project's `src/` (or `app/`, per the project):

```
src/store/
├── store.ts                 # configureStore + localStorage write-through subscriber
├── hooks.ts                 # typed useAppDispatch / useAppSelector
├── slices/
│   └── appSlice.ts          # accessToken + refreshToken (hydrates from localStorage)
└── api/
    ├── baseApi.ts           # createApi — auto headers, auto {success,result} unwrap
    └── exampleApi.ts        # injectEndpoints — one dummy endpoint
```

### What the templates include by default

- **`baseApi.ts`** — reads `accessToken` + `refreshToken` from localStorage and
  attaches `Authorization: Bearer …` and `Refresh-Token: …` on every request.
  Automatically unwraps the backend envelope `{ success, errorDescription, errorCode, result }`.
  Includes a **token refresh retry mechanism**: when the backend returns
  `JWT_EXPIRED` the access token is silently refreshed and the request retried
  once. Token clearing happens in two places:
  - `attemptTokenRefresh()` — clears tokens when there is no refresh token,
    the refresh endpoint returns a non-2xx response, or the body has
    `success: false` (LOGIN_EXPIRED).  This is the primary path because
    LOGIN_EXPIRED is typically returned by the refresh endpoint itself (called
    via raw `fetch`, not through `rawBaseQuery`).
  - `unwrapEnvelope()` — clears tokens when a regular endpoint directly
    returns `LOGIN_EXPIRED` (safety net).
  `clearAuthTokens()` removes from localStorage AND dispatches `clearTokens()`
  to Redux via a direct `import { store }` (safe because it only runs at
  runtime, never during module evaluation).  Endpoints just declare
  `builder.mutation<ReturnType, InputType>` — no `transformResponse` needed.
- **`appSlice.ts`** — initialises token state from localStorage so the store
  survives a full-page reload.  The `clearTokens` reducer sets `accessToken`,
  `refreshToken`, and (if present) `authenticatedUser` to `null`.
- **`store.ts`** — subscribes to Redux changes and writes tokens back to
  localStorage (write-through), plus cross-tab sync via `storage` and
  `auth-tokens-changed` events.  The subscribe callback captures change flags
  *before* updating the `prev*` references so the event dispatch check works
  correctly.

## How To Use

1. Read each template under `templates/` in this skill folder.
2. Write it to the matching path in the target project, preserving the
   subdirectory layout (`slices/`, `api/`).
3. Use relative imports between store files (the templates already do) so the
   boilerplate works whether or not the project has an `@/` path alias.
4. Keep it minimal — do not add extra endpoints, middleware, or state unless the
   user asks. The point is a clean starting point.

Templates map 1:1 to the tree above:

- `templates/store.ts`        → `src/store/store.ts`
- `templates/hooks.ts`        → `src/store/hooks.ts`
- `templates/slices/appSlice.ts` → `src/store/slices/appSlice.ts`
- `templates/api/baseApi.ts`  → `src/store/api/baseApi.ts`
- `templates/api/exampleApi.ts` → `src/store/api/exampleApi.ts`

## Wiring Notes (tell the user once)

- `baseApi` must be registered in `store.ts` — both its `reducer`
  (`[baseApi.reducerPath]: baseApi.reducer`) and its `middleware`
  (`getDefaultMiddleware().concat(baseApi.middleware)`). The template already
  does both.
- A feature api like `exampleApi` does NOT need to be added to the store. Its
  endpoints are injected the first time the file (or its exported hooks) is
  imported by a component.
- **Never** destructure hook names from the api object:
  ```ts
  // ❌ WRONG — do not do this:
  export const { useGetExampleQuery } = exampleApi;
  ```
  Instead, import the api object directly and call hooks via `.endpoints`:
  ```ts
  // ✅ CORRECT:
  import { exampleApi } from "@/store/api/exampleApi";

  // In the component:
  const { data, isLoading } = exampleApi.endpoints.getExample.useQuery();
  const [trigger, { isLoading }] = exampleApi.endpoints.createExample.useMutation();
  const [lazyTrigger] = exampleApi.endpoints.getExample.useLazyQuery();
  ```
  This keeps the hook origin explicit and avoids polluting the module scope
  with dozens of re-exported names.
- **Never** split `useQuery()` / `useMutation()` / `useLazyQuery()` calls
  across multiple lines. Keep the entire destructuring + hook call on one line:
  ```ts
  // ❌ WRONG — split across lines:
  const [selectTimeslot, { isLoading: selectingTimeslot }] =
      bookingApi.endpoints.selectTimeslot.useMutation();

  // ✅ CORRECT — single line:
  const [selectTimeslot, { isLoading: selectingTimeslot }] = bookingApi.endpoints.selectTimeslot.useMutation();
  const { data, isLoading } = exampleApi.endpoints.getExample.useQuery();
  ```
- `fetchBaseQuery` is used with `prepareHeaders` that reads tokens from
  localStorage and attaches `Authorization` + `Refresh-Token` on every request.
  The baseQuery wrapper automatically unwraps the `{ success, result }` envelope
  returned by the backend — no `transformResponse` needed on individual endpoints.
- To change the token header logic (e.g. read from Redux state instead of
  localStorage), edit `prepareHeaders` in `baseApi.ts`.
- To change the response unwrapping logic (e.g. different envelope shape), edit
  the `baseQuery` wrapper in `baseApi.ts`.

### Adjusting the retry mechanism

The top of `baseApi.ts` has clearly labelled constants — change these to match
your backend's conventions without hunting through the rest of the file:

```ts
const JWT_EXPIRED_CODE = "JWT_EXPIRED";   // triggers refresh + retry
const LOGIN_EXPIRED_CODE = "LOGIN_EXPIRED"; // triggers logout
const REFRESH_PATH = "/auth/access-token/refresh";
```

- **Add more retry-trigger codes** — change the `=== JWT_EXPIRED_CODE` comparison
  to a set lookup or regex match.
- **Change the refresh endpoint method/headers** — edit `attemptTokenRefresh()`.
- **Disable retry entirely** — remove the `JWT_EXPIRED_CODE` / `LOGIN_EXPIRED_CODE`
  blocks from `unwrapEnvelope()`.
- **Retry more than once** — wrap the retry in a loop with a counter instead of a
  single `if`.

## Dependencies

Requires these in the project's `package.json`:

```json
"@reduxjs/toolkit": "^2.0.0",
"react-redux": "^9.0.0"
```

The `<Provider store={store}>` must wrap the app at its root.