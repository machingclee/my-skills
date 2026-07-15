"""
Azure OpenAI agent — tools + model + agent definition.

The `build_main_agent` factory receives the Azure OpenAI client and
deployment name from `main.py` so the model is configured once at
cold-start and reused across requests.
"""

import os
import logging

from strands import tool, Agent

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# Tools
# ═══════════════════════════════════════════════════════════════════════


@tool
def search_knowledge_base(query: str) -> str:
    """Search the knowledge base for relevant information.

    Use this whenever you need to look up facts, documentation, or
    reference material to answer the user's question.

    Args:
        query: The search query string.

    Returns:
        Relevant passages from the knowledge base.
    """
    # TODO: Replace with your actual search implementation (e.g. vector DB,
    #       RAG pipeline, database query, API call, etc.)
    return f'[placeholder] Results for: "{query}" — wire up your search backend here.'


@tool
def get_current_time() -> str:
    """Return the current date and time in ISO format."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# ═══════════════════════════════════════════════════════════════════════
# Agent factory
# ═══════════════════════════════════════════════════════════════════════


def build_main_agent(azure_client, deployment_name: str) -> Agent:
    """Build the main agent with Azure OpenAI as the model provider.

    Called once per cold-start from ``main.py``.  The Azure OpenAI client
    is initialised lazily in ``main.py`` and injected here so the agent
    has a fully-configured model.

    Args:
        azure_client: An ``openai.AsyncAzureOpenAI`` instance.
        deployment_name: The Azure OpenAI model deployment name
                         (e.g. ``gpt-4o``, ``gpt-4o-mini``).

    Returns:
        A Strands ``Agent`` ready to be wrapped by ``StrandsAgent``.
    """
    from strands.llm import OpenAIChatModel

    model = OpenAIChatModel(
        client=azure_client,
        model=deployment_name,
    )

    system_prompt = (
        "You are a helpful, concise assistant. "
        "Use the available tools to find accurate information. "
        "When you don't know something, say so honestly."
    )

    return Agent(
        name="{{AGENT_NAME}}",
        model=model,
        system_prompt=system_prompt,
        tools=[search_knowledge_base, get_current_time],
    )
