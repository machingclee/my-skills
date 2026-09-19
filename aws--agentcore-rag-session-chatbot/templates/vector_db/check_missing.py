"""Articles in {{ARTICLES_DIR}}/ whose title is not in {{POSTGRES_SCHEMA}}.embeddings.

Prefer `sync_articles.py` for rename / content / path drift. This script only
prints the added bucket (and WIP files that are also missing).
"""

from article_fingerprint import collect_file_articles, load_db_articles


def main() -> None:
    files = collect_file_articles()
    db_titles = {a.title for a in load_db_articles()}

    print(f"Articles found in files: {len(files)}")
    print(f"Distinct titles in DB: {len(db_titles)}")

    missing = [f for f in files if f.title not in db_titles]
    wip_missing = [m for m in missing if m.wip]
    real_missing = [m for m in missing if not m.wip]

    print(f"\nTotal missing: {len(missing)}")
    print(f"  WIP (can skip): {len(wip_missing)}")
    print(f"  Real missing:   {len(real_missing)}")
    print("=" * 80)

    if real_missing:
        print("\n=== NEED VECTORIZATION ===")
        for art in real_missing:
            print(f"  {art.slug}: {art.path.name}")
            print(f"       \"{art.title}\"")

    if wip_missing:
        print("\n=== WIP (skip) ===")
        for art in wip_missing:
            print(f"  {art.slug}: {art.path.name}")
            print(f"       \"{art.title}\"")

    print("\nFor renames, body edits, and deleted articles, run:")
    print("  uv run --directory vector_db sync_articles.py")


if __name__ == "__main__":
    main()
