---
name: aws--agentcore-rag-session-chatbot
description: >-
  Scaffold the HKEV-style RAG chatbot stack: markdown → pgvector (isolated
  schema), Bedrock AgentCore Strands AG-UI agent, Cognito CUSTOM_JWT (dummy
  public bot user), S3 session history, session-retrieval Lambda, and a
  floating React chat UI. Use when the user wants a docs RAG agent with
  session retrieval, AgentCore + Cognito JWT, or to copy this stack into
  another repo. Never paste secret values into templates, SKILL.md, or git.
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
    │
    ▼
app/{{AGENT_NAME}}/   AgentCore AGUI  CUSTOM_JWT
    rephrase → find_tags → search → rerank → copy `link` verbatim → answer
    S3SessionManager → s3://{{S3_SESSION_BUCKET}}/sessions/{uuid}/...
    SideQuestionSessionManager → reads that prefix, writes sessions/{uuid}:btw:{n}/
    │
    ▼
session-lambda  GET /api/sessions/:id/messages              (IAM GetObject/ListBucket)
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

Search-replace the table above. `TAGS = []` stays empty until `get_tags.py` runs —
a plain `sync_articles.py` run refreshes it from frontmatter.

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

Creates `{{POSTGRES_SCHEMA}}` and `{{POSTGRES_SCHEMA}}.embeddings`. Does
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
cd <repo>/agentcore-session-retrieval-lambda && npm install && npx serverless deploy
```

Put the printed `https://….execute-api.…/dev` into
`VITE_SESSION_API_BASE` **plus** `/api`.

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
  question that opened it). The panel's list button shows them with the header history
  panel's own classes: a row switches threads (its turns come back through
  `GET .../side/:n/messages`), the row's trash drops it, and deleting the thread on
  screen falls back to the newest one left. `loadSession` resumes `sideSessions[0]`,
  which is what makes "the latest one by default" fall out of the ordering rather than
  a stored pointer.
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
| Apply without the tag deploy | `uv run --directory vector_db sync_articles.py --apply --no-deploy` |
| Title-only missing | `uv run --directory vector_db check_missing.py` |
| Inject one file | `sh vector_db/inject_new_article.sh "<abs-path>"` |
| Latest | `uv run --directory vector_db get_latest_articles.py` |
| Delete (dry-run) | `sh vector_db/remove_old_article.sh <prefix>` then `--yes` |
| Tags only, no vectors | `uv run --directory vector_db get_tags.py` then `agentcore deploy -y` |

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
It also refreshes the agent's tag list and deploys AgentCore when that list
changed (step 4). Pass `--no-deploy` to leave the deploy to you.

4. Tags are automatic — no separate command. Every run checks the agent's `TAGS`
list against `{{ARTICLES_DIR}}/` frontmatter. `--apply` rewrites
`agentcore/app/{{AGENT_NAME}}/tags.py` and `tools/tags.py`, but only when the
content actually differs, and then runs `agentcore deploy -y` from `agentcore/`
so `find_tags` sees the new tags; an unchanged sync never triggers a deploy.
Expect one of:

- `tags.py unchanged (N tags) ✓` — nothing to do
- `tags.py would change (N tags)` (dry-run) — `--apply` will rewrite the files
- `tags.py would change` → rewrite, then the deploy line

A failed deploy prints the manual command and does **not** roll back the vector
changes — re-run `cd agentcore && agentcore deploy -y`.

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
18. The header's double-click-to-maximize is detected by hand in
    `handleHeaderPointerDown`, **not** with `onDoubleClick`. The chat window is
    rendered through a `createPortal`, so the browser dispatches `dblclick` to
    `<body>` — outside the React root — and a React `onDoubleClick` never fires.
    Do not "simplify" it back. The same handler is what lets a drag start on the
    header without a button press starting one.

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
    tools/__init__.py           no article_links
  vector_db/      ← pgvector CLI (schema-aware)
    step3_inject_new_article.py pdf-filepath + page_range from ## pN-M + page from <!-- page N -->
  session-lambda/ ← Express + serverless.yml IAM
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
