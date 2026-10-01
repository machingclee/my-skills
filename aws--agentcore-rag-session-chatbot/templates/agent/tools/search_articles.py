from strands import tool

from tools.db import embed_texts, get_conn


# Two independent caps, applied in order.
#
# TOP_K_TITLES bounds how many distinct documents a search returns.
#
# TOP_N_CHUNKS bounds how many chunks come back per title. A document is stored as
# many chunks, and the single nearest one is often not the section that explains
# the thing, so each title is represented by its N closest chunks rather than one.
TOP_K_TITLES = 15
TOP_N_CHUNKS = 7


# Titles are grouped on a normalized form so "Doc Title" and "doc title " count as
# one document. `title_rank` numbers documents by their best chunk; `chunk_rank`
# numbers chunks within a document. Both filters are applied after the window
# functions, since neither WHERE nor LIMIT can see them.
# A window function may not reference another, so the per-title best distance is
# computed in its own pass and `title_rank` orders by that plain column.
_SEARCH_SQL = """
WITH scored AS (
    SELECT
        id,
        metadata,
        embedding <=> %(embedding)s::vector AS distance,
        lower(btrim(metadata->>'title')) AS title_key,
        row_number() OVER (
            PARTITION BY lower(btrim(metadata->>'title'))
            ORDER BY embedding <=> %(embedding)s::vector
        ) AS chunk_rank,
        min(embedding <=> %(embedding)s::vector) OVER (
            PARTITION BY lower(btrim(metadata->>'title'))
        ) AS best_distance
    FROM embeddings
    {where}
),
ranked AS (
    SELECT
        id,
        metadata,
        distance,
        chunk_rank,
        dense_rank() OVER (ORDER BY best_distance, title_key) AS title_rank
    FROM scored
)
SELECT id, metadata, distance
FROM ranked
WHERE title_rank <= %(top_k_titles)s
  AND chunk_rank <= %(top_n_chunks)s
ORDER BY distance
"""


@tool
def search_articles(
    query: str,
    tags: list[str],
) -> dict:
    """Search the {{DOMAIN_DESCRIPTION}} vector database by cosine similarity.

    Returns the closest chunks of the closest documents. No LLM rerank — pure
    SQL vector search with summary extraction.

    Args:
        query: The rephrased search query.
        tags: The tags selected via find_tags. Pass [] to skip filtering.

    Returns:
        A dict with "articles": [{id, title, tags, score, page_range}], one entry
        per chunk, "total_found": the number of distinct titles represented,
        "chunks_found": the number of chunks being passed on for reranking, and
        "titles": those distinct titles, best match first.
    """
    embedding = embed_texts([query])[0]

    where = ""
    params = {
        "embedding": embedding,
        "top_k_titles": TOP_K_TITLES,
        "top_n_chunks": TOP_N_CHUNKS,
    }
    if tags:
        where = "WHERE string_to_array(metadata->>'tags', ',') && %(tags)s::text[]"
        params["tags"] = tags

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(_SEARCH_SQL.format(where=where), params)
        results = cur.fetchall()
    finally:
        conn.close()

    chunks: list[dict] = []
    titles: list[str] = []
    seen: set[str] = set()
    for row in results:
        row_id = row[0]
        metadata = row[1] or {}
        distance = row[2]

        title = (metadata.get("title") or "").strip()
        norm = title.lower()
        if not norm:
            continue
        if norm not in seen:
            seen.add(norm)
            titles.append(title)

        tags_str = metadata.get("tags", "")
        if isinstance(tags_str, str) and tags_str:
            tag_list = [t.strip() for t in tags_str.split(",") if t.strip()]
        elif isinstance(tags_str, list):
            tag_list = tags_str
        else:
            tag_list = []

        chunks.append({
            "id": row_id,
            "title": title,
            "tags": tag_list,
            "score": round(1.0 - float(distance), 4),
            # Pages of the source PDF this particular chunk came from. Belongs to
            # the matching chunk, not the article. rerank_chunks re-reads it from
            # the row by id — do not rely on the model to relay this field.
            "page_range": metadata.get("page_range") or "",
        })

    return {
        "articles": chunks,
        "total_found": len(titles),
        "chunks_found": len(chunks),
        "titles": titles,
    }
