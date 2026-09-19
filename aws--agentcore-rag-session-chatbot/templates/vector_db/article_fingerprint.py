"""Fingerprint markdown articles and load matching embeddings metadata.

content_hash = sha256(source_path + NUL + raw file bytes)
source_path  = repo-relative posix path, e.g. {{ARTICLES_DIR}}/060-section/010-Article.md
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import frontmatter

from env import ROOT, pg_connect

ARTICLES_DIR = ROOT / "{{ARTICLES_DIR}}"


def source_path_for(filepath: str | Path) -> str:
    path = Path(filepath).resolve()
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def content_hash_for(filepath: str | Path, source_path: str | None = None) -> str:
    path = Path(filepath)
    rel = source_path or source_path_for(path)
    return hashlib.sha256(rel.encode("utf-8") + b"\0" + path.read_bytes()).hexdigest()


def is_wip_value(wip) -> bool:
    if isinstance(wip, str):
        return wip.lower() in ("true", "yes")
    return bool(wip)


def normalize_tags(tags) -> str:
    if isinstance(tags, list):
        return ",".join(sorted(str(t).strip() for t in tags if str(t).strip()))
    if isinstance(tags, str) and "," in tags:
        return ",".join(sorted(t.strip() for t in tags.split(",") if t.strip()))
    return str(tags or "")


def slug_from_stem(stem: str) -> str:
    slug = re.sub(r"^\d+[._-]", "", stem).lower()
    return re.sub(r"[^a-z0-9]+", "-", slug).strip("-")


@dataclass
class FileArticle:
    path: Path
    source_path: str
    content_hash: str
    title: str
    slug: str
    tags: str
    wip: bool


@dataclass
class DbArticle:
    title: str
    slug: str
    source_path: str
    content_hash: str
    row_count: int
    min_id: int
    max_id: int


def collect_file_articles() -> list[FileArticle]:
    articles: list[FileArticle] = []
    for path in sorted(ARTICLES_DIR.rglob("*.md")):
        if path.name.endswith("-tc.md"):
            continue
        try:
            post = frontmatter.load(str(path))
        except Exception as e:
            print(f"  ⚠  Skipping {path}: {e}")
            continue
        title = str(post.get("title") or "").strip()
        if not title:
            continue
        source_path = source_path_for(path)
        slug = str(post.get("slug") or "").strip() or slug_from_stem(path.stem)
        articles.append(
            FileArticle(
                path=path,
                source_path=source_path,
                content_hash=content_hash_for(path, source_path),
                title=title,
                slug=slug,
                tags=normalize_tags(post.get("tags") or post.get("tag") or ""),
                wip=is_wip_value(post.get("wip", False)),
            )
        )
    return articles


def load_db_articles(conn=None) -> list[DbArticle]:
    close = False
    if conn is None:
        conn = pg_connect()
        close = True
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            metadata->>'title' AS title,
            COALESCE(MAX(metadata->>'slug'), '') AS slug,
            COALESCE(MAX(NULLIF(metadata->>'source_path', '')), '') AS source_path,
            COALESCE(MAX(NULLIF(metadata->>'content_hash', '')), '') AS content_hash,
            COUNT(*) AS row_count,
            MIN(CAST(id AS INTEGER)) FILTER (WHERE id ~ '^[0-9]+$') AS min_id,
            MAX(CAST(id AS INTEGER)) FILTER (WHERE id ~ '^[0-9]+$') AS max_id
        FROM embeddings
        GROUP BY metadata->>'title'
        """
    )
    rows = [
        DbArticle(
            title=r[0] or "",
            slug=r[1] or "",
            source_path=r[2] or "",
            content_hash=r[3] or "",
            row_count=int(r[4] or 0),
            min_id=int(r[5] or 0),
            max_id=int(r[6] or 0),
        )
        for r in cur.fetchall()
        if r[0]
    ]
    cur.close()
    if close:
        conn.close()
    return rows


def delete_by_title(conn, title: str) -> int:
    cur = conn.cursor()
    cur.execute("DELETE FROM embeddings WHERE metadata->>'title' = %s", (title,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    return deleted
