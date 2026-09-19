from strands import tool

from model.load import DEEPSEEK_MODEL, DEEPSEEK_NO_THINKING, get_llm_client
from tools.db import get_conn

MODEL_ID = DEEPSEEK_MODEL
_client = get_llm_client()


def _fetch_summaries(ids: list[str]) -> dict[str, str]:
    """Fetch the summary (text before first ###) for each row id from DB."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, content FROM embeddings WHERE id = ANY(%s)",
            (ids,),
        )
        results = cur.fetchall()
    finally:
        conn.close()

    summaries: dict[str, str] = {}
    for row_id, content in results:
        parts = (content or "").split("###", 1)
        summaries[row_id] = parts[0].strip()
    return summaries


def _build_result(articles: list[dict], order: list[int], summaries: dict[str, str]) -> list[dict]:
    """Build the result list with title and summary for each article."""
    return [
        {"title": articles[i]["title"], "summary": summaries.get(articles[i]["id"], "")[
            :200]}
        for i in order
        if i < len(articles)
    ]


@tool
def rerank_chunks(query: str, articles: list[dict]) -> list[dict]:
    """Rerank articles by relevance using LLM evaluation.

    Fetches summaries from the DB by id — no summaries in the
    conversation. Call this AFTER search_articles.

    Args:
        query: The rephrased search query.
        articles: The "articles" list from search_articles (with id).

    Returns:
        List of {title, summary} reordered by relevance.
    """
    ids = [a["id"] for a in articles]
    summaries = _fetch_summaries(ids)

    if len(articles) <= 1:
        return _build_result(articles, list(range(len(articles))), summaries)

    prompt = (
        f"Return ALL article indices in order of relevance (most relevant first) "
        f"for the query: {query}\n"
        f"Just the numbers separated by commas, like: 2,0,1,3,4\n\n"
    )
    for i, a in enumerate(articles):
        s = summaries.get(a["id"], "")[:200]
        prompt += f"{i}: {a['title']} — {s}\n"

    response = _client.chat.completions.create(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        extra_body=DEEPSEEK_NO_THINKING,
    )

    try:
        text = (response.choices[0].message.content or "").strip()
        order = [
            int(x.strip())
            for x in text.split(",")
            if x.strip().isdigit()
        ]
        if not order:
            order = list(range(len(articles)))
        return _build_result(articles, order, summaries)
    except (ValueError, IndexError):
        return _build_result(articles, list(range(len(articles))), summaries)
