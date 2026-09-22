"""Markdown citation links for documentation articles.

Used by `rerank_chunks`, which builds a finished `link` at retrieval time so
the agent copies one string instead of relaying structured fields.
"""

import re
from urllib.parse import quote

from tools.db import get_conn


def title_to_route_id(title: str) -> str:
    """Fallback slug when the database has none for this title."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())
    return slug.strip("-")


def link_parts_for_titles(titles: list[str]) -> dict[str, tuple[str, str]]:
    """Resolve each title to (slug, pdf-filepath)."""
    if not titles:
        return {}
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT ON (metadata->>'title')
                metadata->>'title',
                metadata->>'slug',
                metadata->>'pdf-filepath'
            FROM embeddings
            WHERE metadata->>'title' = ANY(%s)
            """,
            (titles,),
        )
        return {
            title: (slug or "", pdf or "")
            for title, slug, pdf in cur.fetchall()
        }
    finally:
        conn.close()


def first_page(page_range: str) -> str:
    """The opening page of a stored range ("106-109" → "106", "14" → "14")."""
    token = (page_range or "").split("-", 1)[0].strip()
    return token if token.isdigit() else ""


_PAGE_SUMMARY_SUFFIX = re.compile(r"\s*\(page summary\)\s*$", re.IGNORECASE)


def unescape_pg_math(title: str) -> str:
    """Undo PostgreSQL's backslash doubling in a title, as link text needs."""
    return title.replace("\\\\", "\\")


def citation_title(title: str) -> str:
    """Display title for a citation — drop the PDF-derived '(page summary)' suffix."""
    return _PAGE_SUMMARY_SUFFIX.sub("", unescape_pg_math(title)).strip()


def pdf_chip_label(page_range: str = "") -> str:
    """Chip text: `PDF` or `PDF · page 45` / `PDF · page 7-10`."""
    if not page_range:
        return "PDF"
    return f"PDF · page {page_range}"


def pdf_chip(pdf_filepath: str, page_range: str = "") -> str:
    """Markdown link for an article's source PDF, or "" when it has none.

    The path is percent-encoded because some filenames contain non-ASCII, and a
    raw multibyte character is unsafe in a markdown link destination. Filenames
    in files/ must not contain spaces — a literal space terminates the
    destination.

    A page range, when known, rides on the label: it is the part of the PDF that
    matched the question, which is what makes the link worth clicking. The
    destination also carries `#page=N` so the browser opens that page.

    Prefixed with ` · ` so the citation reads `Title · PDF · page N`.
    """
    if not pdf_filepath:
        return ""
    href = quote(pdf_filepath, safe="/")
    page = first_page(page_range)
    if page:
        href = f"{href}#page={page}"
    return f" · [{pdf_chip_label(page_range)}]({href})"


def article_link(title: str, slug: str, pdf_filepath: str, page_range: str = "") -> str:
    """The complete markdown citation for one article.

    Returned as a finished string on purpose: the agent copies it verbatim
    rather than relaying structured fields, which it does unreliably — page
    ranges were being dropped in transit when they travelled as an object key.

    Example: `[OCPI 2.2.1-d2]({{ARTICLE_ROUTE_PREFIX}}/slug) · [PDF · page 45](/files/x.pdf#page=45)`
    """
    text = citation_title(title)
    return (
        f"[{text}]({{ARTICLE_ROUTE_PREFIX}}/{slug or title_to_route_id(text)})"
        f"{pdf_chip(pdf_filepath, page_range)}"
    )
