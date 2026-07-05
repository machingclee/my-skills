---
name: express--zod-swagger-integration
description: >-
  Integrate Zod validation and auto-generated Swagger docs into an existing
  Express TypeScript app. Replaces `const app = express()` with a
  `createDocApp()` that accepts FastAPI-style endpoint configs
  (`app.post("/path", { requestBodySchema, responseSchema, summary }, handler)`).
  Routes are auto-registered in an OpenAPI registry and served at `/api-docs`
  via swagger-ui-express. Request bodies are validated via a reusable
  `validate` middleware; response bodies are documented and optionally
  validated at runtime. Ships ready-to-copy source templates in `templates/src/`
  so the skill is self-contained — no reference repo needed. Use when the user
  wants to add Swagger docs to an Express app, integrate Zod with Express
  routes, add request/response validation, generate OpenAPI from Zod schemas,
  or migrate from plain Express to a schema-first API style.
---

# Express + Zod + Swagger UI Integration

Adds FastAPI-style route registration to an existing Express app. For each
route you define a Zod schema for the request body (and/or query) and the
response body, plus a summary. In return you get, with **no boilerplate**:

- **Runtime request validation** — invalid bodies return `400` with structured
  issues before your handler runs.
- **Runtime response validation** — your handler's `res.json()` payload is
  checked against `responseSchema`; a mismatch is logged and returns `500`.
- **Compile-time types** — `req.body` is `z.infer`'d from the request schema,
  `res.json()` is narrowed to the response schema. No casts, no annotations.
- **Auto-generated OpenAPI 3.0** — served as JSON at `/api-docs.json` and as
  Swagger UI at `/api-docs`, rebuilt from the route registry on every boot.

## Architecture

```
app.get ("/path", { querySchema, responseSchema, summary }, handler)
app.post("/path", { requestBodySchema, responseSchema, summary }, handler)
        │
        ▼
   createDocApp() — patched Express app (get/post/put/delete/patch)
        │
        ├── isConfig(arg)? ── no ──▶ plain Express passthrough
        │
        └── yes ── FastAPI-style registration:
             ├── validate(requestBodySchema)   middleware (Zod safeParse on req.body → 400)
             ├── res.json wrapper               (Zod safeParse on 2xx body → log + 500)
             ├── registry.push({ method, path, ...config })
             │        │
             │        ▼
             │   generateOpenApiDoc()  →  OpenAPI 3.0 JSON
             │        │
             │        ▼
             │   setupSwagger()        →  GET /api-docs.json  +  /api-docs (swagger-ui-express)
             │
             └── TypedRequest / TypedResponse   (compile-time: z.infer types via overloads)
```

## Files it adds

| File | Role |
|------|------|
| `src/middlewares/validate.ts` | Reusable `validate(schema)` middleware factory. Returns `400` + issues on failure; replaces `req.body` with parsed data on success. |
| `src/docs/routeRegistry.ts` | `createDocApp()`, `setupSwagger()`, `generateOpenApiDoc()`, the `EndpointConfig` / `DocApp` types, and the OpenAPI schema converter. |
| `src/schemas.ts` | `successResponse(resultSchema)` envelope helper, `ErrorResponse`, and starter response schemas. |
| `src/app.ts` *(edit)* | Replace `express()` with `createDocApp()`; convert routes to inline config style; call `setupSwagger()` before the error handler. |

## Template files

Copy these from this skill's `templates/` directory into the target project,
preserving the `src/` layout. They are the source of truth — `SKILL.md` only
summarizes them.

- `templates/src/docs/routeRegistry.ts` — the patched Express app, the route
  registry, the v3/v4 Zod→OpenAPI converter, and Swagger setup. Drop in
  unchanged.
- `templates/src/middlewares/validate.ts` — `validate(schema)` factory. Drop in
  unchanged. (Same file produced by the `/express--create-zod-middleware`
  skill — if that skill has already created it, skip this one.)
- `templates/src/schemas.ts` — `successResponse` helper + `ErrorResponse` +
  starter schemas. Keep the helper; **replace the starter schemas** with your
  own.

## How to apply

### 1. Install dependencies

```bash
npm install zod swagger-ui-express
npm install --save-dev @types/swagger-ui-express
```

> Zod **v4** is assumed (`_def.type` short names). The converter also handles
> v3 (`_def.typeName`), but pin `zod@^4` in a fresh project to avoid the
> deprecated `ZodSchema` lint.

### 2. Copy the template files

```bash
# From the target project root:
mkdir -p src/docs src/middlewares
cp <skill>/templates/src/docs/routeRegistry.ts        src/docs/routeRegistry.ts
cp <skill>/templates/src/middlewares/validate.ts      src/middlewares/validate.ts
cp <skill>/templates/src/schemas.ts                   src/schemas.ts   # then edit
```

### 3. Wire up `src/app.ts`

Replace `const app = express()` with `const app = createDocApp()` and import
`setupSwagger`. **Global middleware and `app.use()` calls do not change** —
they run on the patched app exactly as before.

```typescript
import express from "express";
import { createDocApp, setupSwagger } from "./docs/routeRegistry";
import errorHandler from "./middlewares/errorHandler";
import { HelloResponseSchema } from "./schemas";

export const app = createDocApp();

app.use(express.json());          // unchanged — still needed to parse JSON bodies

app.get("/api/hello", {
  querySchema: ...,               // optional
  responseSchema: HelloResponseSchema,
  summary: "Hello world endpoint",
}, (req, res) => {
  res.json({ success: true, result: { message: "Hello!" } });
});

// After ALL routes, before the error handler:
setupSwagger(app, { title: "My API", version: "1.0.0" });

app.use(errorHandler);            // MUST be registered last
```

Then convert each existing route (see [Migration](#migration-from-plain-express)
below).

## The `EndpointConfig` reference

Every config key, what it does at runtime vs. compile time vs. in the docs:

| Key | Type | Runtime effect | Compile-time effect | OpenAPI effect |
|-----|------|----------------|---------------------|----------------|
| `requestBodySchema` | `ZodSchema` | `validate()` middleware parses `req.body`, `400` on failure | Narrows `req.body` to `z.infer<…>` | `requestBody` (required, `application/json`) |
| `querySchema` | `ZodObject` | *(none — validate only runs on body)* | *(none)* | One `in: query` parameter per field, `required` unless `.optional()` |
| `responseSchema` | `ZodSchema` | `res.json()` payload is `safeParse`'d; mismatch → log + `500` | Narrows `res.json()` arg to `z.infer<…>` | `200` response with that schema |
| `responses` | `Record<code, { description, schema? }>` | *(none)* | *(none)* | Merged **on top of** `responseSchema`'s `200` — use for error codes (`4xx`/`5xx`) |
| `summary` | `string` | *(none)* | *(none)* | Operation `summary`; defaults to `METHOD /path` |
| `tags` | `string[]` | *(none)* | *(none)* | Operation `tags`; also seeds the top-level `tags` list |

> **Note on `querySchema`:** it documents query params in OpenAPI but does **not**
> validate them at runtime. Read `req.query` yourself in the handler (cast as
> needed), or wrap the handler with `validate(querySchema)` adapted to parse
> `req.query` instead of `req.body`.

## Route registration patterns

The patched methods have four overloads each. Pick by what you need typed.

### GET — response only (most common for reads)

```typescript
app.get("/api/items/:id", {
  responseSchema: ItemResponseSchema,
  summary: "Get an item by id",
  tags: ["items"],
}, (req, res) => {
  // res.json() is typed to ItemResponseSchema
  res.json({ success: true, result: { id: req.params.id, name: "..." } });
});
```

### GET — with query parameters

```typescript
import { z } from "zod";

app.get("/api/items", {
  querySchema: z.object({
    page: z.coerce.number().int().min(1).default(1).describe("Page number"),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().optional().describe("Search term"),
  }),
  responseSchema: ItemsListResponseSchema,
  summary: "List items (paginated)",
}, (req, res) => {
  // querySchema is NOT runtime-validated — coerce/parse yourself if needed:
  const page = Number(req.query.page ?? 1);
  res.json({ success: true, result: { items: [], page } });
});
```

### POST — request body + response (writes)

```typescript
app.post("/api/items", {
  requestBodySchema: z.object({
    name: z.string().min(1, "name is required"),
    price: z.number().positive(),
  }),
  responseSchema: ItemResponseSchema,
  summary: "Create an item",
  tags: ["items"],
}, async (req, res) => {
  const { name, price } = req.body;   // typed — no cast, already validated
  const item = await createItem({ name, price });
  res.status(201).json({ success: true, result: item });
});
```

### Documenting error responses

`responses` augments the auto-generated `200` — use it for `4xx`/`5xx` so
Swagger shows them. Import your `ErrorResponse` schema from `src/schemas.ts`.

```typescript
app.delete("/api/items/:id", {
  responseSchema: successResponse(z.object({ id: z.string() })),
  responses: {
    404: { description: "Item not found", schema: ErrorResponse },
    401: { description: "Unauthorized",   schema: ErrorResponse },
  },
  summary: "Delete an item",
}, (req, res) => {
  res.json({ success: true, result: { id: req.params.id } });
});
```

### Plain Express passthrough (no config)

Any second argument that isn't a config object is forwarded untouched. This
keeps existing routes, settings getters, and inline middleware working:

```typescript
app.get("/healthz", (req, res) => res.json({ ok: true }));   // no config, not documented
app.set("trust proxy", 1);                                   // settings getter still works
app.get("/raw", express.raw({ type: "*/*" }), (req, res) => …);
```

## Migration from plain Express

Convert each route from this:

```typescript
import validate from "./middlewares/validate";

app.post("/items", validate(CreateItemSchema), (req: Request, res: Response) => {
  const { name } = req.body as CreateItem;   // cast everywhere
  res.json({ result: makeItem(name) });       // untyped, undocumented
});
```

to this:

```typescript
// validate import no longer needed on this route — createDocApp applies it
app.post("/items", {
  requestBodySchema: CreateItemSchema,
  responseSchema: CreateItemResponseSchema,
  summary: "Create an item",
}, async (req, res) => {
  const { name } = req.body;                  // typed, no cast
  res.json({ result: makeItem(name) });        // typed + runtime-checked + documented
});
```

Checklist per route:
1. Move the body schema into `requestBodySchema`.
2. Add a `responseSchema` (build one with `successResponse(…)` if you use the envelope).
3. Add a one-line `summary` (and `tags` if you group endpoints).
4. **Delete** the `req: Request, res: Response` annotations — see gotcha 4.
5. **Delete** the `validate(Schema)` middleware arg and the now-unused `validate` import (if no other route uses it).

## The type system (why overloads matter)

`DocAppMethods` declares **four overloads per HTTP verb**, so the config you
pass drives the contextual types flowing into the handler:

1. `TBody + TResp` both present → `req.body` and `res.json()` both typed.
2. `TBody` only → `req.body` typed; `res.json()` accepts anything.
3. No schemas → plain `Request` / `Response`.
4. `(path, handler)` → original Express signature.

Because the types are **contextual** (inferred from the config), annotating the
handler parameters with `req: Request, res: Response` *overrides* and erases
them. Always let TypeScript infer.

## OpenAPI generation notes

- `generateOpenApiDoc(title, version)` walks the in-memory `registry` and emits
  OpenAPI **3.0.3**. It is called once by `setupSwagger()`; re-running it after
  registering more routes gives you the updated doc.
- `zodToOpenApiSchema` supports `string`, `number`/`integer`, `boolean`,
  `enum`, `array`, and `object` (with `minLength`/`maxLength`/`minimum`/
  `maximum` from Zod checks). Unknown types fall back to `{ type: "string" }`.
  Add support for `union`/`literal`/`record` there if your schemas need them.
- `unwrap()` resolves `.optional()` / `.default()` wrappers so required-field
  detection (`required` array) works. Required = not `optional`/`default`.

## Gotchas (non-obvious — read before debugging)

1. **The config key is `requestBodySchema`, not `bodySchema`.** Older comments
   in some copies of `routeRegistry.ts` say `bodySchema`; that is a typo. The
   `CONFIG_KEYS` detector and the `EndpointConfig` type only recognize
   `requestBodySchema` — using `bodySchema` silently skips validation AND
   typing on that route.

2. **Express's internal `app.get(setting)` is intercepted by the patch.** The
   patched methods must handle `arguments.length === 1` or
   `configOrHandler === undefined` by passing through to the original method
   *without forwarding `undefined` args* — Express uses arg-count to
   distinguish route registration from settings getters (`app.get("env")`).
   Don't "simplify" the passthrough branches.

3. **Zod v4 uses `_def.type` (short names like `"string"`, `"object"`), not
   `_def.typeName` (`"ZodString"`, `"ZodObject"`).** `zodToOpenApiSchema` and
   `zodType()` check both, so the converter works under v3 and v4. If you
   upgrade Zod and the docs go empty, this is the first thing to check.

4. **`_def.shape` is a plain object in v4, not a function.** `getShape()` and
   the query-schema code check `typeof shape === "function"` before calling.
   Don't assume one form.

5. **Don't annotate handler parameters.** Writing `(req: Request, res: Response)`
   overrides the contextual types from the overloads — you lose `req.body` /
   `res.json()` narrowing and the whole point of the config. Let TypeScript
   infer. If the inferred types look wrong, you almost certainly mismatched
   the config (e.g. `bodySchema` instead of `requestBodySchema` — see gotcha 1).

6. **`setupSwagger` must be called after all routes, before the error handler.**
   Routes registered after `setupSwagger()` won't appear in the docs
   (the doc is built eagerly at setup time). The error handler must stay last
   so thrown errors still produce JSON, not an HTML page.

7. **Response validation is `2xx`-only and logs on mismatch.** The `res.json`
   wrapper checks `status >= 200 && status < 300`. On failure it `console.error`s
   the Zod issues and returns `500 { error: "Internal server error" }`. Errors
   responses (`4xx`/`5xx`) are passed through unvalidated — so document them in
   `responses` but don't expect the wrapper to enforce them.

8. **If `express` is imported as a value (for `express.json()`, `express.raw()`),
   keep that import.** Only the *app creation* call changes from `express()` to
   `createDocApp()`. `express.json()` is still required to parse bodies before
   `validate` can see them.

9. **Binary/raw routes (e.g. AgentCore `/invocations` with `express.raw()`)
   can't use `requestBodySchema`.** Body validation assumes the body is already
   parsed as JSON. For binary endpoints, keep `express.raw()` as inline
   middleware and omit `requestBodySchema` (document the route with just
   `responseSchema` / `summary`).

10. **`querySchema` documents but does not validate.** Query params are read
    raw from `req.query`. If you need enforced query validation, run an
    explicit `validate(querySchema)`-style check inside the handler (the
    bundled `validate` targets `req.body`).

## Related skill

- `/express--create-zod-middleware` — produces the same `validate(schema)`
  middleware this integration depends on. If you only want request validation
  (no Swagger, no response typing), use that one instead.
