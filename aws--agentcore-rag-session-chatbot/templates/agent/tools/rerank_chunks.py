from strands import tool
import re

from model.load import DEEPSEEK_MODEL, DEEPSEEK_NO_THINKING, get_llm_client
from tools.db import get_conn
from tools.links import article_link, citation_title, link_parts_for_titles

MODEL_ID = DEEPSEEK_MODEL
_client = get_llm_client()

# Characters of verbatim source handed back per chunk — enough for the agent to
# write a digest grounded in the source rather than in the summary alone.
# A 15-article rerank is therefore roughly 35-40k chars (~10k tokens), which
# fits comfortably in context but does persist with the session history, so this
# is a context-cost dial and not a free one.
#
# It is a real ceiling: detail the summariser omitted AND that sits past this
# offset is invisible to the agent. Measured on one answer, a protocol field
# lived past char 800 and only surfaced because a summary happened to name it —
# which is why this is no longer 800.
EXCERPT_CHARS = 2000

# Only the rerank prompt truncates; the returned summary is full.
RERANK_SUMMARY_CHARS = 200

# First <!-- page N --> in a chunk's original_text — the printed page this
# fragment starts on. Used when metadata.page is not yet backfilled.
_PAGE_MARKER_RE = re.compile(r"<!--\s*page\s+(\d+)\s*-->", re.IGNORECASE)


def _exact_page(original_text: str, stored: str = "") -> str:
    token = (stored or "").strip()
    if token.isdigit():
        return token
    m = _PAGE_MARKER_RE.search(original_text or "")
    return m.group(1) if m else ""


def _excerpt(text: str, limit: int = EXCERPT_CHARS) -> str:
    """First `limit` characters of the source, cut back to a word boundary.

    Slicing mid-token invents identifiers — "FirmwareStatusNotification" becomes
    "FirmwareStatusN" — that are plausible, greppable and wrong, which is the
    worst available failure mode on a protocol spec.
    """
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit // 2:
        cut = cut[:space]
    return cut.rstrip() + " …"


def _fetch_chunks(ids: list[str]) -> dict[str, tuple[str, str, str, str]]:
    """Return (summary, source_excerpt, page_range, page) for each chunk id.

    `page_range` is the summariser `## pN-M` heading. `page` is the first
    `<!-- page N -->` in original_text (or metadata.page if already stored).
    Both are read from the row, not from the model-relayed articles list.
    """
    if not ids:
        return {}
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, content,
                   metadata->>'page_range',
                   metadata->>'page'
            FROM embeddings WHERE id = ANY(%s)
            """,
            (ids,),
        )
        results = cur.fetchall()
    finally:
        conn.close()

    chunks: dict[str, tuple[str, str, str, str]] = {}
    for row_id, content, page_range, stored_page in results:
        parts = (content or "").split("\n\n", 2)
        if len(parts) >= 3:
            original = parts[2]
            chunks[row_id] = (
                parts[1].strip(),
                _excerpt(original),
                page_range or "",
                _exact_page(original, stored_page or ""),
            )
        else:
            chunks[row_id] = (
                (content or "").strip(),
                "",
                page_range or "",
                _exact_page(content or "", stored_page or ""),
            )
    return chunks


def _build_result(
    articles: list[dict],
    order: list[int],
    chunks: dict[str, tuple[str, str, str, str]],
    parts: dict[str, tuple[str, str]],
) -> list[dict]:
    """Build the result list with title, summary, source excerpt — and a ready link."""
    results = []
    for i in order:
        if i >= len(articles):
            continue
        title = articles[i]["title"]
        summary, excerpt, page_range, page = chunks.get(
            articles[i]["id"], ("", "", "", "")
        )
        slug, pdf_filepath = parts.get(title, ("", ""))
        results.append(
            {
                "title": citation_title(title),
                "summary": summary,
                "page_range": page_range,
                "page": page,
                "source_excerpt": excerpt,
                "link": article_link(title, slug, pdf_filepath, page_range, page),
            }
        )
    return results


@tool
def rerank_chunks(query: str, articles: list[dict]) -> list[dict]:
    """Rerank articles by relevance, and return their summary, source and citation.

    Call this AFTER search_articles. Each returned object carries:
      - title, summary     — what this chunk covers
      - source_excerpt     — the first part of the chunk's verbatim text
      - page_range         — summariser heading pages (`## p40-45`)
      - page               — first `<!-- page N -->` in the chunk, when known
      - link               — the finished markdown citation, PDF chip included

    Use `summary` and `source_excerpt` to write your answer — they are the
    material you explain from, not merely something to choose between articles
    with. Copy `link` verbatim when citing an article; do not rebuild it.

    Args:
        query: The rephrased search query.
        articles: The "articles" list from search_articles (with id).

    Returns:
        List of {title, summary, source_excerpt, page_range, page, link} by relevance.
    """
    ids = [a["id"] for a in articles]
    chunks = _fetch_chunks(ids)
    # One lookup for the whole batch, so each result can carry a finished link.
    parts = link_parts_for_titles([a.get("title") or "" for a in articles])
    full_order = list(range(len(articles)))

    if len(articles) <= 1:
        return _build_result(articles, full_order, chunks, parts)

    # The ranking prompt only needs enough of each summary to order by, so it
    # stays truncated even though the returned value does not.
    prompt = (
        f"Return ALL article indices in order of relevance (most relevant first) "
        f"for the query: {query}\n"
        f"Just the numbers separated by commas, like: 2,0,1,3,4\n\n"
    )
    for i, a in enumerate(articles):
        s = chunks.get(a["id"], ("", "", "", ""))[0][:RERANK_SUMMARY_CHARS]
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
            order = full_order
        return _build_result(articles, order, chunks, parts)
    except (ValueError, IndexError):
        return _build_result(articles, full_order, chunks, parts)
