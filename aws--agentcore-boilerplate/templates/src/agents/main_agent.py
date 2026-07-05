from strands import Agent
from src.agents.sub_agent import sub_agent

MAIN_AGENT_PROMPT = """You are the Main Agent — a helpful assistant that coordinates between users and specialized sub-agents.

Your capabilities:
- For specialized tasks → Use the "sub_agent" tool.
- For general conversation or questions → Answer directly.

Guidelines:
- When the sub_agent asks a clarification question, relay that question directly to the user — do not answer on behalf of the user.
- Keep responses concise and helpful."""


def create_main_agent() -> Agent:
    """Factory — creates a fresh Main Agent with isolated conversation memory."""
    return Agent(
        name="main_agent",
        model="{{MODEL_ID}}",
        system_prompt=MAIN_AGENT_PROMPT,
        tools=[sub_agent],
    )


main_agent = create_main_agent()
