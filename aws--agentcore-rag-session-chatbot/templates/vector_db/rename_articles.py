"""
Rename a blog article's title across .md files and the embeddings database.

Usage: uv run vector_db/rename_articles.py <article_number> <new_title>

Example: uv run vector_db/rename_articles.py 411 "My New Title"

Updates:
1. The .md file (English)
2. The -tc.md file (if it exists)
3. The embeddings.metadata->>'title' column in PostgreSQL
"""

import sys
import os
import re
import json
import frontmatter

from env import pg_connect

ARTICLES_DIR = os.path.join(os.path.dirname(__file__), "..", "{{ARTICLES_DIR}}")


# ── Article file helpers ──────────────────────────────────────────────

def find_article_files(article_number: str) -> tuple[str | None, str | None]:
    """Return (english_path, tc_path_or_None) for the given article number."""
    prefix = f"{article_number}-"
    english = None
    tc = None
    for root, _dirs, files in os.walk(ARTICLES_DIR):
        for f in sorted(files):
            if f.startswith(prefix) and f.endswith(".md"):
                path = os.path.join(root, f)
                if f.endswith("-tc.md"):
                    tc = path
                else:
                    english = path
    return english, tc


def read_title(filepath: str) -> str:
    """Extract the title from an article's frontmatter."""
    post = frontmatter.load(filepath)
    return post.get("title", "")


def update_title_in_file(filepath: str, new_title: str):
    """Replace the title: line inside the YAML frontmatter."""
    with open(filepath, "r") as fh:
        content = fh.read()

    # Only touch the first frontmatter block
    parts = content.split("---", 2)
    if len(parts) < 3:
        print(f"  ⚠  No frontmatter found in {filepath}")
        return False

    # Match the entire title: line (handles quoted and unquoted values)
    front = re.sub(
        r"^title:.*$",
        f'title: "{new_title}"',
        parts[1],
        count=1,
        flags=re.MULTILINE,
    )
    new_content = "---" + front + "---" + parts[2]

    with open(filepath, "w") as fh:
        fh.write(new_content)

    # Verify
    verified = read_title(filepath)
    if verified != new_title:
        print(f"  ⚠  Verification failed for {os.path.basename(filepath)}: expected '{new_title}', got '{verified}'")
        return False
    else:
        print(f"  ✓ Updated {os.path.basename(filepath)}")
        return True


# ── Database helpers ──────────────────────────────────────────────────

def get_pg_connection():
    return pg_connect()


def update_embeddings_title(conn, old_title: str, new_title: str) -> int:
    """Update metadata->>'title' for all rows matching old_title. Returns row count."""
    cur = conn.cursor()

    # Count first
    cur.execute(
        "SELECT COUNT(*) FROM embeddings WHERE metadata->>'title' = %s",
        (old_title,),
    )
    count = cur.fetchone()[0]

    if count > 0:
        cur.execute(
            "UPDATE embeddings SET metadata = jsonb_set(metadata, '{title}', %s) WHERE metadata->>'title' = %s",
            (json.dumps(new_title), old_title),
        )
        conn.commit()

    cur.close()
    return count


# ── Main ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: uv run vector_db/rename_articles.py <article_number> <new_title>")
        print("Example: uv run vector_db/rename_articles.py 411 \"My New Title\"")
        sys.exit(1)

    article_number = sys.argv[1]
    new_title = sys.argv[2]

    # Find files
    english, tc = find_article_files(article_number)

    if not english:
        print(f"Error: No article file found for number '{article_number}'")
        sys.exit(1)

    # Read current title
    old_title = read_title(english)

    if old_title == new_title:
        print(f"Title is already '{new_title}' — nothing to do.")
        sys.exit(0)

    # Show summary
    files_to_update = [os.path.basename(english)]
    if tc:
        files_to_update.append(os.path.basename(tc))

    print(f"Article #{article_number}")
    print(f"  Files: {', '.join(files_to_update)}")
    print(f"  Old title: \"{old_title}\"")
    print(f"  New title: \"{new_title}\"")
    print()

    # Update English .md
    update_title_in_file(english, new_title)

    # Update TC .md
    if tc:
        update_title_in_file(tc, new_title)

    # Update PostgreSQL embeddings
    conn = get_pg_connection()
    try:
        db_count = update_embeddings_title(conn, old_title, new_title)
        print(f"  ✓ DB: {db_count} row(s) updated")
    finally:
        conn.close()

    print()
    print("Done.")


if __name__ == "__main__":
    main()
