import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from strands.models import OpenAIModel

# Load .env.local so the DeepSeek key is available even when this module is
# imported outside main.py (e.g. direct tool invocations / tests).
load_dotenv(Path(__file__).resolve(
).parents[3] / "agentcore" / ".env.local", override=True)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")

# V4 Flash thinks by default. Thought tokens count against max_tokens and
# leave message.content empty, so short tool calls (find_tags, rephrase,
# rerank) must disable thinking or they return "".
DEEPSEEK_NO_THINKING = {"thinking": {"type": "disabled"}}

# Shared model instance — the Strands agent uses this for streaming LLM calls
_model = OpenAIModel(
    model_id=DEEPSEEK_MODEL,
    client_args={
        "api_key": DEEPSEEK_API_KEY,
        "base_url": DEEPSEEK_BASE_URL,
    },
)

# Shared sync OpenAI-compatible client — tools use this for their LLM calls
_client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)


def load_model() -> OpenAIModel:
    """Return the shared DeepSeek (OpenAI-compatible) model for the Strands agent."""
    return _model


def get_llm_client():
    """Return a sync OpenAI-compatible client for tool LLM calls."""
    return _client
