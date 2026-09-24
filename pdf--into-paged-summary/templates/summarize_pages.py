#!/usr/bin/env python3
"""Summarize the ``{page, context}`` JSON from ``pdf_pages.py`` into markdown.

Each output file is a sequence of sections, one per page range::

    ## p13-16

    ### summary

    - Three worked charging-profile examples.
    - Profile 2 is a TxDefaultProfile that recurs daily at 07:00.
    - Both examples use the same `connectorId` 1 but differ in `stackLevel`.

    ### original_text

    ```markdown
    <the pages' own text, byte-exact>
    ```

Pages are grouped into ranges by a character budget rather than summarized one
at a time: a single page is often too small to say anything useful about, and a
figure-only page summarizes to nothing. A page is never split across two
ranges, and a page bigger than the budget becomes a range of its own.

The original text goes inside a fence sized to the content, so a page that
itself contains ``` cannot close it early. It is fenced rather than inlined
because the text carries its own ``#`` headings -- inlined, those would become
siblings of the ``##`` ranges and destroy the structure. Fencing also keeps the
text byte-exact, which is the point of the whole pipeline.

Summaries are bullet lists, not prose. Each bullet has to make sense read
alone, because the summary is what gets quoted and embedded later -- a reader
meeting one line in a search result should learn something from that line by
itself, which an opening sentence like "The following ..." never does.

Summaries are cached in ``.summary-cache.json`` beside the output, keyed by
model + prompt + text, so re-running after a failure (or after adding
documents) costs nothing for work already done.

Usage::

    uv run python summarize_pages.py pages/coupon_v2.pages.json
    uv run python summarize_pages.py pages --model deepseek/deepseek-chat
    uv run python summarize_pages.py pages --model azure/gpt-4o --jobs 4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DEFAULT_OUT = "summaries"
CACHE_NAME = ".summary-cache.json"

# The .env lives beside this script, not in the caller's working directory, so
# running from elsewhere still finds the key.
ENV_PATH = Path(__file__).with_name(".env")

# Roughly 8k characters -- about 2k tokens. Small enough that a summary stays
# specific to its range, large enough that a range is a coherent topic rather
# than a fragment. Tune with --budget.
CHUNK_CHAR_BUDGET = 8000

# Bump when the prompt changes, so the cache does not serve summaries written
# under different instructions.
PROMPT_VERSION = 2

PROMPT = """\
You are indexing a technical document for a documentation search system.

Below is the text of pages {page_range} of "{name}".

Summarize what these pages cover as 2-5 bullet points, so a reader can decide \
whether to open them. One line per bullet, each starting with "- "; no nested \
bullets, no bold, no heading of your own. The first bullet says what KIND of \
content this is (specification section, API reference, parameter table, \
diagram, example payload, procedure, revision history) and what it is about; \
the rest carry the specifics, naming concrete identifiers, endpoints or message \
names where they carry the meaning. Each bullet must stand on its own -- a \
reader who sees one line alone should still learn something.

Output only the bullets. No preamble, no commentary on these instructions.

---
{text}"""


def fence_for(text: str) -> str:
    """A backtick fence long enough that `text` cannot close it early."""
    longest = max((len(m.group()) for m in re.finditer(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def group_pages(pages: list[dict], budget: int) -> list[list[dict]]:
    """Gather consecutive pages until the next would exceed `budget`.

    A page is never split, so a page larger than the budget ends up alone in
    its own range rather than truncated.
    """
    chunks: list[list[dict]] = []
    current: list[dict] = []
    size = 0
    for page in pages:
        length = len(page["context"])
        if current and size + length > budget:
            chunks.append(current)
            current, size = [], 0
        current.append(page)
        size += length
    if current:
        chunks.append(current)
    return chunks


def page_range_label(chunk: list[dict]) -> str:
    """``p13`` or ``p13-16`` for a run of pages."""
    first, last = chunk[0]["page"], chunk[-1]["page"]
    return f"p{first}" if first == last else f"p{first}-{last}"


def chunk_text(chunk: list[dict]) -> str:
    """The chunk's pages, joined with their page markers kept."""
    return "\n\n".join(f"<!-- page {p['page']} -->\n\n{p['context']}" for p in chunk)


def cache_key(model: str, text: str) -> str:
    digest = hashlib.sha256()
    for part in (str(PROMPT_VERSION), model, text):
        digest.update(part.encode("utf-8"))
        digest.update(b"\x00")
    return digest.hexdigest()


def summarize(model: str, name: str, label: str, text: str) -> str:
    """One completion. Imported lazily so --help works without litellm."""
    import litellm

    response = litellm.completion(
        model=model,
        messages=[
            {
                "role": "user",
                "content": PROMPT.format(page_range=label, name=name, text=text),
            }
        ],
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def load_env() -> None:
    """Load ``.env`` so litellm can find the provider key.

    Searched in this order, first hit wins:

    1. beside this script -- so a bare checkout of the two files works
    2. ``.env`` in the working directory, or any parent of it

    Step 2 is what makes this a drop-in for a project that already has a
    ``.env``: copy the scripts anywhere under it, run from its root, and the
    existing key is picked up. ``find_dotenv(usecwd=True)`` does the walking.

    A variable already exported in the shell always wins -- ``load_dotenv`` does
    not override -- so `DEEPSEEK_API_KEY=... python summarize_pages.py` beats any
    file. That also means a stale exported key silently shadows the .env; use
    ``env -u DEEPSEEK_API_KEY`` if a changed key seems to have no effect.

    Variable names must be the standard ones litellm reads (``DEEPSEEK_API_KEY``,
    ``OPENAI_API_KEY``, ``AZURE_API_KEY``, ...): a key under a house name loads
    fine but is invisible to litellm, which surfaces as "no credentials found".
    """
    try:
        from dotenv import find_dotenv, load_dotenv
    except ImportError:  # not installed: fall back to the real environment
        return
    if ENV_PATH.is_file():
        load_dotenv(ENV_PATH)
        return
    found = find_dotenv(usecwd=True)
    if found:
        load_dotenv(found)


def load_cache(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # A corrupt cache costs money, not correctness: rebuild it.
        print(f"warning: ignoring unreadable cache at {path}", file=sys.stderr)
        return {}


# When --model is not given, infer one from whichever provider key is present.
# Deliberately a table of *cheap* models: this runs once per page range (140
# calls on a 500-page corpus), so a flagship model is rarely worth it.
#
# Model ids age. Override with --model or $SUMMARIZE_MODEL whenever a name here
# has been retired -- that is the supported path, not editing this list.
KEY_DEFAULT_MODELS: tuple[tuple[str, str], ...] = (
    ("DEEPSEEK_API_KEY", "deepseek/deepseek-chat"),
    ("OPENAI_API_KEY", "gpt-4o-mini"),
    ("ANTHROPIC_API_KEY", "anthropic/claude-sonnet-5"),
    ("GEMINI_API_KEY", "gemini/gemini-2.0-flash"),
)


def default_model() -> str | None:
    """Pick a model from the environment, or None if nothing obvious is set.

    Azure is absent on purpose: it needs a deployment name and endpoint, which
    cannot be guessed from a key. Use ``--model azure/<deployment>``.
    """
    if os.environ.get("SUMMARIZE_MODEL"):
        return os.environ["SUMMARIZE_MODEL"]
    for key, model in KEY_DEFAULT_MODELS:
        if os.environ.get(key):
            return model
    return None


def summarize_document(
    src: Path,
    out_dir: Path,
    model: str,
    budget: int,
    jobs: int,
    cache: dict[str, str],
    force: bool,
) -> tuple[Path, int, int]:
    """Summarize one document. Returns (out path, chunks, cache hits)."""
    pages = json.loads(src.read_text(encoding="utf-8"))
    # Tolerate the older wrapper shape so this keeps working on output from an
    # earlier revision of pdf_pages.py.
    if isinstance(pages, dict):
        pages = pages["pages"]

    # Accept both stage 1's `<stem>.pages.json` and a plain `<stem>.json`, so
    # the output is `<stem>.summary.md` either way rather than `<stem>.json.summary.md`.
    name = re.sub(r"\.pages\.json$|\.json$", "", src.name)
    chunks = group_pages(pages, budget)

    keys = [cache_key(model, chunk_text(c)) for c in chunks]
    if force:
        for key in keys:
            cache.pop(key, None)

    pending = [
        (i, key)
        for i, key in enumerate(keys)
        if key not in cache
    ]
    hits = len(chunks) - len(pending)
    if pending:
        print(
            f"  {len(pending)} to summarize, {hits} cached",
            file=sys.stderr,
        )
        done = 0

        def work(item: tuple[int, str]) -> tuple[str, str]:
            nonlocal done
            index, key = item
            label = page_range_label(chunks[index])
            result = summarize(model, name, label, chunk_text(chunks[index]))
            done += 1
            print(f"    [{done}/{len(pending)}] {label}", file=sys.stderr)
            return key, result

        with ThreadPoolExecutor(max_workers=jobs) as pool:
            for key, result in pool.map(work, pending):
                cache[key] = result

    lines = [
        f"# {name} — page summary",
        "",
        f"<!-- generated by summarize_pages.py | model: {model} | "
        f"{len(chunks)} ranges -->",
        "",
    ]
    for chunk, key in zip(chunks, keys):
        label = page_range_label(chunk)
        text = chunk_text(chunk)
        fence = fence_for(text)
        lines += [
            f"## {label}",
            "",
            "### summary",
            "",
            cache.get(key, "_(no summary — model did not return one)_").strip(),
            "",
            "### original_text",
            "",
            fence + "markdown",
            text,
            fence,
            "",
        ]

    out_path = out_dir / f"{name}.summary.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return out_path, len(chunks), hits


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Summarize page JSON into markdown, one section per page range.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage::")[-1].strip(),
    )
    parser.add_argument(
        "path",
        type=Path,
        help="A .pages.json file, or a directory of them (e.g. pages/).",
    )
    parser.add_argument(
        "--out", type=Path, default=Path(DEFAULT_OUT),
        help=f"Output directory (default: ./{DEFAULT_OUT}).",
    )
    parser.add_argument(
        "--model",
        help="litellm model string, e.g. deepseek/deepseek-chat, azure/gpt-4o. "
        "Defaults to $SUMMARIZE_MODEL, then deepseek/deepseek-chat when "
        "DEEPSEEK_API_KEY is set.",
    )
    parser.add_argument(
        "--budget", type=int, default=CHUNK_CHAR_BUDGET,
        help=f"Characters per page range (default: {CHUNK_CHAR_BUDGET}).",
    )
    parser.add_argument(
        "--jobs", type=int, default=4,
        help="Concurrent model calls (default: 4). Lower it if rate-limited.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Ignore cached summaries and call the model again.",
    )
    args = parser.parse_args(argv)

    load_env()
    model = args.model or default_model()
    if not model:
        looked_for = ", ".join(key for key, _ in KEY_DEFAULT_MODELS)
        print(
            f"No model to use, and no provider key found.\n"
            f"  Looked for one of: {looked_for}\n"
            f"  in the shell environment, in {ENV_PATH.name} beside this script, "
            f"and in .env anywhere up from {Path.cwd()}.\n"
            f"  Either put a key in .env, or name the model directly with "
            f"--model <litellm-model>.",
            file=sys.stderr,
        )
        return 1

    target = args.path
    if target.is_file():
        sources = [target]
    elif target.is_dir():
        sources = sorted(target.glob("*.pages.json"))
    else:
        print(f"No such file or directory: {target}", file=sys.stderr)
        return 1

    if not sources:
        print(f"No *.pages.json found in {target}", file=sys.stderr)
        return 1

    out_dir: Path = args.out
    cache_path = out_dir / CACHE_NAME
    cache = load_cache(cache_path)

    print(f"summarize {len(sources)} document(s) with {model}", file=sys.stderr)
    failures: list[tuple[Path, str]] = []
    for src in sources:
        print(f"{src.name}", file=sys.stderr)
        try:
            out_path, chunks, hits = summarize_document(
                src, out_dir, model, args.budget, args.jobs, cache, args.force
            )
        except Exception as exc:  # keep going through the rest
            failures.append((src, f"{type(exc).__name__}: {exc}"))
            print(f"  FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        else:
            print(
                f"  -> {out_path}  ({chunks} ranges, {hits} cached)",
                file=sys.stderr,
            )
        # Save after each document: a failure on page 400 must not discard the
        # summaries already paid for.
        out_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, indent=1), encoding="utf-8")

    if failures:
        print("\nFailed:", file=sys.stderr)
        for src, err in failures:
            print(f"  {src.name}: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
