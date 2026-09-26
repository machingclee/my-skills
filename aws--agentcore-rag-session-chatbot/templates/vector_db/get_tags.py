"""Sync the article-tag vocabulary into {{POSTGRES_SCHEMA}}.tags.

Frontmatter under {{ARTICLES_DIR}}/ is the source. The table is the list
`find_tags` reads on every call, so a tag change does not redeploy AgentCore.
"""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

from env import ROOT, pg_connect, schema_name

ARTICLES_DIR = ROOT / "{{ARTICLES_DIR}}"


@dataclass
class TagSyncResult:
    tags: list[str]
    inserted: list[str]
    deleted: list[str]
    table_existed: bool


def extract_tags(md_path: Path) -> list[str]:
    content = md_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return []
    parts = content.split("---", 2)
    if len(parts) < 3:
        return []
    try:
        fm = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        return []
    raw = fm.get("tags") or fm.get("tag") or []
    if isinstance(raw, str):
        return [t.strip() for t in raw.split(",") if t.strip()]
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return []


def collect_tags() -> list[str]:
    all_tags: set[str] = set()
    for md_file in sorted(ARTICLES_DIR.rglob("*.md")):
        if md_file.name.endswith("-tc.md"):
            continue
        all_tags.update(extract_tags(md_file))
    return sorted(all_tags)


def _tags_table_exists(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = 'tags'
            """,
            (schema_name(),),
        )
        return cur.fetchone() is not None


def ensure_tags_table(conn) -> None:
    """Create {{POSTGRES_SCHEMA}}.tags when it is missing. One column, the tag."""
    if _tags_table_exists(conn):
        return
    schema = schema_name()
    with conn.cursor() as cur:
        cur.execute(f"CREATE TABLE {schema}.tags (tag TEXT PRIMARY KEY)")
    conn.commit()


def _select_tags(conn) -> list[str]:
    schema = schema_name()
    with conn.cursor() as cur:
        cur.execute(f"SELECT tag FROM {schema}.tags ORDER BY tag")
        return [row[0] for row in cur.fetchall() if row[0]]


def sync_tags(*, dry_run: bool = False) -> TagSyncResult:
    """Make {{POSTGRES_SCHEMA}}.tags equal the sorted frontmatter vocabulary.

    Inserts tags that are new and deletes tags that no longer appear on any
    article. A dry run reports that diff and does not create or write the table.
    """
    tags = collect_tags()
    conn = pg_connect(register=False)
    try:
        existed = _tags_table_exists(conn)
        existing = set(_select_tags(conn)) if existed else set()
        wanted = set(tags)
        inserted = sorted(wanted - existing)
        deleted = sorted(existing - wanted)
        if dry_run or (not inserted and not deleted and existed):
            return TagSyncResult(tags, inserted, deleted, existed)
        ensure_tags_table(conn)
        schema = schema_name()
        with conn.cursor() as cur:
            if inserted:
                cur.executemany(
                    f"INSERT INTO {schema}.tags (tag) VALUES (%s) "
                    "ON CONFLICT (tag) DO NOTHING",
                    [(tag,) for tag in inserted],
                )
            if deleted:
                cur.execute(
                    f"DELETE FROM {schema}.tags WHERE tag = ANY(%s)",
                    (deleted,),
                )
        conn.commit()
        return TagSyncResult(tags, inserted, deleted, existed)
    finally:
        conn.close()


def main() -> None:
    result = sync_tags()
    print(json.dumps(result.tags))
    print(
        f"{schema_name()}.tags +{len(result.inserted)} -{len(result.deleted)} "
        f"({len(result.tags)} tags)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
