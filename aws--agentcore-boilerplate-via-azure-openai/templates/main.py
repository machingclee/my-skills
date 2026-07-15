import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from ag_ui_strands import StrandsAgent
from ag_ui_strands.config import StrandsAgentConfig
from ag_ui.core import RunAgentInput
from ag_ui.encoder import EventEncoder

# ═══════════════════════════════════════════════════════════════════════
# Lightweight module-level code — env vars only, no network I/O.
# The heavy imports and agent construction are deferred to _build_agent()
# so the runtime initializes within the 30 s window.
# ═══════════════════════════════════════════════════════════════════════

REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET = os.getenv("S3_SESSION_BUCKET", "{{PROJECT_NAME_LOWER}}-agentcore-sessions")

# ── Azure OpenAI env vars ──────────────────────────────────────────────
AZURE_OPENAI_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_OPENAI_API_KEY = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_OPENAI_DEPLOYMENT_NAME = os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"]
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")

# ── AgentCore Memory env vars ──────────────────────────────────────────
MEMORY_ID = os.getenv("MEMORY_{{MEMORY_NAME_UPPER}}_ID", os.getenv("MEMORY_ID", ""))

logger = logging.getLogger(__name__)
app = FastAPI()

# ── Lazy singletons ────────────────────────────────────────────────────
_agui_agent = None
_azure_client = None


def _get_azure_client():
    """Lazily initialise the Azure OpenAI client (async, no network on init)."""
    global _azure_client
    if _azure_client is None:
        from openai import AsyncAzureOpenAI

        _azure_client = AsyncAzureOpenAI(
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
        )
    return _azure_client


# ═══════════════════════════════════════════════════════════════════════
# S3SessionManager — Strands' built-in S3 session storage.
# Messages are persisted as JSON files under
# s3://<bucket>/sessions/session_<id>/.
# ═══════════════════════════════════════════════════════════════════════

def _build_agent():
    """Deferred agent construction — runs on first request."""
    from src.agents.main_agent import build_main_agent
    from strands.session.s3_session_manager import S3SessionManager

    # Build the agent with the Azure OpenAI client
    agent = build_main_agent(_get_azure_client(), AZURE_OPENAI_DEPLOYMENT_NAME)

    return StrandsAgent(
        agent=agent,
        name="{{AGENT_NAME}}",
        description="{{AGENT_DESCRIPTION}}",
        config=StrandsAgentConfig(
            session_manager_provider=lambda input_data: S3SessionManager(
                session_id=input_data.thread_id or "default",
                bucket=S3_BUCKET,
                prefix="sessions",
                region_name=REGION,
            ),
        ),
    )


# ── Agent singleton & HTTP handlers ─────────────────────────────────────

def _get_agent():
    global _agui_agent
    if _agui_agent is None:
        _agui_agent = _build_agent()
    return _agui_agent


@app.post("/invocations")
async def invocations(input_data: dict, request: Request):
    accept_header = request.headers.get("accept")
    encoder = EventEncoder(accept=accept_header)

    async def event_generator():
        run_input = RunAgentInput(**input_data)
        async for event in _get_agent().run(run_input):
            yield encoder.encode(event)

    return StreamingResponse(
        event_generator(),
        media_type=encoder.get_content_type(),
    )


@app.get("/ping")
async def ping():
    return JSONResponse({"status": "Healthy"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
