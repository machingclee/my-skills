from strands import tool

from tools.db import embed_texts, get_conn


@tool
def search_articles(
    query: str,
    tags: list[str],
    top_k: int = 15,
) -> dict:
    """Search the {{DOMAIN_DESCRIPTION}} vector database by cosine similarity.

    Returns articles ordered by relevance, deduplicated by title.
    No LLM rerank — pure SQL vector search with summary extraction.

    Args:
        query: The rephrased search query.
        tags: The tags selected via find_tags. Pass [] to skip filtering.
        top_k: Number of distinct articles to return (default 15).

    Returns:
        A dict with "articles": [{title, summary, tags, score}].
    """
    embedding = embed_texts([query])[0]

    # Over-fetch to compensate for Python-side dedup; title variants
    # (case, trailing spaces) can slip past DISTINCT ON.
    fetch_limit = max(top_k * 3, 60)

    conn = get_conn()
    try:
        cur = conn.cursor()
        if tags:
            cur.execute(
                """
                SELECT * FROM (
                    SELECT DISTINCT ON (metadata->>'title')
                        id, metadata,
                        embedding <=> %s::vector AS distance
                    FROM embeddings
                    WHERE string_to_array(metadata->>'tags', ',') && %s::text[]
                    ORDER BY metadata->>'title', distance
                ) sub
                ORDER BY distance
                LIMIT %s
                """,
                (embedding, tags, fetch_limit),
            )
        else:
            cur.execute(
                """
                SELECT * FROM (
                    SELECT DISTINCT ON (metadata->>'title')
                        id, metadata,
                        embedding <=> %s::vector AS distance
                    FROM embeddings
                    ORDER BY metadata->>'title', distance
                ) sub
                ORDER BY distance
                LIMIT %s
                """,
                (embedding, fetch_limit),
            )

        results = cur.fetchall()
    finally:
        conn.close()

    articles: list[dict] = []
    seen_titles: set[str] = set()
    for row in results:
        row_id = row[0]
        metadata = row[1] or {}
        distance = row[2]

        # Normalize title to catch case / whitespace variants
        title = (metadata.get("title") or "").strip()
        norm = title.lower()
        if not norm or norm in seen_titles:
            continue
        seen_titles.add(norm)

        tags_str = metadata.get("tags", "")
        if isinstance(tags_str, str) and tags_str:
            tag_list = [t.strip() for t in tags_str.split(",") if t.strip()]
        elif isinstance(tags_str, list):
            tag_list = tags_str
        else:
            tag_list = []

        articles.append({
            "id": row_id,
            "title": title,
            "tags": tag_list,
            "score": round(1.0 - float(distance), 4),
            # Pages of the source PDF this particular chunk came from. Belongs to
            # the matching chunk, not the article. rerank_chunks re-reads it from
            # the row by id — do not rely on the model to relay this field.
            "page_range": metadata.get("page_range") or "",
        })

        if len(articles) >= top_k:
            break

    return {"articles": articles, "total_found": len(articles)}
