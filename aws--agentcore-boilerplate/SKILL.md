---
name: aws--agentcore-boilerplate
description: >-
  Scaffold an AWS Bedrock AgentCore Python project with Strands Agents, AG-UI
  protocol, and a custom model (DeepSeek). Generates the full AgentCore project
  structure (agentcore/ config, CDK infra, a FastAPI AG-UI entrypoint with
  /invocations and /ping endpoints, and a multi-agent template with the
  agents-as-tools pattern). Use when the user wants to create a new AgentCore
  project, scaffold a Strands agent for Bedrock AgentCore Runtime with AG-UI,
  set up an AgentCore boilerplate, or start a new agent project targeting AWS
  with a non-Claude model.
---

# AgentCore Strands Agent Boilerplate (AG-UI Protocol)

Scaffolds a complete AgentCore project: agent code, runtime configuration, CDK
infrastructure, and target region setup. The starter code uses DeepSeek v3.2 and
includes a working agents-as-tools example. The entrypoint uses the **AG-UI
protocol** via FastAPI + `StrandsAgent` wrapper, which streams typed events
(`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, etc.) as SSE for any
AG-UI-compatible frontend to consume.

## Project Structure

```
<project-name>/
  agentcore/
    agentcore.json              # Runtime config (protocol: AGUI, entrypoint, build)
    aws-targets.json            # AWS account + region
    cdk/                        # CDK TypeScript infra (auto-managed by CLI)
  app/<agent-name>/
    main.py                     # FastAPI AG-UI server (/invocations + /ping)
    pyproject.toml              # Python deps (ag-ui-strands, fastapi, strands-agents)
    src/agents/
      main_agent.py             # Orchestrator agent (DeepSeek)
      sub_agent.py              # Example sub-agent
      collaborator.py           # Example @tool
```

## Scaffold Steps

Ask the user for:
1. `projectName` — top-level directory name (default: `MyAgent`)
2. `agentName` — app subdirectory name (default: `AgentApp`)
3. `region` — AWS region (default: `us-east-1`)
4. `account` — AWS account ID (required)
5. `modelId` — Bedrock model ID (default: `deepseek.v3.2`)

Then:

1. Create the directory structure.
2. Copy each template from `templates/` to the target path, replacing
   `{{PROJECT_NAME}}`, `{{AGENT_NAME}}`, `{{REGION}}`, `{{ACCOUNT}}`, and
   `{{MODEL_ID}}` with the user's values.
3. Create `agentcore/agentcore.json` with `"protocol": "AGUI"` and
   `"runtimeVersion": "PYTHON_3_14"`. The `agentcore create` CLI does this
   automatically if available; otherwise write it directly from the spec below.
4. Print the next steps: install deps, dev, deploy.

If the user does not provide values, ask before writing.

## agentcore.json Spec

When writing `agentcore.json` directly (without the CLI), use this shape:

```json
{
  "$schema": "https://schema.agentcore.aws.dev/v1/agentcore.json",
  "name": "{{PROJECT_NAME}}",
  "version": 1,
  "managedBy": "CDK",
  "runtimes": [
    {
      "name": "{{AGENT_NAME}}",
      "build": "CodeZip",
      "entrypoint": "main.py",
      "codeLocation": "app/{{AGENT_NAME}}/",
      "runtimeVersion": "PYTHON_3_14",
      "networkMode": "PUBLIC",
      "protocol": "AGUI"
    }
  ],
  "memories": [],
  "knowledgeBases": [],
  "credentials": [],
  "evaluators": [],
  "onlineEvalConfigs": [],
  "agentCoreGateways": [],
  "policyEngines": [],
  "configBundles": [],
  "abTests": [],
  "harnesses": [],
  "datasets": [],
  "payments": []
}
```

## Template Files

```
templates/
  main.py                  → app/<agent-name>/main.py
  pyproject.toml           → app/<agent-name>/pyproject.toml
  src/agents/main_agent.py → app/<agent-name>/src/agents/main_agent.py
  src/agents/sub_agent.py  → app/<agent-name>/src/agents/sub_agent.py
  src/agents/collaborator.py → app/<agent-name>/src/agents/collaborator.py
  aws-targets.json         → agentcore/aws-targets.json
```

## Post-Scaffold Commands (tell the user)

```bash
cd <project-name>

# Install Python dependencies
cd app/<agent-name> && uv sync && cd ../..

# Bootstrap CDK in the target region (once per region)
npx cdk bootstrap aws://<account>/<region>

# Test locally (starts FastAPI on port 8080)
cd app/<agent-name> && uv run python main.py

# Deploy
agentcore deploy

# Invoke
agentcore invoke "Your prompt"

# Destroy
agentcore remove all
```

## Notes

- The `ag-ui-strands` package requires Python >=3.12, <3.14. The generated
  `pyproject.toml` enforces this. If the user has a `.python-version` file
  pinned to an older Python, remind them to run `uv python pin 3.12`.
- The AG-UI protocol contracts expects two endpoints: `POST /invocations`
  (streaming SSE) and `GET /ping` (health check). Both are in the generated
  `main.py`. AgentCore handles auth, scaling, and session isolation.
- To connect a frontend directly, the user can point any AG-UI client (CopilotKit,
  `@ag-ui/client` `HttpAgent`, or a raw `EventSource`) at the AgentCore invoke
  URL. For production browser access, configure inbound JWT auth on the runtime
  and pass `Authorization: Bearer <token>` from the client.
