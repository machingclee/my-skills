---
name: aws--agentcore-boilerplate
description: >-
  Scaffold an AWS Bedrock AgentCore Python project with Strands Agents and a
  custom model (DeepSeek). Generates the full AgentCore project structure
  (agentcore/ config, CDK infra, app entrypoint, and a multi-agent template
  with the agents-as-tools pattern). Use when the user wants to create a new
  AgentCore project, scaffold a Strands agent for Bedrock AgentCore Runtime,
  set up an AgentCore boilerplate, or start a new agent project targeting AWS
  with a non-Claude model.
---

# AgentCore Strands Agent Boilerplate

Scaffolds a complete AgentCore project: agent code, runtime configuration, CDK
infrastructure, and target region setup. The starter code uses DeepSeek v3.2 and
includes a working agents-as-tools example.

## Project Structure

```
<project-name>/
  agentcore/
    agentcore.json              # Runtime config (entrypoint, protocol, build type)
    aws-targets.json            # AWS account + region
    cdk/                        # CDK TypeScript infra (auto-managed by CLI)
  app/<agent-name>/
    main.py                     # BedrockAgentCoreApp entrypoint
    pyproject.toml              # Python deps (strands-agents, bedrock-agentcore)
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

1. Create the directory structure
2. Copy each template from `templates/` to the target path, replacing
   `{{PROJECT_NAME}}`, `{{AGENT_NAME}}`, `{{REGION}}`, `{{ACCOUNT}}`, and
   `{{MODEL_ID}}` with the user's values.
3. Run `cd <project-name> && agentcore add agent --name <agent-name> --framework Strands --entrypoint main.py --model-provider Bedrock --language Python`
   to populate the `agentcore/agentcore.json` and CDK stack. If `agentcore` CLI
   is not available, copy the json/cdk templates directly.
4. Print the next steps: bootstrap, dev, deploy.

If the user does not provide values, ask before writing.

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

# Bootstrap CDK in the target region (once per region)
npx cdk bootstrap aws://<account>/<region>

# Test locally
agentcore dev

# Deploy
agentcore deploy

# Invoke
agentcore invoke "Your prompt"

# Destroy
agentcore remove all
```
