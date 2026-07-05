from strands import Agent
from src.agents.collaborator import collaborator

SUB_AGENT_PROMPT = """You are a specialized Sub-Agent.

Your job:
1. Determine what the user needs by asking clarifying questions if necessary.
2. Once you have enough information, forward the request to the "collaborator" tool.
3. Return the collaborator's results back to the caller.

IMPORTANT RULES:
- Gather all required information before calling the collaborator.
- Do NOT make up results yourself — always use the collaborator tool."""

sub_agent = Agent(
    name="sub_agent",
    description="Handles specialized tasks. Use this agent when the user needs domain-specific help.",
    system_prompt=SUB_AGENT_PROMPT,
    tools=[collaborator],
)
