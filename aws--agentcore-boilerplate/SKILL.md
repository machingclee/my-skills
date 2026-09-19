---
name: aws--agentcore-boilerplate
description: >-
  Create an AgentCore project boilerplate with CUSTOM_JWT authorizer, all 4 memory
  strategy types (SEMANTIC, SUMMARIZATION, USER_PREFERENCE, EPISODIC), AGUI protocol,
  CodeZip build, and S3SessionManager by default with an optional
  AgentCoreMemorySessionManager + S3 archive hook template. Use when the user wants
  to scaffold a new AgentCore agent project, create an agentcore boilerplate, or
  start a new Bedrock AgentCore project with production-ready defaults.
---

# AgentCore Boilerplate — Production-Ready AgentCore Project Scaffold

Creates a new AgentCore project via `agentcore create` and then customizes the
generated files with production-ready defaults: JWT authorizer, all 4 memory
strategy types, S3 session storage, and an optional AgentCore Memory + S3 archive
hook path.

## When to Use

- The user asks to scaffold, create, or bootstrap a new AgentCore project
- The user wants a "boilerplate" or "starter" for Bedrock AgentCore
- The user mentions `agentcore create` but wants opinionated defaults beyond
  what the CLI provides
- The user says "create an agentcore project like this one" or "use this as a prototype"

## Architecture of the Generated Project

```
<project-name>/
├── agentcore/
│   ├── agentcore.json          # Customized with all 4 memory types + JWT authorizer
│   └── .cli/
├── app/<AgentName>/
│   ├── main.py                 # S3SessionManager (default) or AgentCoreMemorySessionManager
│   ├── pyproject.toml
│   ├── .gitignore
│   ├── README.md
│   └── src/
│       └── agents/
│           └── main_agent.py
```

**Two session-manager paths** (choose by commenting/uncommenting in `main.py`):

| Path | Session Manager | Description |
|------|----------------|-------------|
| **Default** | `S3SessionManager` | Strands' built-in S3 session storage. Simple, no long-term memory (LTM). |
| **Advanced** | `AgentCoreMemorySessionManager` + `S3ArchiveHook` | Full LTM strategies (semantic, summaries, preferences, episodic) **plus** an S3 archive hook that writes every raw message to S3 for audit / cold storage. |

The boilerplate ships with the **Advanced** path commented out — switch by
uncommenting the AgentCore Memory blocks and removing the S3SessionManager block.

## Workflow

### Step 1: Ask for the project name and agent name

**ALWAYS ask the user these two questions** — even if the user's request
already mentions a name. Never guess or derive names without confirmation.

Ask the first question:

> *"What should the **project** be called? This is the directory name and
> the value passed to `--project-name`. (alphanumeric only, max 23 chars,
> start with a letter, no hyphens or underscores — e.g. `MyBlogAgent`)"*

Then ask the second question:

> *"What should the **agent/runtime** be called? This is the value passed
> to `--name` and becomes the subdirectory under `app/`. (PascalCase,
> alphanumeric only — e.g. `BlogRagAgent`)"*

Together these drive:

| Thing | From |
|-------|------|
| `--project-name` flag | Project name (e.g. `MyBlogAgent`) |
| `--name` flag | Agent/runtime name (e.g. `BlogRagAgent`) |
| Directory on disk | Project name (e.g. `MyBlogAgent/`) |
| `app/<AgentName>/` subdirectory | Agent/runtime name (e.g. `app/BlogRagAgent/`) |
| `agentcore.json` → `name` | Project name |
| `agentcore.json` → `runtimes[0].name` | Agent/runtime name |
| `agentcore.json` → `memories[0].name` | `"<AgentName>Memory"` (e.g. `BlogRagAgentMemory`) |
| `tags.agentcore:project-name` | Project name |
| S3 session bucket | Lowercased project name + `-agentcore-sessions` |
| `MEMORY_<NAME>_ID` env var | `MEMORY_<UPPERCASED_AGENT_NAME>MEMORY_ID` |

Derive the S3 bucket name as: `<project_name_lowercase>-agentcore-sessions`

### Step 2: Ask for optional customizations

After confirming the names, ask these questions **one at a time** using
`AskUserQuestion`. All have sensible defaults, so the user can accept
by saying "defaults" or pressing Enter.

1. **AWS Region** — default: `us-east-1`
2. **Cognito User Pool ID** — default: skip (leave `REPLACE_ME_USER_POOL_ID`
   placeholder). If they provide one, also ask for the **Cognito Client ID**
   and the pool's **region**.
3. **Agent framework** — default: `Strands`. Also offer `LangChain_LangGraph`,
   `OpenAIAgents`, `GoogleADK`, `VercelAI`.
4. **Model provider** — default: `Bedrock`. Also offer `Anthropic`, `OpenAI`,
   `Gemini`.

**IMPORTANT:** Do NOT proceed to Step 3 until Step 1 is complete and the
user has confirmed both names. Skipping this causes the agent to guess
project names that may violate `agentcore create` constraints (e.g. hyphens
in `--project-name`).

### Step 3: Run `agentcore create`

Run the CLI with all the collected flags. The minimal invocation is:

```bash
agentcore create \
  --name <ProjectName> \
  --project-name <project-name> \
  --protocol AGUI \
  --build CodeZip \
  --memory longAndShortTerm \
  --framework Strands \
  --language Python \
  --region <region>
```

Add `--model-provider <provider>` and `--api-key <key>` if not Bedrock.

**Important:** `agentcore create` is interactive by default. Use the
`--defaults` flag to accept defaults for any prompts we haven't covered,
and provide all known answers via flags to minimize prompts.

If the user wants a fully non-interactive run, add `--defaults --skip-git`.

### Step 4: Customize `agentcore.json`

After creation, read the generated `agentcore/agentcore.json` and apply these
changes:

#### 4a. Add / update authorizer

In the `runtimes[0]` object, ensure these fields exist:

```json
"authorizerType": "CUSTOM_JWT",
"authorizerConfiguration": {
  "customJwtAuthorizer": {
    "discoveryUrl": "https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/openid-configuration",
    "allowedAudience": [],
    "allowedClients": ["<cognito-client-id>"]
  }
}
```

If the user skipped Cognito config, use placeholder values:
- `<region>` → `us-east-1`
- `<user-pool-id>` → `REPLACE_ME_USER_POOL_ID`
- `<cognito-client-id>` → `REPLACE_ME_CLIENT_ID`

#### 4b. Replace memories with all 4 strategy types

Replace the entire `memories` array. The generated project typically has a
single memory with 2 strategies. Replace it with one memory containing all
4 built-in strategies:

```json
"memories": [
  {
    "name": "<ProjectName>Memory",
    "eventExpiryDuration": 90,
    "strategies": [
      {
        "type": "SEMANTIC",
        "name": "user_facts",
        "namespaceTemplates": [
          "/strategies/{memoryStrategyId}/actors/{actorId}/"
        ]
      },
      {
        "type": "SUMMARIZATION",
        "name": "conversation_summaries",
        "namespaceTemplates": [
          "/strategies/{memoryStrategyId}/actors/{actorId}/sessions/{sessionId}/"
        ]
      },
      {
        "type": "USER_PREFERENCE",
        "name": "user_preferences",
        "namespaceTemplates": [
          "/strategies/{memoryStrategyId}/actors/{actorId}/"
        ]
      },
      {
        "type": "EPISODIC",
        "name": "episodic_memory",
        "namespaceTemplates": [
          "/strategies/{memoryStrategyId}/actors/{actorId}/sessions/{sessionId}/"
        ]
      }
    ]
  }
]
```

Also update `tags.agentcore:project-name` to match the chosen project name.

### Step 5: Customize `main.py`

Read the template from `templates/main.py` (located alongside this SKILL.md)
and write it to `app/<AgentName>/main.py`. The template contains two paths:

- **Default path (active):** `S3SessionManager` — simple S3-backed session storage, no LTM.
- **Advanced path (commented out):** `AgentCoreMemorySessionManager` + `S3ArchiveHook` —
  full LTM with S3 cold storage of every raw message.

Substitute these placeholders when writing the file:

| Placeholder | Replace with | Example |
|---|---|---|
| `{{PROJECT_NAME_LOWER}}` | Lowercased project name (hyphens ok) | `my-agent` |
| `{{MEMORY_NAME_UPPER}}` | UPPERCASED project name, no hyphens | `MYAGENT` |
| `{{AGENT_NAME}}` | Runtime name from `agentcore.json`, snake_case | `my_agent` |
| `{{AGENT_DESCRIPTION}}` | One-line agent description | `"A helpful assistant that..."` |

Do **not** scaffold a standalone Vite chat frontend. This skill is agent +
IAM only. For a floating React chatbot (Cognito dummy bot + AG-UI SSE +
session history), use `/aws--agentcore-rag-session-chatbot` and overlay it
on an existing app.

### Step 6: Scaffold the S3 policy script

Copy `templates/attach-s3-policy.sh` from this skill into the project root:

```
cp <skill-dir>/templates/attach-s3-policy.sh <project-dir>/attach-s3-policy.sh
chmod +x <project-dir>/attach-s3-policy.sh
```

Substitute `{{S3_SESSION_BUCKET}}` with the session bucket name derived in Step 1
(e.g. `myagent-agentcore-sessions`). The script:

- Reads the deployed runtime role ARN from `agentcore/.cli/deployed-state.json`
- Attaches an inline IAM policy granting `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` on the session bucket
- Is idempotent — safe to run after every deploy

### Step 7: Report what was created

After all changes are written, summarize:

- Project location and name
- S3 bucket name and the `attach-s3-policy.sh` script for IAM setup
- The Cognito authorizer placeholder values they need to fill in
  `agentcore.json`
- The two session-manager paths and how to switch between them
- For a chat UI, use `/aws--agentcore-rag-session-chatbot` on an existing app
- Next steps: `agentcore dev` for local development, `agentcore deploy` to ship

## Boilerplate Reference

### The 4 AgentCore Memory Strategy Types

| Type | `agentcore.json` key | Purpose | Default namespace |
|------|---------------------|---------|-------------------|
| `SEMANTIC` | `type: "SEMANTIC"` | Extracts factual knowledge about the user/domain | `/strategies/{memoryStrategyId}/actors/{actorId}/` |
| `SUMMARIZATION` | `type: "SUMMARIZATION"` | Compresses conversations into running summaries | `/strategies/{memoryStrategyId}/actors/{actorId}/sessions/{sessionId}/` |
| `USER_PREFERENCE` | `type: "USER_PREFERENCE"` | Captures user choices, styles, and interaction patterns | `/strategies/{memoryStrategyId}/actors/{actorId}/` |
| `EPISODIC` | `type: "EPISODIC"` | Preserves event sequences and timelines | `/strategies/{memoryStrategyId}/actors/{actorId}/sessions/{sessionId}/` |

### S3 Bucket Naming Convention

The bucket name is derived as `<project_name_lowercase>-agentcore-sessions`.
S3 bucket names must:
- Be 3–63 characters
- Contain only lowercase letters, numbers, periods, and hyphens
- Start and end with a letter or number
- Not contain two adjacent periods

## Gotchas

1. **`agentcore create` prompts.** Even with `--defaults`, the CLI may still
   prompt for some options. Pass every known value as a flag to minimize
   interactivity.
2. **Bucket must exist.** The S3 bucket is not auto-created. Remind the user
   to create it before deploying.
3. **Python 3.12 vs 3.14 runtime.** The generated `pyproject.toml` may pin
   `requires-python = ">=3.12, <3.14"`. The runtime version in `agentcore.json`
   is `PYTHON_3_14` — these should agree. If `agentcore create` generates a
   mismatched constraint, fix `pyproject.toml` to match the runtime.
4. **Memory names must match.** The memory name in `agentcore.json`
   (`<ProjectName>Memory`) must match the `MEMORY_<NAME>_ID` env var that
   AgentCore injects at deploy time. The boilerplate uses `MEMORY_ID`
   as a fallback, but the exact env var name is
   `MEMORY_<UPPERCASED_MEMORY_NAME>_ID`.
5. **The `main.py` name field in `StrandsAgent`** must be a valid
   identifier (no spaces, hyphens, or special characters). Use snake_case.
