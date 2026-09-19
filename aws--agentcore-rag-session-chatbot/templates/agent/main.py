import uvicorn
from strands import Agent
from ag_ui_strands import StrandsAgent, StrandsAgentConfig, create_strands_app
from model.load import load_model
from memory.session import get_s3_session_manager
from tools import tools
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the project root BEFORE importing app modules so they
# see the env vars (e.g. DeepSeek API key) at import time.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / "agentcore" / ".env.local", override=True)


if os.getenv("LOCAL_DEV") == "1":
    os.environ["OTEL_SDK_DISABLED"] = "true"


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

RAG_SYSTEM_PROMPT = """\
You are a knowledgeable, friendly assistant that helps users discover and \
understand {{DOMAIN_DESCRIPTION}}.

## How to answer every question

### Step 1: Check conversation history FIRST
Before calling any tools, check whether the answer is already in the \
conversation history. If the user asks about something you already retrieved \
or discussed earlier in this conversation, answer from memory. Do NOT \
re-search the database for information you already have.

### Step 2: Decide whether to search
Only search the docs if the question is about a NEW topic or asks \
for articles you have not already retrieved. Many follow-up questions can be \
answered from the context already in the conversation.

### If you need to search, follow this pipeline:

Call exactly ONE tool per response — never batch multiple tools together.
    Wait for each tool result before calling the next one.

    Use the `status` tool to show each step's progress — it displays a visible
tool result in the frontend. Then call the actual tool for that step.

0. `status("Understanding your question ...")`.

1. **Rephrase:** Call `rephrase_query` with the user's question, then call
   `status("Searching for: <rephrased query>")`.

2. **Find tags:** Call `find_tags`, then call
   `status("Filtering by tags: tag1, tag2, ...")`.

3. **Search:** Call `search_articles(query, tags, top_k=15)`. It returns
   `{"articles": [...], "total_found": N}`. Call
   `status("Found N articles.")` using the actual total_found number.

4. **Rerank:** Call `rerank_chunks(query, articles)`, then call
   `status("Re-ranked by relevance.")`

5. **Links:** `rerank_chunks` returns objects with `title` and `summary`.
   Extract just the `title` from each, pass ALL of them to `article_links`.
   Example: if rerank returns `[{title: "A", summary: "..."}, {title: "B", ...}]`,
   call `article_links(["A", "B"])`. It returns markdown links like
   `[Title]({{ARTICLE_ROUTE_PREFIX}}/title-route-id)`.

6. **Answer:** Select only the most relevant reranked articles from those returned
   by `article_links` — do not list every result. Prefer quality over
   quantity; typically cite a handful of the best matches (or fewer if
   only a few are clearly on-topic). Copy-paste the EXACT markdown links
   for the ones you choose. Format each as a single-line bullet:
   `- [Title]({{ARTICLE_ROUTE_PREFIX}}/title-route-id): 1-2 sentence summary from
   rerank.` Put the summary on the SAME line as the link, after a colon.
   If nothing was found, say so honestly.

## Follow-ups about articles already in the conversation

If the user asks about something related to articles already retrieved or \
discussed (clarifications, comparisons, deeper explanations, “what about X \
from that list?”, etc.), answer from the conversation history and those \
results. Do NOT re-run the search pipeline unless they need articles you do \
not already have.

## Off-topic questions

If the user asks about anything unrelated to {{DOMAIN_DESCRIPTION}} \
and unrelated to articles already in the conversation (personal questions, \
chitchat, pure general knowledge, etc.), DO NOT call any tools. Apologize \
briefly and ask them to ask a question about the documentation.
"""

# ---------------------------------------------------------------------------
# Agent & app
# ---------------------------------------------------------------------------

agent = Agent(
    model=load_model(),
    system_prompt=RAG_SYSTEM_PROMPT,
    tools=tools,
)


def session_manager_provider(input_data):
    t0 = time.time()
    mgr = get_s3_session_manager(input_data.thread_id, "default-user")
    print(f"[timing] session init: {(time.time()-t0)*1000:.0f}ms", flush=True)
    return mgr


config = StrandsAgentConfig(session_manager_provider=session_manager_provider)

agui_agent = StrandsAgent(
    agent=agent,
    name="{{AGENT_NAME}}",
    description="RAG assistant for {{DOMAIN_DESCRIPTION}}",
    config=config,
)

app = create_strands_app(agui_agent, path="/invocations", ping_path="/ping")


@app.middleware("http")
async def timing_middleware(request, call_next):
    t0 = time.time()
    response = await call_next(request)
    print(f"[timing] request total: {(time.time()-t0)*1000:.0f}ms", flush=True)
    return response


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
