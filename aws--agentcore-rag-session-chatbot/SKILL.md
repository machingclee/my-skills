---
name: aws--agentcore-rag-session-chatbot
description: >-
  Scaffold the HKEV-style RAG chatbot stack: markdown → pgvector (isolated
  schema), Bedrock AgentCore Strands AG-UI agent, Cognito CUSTOM_JWT (dummy
  public bot user), S3 session history, session-retrieval Lambda, and a
  floating React chat UI. Every setup persists the chat session list per user:
  a `user` row keyed by the logged-in username, and a `chat_session` row per
  conversation, created by the session Lambda through Prisma and Kysely. Use when the user wants a docs RAG agent with
  session retrieval, AgentCore + Cognito JWT, per-user persisted chat sessions,
  or to copy this stack into another repo. Never paste secret values into
  templates, SKILL.md, or git.
---

# AgentCore RAG + session chatbot

Reusable extract of the echarge-documentation stack. **Do not copy
credentials** from any existing `.env`, `agentcore.json`, or chat UI. Ask
the user to fill env files locally. Templates use empty strings and
`{{PLACEHOLDERS}}` only.

This skill **replaces** `aws--agentcore-rag-pgvector` (ingestion + agent
only). Keep `aws--agentcore-boilerplate` for a bare `agentcore create`.

## Trigger

Load this skill whenever the user wants to **reuse or scaffold this stack**
in another repo (or overlay it on an existing frontend). Do not wait for
the slash command if the request matches.

**Slash (most reliable):**

```
/aws--agentcore-rag-session-chatbot
```

**Plain language (also trigger):**

- "Scaffold a docs RAG agent with AgentCore, Cognito JWT, and session retrieval"
- "Copy the HKEV-style RAG chatbot stack into this repo"
- "Set up AgentCore + pgvector + floating chat + session Lambda"
- "Add a docs chatbot with AgentCore and S3 session history"
- "Reuse the echarge-documentation RAG / session chatbot"

**Do not use** `/aws--agentcore-rag-pgvector` (removed). For a bare
`agentcore create` only, use `/aws--agentcore-boilerplate`.

Never copy credentials from another project's `.env`, `.env.local`, filled
`agentcore.json` `envVars`, or chat UI Cognito constants. Ask the user to
fill env files in the **target** repo.

## Architecture

```
{{ARTICLES_DIR}}/  (YAML: title, description, slug, section, tags, wip,
                    optional pdf-filepath — no spaces in the filename)
    │  optional: PDF → paged summary (pdf--into-paged-summary) with
    │            ## pN-M headings (page_range). <!-- page N --> → optional exact page.
    ▼
vector_db/sync_articles.py
    fingerprint = sha256(source_path + NUL + raw file bytes)
    plan: added | changed | removed | unfingerprinted | ok
    │
    ▼  --apply  (delete by title, then inject)
vector_db/inject  →  DeepSeek chunks + Azure ada-002 (1536-d)
    metadata: title, slug, tags, source_path, content_hash,
              pdf-filepath, page_range (## pN-M), page (<!-- page N -->)
    │
    ▼
PostgreSQL  schema {{POSTGRES_SCHEMA}}.embeddings
            schema {{POSTGRES_SCHEMA}}.tags   ← frontmatter vocabulary
    │
    ▼
app/{{AGENT_NAME}}/   AgentCore AGUI  CUSTOM_JWT
    rephrase → find_tags (SELECT tags every call) → search → rerank → copy `link` verbatim → answer
    S3SessionManager → s3://{{S3_SESSION_BUCKET}}/sessions/{uuid}/...
    SideQuestionSessionManager → reads that prefix, writes sessions/{uuid}:btw:{n}/
    │
    ▼
session-lambda  POST /api/sessions                         (record the browser's UUID)
                GET  /api/sessions?username=                (the user's history list)
                DELETE /api/sessions/:id?username=          (drop the history entry)
                GET /api/sessions/:id/messages              (IAM GetObject/ListBucket)
                GET /api/sessions/:parent/side/:n/messages  (/btw side threads only)
    │
    ▼
frontend FloatingChatBot  Amplify signIn(dummy bot) + SSE /invocations
    CustomMarkdown renders /files/*.pdf[#page=N] as a chip from {children}
```

The S3 bucket is **private**. Lambda IAM is in `serverless.yml`. AgentCore
write access is `attach-s3-policy.sh` on the **runtime role** after deploy
(different role — cannot live in serverless.yml).

## Layout after scaffold

```
<repo>/
  markdowns/                         ← corpus (optional pdf-filepath frontmatter)
  files/                             ← source PDFs; hyphenated names, no spaces
  vector_db/                         ← this skill's templates/vector_db
  agentcore/                         ← AgentCore CLI project (nested)
    AGENTS.md
    attach-s3-policy.sh
    app/{{AGENT_NAME}}/
    agentcore/agentcore.json         ← envVars NAMES only, empty values
    agentcore/.env.local             ← gitignored secrets (user fills)
  agentcore-session-retrieval-lambda/
  <frontend>/src/components/FloatingChatBot/
  <frontend>/src/redux/slices/chatSlice.ts
  <frontend>/src/redux/api/ragApi.ts
  .env.sample                        ← names only
```

Detect nested vs standalone AgentCore before copying (`agentcore/agentcore.json`
vs `agentcore/agentcore/agentcore.json`).

## Inputs (ask missing ones, one at a time)

| Input | Meaning | Example |
|---|---|---|
| `targetDir` | repo root | `.` |
| `projectName` | AgentCore project `name` (alphanumeric, no hyphen, max 23) | `hkevDoc` |
| `agentName` | runtime / `app/` folder, PascalCase | `HkevDocAgent` |
| `domainDescription` | system-prompt domain | `HKEV / E-Charge internal documentation` |
| `articlesDir` | markdown corpus relative to repo | `markdowns` |
| `articleRoutePrefix` | citation URL prefix, no trailing slash | `/docs` |
| `postgresSchema` | isolated PG schema (not `public`) | `hkev` |
| `s3SessionBucket` | private session bucket | `hkev-doc-agentcore-sessions` |
| `awsRegion` | AgentCore + S3 + Lambda | `ap-northeast-1` |
| `cognitoRegion` | user pool region | `us-east-1` |
| `frontendDir` | existing React app to mount the chatbot | `doc-project/frontend` |
| `welcomeMessage` | first chat bubble | `Hello! I can help you search …` |
| `chatTitle` | floating chat header | `Docs` |

If `agentcore.json` exists, reuse `runtimes[0].name` unless the user wants a new runtime.

## Placeholders

Replace in **every** copied file. Never substitute secret **values**.

| Placeholder | Replace with |
|---|---|
| `{{PROJECT_NAME}}` | `hkevDoc` |
| `{{AGENT_NAME}}` | `HkevDocAgent` |
| `{{DOMAIN_DESCRIPTION}}` | domain sentence |
| `{{ARTICLES_DIR}}` | `markdowns` |
| `{{ARTICLE_ROUTE_PREFIX}}` | `/docs` |
| `{{POSTGRES_SCHEMA}}` | `hkev` |
| `{{S3_SESSION_BUCKET}}` | bucket name |
| `{{AWS_REGION}}` | `ap-northeast-1` |
| `{{COGNITO_REGION}}` | `us-east-1` |
| `{{COGNITO_USER_POOL_ID}}` | created pool id (after Cognito step) |
| `{{COGNITO_CLIENT_ID}}` | created client id |
| `{{BOT_USERNAME}}` | `bot` |
| `{{BOT_PASSWORD}}` | dummy password the user chose (public by design; still do not commit if they prefer env) |
| `{{WELCOME_MESSAGE}}` | welcome string |
| `{{CHAT_TITLE}}` | header in FloatingChatBot |
| `{{LAMBDA_SERVICE}}` | e.g. `hkev-doc-rag-api` |
| `{{SESSION_API_BASE}}` | filled **after** `serverless deploy` |

Env **names** stay as written (`POSTGRES_HOST`, `DEEPSEEK_API_KEY`, …).

## Workflow

### 1. Copy templates

From `~/.claude/skills/aws--agentcore-rag-session-chatbot/templates`:

```bash
SKILL=~/.claude/skills/aws--agentcore-rag-session-chatbot/templates
cp -R "$SKILL/vector_db" <repo>/vector_db
cp -R "$SKILL/agent/." <agentcore-root>/app/{{AGENT_NAME}}/
rm -f <agentcore-root>/app/{{AGENT_NAME}}/tools/article_links.py   # tombstone; do not ship
rm -f <agentcore-root>/app/{{AGENT_NAME}}/tags.py \
      <agentcore-root>/app/{{AGENT_NAME}}/tools/tags.py            # vocabulary lives in {{POSTGRES_SCHEMA}}.tags
cp -R "$SKILL/session-lambda" <repo>/agentcore-session-retrieval-lambda
cp -R "$SKILL/frontend/FloatingChatBot" <frontendDir>/src/components/FloatingChatBot
cp "$SKILL/frontend/chatSlice.ts" <frontendDir>/src/redux/slices/chatSlice.ts
cp "$SKILL/frontend/ragApi.ts" <frontendDir>/src/redux/api/ragApi.ts
cp "$SKILL/frontend/agentBotApi.ts" <frontendDir>/src/redux/api/agentBotApi.ts
cp "$SKILL/attach-s3-policy.sh" <agentcore-root>/attach-s3-policy.sh
cp "$SKILL/.env.sample" <repo>/.env.sample
```

If there is no AgentCore project yet, run `agentcore create` first (or
`aws--agentcore-boilerplate`), then overlay `app/{{AGENT_NAME}}/`.

### 2. Substitute placeholders

Search-replace the table above. The tag vocabulary is `{{POSTGRES_SCHEMA}}.tags`,
written by `sync_articles.py --apply` or `get_tags.py`. `find_tags` reads that
table on every call.

### 3. Frontend wiring (existing app)

- Add `chat: chatSlice.reducer` and `persistChatState` subscribe (see this
  repo's `doc-project/frontend/src/redux/store.ts`).
- Add `"SessionMessages"` to RTK `tagTypes`.
- Import `./api/ragApi` next to other API injects.
- Mount `<FloatingChatBot />` in the authenticated shell.
- The bot user's credentials come from the **host app**, not from Cognito
  constants: `agentBotApi.ts` calls `GET /api/agent-bot-credentials` and expects
  `{ success: boolean, result: { username, password } }`. It needs that app's
  `baseApi` (RTK Query) to inject into. Serve the endpoint from whatever backend
  the host app already has and gate it like the app's other authenticated routes.
  The dummy `bot` user is public by design.
- Dependencies: `aws-amplify`, `@mui/material`, `@mui/icons-material`,
  `react-icons`, `sass` (if SCSS). Markdown renderer: swap
  `CustomMarkdown` import if the host app uses a different component.
- PDF chips: the agent emits
  `[Title]({{ARTICLE_ROUTE_PREFIX}}/slug) · [PDF · page 7-10](/files/<name>.pdf#page=7)`
  (no `(page summary)` on the title; `page` not `pp.`). The renderer must
  use `{children}` as the chip label (not a hardcoded `"PDF"`) and treat
  `/files/*.pdf` **and** `/files/*.pdf#page=N` as a PDF.
  `whitespace-nowrap` on the chip so the range does not wrap. Rewrite
  stored older citations on render: strip `(page summary)`, turn `pp.`
  into `page`, and put ` · ` between the article link and the chip.
- Frontend `.env` (gitignored), names only until deploy:

```
VITE_AGENT_ENDPOINT=
VITE_SESSION_API_BASE=
```

`ragApi.ts` appends `/sessions/:id/messages`, so
`VITE_SESSION_API_BASE` must include `/api`
(`https://….execute-api.…/dev/api`).

### 4. Cognito (JWT for AgentCore, dummy public bot)

No Hosted UI. Same as the Cognito AgentCore article: pool + app client
`USER_PASSWORD_AUTH` + user `bot`. **One-line AWS commands** (zsh wraps
`\` continuations and then prints `command not found: --region`).

```bash
aws cognito-idp create-user-pool --pool-name {{PROJECT_NAME}}Users --region {{COGNITO_REGION}}
# export POOL_ID=...
aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" --client-name {{PROJECT_NAME}}Client --no-generate-secret --access-token-validity 24 --refresh-token-validity 3650 --token-validity-units AccessToken=hours,RefreshToken=days --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH --region {{COGNITO_REGION}}
# Use a literal username, not $USERNAME (zsh reserved → your macOS user).
aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username bot --user-attributes Name=email,Value=bot@example.com Name=email_verified,Value=true --temporary-password 'TempPass123!' --message-action SUPPRESS --region {{COGNITO_REGION}}
aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --username bot --password '{{BOT_PASSWORD}}' --permanent --region {{COGNITO_REGION}}
```

Then set in `agentcore.json`:

- `authorizerType`: `CUSTOM_JWT`
- `discoveryUrl`: `https://cognito-idp.{{COGNITO_REGION}}.amazonaws.com/<poolId>/.well-known/openid-configuration`
- `allowedClients`: `[clientId]` — **not** `allowedAudience` (`InitiateAuth` tokens have `client_id`, no `aud`)

Paste pool id / client id into `AgentChatInterface.tsx` `COGNITO` constants
(or env). Dummy `bot` / password is intentionally public for this pattern.

### 5. Env files — names in git, values local

Copy `.env.sample` → repo-root `.env` and `agentcore/agentcore/.env.local`.
User fills Postgres, Azure, DeepSeek. **Do not copy values from another
project in the skill.** Merge `templates/agentcore-envvars.json` into
`runtimes[0].envVars` with **empty** `value`s except non-secret defaults
(`DEEPSEEK_BASE_URL`, `AZURE_EMBEDDING_MODEL`, `POSTGRES_SCHEMA`,
`S3_SESSION_BUCKET`, `AWS_REGION`, `OTEL_SDK_DISABLED`).

Reset `.cli/deployed-state.json` to `{"targets": {}}` if this was copied
from another AgentCore project so deploy does not destroy that runtime.

### 6. Postgres schema + table

```bash
cd <repo>/vector_db && uv sync && uv run create_table.py
```

Creates `{{POSTGRES_SCHEMA}}`, `{{POSTGRES_SCHEMA}}.embeddings`, and
`{{POSTGRES_SCHEMA}}.tags` (`tag TEXT PRIMARY KEY`). Does
**not** drop `public.embeddings`.

Markdown frontmatter (no `id` / `path` — folder numbers are sidebar sort only):

```yaml
title: ...
description: ...
slug: ...          # must match frontend /docs/:slug
section: ...
tags: [..]
wip: false
pdf-filepath: /files/ocpi-2-2-1-d2.pdf   # optional; NO spaces in the filename
```

A PDF-sourced article is a paged summary (`## pN-M` headings from
`pdf--into-paged-summary`). Inject recovers `page_range` from those
headings — they are the LLM's grouping of the PDF. `<!-- page N -->`
markers inside original_text are extraction scaffolding and are ignored.
`pdf-filepath` is stored on every chunk. Filenames in `files/` must be
hyphenated — a space terminates a markdown link destination, and inject
raises if `pdf-filepath` contains one.

Inject writes `source_path`, `content_hash`, `pdf-filepath`, and
`page_range` onto every chunk. After `create_table.py`, sync the corpus:

```bash
uv run --directory vector_db sync_articles.py                  # dry-run
uv run --directory vector_db sync_articles.py --apply          # new empty table
# existing rows with no hash:
uv run --directory vector_db sync_articles.py --backfill-hashes
```

### 7. S3 bucket + session Lambda

Bucket is **private**. Do not make it public. Lambda access is IAM in
`serverless.yml` (`${self:custom.sessionBucket}` → the string in
`custom.sessionBucket`).

```bash
aws s3 mb s3://{{S3_SESSION_BUCKET}} --region {{AWS_REGION}}
cd <repo>/agentcore-session-retrieval-lambda
cp .env.local.example.json .env.local.json   # fill DB_* and DATABASE_URL
npm install
yarn migrate:applied -- 20260101000000_baseline_existing_tables
yarn migrate:deploy                          # creates user, chat_session, chat_side_session
npx serverless deploy
```

`yarn migrate:applied` records the baseline without running it, because
`embeddings` and `tags` already exist from `create_table.py`. `migrate:deploy`
then creates `{{POSTGRES_SCHEMA}}.user`, `chat_session`, and `chat_side_session`.
`DATABASE_URL` (with `&schema={{POSTGRES_SCHEMA}}`) is what Prisma reads; the
function reads `DB_HOST`, `DB_DATABASE`, `DB_USER`, and `DB_PASSWORD` instead,
and qualifies the schema in SQL. Do not add `DATABASE_URL` to the Lambda
environment, and do not set `search_path` as a connection option — a pooled
connection rejects it.

Put the printed `https://….execute-api.…/dev` into
`VITE_SESSION_API_BASE` **plus** `/api`.

`serverless-plugin-typescript-express` rewrites the handler from
`src/server.handler` to `dist/server.handler` and compiles with plain `tsc`.
`tsconfig.json` keeps `rootDir` at `src`, and the Kysely client lives at
`src/db/` so the compile emits `dist/server.js`. A second directory in
`include` makes `tsc` emit `dist/src/server.js` instead, which the handler
never loads — the deploy then reports "No changes to deploy" because the stale
`dist/server.js` is unchanged. If that happens, delete `dist/` and redeploy.

### 8. AgentCore deploy

```bash
cd <agentcore-root>
agentcore validate
agentcore deploy -y
./attach-s3-policy.sh
```

Do **not** edit generated `cdk/` — `agentcore.json` is the source of
truth. Renaming `runtimes[].name` or project `name` creates a **new**
stack (`AgentCore-{{PROJECT_NAME}}-default`); it does not update the old
one. Put the invoke URL in `VITE_AGENT_ENDPOINT`.

### 9. Report

- Layout detected and paths written
- Env files created (names only) and which file the user must fill
- Cognito pool/client ids (not secrets besides the agreed dummy password)
- Session API URL and whether `create_table.py` / first inject ran
- Next: fill `.env`, `create_table.py`, `sync_articles.py --backfill-hashes` (or `--apply` for a new corpus), `agentcore deploy`, attach S3 policy

## Chat session list

Every setup persists the history list per user. There is no localStorage
version to fall back to: the browser still mints the session id with
`crypto.randomUUID()`, but the row is recorded in `{{POSTGRES_SCHEMA}}` before
the agent is asked, so the list follows the logged-in user across browsers.

The object the frontend holds and the object `GET /api/sessions` returns are
the same shape.

```ts
type ChatSessionsState = {
  sessionIds: string[];                              // newest first
  idToSession: {
    [sessionId: string]: {
      name: string;
      updatedAt?: string;
      lastSideSeq?: number;                          // highest :btw:<n> ever minted
      sideSessions?: { sideSessionId: string; name: string; updatedAt?: string }[];
    };
  };
};
```

`sessionIds[0]` is the most recently touched session. `sideSessions` is omitted
entirely when a session has none — it is never an empty array. `lastSideSeq`
never decreases, because a deleted side thread's turns are still on S3.

### Tables

The rows live in `{{POSTGRES_SCHEMA}}` beside `embeddings` and `tags`, and
Kysely queries them — Prisma only owns the schema and the generated types. The
schema, the two migrations, and `src/db/database.ts` ship in
`templates/session-lambda`, so a scaffold already contains them.

`user` is created on first use from the username alone. It has no password
column, because this lambda never sees the credential the login checked, and
`username` is its primary key — `chat_session` stores that username directly
rather than a surrogate id. `chat_session.session_id` is the browser's UUID and
`position` is its index in `sessionIds`, so `0` is the newest.
`chat_side_session.side_session_id` is `<parentSessionId>:btw:<n>`.

```prisma
model user {
  username      String         @id
  created_at    DateTime       @default(now()) @db.Timestamptz(6)
  updated_at    DateTime       @default(now()) @updatedAt @db.Timestamptz(6)
  chat_sessions chat_session[]

  @@schema("{{POSTGRES_SCHEMA}}")
}

model chat_session {
  id            String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  session_id    String
  username      String
  user          user                @relation(fields: [username], references: [username], onDelete: Cascade)
  name          String              @default("Untitled")
  updated_at    DateTime?           @db.Timestamptz(6)
  last_side_seq Int                 @default(0)
  position      Int                 @default(0)
  side_sessions chat_side_session[]

  @@unique([username, session_id])
  @@index([username, position])
  @@schema("{{POSTGRES_SCHEMA}}")
}

model chat_side_session {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  side_session_id String
  chat_session_id String       @db.Uuid
  chat_session    chat_session @relation(fields: [chat_session_id], references: [id], onDelete: Cascade)
  name            String
  updated_at      DateTime?    @db.Timestamptz(6)
  position        Int          @default(0)

  @@unique([chat_session_id, side_session_id])
  @@index([chat_session_id, position])
  @@schema("{{POSTGRES_SCHEMA}}")
}
```

`gen_random_uuid()` comes from `pgcrypto`. On a shared database that extension
may be installed in another schema, in which case the default has to be
schema-qualified (`blog_system.gen_random_uuid()`). Kysely does not apply
Prisma's client-side defaults, so the insert passes `id` and `updated_at`
explicitly anyway. Regenerate the types with the `lambda--prisma-kysely` skill;
its Prisma 7 section also covers the migration scripts and the shadow-database
drift a shared database causes. `src/db/types.ts` is committed, because the
Lambda build does not run `prisma generate`.

### Schema qualification

`prisma-kysely` is told `defaultSchema = "{{POSTGRES_SCHEMA}}"`, so the
generated SQL names tables without a schema. That resolves only when the
connection's `search_path` includes `{{POSTGRES_SCHEMA}}`, and a role's default
is `"$user", public` — Postgres then reports `relation "chat_session" does not
exist` even though the table is there.

`src/db/database.ts` fixes it with `new Kysely<DB>(…).withSchema("{{POSTGRES_SCHEMA}}")`,
which emits `"{{POSTGRES_SCHEMA}}"."chat_session"`. Do not set `search_path`
through the pool's `options` instead: the Neon pooler refuses it with
`unsupported startup parameter in options: search_path`. Do not hand the Pool
`DATABASE_URL` either — node-postgres ignores the `schema` query param that
Prisma uses, so the same URL that makes `yarn migrate:deploy` land tables in
the right schema does nothing for the function.

### Endpoints

All five live in `src/routes/sessions.ts`, mounted beside the message routes.
`sessionId` must be a UUID — the same guard that keeps `/btw` side threads out
of the history — and every one is scoped by `username`.

| Endpoint | Body / query | Behaviour |
|---|---|---|
| `POST /api/sessions` | `{ sessionId, username, name? }` | Upserts `user` by username, inserts `chat_session` at `position` 0, shifts that user's other rows up by 1. `onConflict (username, session_id) doNothing`, so a retry returns the existing row with `created: false`. `201` when created, `200` otherwise. |
| `GET /api/sessions` | `?username=` | The `ChatSessionsState` object exactly: `sessionIds` ordered by `position`, side threads nested with `jsonArrayFrom` and ordered by their own `position`. `sideSessions` is dropped when empty. |
| `DELETE /api/sessions/:sessionId` | `?username=` | Deletes the `chat_session` row for that username. `chat_side_session` goes with it through `ON DELETE CASCADE`. Returns `{ sessionId, deleted }` and `200` even when no row matched, so deleting a session that only ever lived in the browser is safe. The S3 transcript is not touched. |
| `POST /api/sessions/:sessionId/side` | `{ username, sideSeq, name? }` | Records a `/btw` thread (`<sessionId>:btw:<sideSeq>`) on the parent and raises `last_side_seq` when `sideSeq` is higher. A new thread takes `position` 0 and shifts the others up; a follow-up moves the existing row back to the front and leaves its name alone. `201` when created, `200` when touched, `404` when the parent was never recorded. |
| `DELETE /api/sessions/:sessionId/side/:sideSeq` | `?username=` | Drops that one side thread from the parent's list. `last_side_seq` stays where it is, so the number is never minted again, and the S3 transcript is not touched. Returns `{ sideSessionId, deleted }` and `200` even when no row matched. |

### Frontend wiring

`AuthState` holds `username`, set from the login form only after login
succeeds. `persistChatState` writes only the window geometry — `sessions` is
not stored locally, because the database is the source of it.

- On startup, `getChatSessions(username)` runs once and its result is
  dispatched through `setChatSessions`, which passes it through
  `normalizeSessions`. Skip the query when no username is known.
- `handleSend` calls `createSession(sessionId, username, name)` before the
  agent turn, guarded by a ref so a session is recorded once. The agent call
  still happens after it resolves.
- `deleteSession` dispatches `removeChatSession` immediately and then fires
  `DELETE /api/sessions/:sessionId?username=` without awaiting it. The list is
  already gone; a failed call only leaves a row the next load would show.

A browser that previously kept its sessions in `chat-storage` keeps them there,
unread. Nothing migrates them.

## Side questions (`/btw`)

Ask a clarifying question *about* an answer — including while it is still
streaming — without touching the main transcript, the session list, or what the
agent remembers. Ships in the templates; nothing to enable.

- Three ways to open it: type `/btw <question>` in the main composer, type bare
  `/btw` to just open the panel, or click the **`/btw` button in the header** —
  a toggle, so it also closes the panel. The typed form is parsed **before** the
  `isLoading` guard, so it works mid-stream; the button needs no special casing.
- The panel is an **overlay, not a column**: the transcript keeps the window's
  full width, so opening or closing it never re-wraps the conversation or moves
  its scroll anchor. Drag its left edge to resize; the width persists in
  `chatSlice`. Below 480px it takes the whole window instead.
- Follow-ups typed in the panel continue the same side thread. **New** (`+` in the
  panel toolbar) clears the panel *without* dropping the thread: the next ask mints a
  fresh id (so it re-reads the parent and picks up main turns that finished since) and
  the thread it left behind stays in the session's side list. X hides the panel and
  keeps the thread; the header toggle is the same — closing is not clearing.
- The panel is bound to its parent session — switching sessions, New Session, or
  deleting the active session resets it.
- **Every** side thread the session has asked is recorded, newest first, in
  `ChatSession.sideSessions` (`{ sideSessionId, name, updatedAt }`, where `name` is the
  question that opened it). Recording is `saveSideSession`, a `ragApi` mutation that
  `POST`s `/api/sessions/:sessionId/side` with `{ username, sideSeq, name? }` — `name`
  only on a new thread, since a follow-up must not rename it. The username is the bot
  credential `useGetAgentBotCredentialsQuery` already loaded. The panel's list button
  shows them with the header history panel's own classes: a row switches threads (its
  turns come back through `GET .../side/:n/messages`), and the row's trash drops it
  through `deleteSideSession`, which `DELETE`s `/api/sessions/:sessionId/side/:sideSeq`.
  Deleting the thread on screen falls back to the newest one left. `loadSession`
  resumes `sideSessions[0]`, which is what makes "the latest one by default" fall out
  of the ordering rather than a stored pointer. Both calls are fire-and-forget: the
  slice is already updated, and a failed call only leaves the database behind.
- **The sequence floor is tracked separately.** `ChatSession.lastSideSeq` holds the
  highest `:btw:<n>` ever minted and outlives deletion, because a deleted thread's turns
  are still on S3 — handing its number to a new thread would read them back as that
  thread's history. `loadSession` seeds the mint counter from `max(list, lastSideSeq)`,
  and switching threads only ever raises it.
- The transcript comes back too, from `GET /api/sessions/:parent/side/:n/messages`.
  Restoring **in `loadSession`, not when the panel opens**, is the load-bearing choice:
  a stored session can only be resumed through `loadSession`, which already serializes
  itself and resets the panel first, so nothing can race; and it covers the header
  `/btw` toggle, which never goes through the composer's submit path. The fetch is not
  awaited (display state for a panel nobody has opened yet), so it carries its own two
  guards — the ref must still point at the thread it fetched (`fetchSideHistory`, shared
  with the switch path), and local messages must still be empty — and it fails silently:
  no `sideError`, because a red bubble about something the user did not just do is worse
  than no history. Switching threads reuses that fetch but skips the empty-guard: it
  replaces the transcript on purpose.

### Why it works — context is `threadId`

The browser only ever sends the newest user message; the agent's memory is
whatever `S3SessionManager` restored into `agent.messages`. So a side question
needs a *different* thread that can still see the parent's.

| Piece | How |
|---|---|
| Side thread id | `"<parentUuid>:btw:<n>"` — never a UUID, so the session route's UUID regex rejects it and **the session Lambda never lists it**. History shows nothing. The side route serves it instead, built from two validated halves. |
| Retrieval | `GET /api/sessions/:parent/side/:n/messages` — the parent half keeps the UUID guard, `:n` must be digits (Express decodes `%2F` inside a path param *after* routing, so a looser check could build a prefix outside the parent's namespace). It *constructs* the side id rather than parsing one. |
| Empty side thread | **200 with `messages: []`, not 404**, unlike the session route: "minted, but the first run died before writing" is a legitimate state, and the panel should come up empty rather than surface an error. |
| Wire | the ordinary `RunAgentInput` plus `forwardedProps.sideQuestionOf = "<parentUuid>"` |
| Provider | `session_manager_provider` in `main.py` branches on it → `get_side_question_session_manager` |
| Manager | **reads** the parent prefix, **writes** its own. `self.session_id` is never changed, so the inherited `create_message` / `update_agent` already write under the side prefix; only the reads are overridden. |
| Read paths | all four go through `_get_session_path`, which resolves every id against its *own* prefix — `S3SessionManager` bakes `self.prefix` in at construction, so overriding the `session_id` argument alone would look under `sessions/{side}/session_{parent}/` and silently return an empty history. |
| Index base | side turns number from `SIDE_QUESTION_MESSAGE_INDEX_BASE` (1e6), so the parent growing past the side's ids cannot collide. |
| Mid-stream | the parent's *persisted* transcript cannot contain an answer that is still arriving, so while the main run is in flight the partial answer (capped ~3000 chars) is carried in the **sent** content while the panel displays only the question. That composed string is what S3 stores, so `splitSidePrompt` strips the bracket back off when the transcript is restored — and it is built from the same two constants that compose it, so mint and strip cannot drift. |

Two consequences worth knowing:

- **Read-through, not copy.** `sessions/{sideId}/` on S3 holds only the side's own
  turns — the parent's are materialised into `agent.messages` in memory. Anything
  reading S3 directly (`aws s3 ls`, the retrieval Lambda) sees a partial record;
  only the agent sees the merged view. The side route serves that partial record
  deliberately: the panel renders next to the main transcript that is already on
  screen, so merging would re-ship the parent's whole transcript on every restore and
  would have to reconcile two disjoint id ranges. `messageCount` counts stored
  messages, tool traffic included, so it exceeds what the panel renders.
- **The provider runs once per thread** (ag_ui_strands caches one agent per
  `thread_id`), so a recycled container re-reads the parent on the next side run.
  That is what keeps a side thread fresh with no extra bookkeeping.

Do **not** turn the side id into a UUID, and do **not** add side turns to
`chatSlice.sessions`, the rename path, or the main session's cache invalidation —
that would make side questions ordinary sessions, which is the opposite of the
point. The one thing that does belong on the session record is the side *thread list*
(`sideSessions`, see above): pointers to threads, not turns in the transcript.
It is also why the panel invalidates the *side* tag after each turn but never the
parent's — the year-long `keepUnusedDataFor` on the side query would otherwise hand a
pre-ask transcript to the next restore.

## Operations

Prefer **sync** over one-off inject/delete. Each inject stores `metadata.source_path` and `metadata.content_hash` (`sha256(source_path + NUL + raw file bytes)`). Filename, frontmatter (including `pdf-filepath`), and body all change the hash. Any mismatch is delete + re-inject.

`metadata.pdf-filepath` and `metadata.page_range` are injected too. The
filepath is carried, not compared on its own: because the hash covers raw
file bytes, adding or editing it re-injects the article like any other
frontmatter change. `page_range` is per *chunk* (from `## pN-M` headings).
`page` is the first `<!-- page N -->` in that chunk's original_text — the
printed page the fragment starts on. The chip shows `PDF · page 40-45` and,
when the exact page differs from the start of the range, ` · p.45`. `#page=`
opens at the exact page when known. A title-keyed lookup cannot recover
either field, which is why there is no `article_links` tool.

### PDF-sourced articles

1. Put the PDF in `files/` with a **hyphenated** name
   (`json-request-example-ocpp-j-1.6-specification.pdf`, not
   `json request example …pdf`).
2. Produce a paged summary (`pdf--into-paged-summary`) into `markdowns/`.
3. Set `pdf-filepath: /files/<hyphenated-name>.pdf` in frontmatter.
4. `sync_articles.py --apply` (or inject the one file). New / changed PDF
   articles pick up `page_range` automatically; renaming a PDF in `files/`
   without updating frontmatter leaves citations pointing at a 404.

Changing only the PDF binary (not the markdown) does **not** re-embed —
the hash is of the markdown file. Re-run the paged-summary step, then sync.

| Intent | Command |
|---|---|
| Sync dry-run | `uv run --directory vector_db sync_articles.py` |
| First-time fingerprints | `uv run --directory vector_db sync_articles.py --backfill-hashes` |
| Apply add / change / remove | `uv run --directory vector_db sync_articles.py --apply` |
| Title-only missing | `uv run --directory vector_db check_missing.py` |
| Inject one file | `sh vector_db/inject_new_article.sh "<abs-path>"` |
| Latest | `uv run --directory vector_db get_latest_articles.py` |
| Delete (dry-run) | `sh vector_db/remove_old_article.sh <prefix>` then `--yes` |
| Tags only, no vectors | `uv run --directory vector_db get_tags.py` |

Resolve files by filename, `slug`, path, or title — not a YAML `id`. Ignore `*-tc.md`. Skip `wip: true` (and drop vectors if a previously injected article flips to WIP).

### Sync articles (default path)

1. Dry-run:

```bash
uv run --directory vector_db sync_articles.py
```

Buckets:

- **added** — file title not in DB → inject
- **changed** — path or file bytes differ (includes rename) → delete + inject
- **removed** — DB title has no file (or file is now WIP) → delete
- **unfingerprinted** — existing rows have no hash yet → backfill, do not re-embed
- **ok** — path + hash match

2. If the plan is only **unfingerprinted**, write hashes (and fill empty `slug`) without Azure / DeepSeek:

```bash
uv run --directory vector_db sync_articles.py --backfill-hashes
```

Then dry-run again. Expect all **ok**.

3. If the plan has **added** / **changed** / **removed**, confirm with the user, then:

```bash
uv run --directory vector_db sync_articles.py --apply
```

`--apply` refuses if any articles are still unfingerprinted — backfill first.
It also writes `{{POSTGRES_SCHEMA}}.tags` from frontmatter (step 4).

A run shows two nested tqdm bars: `articles: N/M` over the plan, and a
per-article `part k/N` bar with an ETA — a long article is cut into
`max_part_chars` (14,000-char) parts before chunking, and the part total is
computed from the character count before any model call. Read the bar, not the
table: an article's rows land only after *all* of its parts are chunked, so a
large document shows no progress in `embeddings` for an hour or more, and a
`changed` article's row count drops to zero in the meantime. After 3 failed
attempts a part falls back to the non-LLM splitter rather than aborting the run.

Bars go to stderr, so they stream to a terminal even when stdout is
block-buffered. Redirecting to a file needs `PYTHONUNBUFFERED=1`, or the `print`
lines arrive in 8 KB bursts and a healthy run looks hung.

4. Tags are automatic — no separate command. Every run compares
`{{ARTICLES_DIR}}/` frontmatter with `{{POSTGRES_SCHEMA}}.tags`. `--apply`
creates that table when it is missing, inserts tags that are new, and deletes
tags that no longer appear on any article. `find_tags` runs
`SELECT tag FROM {{POSTGRES_SCHEMA}}.tags` on every call, so the new list is
visible without an AgentCore deploy. Expect one of:

- `{{POSTGRES_SCHEMA}}.tags unchanged (N tags) ✓` — nothing to do
- `{{POSTGRES_SCHEMA}}.tags would change (+A -B, N tags)` (dry-run) — `--apply` writes the diff
- `{{POSTGRES_SCHEMA}}.tags updated (+A -B, N tags)` — rows inserted and deleted

`get_tags.py` writes the same table without touching embeddings.

Do **not** hook sync into the docs-site GitHub Actions workflow unless that job has Postgres / Azure / DeepSeek secrets.

## Gotchas

1. DeepSeek V4 Flash thinks by default — tools pass
   `extra_body={"thinking": {"type": "disabled"}}`.
2. ada-002 is 1536-d. Changing embedding model needs a new table.
3. `sslmode=require` default. Local PG: `POSTGRES_SSLMODE=disable`.
4. `wip: true` skips inject. Sync treats a previously injected WIP file as `removed`.
5. Title-only `check_missing.py` does not see renames or body edits. Use `sync_articles.py`.
6. One tool per model turn.
7. zsh: never split AWS CLI with `\`; `$USERNAME` is reserved.
8. Never commit `.env`, `.env.local`, or filled `envVars` values.
9. Session Lambda does not create the AgentCore runtime role.
10. Encoded draw.io / diagrams.net `#R` / `#U` URL payloads are stripped before DeepSeek. The hash still uses raw file bytes, so a diagram-only edit still counts as `changed`.
11. Do **not** register a title-keyed `article_links` tool. `rerank_chunks`
    already returns a finished `link` (`[Title](…) · [PDF · page N](/files/…#page=N)`).
    The model copies that string; a second builder made it drop the pages.
12. `rerank_chunks` splits stored content on two blank lines (headline /
    summary / original_text), **not** `"###"`. It hands the agent a full
    summary plus the first **2000 characters** of `original_text`
    (`EXCERPT_CHARS`), cut on a word boundary. The ranking prompt still
    truncates summaries to 200 chars; the returned summary does not.
13. `page_range` is re-read from the row by chunk id. The model drops it
    when relaying the `articles` list between search and rerank — do not
    trust that relay.
14. `files/` PDF names must not contain spaces. Inject refuses a
    `pdf-filepath` that does. Non-ASCII is fine (percent-encoded in the chip).
15. `/btw` side threads are **invisible to the session route by design** — the id is
    not a UUID. Do not "fix" that by relaxing its regex; it is what keeps them out of
    history. They have their own route (`/side/:n`), which the session route's guard
    must never be loosened to absorb.
16. A side thread's S3 prefix holds only its **own** turns. The parent's are read
    through in memory, never copied. A reader that goes straight to S3 (the
    Lambda, `aws s3 ls`) sees a partial record; only the agent sees the merge. The
    side route returns exactly that partial record, on purpose.
17. `session_manager_provider` runs **once per thread** per container, so a side
    thread picks up main turns that finished since only after the container
    recycles or the panel's New (`+`) mints a new side id.
18. `find_tags` reads `{{POSTGRES_SCHEMA}}.tags` on every call. Sync and
    `get_tags.py` write that table from frontmatter. Do not put the vocabulary
    back in `tags.py`, and do not redeploy AgentCore to publish a tag.
19. The header's double-click-to-maximize is detected by hand in
    `handleHeaderPointerDown`, **not** with `onDoubleClick`. The chat window is
    rendered through a `createPortal`, so the browser dispatches `dblclick` to
    `<body>` — outside the React root — and a React `onDoubleClick` never fires.
    Do not "simplify" it back. The same handler is what lets a drag start on the
    header without a button press starting one.
20. `relation "chat_session" does not exist` with the table present means the
    connection's `search_path` does not include `{{POSTGRES_SCHEMA}}`. Qualify
    with `withSchema` in `src/db/database.ts`. Do not set `search_path` in the
    pool `options` — a pooled connection (Neon) rejects that startup parameter.
21. `DATABASE_URL` is for Prisma only. The function reads `DB_HOST`,
    `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, and node-postgres ignores the
    `schema` query param, so adding `DATABASE_URL` to the Lambda environment
    changes nothing.
22. `serverless deploy` printing "No changes to deploy" while the source
    changed means `tsc` emitted under `dist/src/` and the handler still loads
    the stale `dist/server.js`. Keep `rootDir` at `src` with a single `include`
    directory. Delete `dist/` and redeploy.

## Template files

```
templates/
  .env.sample
  agentcore-envvars.json
  attach-s3-policy.sh
  agent/          ← Strands AG-UI RAG agent
    main.py                     system prompt: copy `link` verbatim; two answer shapes;
                                session_manager_provider routes /btw to the side manager
    memory/session.py           S3SessionManager + SideQuestionSessionManager (read parent,
                                write own prefix; ids from 1e6)
    tools/rerank_chunks.py      2000-char excerpt; page_range + page from the row; finished `link`
    tools/links.py              chip `PDF · page 40-45 · p.45`; `#page=` = exact page
    tools/find_tags.py          SELECT {{POSTGRES_SCHEMA}}.tags on every call
    tools/db.py                 load_tags()
    tools/__init__.py           no article_links
  vector_db/      ← pgvector CLI (schema-aware)
    create_table.py             embeddings + tags (tag TEXT PRIMARY KEY)
    get_tags.py                 frontmatter → {{POSTGRES_SCHEMA}}.tags
    step3_inject_new_article.py pdf-filepath + page_range from ## pN-M + page from <!-- page N -->
  session-lambda/ ← Express + serverless.yml IAM + Prisma chat tables
    prisma/schema.prisma        user, chat_session, chat_side_session in {{POSTGRES_SCHEMA}}
    prisma/migrations/          baseline (mark applied) + the chat tables (deploy)
    src/db/database.ts          pg Pool; withSchema("{{POSTGRES_SCHEMA}}"), never a search_path option
    src/db/types.ts             committed prisma-kysely output; the Lambda build does not generate
    src/routes/sessions.ts      POST/GET/DELETE /api/sessions, scoped by username
    src/messages.ts             shared messagesPrefix + readSessionMessages, used by both
                                routes; `objectCount` keeps the session route's 404 (no
                                objects) apart from a 200 with zero messages (unparseable)
    src/routes/sessionMessages.ts  the session route + the `/side/:n` side-thread route
  frontend/       ← FloatingChatBot + chatSlice + ragApi + agentBotApi
    FloatingChatBot/agentStream.ts  SSE reader + runAgentTurn + resolveAgentAuth,
                                    shared by the main chat and the side panel
    FloatingChatBot/AgentChatInterface.tsx  /btw parsing + the header /btw toggle;
                                    the overlay side panel and its drag handle;
                                    the side-question list (switch / delete / badge);
                                    header drag-to-move + double-click-to-maximize;
                                    side-history restore in loadSession
    chatSlice.ts                sessions + the persisted `sideSessions` list, its
                                `lastSideSeq` mint floor, and the legacy-pointer
                                migration in `normalizeSessions`
    ragApi.ts                   getSessionMessages + getSideSessionMessages, and the
                                `sideThreadId(parent, n)` / `sideSeqOf` id pair
    agentBotApi.ts              GET /api/agent-bot-credentials (served by the host app)
```
