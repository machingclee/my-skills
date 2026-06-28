---
name: express-lambda-boilerplate
description: >-
  Scaffold a TypeScript Express API that runs locally via ts-node and deploys to
  AWS Lambda behind an API Gateway (REST). Uses serverless-http to adapt the
  Express app for Lambda and the Serverless Framework (npm `serverless` v3.38.0
  + `serverless-plugin-typescript-express`) to compile TypeScript and deploy —
  no manual build step. Configuration/environment is stored as JSON files
  (.env.local.json / .env.prod.json) loaded via serverless-dotenv-plugin with a
  custom JSON parser. Use when the user wants to create, scaffold, replicate, or
  clone this Express/TypeScript-on-Lambda architecture, deploy an Express app to
  AWS Lambda via Serverless, wire up serverless-http + Serverless for a Node
  serverless API, or add a route to an existing project that follows this
  pattern.
---

# TypeScript Express on AWS Lambda (Serverless Framework)

A Node/TypeScript API that runs as a normal Express app locally (`ts-node`) and
deploys as a single AWS Lambda function behind a REST API Gateway. Pure HTTP
plumbing — drop your own routes/middleware in.

## Architecture

```
                local dev                        AWS
        ┌─────────────────────┐         ┌─────────────────────────────────┐
   you ─▶ yarn start                    │  API Gateway (REST)             │
        │ ts-node src/app.ts             │   http: ANY /  +  ANY /{proxy+} │
        │ app.listen (Express)           │           │                     │
        └─────────────────────┘         │           ▼                     │
                                        │  Lambda  src/server.handler     │
                                        │           │  serverless-http    │
                                        │           ▼                     │
                                        │        app  (same Express app)  │
                                        └─────────────────────────────────┘
```

Two TypeScript entry points — know which is which:

| File           | Role                                                           | Runs where |
|----------------|----------------------------------------------------------------|------------|
| `src/app.ts`   | Builds the Express `app`, routes, middleware, local `listen`.  | everywhere |
| `src/server.ts`| Lambda entry: `serverless-http(app)` adapts Express→Lambda.    | Lambda only|

There is exactly **one** Lambda function. The API Gateway rules `http: ANY /`
and `http: ANY /{proxy+}` forward *every* request to it, and `serverless-http`
dispatches to the matching Express route. Add routes in `src/app.ts`; nothing
else changes to deploy.

## The build + env model

- **No build step.** `serverless-plugin-typescript-express` reads `tsconfig.json`
  and emits JS during `serverless deploy`. Don't run `tsc` yourself; `dist/` is
  generated and gitignored. Locally, `ts-node` runs the TS directly.
- **Env is JSON, not KEY=VALUE.** `serverless-dotenv-plugin` + the custom
  `jsonParser.js` read `.env.local.json` (and per-stage files) and flatten them
  into Lambda env vars: scalars → strings, arrays → comma-joined, objects
  dropped. Local dev loads the same JSON via `env-cmd -f .env.local.json`.

## Scaffold a new project

Copy the files from this skill's `templates/` directory into a new project
folder (the `templates/src/` subfolder maps to `./src/`), then replace the
`# TODO` placeholders and run setup.

```bash
mkdir my-api && cd my-api

# 1. Copy templates/ contents into the project root, preserving the src/ layout:
#    serverless.yml  jsonParser.js  tsconfig.json  package.json  .gitignore
#    .env.local.example.json  .env.prod.example.json
#    src/app.ts  src/server.ts  src/middlewares/errorHandler.ts

# 2. Install dependencies
npm install            # or: yarn

# 3. Configure env
cp .env.local.example.json .env.local.json     # then edit values

# 4. Run locally (Express via ts-node, hot edits on save)
npm start              # http://localhost:3000  (PORT from .env.local.json)
```

## Replace the `# TODO` placeholders

- `serverless.yml` → `service:` name and `region:`
- `package.json` → `"name"`
- `.env.local.json` → `PORT`, `APP_NAME`, your own keys

## Local dev & deploy

```bash
npm start              # local Express server (ts-node, loads .env.local.json)
npm run offline        # alternatively: emulate Lambda+APIGW locally via serverless-offline
npm run deploy         # deploy serverless.yml (default stage: dev)
```

## Multi-stage deploy (one config file per stage)

The pattern uses a separate serverless file per stage, each pointing at its own
env file. To add production:

1. Copy `serverless.yml` → `serverless-prod.yml`, set `stage: prod`, and add
   `.env.prod.json` to `custom.dotenv.path` (after `.env.local.json` so prod
   values override).
2. `cp .env.prod.example.json .env.prod.json` and fill in prod secrets.
3. Deploy with the explicit config:
   ```bash
   npm run deploy:prod          # = serverless deploy --config serverless-prod.yml
   npm run remove               # tear down (serverless remove)
   ```

## Adding a route

Just add it in `src/app.ts` — no serverless change, no rebuild:

```ts
app.get("/api/items/:id", (req, res) => {
  res.json({ success: true, result: { id: req.params.id } });
});
```

## Template files

- `templates/serverless.yml` — provider config, the single Lambda + REST API
  catch-all events, the four plugins, binary media types, prune settings.
- `templates/src/app.ts` — Express app: healthcheck, CORS, cookie/json parsing,
  one example route, error handler, guarded `app.listen`.
- `templates/src/server.ts` — `serverless-http` Lambda handler.
- `templates/src/middlewares/errorHandler.ts` — last-middleware error responder.
- `templates/jsonParser.js` — custom JSON→env parser for serverless-dotenv-plugin.
- `templates/tsconfig.json` — CommonJS output for Lambda (consumed by the
  TypeScript plugin at deploy time).
- `templates/package.json` — `start` / `offline` / `deploy` / `deploy:prod`
  scripts + versions.
- `templates/.env.local.example.json`, `templates/.env.prod.example.json`,
  `templates/.gitignore` — env templates + ignores.

## Gotchas (non-obvious — read before debugging)

1. **Guard `app.listen` with `require.main === module`.** The Express app module
   (`src/app.ts`) is imported by the Lambda entry (`src/server.ts`), so anything
   at its top level runs on cold start. Calling `app.listen(PORT)` there
   unconditionally — as some Express starters do — runs in Lambda where `PORT`
   is undefined, `Number(undefined)` is `NaN`, and the Lambda crashes on a bad
   port. The template's `if (require.main === module)` guard ensures `listen`
   only fires under `ts-node src/app.ts`. Don't remove it.
2. **`serverless-http` is the Node equivalent of Python's Mangum.** It converts
   API Gateway events into Express requests. Because there's one Lambda for all
   routes, route changes need zero serverless edits.
3. **Binary support needs BOTH sides.** Set `{ binary: ['*/*'] }` in
   `serverless-http(app, …)` (server.ts) **and** `apiGateway.binaryMediaTypes:
   ["*/*"]` (serverless.yml). Miss either and images/PDFs served through Express
   arrive corrupted.
4. **API Gateway 6 MB response cap (synchronous invoke).** Lambda can't return a
   payload larger than 6 MB. For big files (video, large PDFs), don't stream
   them through Express — issue a 302 redirect to a short-lived S3 presigned URL
   instead.
5. **REST API (`http:`) vs HTTP API (`httpApi:`).** This uses the REST API
   Gateway (full-featured, easy `binaryMediaTypes`, mapping templates). The
   cheaper/simpler HTTP API (`httpApi:`) is an option but differs in features.
6. **Env is JSON.** `.env.local.json` / `.env.prod.json` are read by the custom
   `jsonParser.js`, not the standard dotenv `.env` parser. Edit the JSON files;
   `env-cmd` loads the same JSON for local dev. (`.env.local.json` and
   `.env.prod.json` are gitignored — only the `.example.json` files are
   committed.)
7. **`serverless-prune-plugin` prevents deploy accumulation.** Every `serverless
   deploy` uploads a new versioned package to S3; prune keeps only the last `N`
   (`number: 3`). Without it, S3 fills up with old artifacts.
8. **CORS `origin: true` reflects the caller's origin.** Required when combined
   with `credentials: true` (cookie auth) for cross-origin browser calls — a
   static allowlist would block credentialed requests.
9. **Keep Node versions aligned.** `runtime: nodejs22.x` should match the Node
   version you develop with locally (`node -v`). Mismatches cause subtle runtime
   differences (built-ins, ESM/CJS edge cases).
