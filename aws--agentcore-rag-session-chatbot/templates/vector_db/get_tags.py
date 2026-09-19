import json
from pathlib import Path

import yaml

from env import ROOT

ARTICLES_DIR = ROOT / "{{ARTICLES_DIR}}"
TAGS_FILES = [
    ROOT / "agentcore" / "app" / "{{AGENT_NAME}}" / "tags.py",
    ROOT / "agentcore" / "app" / "{{AGENT_NAME}}" / "tools" / "tags.py",
]


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


def format_tags_py(tags: list[str]) -> str:
    if not tags:
        return "TAGS = []\n"
    inner = ",\n        ".join(json.dumps(t) for t in tags)
    return f"TAGS = [\n        {inner},\n]\n"


def write_tags_files(tags: list[str]) -> None:
    content = format_tags_py(tags)
    for path in TAGS_FILES:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path}")


def main() -> None:
    all_tags: set[str] = set()
    for md_file in sorted(ARTICLES_DIR.rglob("*.md")):
        if md_file.name.endswith("-tc.md"):
            continue
        all_tags.update(extract_tags(md_file))

    tags = sorted(all_tags)
    write_tags_files(tags)
    print(json.dumps(tags))


if __name__ == "__main__":
    main()
