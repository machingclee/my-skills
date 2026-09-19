#!/bin/bash

# Usage: sh remove_old_article.sh <article_number> [--yes]
# Example: sh remove_old_article.sh 526         # dry-run
#          sh remove_old_article.sh 526 --yes   # execute deletion
#
# Finds the article file matching the number prefix, extracts its title
# from frontmatter, and deletes all matching rows from the embeddings table.
#
# Without --yes:  dry-run mode — shows what would be deleted and exits.
# With --yes:     actually executes the deletion.

if [ -z "$1" ]; then
    echo "Error: No article number provided."
    echo "Usage: sh remove_old_article.sh <article_number> [--yes]"
    echo "Example: sh remove_old_article.sh 526"
    echo "         sh remove_old_article.sh 526 --yes"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

uv run "$SCRIPT_DIR/remove_old_article.py" "$@"
