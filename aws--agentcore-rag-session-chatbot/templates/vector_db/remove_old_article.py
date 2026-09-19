"""
Remove an article from the PostgreSQL vector database.

Usage: uv run remove_old_article.py <article_number> [--yes]
Example: uv run remove_old_article.py 526         # dry-run
         uv run remove_old_article.py 526 --yes   # execute deletion
"""

import sys
import os
import frontmatter

from env import pg_connect

ARTICLES_DIR = os.path.join(os.path.dirname(__file__), "..", "{{ARTICLES_DIR}}")


def find_article_file(article_number: str) -> str:
    """Find the markdown file matching the article number prefix under {{ARTICLES_DIR}}/."""
    matches = []
    for root, _dirs, files in os.walk(ARTICLES_DIR):
        for f in files:
            if f.startswith(f"{article_number}-") and f.endswith(".md") and not f.endswith("-tc.md"):
                matches.append(os.path.join(root, f))

    if len(matches) == 0:
        print(f"Error: No article file found starting with '{article_number}-' in {ARTICLES_DIR}")
        sys.exit(1)
    if len(matches) > 1:
        print(f"Error: Multiple files match '{article_number}-':")
        for m in matches:
            print(f"  {m}")
        sys.exit(1)

    return matches[0]


def extract_title(filepath: str) -> str:
    """Extract the title from the article's frontmatter."""
    try:
        post = frontmatter.load(filepath)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        sys.exit(1)

    title = post.get("title", "")
    if not title:
        print(f"Error: Could not extract title from frontmatter of {filepath}")
        sys.exit(1)

    return title


def get_connection():
    """Connect to PostgreSQL with search_path set to POSTGRES_SCHEMA."""
    return pg_connect()


def count_rows(conn, title: str) -> int:
    """Count how many rows match the given title."""
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM embeddings WHERE metadata->>'title' = %s", (title,))
    count = cur.fetchone()[0]
    cur.close()
    return count


def delete_rows(conn, title: str) -> None:
    """Delete all rows matching the given title."""
    cur = conn.cursor()
    cur.execute("DELETE FROM embeddings WHERE metadata->>'title' = %s", (title,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    print(f"Deleted {deleted} row(s).")


def main():
    if len(sys.argv) < 2:
        print("Usage: uv run remove_old_article.py <article_number> [--yes]")
        print("Example: uv run remove_old_article.py 526         # dry-run")
        print("         uv run remove_old_article.py 526 --yes   # execute deletion")
        sys.exit(1)

    article_number = sys.argv[1]
    dry_run = "--yes" not in sys.argv

    # Find file and extract title
    filepath = find_article_file(article_number)
    print(f"Found article file: {filepath}")

    title = extract_title(filepath)
    print(f"\nArticle title: {title}\n")

    # Connect and count
    conn = get_connection()
    try:
        row_count = count_rows(conn, title)
        print(f"Found {row_count} row(s) in the database with this title.\n")

        if row_count == 0:
            print("Nothing to delete.")
            return

        # Show the SQL
        print("=" * 50)
        print("SQL to be executed:")
        print(f"\n  DELETE FROM embeddings")
        print(f"  WHERE metadata->>'title' = '{title}';\n")
        print(f"This will delete {row_count} row(s).")
        print("=" * 50)
        print()

        if dry_run:
            print("DRY RUN — no rows were deleted.")
            print("Re-run with --yes to execute the deletion.")
        else:
            print("Executing deletion...")
            delete_rows(conn, title)
            print()

            # Verify
            remaining = count_rows(conn, title)
            print(f"Rows remaining with this title: {remaining}")
            print("Deletion complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
