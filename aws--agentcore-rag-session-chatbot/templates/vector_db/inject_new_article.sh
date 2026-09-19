#!/bin/bash

# Usage: sh inject_new_article.sh <absolute_file_path>
# Example: sh inject_new_article.sh /absolute/path/to/{{ARTICLES_DIR}}/article.md

if [ -z "$1" ]; then
    echo "Error: No file path provided."
    echo "Usage: sh inject_new_article.sh <absolute_file_path>"
    exit 1
fi

FILE_PATH="$1"

if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

uv run --directory "$SCRIPT_DIR" step3_inject_new_article.py "$FILE_PATH"
