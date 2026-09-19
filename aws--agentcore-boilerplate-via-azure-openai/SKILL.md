# AgentCore Boilerplate — Azure OpenAI + S3SessionManager

Creates a new AgentCore project via `agentcore create` and then customizes the
generated files with production-ready defaults: Azure OpenAI model, JWT
authorizer, all 4 memory strategy types, S3 session storage, and a CDK grant
on the runtime role for the session bucket (`S3_SESSION_BUCKET`).

## When to Use

- The user asks to scaffold, create, or bootstrap a new AgentCore project
  using **Azure OpenAI** (not Bedrock)
- The user wants an AgentCore boilerplate with Azure OpenAI model provider
- The user mentions `agentcore create` with Azure OpenAI or "Azure" model
- The user says "create an agentcore project with Azure OpenAI"

## Architecture of the Generated Project

```
<project-name>/
├── agentcore/
│   ├── agentcore.json          # Customized with all 4 memory types + JWT authorizer
│   ├── cdk/lib/cdk-stack.ts    # Grants S3 session IAM from S3_SESSION_BUCKET
│   └── .cli/
├── app/<AgentName>/
│   ├── main.py                 # S3SessionManager + Azure OpenAI model config
│   ├── pyproject.toml          # Includes openai + azure-identity deps
│   ├── .gitignore
│   ├── README.md
│   └── src/
│       └── agents/
│           └── main_agent.py   # Agent definition using Azure OpenAI model
```

**Session manager:** Uses Strands' built-in `S3SessionManager` — simple,
durable S3-backed session storage.

**Model provider:** Azure OpenAI — configured via environment variables:
`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_NAME`,
and `AZURE_OPENAI_API_VERSION`.

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
3. **Azure OpenAI Endpoint** — default: skip (leave `REPLACE_ME_AZURE_ENDPOINT`
   placeholder). If they provide one, also ask for the **API Key**,
   **Deployment Name**, and **API Version**.
4. **Agent framework** — default: `Strands`. Also offer `LangChain_LangGraph`,
   `OpenAIAgents`, `GoogleADK`, `VercelAI`.

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

**Important:** `agentcore create` is interactive by default. Use the
`--defaults` flag to accept defaults for any prompts we haven't covered,
and provide all known answers via flags to minimize prompts.

If the user wants a fully non-interactive run, add `--defaults --skip-git`.

**Note:** The `agentcore create` CLI may not have a built-in Azure OpenAI
provider option. If it doesn't, accept the default model provider (Bedrock)
for scaffolding — we will replace the model configuration in Step 5.

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

#### 4c. Add Azure OpenAI + S3 session env vars to the runtime

In `runtimes[0]`, add an `envVars` **array** (not an `environment` object — that is not a valid `AgentEnvSpec` field). CDK reads `S3_SESSION_BUCKET` from this list and attaches the session IAM grant in Step 8.

```json
"envVars": [
  { "name": "AZURE_OPENAI_ENDPOINT", "value": "<azure-endpoint>" },
  { "name": "AZURE_OPENAI_API_KEY", "value": "<azure-api-key>" },
  { "name": "AZURE_OPENAI_DEPLOYMENT_NAME", "value": "<deployment-name>" },
  { "name": "AZURE_OPENAI_API_VERSION", "value": "2024-10-21" },
  { "name": "S3_SESSION_BUCKET", "value": "<project-name-lower>-agentcore-sessions" }
]
```

Use the values collected in Step 2, or placeholders if skipped. Merge with any `envVars` `agentcore create` already wrote — do not drop existing entries.

`S3_SESSION_BUCKET` is **app config only**. It does not grant IAM. `agentcore.json` has no field for an arbitrary S3 bucket on the runtime role (`additionalPolicies` exists in the published CDK schema but is missing from this project's `.llm-context` types, and `connections` only covers AgentCore resources). The grant is added in CDK (Step 8).

### Step 5: Customize `main.py`

Read the template from `templates/main.py` (located alongside this SKILL.md)
and write it to `app/<AgentName>/main.py`. The template configures:

- **S3SessionManager** — Strands' built-in S3 session storage
- **Azure OpenAI model** — configured via environment variables

Substitute these placeholders when writing the file:

| Placeholder | Replace with | Example |
|---|---|---|
| `{{PROJECT_NAME_LOWER}}` | Lowercased project name (hyphens ok) | `my-agent` |
| `{{MEMORY_NAME_UPPER}}` | UPPERCASED project name, no hyphens | `MYAGENT` |
| `{{AGENT_NAME}}` | Runtime name from `agentcore.json`, snake_case | `my_agent` |
| `{{AGENT_DESCRIPTION}}` | One-line agent description | `"A helpful assistant that..."` |

### Step 6: Customize `src/agents/main_agent.py`

Read the template from `templates/main_agent.py` and write it to
`app/<AgentName>/src/agents/main_agent.py`. This is the agent definition
that wires up tools and the Azure OpenAI model.

### Step 7: Update `pyproject.toml`

After writing the agent files, add the `openai` dependency to the generated
`pyproject.toml`. The `requires-python` constraint may need adjustment to
match the runtime version in `agentcore.json` (typically `PYTHON_3_14`).

Add to `[project].dependencies`:
```
"openai>=1.0.0",
```

Do **not** scaffold a standalone Vite chat frontend. This skill is agent +
IAM only. For a floating React chatbot (Cognito dummy bot + AG-UI SSE +
session history), use `/aws--agentcore-rag-session-chatbot` and overlay it
on an existing app.

### Step 8: Register the S3 session bucket on the CDK runtime role

`agentcore create` generates `agentcore/cdk/`. `bin/cdk.ts` already loads
`agentcore.json` via `ConfigIO.readProjectSpec()`, so the stack can read
`S3_SESSION_BUCKET` from each runtime's `envVars` and attach IAM. **Do this
in CDK** — a post-deploy `aws iam put-role-policy` is wiped if the role is
recreated on the next `agentcore deploy`.

1. Read `agentcore/cdk/lib/cdk-stack.ts` (generated; do not replace the whole file).
2. Keep `import * as iam from 'aws-cdk-lib/aws-iam';` (already present in the
   generated stack).
3. Add the helpers from `templates/cdk-s3-session-grant.ts` next to
   `isPaymentEligibleAgent` (or just above `export class AgentCoreStack`).
4. Immediately after `this.application = new AgentCoreApplication(...)`, insert:

```ts
    // Strands S3SessionManager needs GetObject/PutObject/ListBucket on the
    // bucket named in S3_SESSION_BUCKET. agentcore.json has no IAM field for
    // arbitrary S3, so grant it here from that env var.
    for (const env of this.application.environments.values()) {
      const bucket = sessionBucketFromAgent(env.agent);
      if (bucket) {
        grantS3SessionStorage(env.runtime, bucket);
      }
    }
```

That grants:
- `s3:ListBucket` on `arn:aws:s3:::<bucket>`
- `s3:GetObject` + `s3:PutObject` on `arn:aws:s3:::<bucket>/*`

If `agentcore create` regenerated `cdk-stack.ts` on a later run, re-apply this
patch. Typecheck with `./node_modules/.bin/tsc --noEmit` from `agentcore/cdk`.

Optionally still copy `templates/attach-s3-policy.sh` as a **manual fallback**
(emergency repair without a full deploy). Substitute `{{S3_SESSION_BUCKET}}`.
Do **not** present it as the primary IAM setup.

### Step 9: Report what was created

After all changes are written, summarize:

- Project location and name
- S3 bucket name (`<project_name_lowercase>-agentcore-sessions`) — **create
  the bucket before deploy**; CDK grants IAM but does not create the bucket
- CDK stack now attaches session IAM from `S3_SESSION_BUCKET` on `agentcore deploy`
- The Cognito authorizer placeholder values they need to fill in
  `agentcore.json`
- Azure OpenAI environment variables to configure (endpoint, API key, deployment name)
- For a chat UI, use `/aws--agentcore-rag-session-chatbot` on an existing app
- Next steps: `agentcore dev` for local development, `agentcore deploy` to ship

## Azure OpenAI Configuration

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint | `https://my-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `abc123...` |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Model deployment name | `gpt-4o` |
| `AZURE_OPENAI_API_VERSION` | Azure OpenAI API version | `2024-10-21` |
| `S3_SESSION_BUCKET` | Bucket for Strands `S3SessionManager` (env only; IAM is granted in CDK) | `myblogagent-agentcore-sessions` |

### Model Configuration in Code

The `main.py` template wires these env vars into a lazily-initialized
`AsyncAzureOpenAI` client:

```python
from openai import AsyncAzureOpenAI

_azure_client = None

def _get_azure_client():
    global _azure_client
    if _azure_client is None:
        _azure_client = AsyncAzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
        )
    return _azure_client
```

The `main_agent.py` uses this client to create the model and agent.

## Boilerplate Reference

### The 4 AgentCore Memory Strategy Types

| Type | `agentcore.json` key | Purpose | Default namespace |
|---|---|---|---|
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

Put that name in `runtimes[0].envVars` as `S3_SESSION_BUCKET`. CDK then grants
`s3:ListBucket` on the bucket ARN and `s3:GetObject` / `s3:PutObject` on
`bucket/*` to the runtime execution role. Without that grant, `S3SessionManager`
fails on first invoke with `AccessDenied` on `s3:ListBucket` and the chat UI
shows `(No response)`.

## Gotchas

1. **`agentcore create` prompts.** Even with `--defaults`, the CLI may still
   prompt for some options. Pass every known value as a flag to minimize
   interactivity.
2. **Bucket must exist.** The S3 bucket is not auto-created, and CDK only
   attaches IAM — it does not create the bucket. Remind the user to create it
   before deploying.
3. **`S3_SESSION_BUCKET` is not IAM.** Setting the env var in `agentcore.json`
   only tells the app which bucket to use. The runtime role still needs the
   CDK grant in Step 8. `envVars` is an array of `{name, value}` — never an
   `environment` object.
4. **`agentcore create` / CLI may regenerate `cdk-stack.ts`.** Re-apply the
   S3 grant helpers after regeneration. Do not rely on `attach-s3-policy.sh`
   as the primary path — inline IAM attached that way is wiped if the role
   is recreated on the next deploy.
5. **Python 3.12 vs 3.14 runtime.** The generated `pyproject.toml` may pin
   `requires-python = ">=3.12, <3.14"`. The runtime version in `agentcore.json`
   is `PYTHON_3_14` — these should agree. If `agentcore create` generates a
   mismatched constraint, fix `pyproject.toml` to match the runtime.
6. **Azure OpenAI API key security.** Never hardcode the API key. Store it
   in AgentCore environment variables (configured in `agentcore.json`) or
   AWS Secrets Manager. The template reads it from the environment.
7. **Memory names must match.** The memory name in `agentcore.json`
   (`<ProjectName>Memory`) must match the `MEMORY_<NAME>_ID` env var that
   AgentCore injects at deploy time.
8. **The `main.py` name field in `StrandsAgent`** must be a valid
   identifier (no spaces, hyphens, or special characters). Use snake_case.
