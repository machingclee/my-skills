import re

from strands import tool

from model.load import DEEPSEEK_MODEL, DEEPSEEK_NO_THINKING, get_llm_client
from tools.db import load_tags

MODEL_ID = DEEPSEEK_MODEL
_client = get_llm_client()


def _canonicalize_tags(raw: str, tags: list[str]) -> list[str]:
    by_lower = {tag.lower(): tag for tag in tags}
    text = raw.strip().strip("`")
    if not text or text.lower() == "untagged":
        return []
    seen: set[str] = set()
    out: list[str] = []
    for part in text.split(","):
        token = part.strip().strip("`\"'")
        canonical = by_lower.get(token.lower())
        if canonical and canonical not in seen:
            seen.add(canonical)
            out.append(canonical)
    return out


def _lexical_tags(query: str, tags: list[str]) -> list[str]:
    """Pick tags that appear as whole tokens in the query (fallback)."""
    q = query.lower()
    out: list[str] = []
    for tag in tags:
        token = tag.lower()
        if len(token) < 2:
            continue
        if re.search(rf"(?<![a-z0-9+]){re.escape(token)}(?![a-z0-9+])", q):
            out.append(tag)
    return out


@tool
def find_tags(query: str) -> list[str]:
    """Find relevant blog tags for a search query using LLM evaluation.

    This is the SECOND step. Call this AFTER rephrase_query and BEFORE
    search_articles. Returns relevant specific tags selected from the
    blog's tag vocabulary, read from {{POSTGRES_SCHEMA}}.tags on this call.

    Args:
        query: The rephrased search query.

    Returns:
        A list of relevant tag strings, e.g. ["springboot", "java", "aws"].
        Returns an empty list if no tags match.
    """
    tags = load_tags()
    system_prompt = (
        f"You are a tag finder for a blog about programming and technology. "
        f"Pick the most relevant SPECIFIC tags from the list below. Prefer "
        f"narrow tags (e.g. \"springboot\") over broad ones (e.g. \"coding\", "
        f"\"tech\", \"backend\"). Include all tags that are a good match — "
        f"there is no strict limit, but avoid noise. If the query doesn't "
        f"clearly match any specific tag, respond with \"untagged\".\n\n"
        f"Tags: {tags}\n\n"
        f"Respond with: tag1,tag2,tag3,... (no spaces, comma-separated). "
        f"If unsure, respond with \"untagged\"."
    )

    response = _client.chat.completions.create(
        model=MODEL_ID,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
        max_tokens=200,
        extra_body=DEEPSEEK_NO_THINKING,
    )

    result = (response.choices[0].message.content or "").strip()
    return _canonicalize_tags(result, tags) or _lexical_tags(query, tags)
