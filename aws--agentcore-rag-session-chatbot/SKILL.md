---
name: aws--agentcore-rag-session-chatbot
description: >-
  Scaffold the HKEV-style RAG chatbot stack: markdown → pgvector (isolated
  schema), Bedrock AgentCore Strands AG-UI agent, Cognito CUSTOM_JWT (dummy
  public bot user), S3 session history, session-retrieval Lambda, a floating
  React chat UI, and an optional second MCP runtime whose OAuth 2.1 login is
  the docs site's own OIDC issuer. Every setup persists the chat session list per
  user: a `user` row keyed by the logged-in username, and a `chat_session` row
  per conversation, created by the session Lambda through Prisma and Kysely.
  Use when the user wants a docs RAG agent with session retrieval, AgentCore +
  Cognito JWT, per-user persisted chat sessions, a custom MCP server
  authenticated with OIDC, or to copy this stack into another repo. Never paste
  secret values into templates, SKILL.md, or git.
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
- "Add an MCP server for the docs, with a browser login"
- "Expose the RAG search as an MCP tool authenticated by our own OIDC issuer"

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

app/{{AGENT_NAME}}/mcp_main.py   a SECOND runtime, protocol MCP (optional)
    one tool, search_docs: rephrase → find_tags → search → rerank
    AgentCore answers a tokenless call with 401 + resource_metadata
    │
    ▼
docs site (the OIDC issuer)   /.well-known/oauth-authorization-server
    POST /oauth/register → GET /oauth/authorize → /mcp-login
    → GET /oauth/complete → POST /oauth/token → the same RS256 JWT
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
| `{{JWT_ISSUER}}` | docs-site issuer, no trailing slash (MCP step only) | `https://doc.example.com` |
| `{{JWT_AUDIENCE}}` | `aud` the docs site signs and the MCP runtime allows | `docs` |

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

### 9. MCP runtime with OIDC login (only when asked)

Skip this whole step unless the user wants a remote MCP client (Claude Code,
Cursor, anything that speaks MCP) to search the docs. The floating chat does
not use it. It keeps calling the AG-UI runtime from step 8.

A runtime has exactly one protocol, so this is a **second entry** in
`runtimes`, not a flag on `{{AGENT_NAME}}`. Name it `{{AGENT_NAME}}Mcp`.
Renaming either runtime later destroys the deployed one.

#### The server

Write `app/{{AGENT_NAME}}/mcp_main.py`. It imports the tools the AG-UI agent
already has and runs them in order inside **one** tool. Do not register
`rephrase_query`, `find_tags`, `search_articles`, and `rerank_chunks`
separately: a remote client has no system prompt forcing that order, so it
will skip or reorder them. Leave `main.py` and `status` alone — the chat UI
shows those status lines.

```python
from mcp.server.fastmcp import FastMCP

from tools.find_tags import find_tags
from tools.rephrase_query import rephrase_query
from tools.rerank_chunks import rerank_chunks
from tools.search_articles import search_articles

# AgentCore forwards MCP to 0.0.0.0:8000/mcp and supplies Mcp-Session-Id.
mcp = FastMCP(host="0.0.0.0", stateless_http=True, port=8000)


@mcp.tool()
def search_docs(question: str) -> dict:
    """Search the documentation and return cited passages.

    Use this for any question about {{DOMAIN_DESCRIPTION}}. It rephrases the
    question, picks tags, searches, then reranks. Call it once per question.
    Each chunk carries title, summary, source_excerpt, and a finished markdown
    link. Answer from those, and copy link verbatim when citing.
    """
    query = rephrase_query(question)
    tags = find_tags(query)
    found = search_articles(query, tags)
    articles = found.get("articles", [])
    ranked = rerank_chunks(query, articles) if articles else []
    return {
        "query": query,
        "tags": tags,
        "total_found": found.get("total_found", 0),
        "chunks": ranked,
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

The docstring is the only tool description the client shows its model. There
is no keyword list and no trigger config.

`FastMCP` is imported from `mcp.server.fastmcp`, which mcp 2.x removed.
`strands-agents` and `bedrock-agentcore` require `mcp<2`, but the deployed
resolver ignores a constraint that is only transitive. Pin it directly in
`app/{{AGENT_NAME}}/pyproject.toml`:

```toml
"mcp>=1.23.0,<2",
```

Without the pin the runtime installs mcp 2, dies on import with
`ModuleNotFoundError: No module named 'mcp.server.fastmcp'`, and the client reports
`connection timed out after 30000ms` **after** login succeeded. The login
working does not mean the runtime started. Read the runtime logs.

#### The runtime entry

Copy `runtimes[0]` to a second object. Same `codeLocation`, same `envVars`
**names** (empty values, filled only in `.env.local`), same authorizer. Change
`name`, `entrypoint`, and `protocol`.

```json
{
  "name": "{{AGENT_NAME}}Mcp",
  "build": "CodeZip",
  "entrypoint": "mcp_main.py",
  "codeLocation": "app/{{AGENT_NAME}}/",
  "runtimeVersion": "PYTHON_3_14",
  "networkMode": "PUBLIC",
  "protocol": "MCP",
  "authorizerType": "CUSTOM_JWT",
  "authorizerConfiguration": {
    "customJwtAuthorizer": {
      "discoveryUrl": "{{JWT_ISSUER}}/.well-known/openid-configuration",
      "allowedAudience": ["{{JWT_AUDIENCE}}"]
    }
  }
}
```

This authorizer is **not** the Cognito one from step 4. Cognito
`USER_PASSWORD_AUTH` tokens carry `client_id` and no `aud`, so the AG-UI
runtime uses `allowedClients`. The MCP token is signed by the docs site and
carries `aud`, so this runtime uses `allowedAudience`. The two runtimes can
keep different authorizers. Deploying this entry does not publish the login
page — that is the docs site, below, and it deploys on its own.

`discoveryUrl` must end in `/.well-known/openid-configuration`. AgentCore
fetches it, then `jwks_uri`, and checks the bearer signature. It never sees a
password and never redirects a browser.

#### The invocation URL

`agentcore status --json` prints `invocationUrl` after deploy. Prefer that
over building it. The shape, with `:` as `%3A` and `/` as `%2F`, is:

```text
https://bedrock-agentcore.{{AWS_REGION}}.amazonaws.com/runtimes/<url-encoded-arn>/invocations?qualifier=DEFAULT
```

Quote it in zsh. `?` is a glob, and an unquoted URL fails with
`no matches found` before the command runs. If the client sends `Accept`, it
must allow both `application/json` and `text/event-stream`. The URL is not
specific to one client.

#### What the client does

A tokenless request gets `401` with one header:

```text
WWW-Authenticate: Bearer resource_metadata="<invocation-url>/.well-known/oauth-protected-resource?qualifier=DEFAULT"
```

AgentCore serves that protected-resource document and names `{{JWT_ISSUER}}`
as the authorization server. The client then does all of this against the docs
site, per the [MCP authorization spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization):

1. `GET /.well-known/oauth-authorization-server`
2. `POST /oauth/register` with its redirect URI
3. Open `authorization_endpoint` in the browser, PKCE S256
4. Get `?code=` back on its own redirect URI
5. `POST /oauth/token` with the code and the verifier
6. Retry with `Authorization: Bearer <access_token>`

The client config holds the invocation URL only. No token, no client id, no
secret. A `200` with `text/html` is a failure: the discovery path fell through
to the SPA. The client reports `does not support dynamic client registration`
and `content-type is not application/json`.

#### The authorization server

The docs site is already the issuer (`{{JWT_ISSUER}}`) and already publishes
`/.well-known/openid-configuration` plus `/.well-known/jwks.json`. It is not
an OAuth server until these routes exist. Add them in three files:
`oauthServer.ts` (signing), the auth controller (HTTP), and the app router
(where the browser goes). Mount every route **before** the SPA catch-all,
or the catch-all returns `index.html` for them.

The site runs as one Lambda, so the register call, the browser, and the token
call can hit different containers. Do not store the client or the code in
memory or in a table. Sign both with HMAC-SHA256 over `JWT_PRIVATE_KEY`. The
token is `base64url(body).base64url(mac)`. A client id lasts 30 days, a code
lasts 5 minutes, and a code carries everything the token endpoint checks.

```ts
const CODE_TTL_SECONDS = 5 * 60;
const CLIENT_TTL_SECONDS = 30 * 24 * 60 * 60;

type ClientClaims = { u: string[]; exp: number };
type CodeClaims = {
    cid: string;   // client id this code was issued to
    r: string;     // the exact redirect URI
    c: string;     // the PKCE S256 challenge
    res?: string;  // RFC 8707 resource, when the client sent one
    exp: number;
    jti: string;   // spent once per warm container
};
```

A `Set` of spent `jti`s blocks a replay on the same warm container. A second
container still accepts the code until it expires. That window is the trade
for having no shared store.

**`GET /.well-known/oauth-authorization-server`** — `200`, RFC 8414:

```json
{
  "issuer": "{{JWT_ISSUER}}",
  "authorization_endpoint": "{{JWT_ISSUER}}/oauth/authorize",
  "token_endpoint": "{{JWT_ISSUER}}/oauth/token",
  "registration_endpoint": "{{JWT_ISSUER}}/oauth/register",
  "jwks_uri": "{{JWT_ISSUER}}/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp"]
}
```

`none` means no client secret. PKCE replaces it. Also add the same three
endpoints to the existing `/.well-known/openid-configuration`, so a client
that starts from OIDC discovery still finds them. `jwks.json` must publish
the public key with the same `kid` the signer writes. The private key stays
in the Lambda.

**`POST /oauth/register`** — body `{ "redirect_uris": ["http://127.0.0.1:19876/callback"] }`.
Accept only `https`, or `http` on `localhost` / `127.0.0.1`. Sign `{ u, exp }`
into the client id. `201`:

```json
{
  "client_id": "<signed token>",
  "redirect_uris": ["http://127.0.0.1:19876/callback"],
  "client_id_issued_at": 1760000000,
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

Anything else is `400` `{ "error": "invalid_client_metadata", "error_description": "redirect_uris must be a list of http(s) or localhost URLs." }`.

**`GET /oauth/authorize`** — validate, then redirect. Do not render a page
here. Reject unless `response_type` is `code`, the client id verifies and is
unexpired, `redirect_uri` is one of the URIs inside that client id, and
`code_challenge_method` is `S256`. A failure is `400`
`{ "error": "invalid_request", "error_description": "..." }` with one of:
`response_type must be code.`, `Unknown client_id. Register the client first.`,
`redirect_uri is not registered for this client.`, `PKCE S256 is required.`

On success the **router** redirects, forwarding the whole query string. The
controller only validates and calls `next()`.

```ts
app.get("/oauth/authorize", AuthController.authorize, (req, res) => {
    const query = new URLSearchParams(req.query as Record<string, string>);
    res.redirect(302, `/mcp-login?${query.toString()}`);
});
```

```text
302 Location: /mcp-login?response_type=code&client_id=<signed token>&redirect_uri=...&code_challenge=<s256>&code_challenge_method=S256&state=<state>&resource=<invocation url>
```

Keep every parameter. The login page sends this query back unchanged, and
dropping `response_type` makes the completion step fail its own check. The
client never learns `/mcp-login`. It only knows `authorization_endpoint`, so
changing pages later is a change to this one redirect.

**`GET /oauth/complete`** — the login page lands here. Read the `access_token`
cookie and verify it; missing or rejected is `401` `{ "error": "login_required" }`.
Run the same validation as authorize (`400` `invalid_request` on failure),
then sign the code and redirect to the client's redirect URI:

```text
302 Location: http://127.0.0.1:19876/callback?code=<signed token>&state=<state>
```

The code claims are `{ cid, r, c, res, exp, jti }`. `jti` is
`randomBytes(16)` base64url. Nothing is stored.

**`POST /oauth/token`** — form body, so mount `express.urlencoded({ extended: false })`
or it arrives empty. Accept JSON too. Fields: `grant_type=authorization_code`,
`code`, `redirect_uri`, `client_id`, `code_verifier`, optional `resource`.

Check in this order, and mark the `jti` spent **before** comparing the
verifier, so a wrong verifier still consumes the code:

1. `grant_type` must be `authorization_code` → `unsupported_grant_type`
2. Signature valid and unexpired, and `jti` not spent → `invalid_grant`
3. `client_id` and `redirect_uri` equal the claims → `invalid_grant`
4. If both sides sent `resource`, they must match → `invalid_target`
5. `base64url(sha256(code_verifier))` must equal the stored challenge,
   compared in constant time → `invalid_grant`

On success sign a fresh access token with the **same** function that sets the
cookie, and return `200`:

```json
{ "access_token": "<RS256 JWT>", "token_type": "Bearer", "expires_in": 604800 }
```

The claims that matter: `algorithm` `RS256`, `keyid` equal to the published
`kid`, `issuer` equal to `{{JWT_ISSUER}}` with no trailing slash, `audience`
equal to `{{JWT_AUDIENCE}}`, `expiresIn` `7d`. The PEM is stored in the env
with newlines as the two characters `\n`; put the real line breaks back
before signing. A token whose `aud` is not `{{JWT_AUDIENCE}}` is rejected by
the runtime even when the signature is valid.

Also return that token from the existing login response, next to setting the
httpOnly cookie. The docs frontend ignores the body. A client that cannot
open a browser can take it from `POST /api/login` and send it as the bearer.
Set the cookie `sameSite: "lax"`. The browser arrives from the client's
localhost redirect and then navigates to `/oauth/complete`; `strict` would
drop the cookie on that navigation.

#### The login page

Do not reuse the docs login page. The app shell sends every authenticated
page to the docs route, so signing in there opens the documentation and the
MCP client waits until it times out. Add a separate page and leave the
original login untouched.

The page posts to the same login endpoint. On success it does not navigate
inside the app. It does a full navigation, which is what carries the cookie:

```tsx
const result = await login({ username, password });
if ("error" in result) {
    setError(err.data?.errorMessage ?? "Invalid username or password.");
    return;
}
const oauth = new URLSearchParams(window.location.search);
window.location.replace(`/oauth/complete?${oauth.toString()}`);
```

Three wiring details, each of which fails silently:

- The router `lazy` must resolve to `{ Component }`. `lazy={() => import(...)}`
  renders a **blank page** even though the URL and the query string are right.

  ```tsx
  <Route path="mcp-login" lazy={async () => {
      const { default: Component } = await import("../pages/McpLoginPage/McpLoginPage.tsx");
      return { Component };
  }} />
  ```

- Put the route **outside** the authenticated shell, and do not build it as a
  protected chunk. Those chunks return `401` when no cookie is present, and
  this page is where the user is before they have one.
- Exclude `/mcp-login` from the shell's "send everything to the docs" effect,
  the same way a public share page is excluded, and skip the cookie check for
  it. Otherwise the moment login succeeds the shell navigates to the docs and
  `/oauth/complete` never runs.

The frontend and the backend ship in one Lambda package, so a new page is not
live until both are deployed. `agentcore deploy` does not deploy it.

The dev server must proxy `/api`, `/oauth`, and `/.well-known` to the local
backend, or the local login posts to the dev server and gets `index.html`.

#### Connect a client

```bash
claude mcp add --scope user --transport http docs "<invocation-url>"
```

`--scope user` is required. The default `local` scope writes the server into
the current project only, and `claude mcp get` then says it does not exist
everywhere else. `claude mcp list` lists servers, not tools. Inside a
session, `/mcp` shows the one tool, `search_docs`.

Any other client uses the same URL and no token:

```json
{
  "mcpServers": {
    "docs": {
      "type": "http",
      "url": "https://bedrock-agentcore.{{AWS_REGION}}.amazonaws.com/runtimes/<url-encoded-arn>/invocations?qualifier=DEFAULT"
    }
  }
}
```

A client with no OAuth support cannot follow the `401`. For that one, take
the token from `POST /api/login` and send `Authorization: Bearer`.

#### How the failures read

| What you see | Where it actually is |
|---|---|
| Discovery URL returns HTML, `content-type is not application/json` | Route missing or registered after the SPA catch-all. Deploy the docs site. |
| `no matches found` in the shell | Unquoted `?`. Quote the URL. |
| Browser opens the docs after login | Authorize redirects to the docs login, or the shell does not treat `/mcp-login` as public. |
| `/mcp-login` is blank, query string correct | `lazy` returns the module instead of `{ Component }`. |
| `Got new credentials, but reconnecting failed: timed out after 30000ms` | Login worked. Runtime did not start. Check logs for `mcp.server.fastmcp`, pin `mcp<2`, redeploy with `agentcore deploy`. |

### 10. Report

- Layout detected and paths written
- Env files created (names only) and which file the user must fill
- Cognito pool/client ids (not secrets besides the agreed dummy password)
- Session API URL and whether `create_table.py` / first inject ran
- Next: fill `.env`, `create_table.py`, `sync_articles.py --backfill-hashes` (or `--apply` for a new corpus), `agentcore deploy`, attach S3 policy
- If the MCP runtime was requested: its `invocationUrl`, and that the docs-site deploy (OAuth routes + `/mcp-login`) is separate from `agentcore deploy`

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
23. The MCP runtime is a second `runtimes` entry (`protocol: MCP`), not a
    mode of the AG-UI one. It exposes one tool that runs rephrase → tags →
    search → rerank internally. Do not register those four tools on it, and
    do not collapse the AG-UI agent to match — its per-tool status lines are
    what the chat renders.
24. Pin `mcp>=1.23.0,<2` in the agent `pyproject.toml`. mcp 2 removed
    `mcp.server.fastmcp`, the deployed resolver does not honor the transitive
    `mcp<2` from strands, and the symptom is a 30s timeout **after** the
    OAuth login succeeded.
25. Client ids and authorization codes are HMAC-signed tokens, not rows.
    The docs site is one Lambda, so the register, the browser, and the token
    call land on different containers. A code is replayable on a second
    container until its 5-minute expiry. Do not "fix" this with an in-memory
    map.
26. `/oauth/authorize` only validates. The redirect to `/mcp-login` lives in
    the router, and it forwards the whole query string. The login page is
    not the docs login page: the app shell sends every authenticated page to
    the docs, so reuse opens the documentation instead of returning the code.
27. The MCP route's `lazy` must return `{ Component }`. The bare module
    renders a blank page. The route stays outside the authenticated shell,
    out of the protected chunks, and excluded from the shell's redirect.
28. OAuth routes go **before** the SPA catch-all, and the token route needs
    `express.urlencoded`. Otherwise the discovery URL returns `index.html`
    with HTTP 200 and the client refuses it. Quote the invocation URL in
    zsh (`?` is a glob). `claude mcp add` needs `--scope user` or the server
    exists only in the project it was added from.

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
