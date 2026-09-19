import re

from strands import tool

from tools.db import get_conn


def _title_to_route_id(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())
    return slug.strip("-")


def _slugs_for_titles(titles: list[str]) -> dict[str, str]:
    if not titles:
        return {}
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT ON (metadata->>'title')
                metadata->>'title',
                metadata->>'slug'
            FROM embeddings
            WHERE metadata->>'title' = ANY(%s)
            """,
            (titles,),
        )
        return {title: (slug or "") for title, slug in cur.fetchall()}
    finally:
        conn.close()


@tool
def article_links(titles: list[str]) -> list[str]:
    """Generate clickable markdown links for documentation article titles.

    Call this ONCE before answering, passing ALL the titles you want to
    cite. The frontend renders these as clickable links to each article.

    Args:
        titles: List of exact article titles from rerank results.

    Returns:
        List of markdown links, one per title.
    """
    def _unescape_pg_math(t: str) -> str:
        return t.replace("\\\\", "\\")

    slugs = _slugs_for_titles(titles)
    links = []
    for title in titles:
        slug = slugs.get(title) or _title_to_route_id(title)
        links.append(f"[{_unescape_pg_math(title)}]({{ARTICLE_ROUTE_PREFIX}}/{slug})")
    return links
