---
name: aws--agentcore-rag-session-chatbot
description: >-
  Scaffold a docs RAG chatbot stack: markdown → pgvector (isolated
  schema), Bedrock AgentCore Strands AG-UI agent, Cognito CUSTOM_JWT (dummy
  public bot user), S3 session history, session-retrieval Lambda, and a
  floating React chat UI. Use when the user wants a docs RAG agent with
  session retrieval, AgentCore + Cognito JWT, or to copy this stack into
  another repo. Never paste secret values into templates, SKILL.md, or git.
---

# AgentCore RAG + session chatbot

Reusable docs RAG + session chatbot stack. **Do not copy
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
- "Copy the docs RAG chatbot stack into this repo"
- "Set up AgentCore + pgvector + floating chat + session Lambda"
- "Add a docs chatbot with AgentCore and S3 session history"
- "Reuse the documentation RAG / session chatbot"

**Do not use** `/aws--agentcore-rag-pgvector` (removed). For a bare
`agentcore create` only, use `/aws--agentcore-boilerplate`.

Never copy credentials from another project's `.env`, `.env.local`, filled
`agentcore.json` `envVars`, or chat UI Cognito constants. Ask the user to
fill env files in the **target** repo.

## Architecture

```
markdowns/  (YAML: title, description, slug, section, tags, wip)
    │
    ▼
vector_db/inject  →  DeepSeek chunks + Azure ada-002 (1536-d)
    │
    ▼
PostgreSQL  schema {{POSTGRES_SCHEMA}}.embeddings
    │
    ▼
app/{{AGENT_NAME}}/   AgentCore AGUI  CUSTOM_JWT
    rephrase → find_tags → search → rerank → article_links → answer
    S3SessionManager → s3://{{S3_SESSION_BUCKET}}/sessions/{uuid}/...
    │
    ▼
session-lambda  GET /api/sessions/:id/messages   (IAM GetObject/ListBucket)
    │
    ▼
frontend FloatingChatBot  Amplify signIn(dummy bot) + SSE /invocations
```

The S3 bucket is **private**. Lambda IAM is in `serverless.yml`. AgentCore
write access is `attach-s3-policy.sh` on the **runtime role** after deploy
(different role — cannot live in serverless.yml).

## Layout after scaffold

```
<repo>/
  markdowns/                         ← corpus
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
| `projectName` | AgentCore project `name` (alphanumeric, no hyphen, max 23) | `docsRag` |
| `agentName` | runtime / `app/` folder, PascalCase | `DocsRagAgent` |
| `domainDescription` | system-prompt domain | `internal product documentation` |
| `articlesDir` | markdown corpus relative to repo | `markdowns` |
| `articleRoutePrefix` | citation URL prefix, no trailing slash | `/docs` |
| `postgresSchema` | isolated PG schema (not `public`) | `docs` |
| `s3SessionBucket` | private session bucket | `docs-rag-agentcore-sessions` |
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
| `{{PROJECT_NAME}}` | `docsRag` |
| `{{AGENT_NAME}}` | `DocsRagAgent` |
| `{{DOMAIN_DESCRIPTION}}` | domain sentence |
| `{{ARTICLES_DIR}}` | `markdowns` |
| `{{ARTICLE_ROUTE_PREFIX}}` | `/docs` |
| `{{POSTGRES_SCHEMA}}` | `docs` |
| `{{S3_SESSION_BUCKET}}` | bucket name |
| `{{AWS_REGION}}` | `ap-northeast-1` |
| `{{COGNITO_REGION}}` | `us-east-1` |
| `{{COGNITO_USER_POOL_ID}}` | created pool id (after Cognito step) |
| `{{COGNITO_CLIENT_ID}}` | created client id |
| `{{BOT_USERNAME}}` | `bot` |
| `{{BOT_PASSWORD}}` | dummy password the user chose (public by design; still do not commit if they prefer env) |
| `{{WELCOME_MESSAGE}}` | welcome string |
| `{{CHAT_TITLE}}` | header in FloatingChatBot |
| `{{LAMBDA_SERVICE}}` | e.g. `docs-rag-api` |
| `{{SESSION_API_BASE}}` | filled **after** `serverless deploy` |

Env **names** stay as written (`POSTGRES_HOST`, `DEEPSEEK_API_KEY`, …).

## Workflow

### 1. Copy templates

From `~/.claude/skills/aws--agentcore-rag-session-chatbot/templates`:

```bash
SKILL=~/.claude/skills/aws--agentcore-rag-session-chatbot/templates
cp -R "$SKILL/vector_db" <repo>/vector_db
cp -R "$SKILL/agent/." <agentcore-root>/app/{{AGENT_NAME}}/
cp -R "$SKILL/session-lambda" <repo>/agentcore-session-retrieval-lambda
cp -R "$SKILL/frontend/FloatingChatBot" <frontendDir>/src/components/FloatingChatBot
cp "$SKILL/frontend/chatSlice.ts" <frontendDir>/src/redux/slices/chatSlice.ts
cp "$SKILL/frontend/ragApi.ts" <frontendDir>/src/redux/api/ragApi.ts
cp "$SKILL/attach-s3-policy.sh" <agentcore-root>/attach-s3-policy.sh
cp "$SKILL/.env.sample" <repo>/.env.sample
```

If there is no AgentCore project yet, run `agentcore create` first (or
`aws--agentcore-boilerplate`), then overlay `app/{{AGENT_NAME}}/`.

### 2. Substitute placeholders

Search-replace the table above. Empty `TAGS = []` until `get_tags.py` runs.

### 3. Frontend wiring (existing app)

- Add `chat: chatSlice.reducer` and `persistChatState` subscribe (see this
  repo's `doc-project/frontend/src/redux/store.ts`).
- Add `"SessionMessages"` to RTK `tagTypes`.
- Import `./api/ragApi` next to other API injects.
- Mount `<FloatingChatBot />` in the authenticated shell.
- Dependencies: `aws-amplify`, `@mui/material`, `@mui/icons-material`,
  `react-icons`, `sass` (if SCSS). Markdown renderer: swap
  `CustomMarkdown` import if the host app uses a different component.
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
- Next: fill `.env`, inject markdowns, `agentcore deploy`, attach S3 policy

## Operations

| Intent | Command |
|---|---|
| Inject | `sh vector_db/inject_new_article.sh "<abs-path>"` |
| Missing | `uv run --directory vector_db check_missing.py` |
| Latest | `uv run --directory vector_db get_latest_articles.py` |
| Delete (dry-run) | `sh vector_db/remove_old_article.sh <prefix>` then `--yes` |
| Tags + deploy | `uv run --directory vector_db get_tags.py` then `agentcore deploy -y` |

Resolve files by filename, `slug`, path, or title — not a YAML `id`.

## Gotchas

1. DeepSeek V4 Flash thinks by default — tools pass
   `extra_body={"thinking": {"type": "disabled"}}`.
2. ada-002 is 1536-d. Changing embedding model needs a new table.
3. `sslmode=require` default. Local PG: `POSTGRES_SSLMODE=disable`.
4. `wip: true` skips inject.
5. One tool per model turn.
6. zsh: never split AWS CLI with `\`; `$USERNAME` is reserved.
7. Never commit `.env`, `.env.local`, or filled `envVars` values.
8. Session Lambda does not create the AgentCore runtime role.

## Template files

```
templates/
  .env.sample
  agentcore-envvars.json
  attach-s3-policy.sh
  agent/          ← Strands AG-UI RAG agent
  vector_db/      ← pgvector CLI (schema-aware)
  session-lambda/ ← Express + serverless.yml IAM
  frontend/       ← FloatingChatBot + chatSlice + ragApi
```
