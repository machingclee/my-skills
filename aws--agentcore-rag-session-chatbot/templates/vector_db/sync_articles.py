"""Compare markdowns/ against {{POSTGRES_SCHEMA}}.embeddings and plan add / rename / change / remove.

Tags: every run checks the agent's tag list against markdowns/ frontmatter. The
dry-run reports drift; --apply rewrites agentcore/app/{{AGENT_NAME}}/tags.py
(+ tools/tags.py) and deploys AgentCore, but only when the content actually
changed (skip the deploy with --no-deploy).

Usage:
  uv run --directory vector_db sync_articles.py                  # dry-run
  uv run --directory vector_db sync_articles.py --backfill-hashes
  uv run --directory vector_db sync_articles.py --apply
  uv run --directory vector_db sync_articles.py --apply --no-deploy
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import asdict, dataclass

from article_fingerprint import (
    DbArticle,
    FileArticle,
    collect_file_articles,
    delete_by_title,
    load_db_articles,
)
from env import ROOT, pg_connect
from get_tags import sync_tags


@dataclass
class PlanItem:
    action: str
    title: str
    path: str = ""
    old_title: str = ""
    old_path: str = ""
    chunks: int = 0
    reason: str = ""


def build_plan(
    files: list[FileArticle], db_articles: list[DbArticle]
) -> list[PlanItem]:
    db_by_title = {a.title: a for a in db_articles}
    db_by_path = {a.source_path: a for a in db_articles if a.source_path}
    file_titles = {f.title for f in files if not f.wip}
    file_paths = {f.source_path for f in files if not f.wip}

    items: list[PlanItem] = []
    handled_db_titles: set[str] = set()

    for art in files:
        db = db_by_path.get(art.source_path) or db_by_title.get(art.title)
        if art.wip:
            if db:
                items.append(
                    PlanItem(
                        action="removed",
                        title=db.title,
                        path=art.source_path,
                        old_title=db.title,
                        old_path=db.source_path,
                        chunks=db.row_count,
                        reason="wip: true — skip inject and drop existing vectors",
                    )
                )
                handled_db_titles.add(db.title)
            continue

        if db is None:
            items.append(
                PlanItem(
                    action="added",
                    title=art.title,
                    path=art.source_path,
                    reason="not in embeddings",
                )
            )
            continue

        handled_db_titles.add(db.title)
        renamed = bool(db.source_path) and db.source_path != art.source_path
        unfingerprinted = not db.content_hash
        hash_mismatch = bool(db.content_hash) and db.content_hash != art.content_hash
        title_changed = db.title != art.title

        if unfingerprinted:
            items.append(
                PlanItem(
                    action="unfingerprinted",
                    title=art.title,
                    path=art.source_path,
                    old_title=db.title,
                    old_path=db.source_path,
                    chunks=db.row_count,
                    reason="existing rows have no source_path/content_hash — backfill, do not re-embed",
                )
            )
            continue

        if renamed or hash_mismatch or title_changed:
            reasons = []
            if renamed:
                reasons.append(f"path {db.source_path} → {art.source_path}")
            if title_changed:
                reasons.append(f"title {db.title!r} → {art.title!r}")
            if hash_mismatch:
                reasons.append("content_hash differs (path, frontmatter, or body)")
            items.append(
                PlanItem(
                    action="changed",
                    title=art.title,
                    path=art.source_path,
                    old_title=db.title,
                    old_path=db.source_path,
                    chunks=db.row_count,
                    reason="; ".join(reasons),
                )
            )
        else:
            items.append(
                PlanItem(
                    action="ok",
                    title=art.title,
                    path=art.source_path,
                    chunks=db.row_count,
                )
            )

    for db in db_articles:
        if db.title in handled_db_titles:
            continue
        if db.title in file_titles:
            continue
        if db.source_path and db.source_path in file_paths:
            continue
        items.append(
            PlanItem(
                action="removed",
                title=db.title,
                old_path=db.source_path,
                chunks=db.row_count,
                reason="no matching markdowns/ file",
            )
        )

    order = {
        "removed": 0,
        "changed": 1,
        "added": 2,
        "unfingerprinted": 3,
        "ok": 4,
    }
    items.sort(key=lambda i: (order.get(i.action, 9), i.title.lower()))
    return items


def print_plan(items: list[PlanItem]) -> None:
    counts: dict[str, int] = {}
    for item in items:
        counts[item.action] = counts.get(item.action, 0) + 1

    print("Article vector sync plan")
    print("=" * 80)
    print(
        f"  added={counts.get('added', 0)}  "
        f"changed={counts.get('changed', 0)}  "
        f"removed={counts.get('removed', 0)}  "
        f"unfingerprinted={counts.get('unfingerprinted', 0)}  "
        f"ok={counts.get('ok', 0)}"
    )
    print("=" * 80)

    for action in ("removed", "changed", "added", "unfingerprinted"):
        bucket = [i for i in items if i.action == action]
        if not bucket:
            continue
        print(f"\n=== {action.upper()} ({len(bucket)}) ===")
        for item in bucket:
            print(f"  {item.title}")
            if item.path:
                print(f"      file: {item.path}")
            if item.old_path and item.old_path != item.path:
                print(f"      was:  {item.old_path}")
            if item.old_title and item.old_title != item.title:
                print(f"      old title: {item.old_title}")
            if item.chunks:
                print(f"      chunks: {item.chunks}")
            if item.reason:
                print(f"      {item.reason}")

    print()
    actionable = [i for i in items if i.action not in ("ok",)]
    if not actionable:
        print("Everything is in sync. ✓")
        return
    if all(i.action == "unfingerprinted" for i in actionable):
        print("Next: uv run --directory vector_db sync_articles.py --backfill-hashes")
    else:
        print("Dry run. Re-run with --apply to delete + re-inject changed/added/removed.")
        unf = [i for i in actionable if i.action == "unfingerprinted"]
        if unf:
            print(
                f"Note: {len(unf)} article(s) are unfingerprinted. "
                "Run --backfill-hashes first so they are not re-embedded."
            )


def backfill_hashes(files: list[FileArticle], db_articles: list[DbArticle]) -> int:
    by_title = {f.title: f for f in files if not f.wip}
    conn = pg_connect()
    cur = conn.cursor()
    updated_articles = 0
    updated_rows = 0
    try:
        for db in db_articles:
            art = by_title.get(db.title)
            if not art:
                continue
            if db.content_hash and db.source_path and db.slug:
                continue
            cur.execute(
                """
                UPDATE embeddings
                SET metadata = metadata
                    || jsonb_build_object(
                        'source_path', %s::text,
                        'content_hash', %s::text,
                        'slug', COALESCE(NULLIF(metadata->>'slug', ''), %s)
                    )
                WHERE metadata->>'title' = %s
                """,
                (art.source_path, art.content_hash, art.slug, db.title),
            )
            if cur.rowcount:
                print(
                    f"  ✓ {cur.rowcount:3d} rows  {db.title}  "
                    f"slug={art.slug!r}"
                )
                updated_articles += 1
                updated_rows += cur.rowcount
        conn.commit()
    finally:
        cur.close()
        conn.close()
    print(f"\nBackfilled {updated_rows} rows across {updated_articles} article(s).")
    return updated_rows


def apply_plan(items: list[PlanItem], files: list[FileArticle]) -> None:
    files_by_path = {f.source_path: f for f in files}
    to_delete = [i for i in items if i.action in ("removed", "changed")]
    to_inject = [i for i in items if i.action in ("added", "changed") and i.path]
    leftover_unf = [i for i in items if i.action == "unfingerprinted"]
    if leftover_unf:
        print(
            "Refusing --apply: unfingerprinted articles would be treated as stale.\n"
            "Run --backfill-hashes first:"
        )
        for item in leftover_unf:
            print(f"  {item.title}")
        sys.exit(1)

    conn = pg_connect()
    try:
        for item in to_delete:
            title = item.old_title or item.title
            deleted = delete_by_title(conn, title)
            print(f"  deleted {deleted:3d} rows  {title}")
            if item.old_title and item.old_title != item.title:
                extra = delete_by_title(conn, item.title)
                if extra:
                    print(f"  deleted {extra:3d} rows  {item.title}")
    finally:
        conn.close()

    if not to_inject:
        return

    from step3_inject_new_article import ArticleInjector

    injector = ArticleInjector(average_chunk_size=2500)
    try:
        for i, item in enumerate(to_inject, 1):
            art = files_by_path.get(item.path)
            if not art:
                print(f"  ⚠  missing file for inject: {item.path}")
                continue
            print(f"\n[{i}/{len(to_inject)}] {art.source_path}")
            injector.inject_article(str(art.path))
    finally:
        injector.close()


def refresh_tags(*, dry_run: bool, deploy: bool) -> None:
    """Refresh the agent's TAGS list from markdowns/ frontmatter.

    Writes only when the content changed, and deploys AgentCore only when it did,
    so a plain sync does not trigger a slow deploy.
    """
    print("\n── Article tags ──")
    tags, changed = sync_tags(dry_run=dry_run)
    if not changed:
        print(f"  tags.py unchanged ({len(tags)} tags) ✓")
        return
    if dry_run:
        print(f"  tags.py would change ({len(tags)} tags) — applied by --apply")
        return

    print(f"  {len(tags)} tags — agent needs a deploy to see them")
    hint = "cd agentcore && agentcore deploy -y"
    if not deploy:
        print(f"  Deploy skipped (--no-deploy). Run: {hint}")
        return

    print("\n── Deploying AgentCore ──")
    result = subprocess.run(
        ["agentcore", "deploy", "-y"], cwd=ROOT / "agentcore", check=False
    )
    if result.returncode:
        print(f"  ⚠  deploy failed (exit {result.returncode}). Run manually: {hint}")
    else:
        print("  deployed ✓")


def main() -> None:
    args = set(sys.argv[1:])
    if "--help" in args or "-h" in args:
        print(__doc__.strip())
        return

    apply = "--apply" in args
    backfill = "--backfill-hashes" in args
    as_json = "--json" in args
    deploy = "--no-deploy" not in args
    if apply and backfill:
        print("Use either --apply or --backfill-hashes, not both.")
        sys.exit(1)

    files = collect_file_articles()
    titles: dict[str, FileArticle] = {}
    for art in files:
        if art.title in titles:
            print(
                f"Error: duplicate title {art.title!r}\n"
                f"  {titles[art.title].source_path}\n"
                f"  {art.source_path}"
            )
            sys.exit(1)
        titles[art.title] = art

    conn = pg_connect()
    try:
        db_articles = load_db_articles(conn)
    finally:
        conn.close()

    items = build_plan(files, db_articles)
    if as_json:
        print(json.dumps([asdict(i) for i in items], indent=2))
        return

    print_plan(items)

    if backfill:
        print("\n── Backfilling source_path / content_hash / slug ──")
        backfill_hashes(files, db_articles)
        return

    if apply:
        actionable = [i for i in items if i.action in ("added", "changed", "removed")]
        if actionable:
            print("\n── Applying ──")
            apply_plan(items, files)
            print("\nDone. ✓")
        refresh_tags(dry_run=False, deploy=deploy)
        return

    refresh_tags(dry_run=True, deploy=deploy)


if __name__ == "__main__":
    main()
