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


def open_page(page_range: str = "", page: str = "") -> str:
    """Page the PDF should open at: exact marker page, else the start of the range."""
    token = (page or "").strip()
    if token.isdigit():
        return token
    return first_page(page_range)


_PAGE_SUMMARY_SUFFIX = re.compile(r"\s*\(page summary\)\s*$", re.IGNORECASE)


def unescape_pg_math(title: str) -> str:
    """Undo PostgreSQL's backslash doubling in a title, as link text needs."""
    return title.replace("\\\\", "\\")


def citation_title(title: str) -> str:
    """Display title for a citation — drop the PDF-derived '(page summary)' suffix."""
    return _PAGE_SUMMARY_SUFFIX.sub("", unescape_pg_math(title)).strip()


def pdf_chip_label(page_range: str = "", page: str = "") -> str:
    """Chip text: `PDF`, `PDF · page 40-45`, or `PDF · page 40-45 · p.45`.

    `page_range` is the summariser heading (`## p40-45`). `page` is the first
    `<!-- page N -->` in the chunk — the printed page this fragment starts on.
    The exact page is appended only when it adds information (it differs from
    the start of the range).
    """
    if page_range:
        label = f"PDF · page {page_range}"
        exact = (page or "").strip()
        if exact.isdigit() and exact != first_page(page_range):
            label += f" · p.{exact}"
        return label
    if (page or "").strip().isdigit():
        return f"PDF · page {page.strip()}"
    return "PDF"


def pdf_chip(pdf_filepath: str, page_range: str = "", page: str = "") -> str:
    """Markdown link for an article's source PDF, or "" when it has none.

    The path is percent-encoded because some filenames contain non-ASCII, and a
    raw multibyte character is unsafe in a markdown link destination. Filenames
    in files/ must not contain spaces — a literal space terminates the
    destination.

    A page range, when known, rides on the label. An exact `<!-- page N -->`
    page, when known, is the open-at target (`#page=N`) and, if it is not
    already the start of the range, appears as ` · p.N` on the chip.

    Prefixed with ` · ` so the citation reads `Title · PDF · page N`.
    """
    if not pdf_filepath:
        return ""
    href = quote(pdf_filepath, safe="/")
    target = open_page(page_range, page)
    if target:
        href = f"{href}#page={target}"
    return f" · [{pdf_chip_label(page_range, page)}]({href})"


def article_link(
    title: str,
    slug: str,
    pdf_filepath: str,
    page_range: str = "",
    page: str = "",
) -> str:
    """The complete markdown citation for one article.

    Example: `[Title]({{ARTICLE_ROUTE_PREFIX}}/slug) · [PDF · page 40-45 · p.45](/files/x.pdf#page=45)`
    """
    text = citation_title(title)
    return (
        f"[{text}]({{ARTICLE_ROUTE_PREFIX}}/{slug or title_to_route_id(text)})"
        f"{pdf_chip(pdf_filepath, page_range, page)}"
    )
