#!/usr/bin/env python3
"""Parse a PDF into per-page markdown chunks -- ``{page, context}`` -- for LLM indexing.

Turning a whole PDF into good markdown is a losing game on this corpus.
Borderless Word tables, vector diagrams, running headers and inconsistent
heading levels each need their own repair, and the repairs fight each other --
see ``EXTRACTION-HANDOFF.md`` for what that cost. This script aims lower on
purpose. It does not try to render the PDF faithfully; it produces a
page-keyed, readable-enough markdown string so a later LLM pass can answer
*"what kinds of content live on which page"* and route a question to a page
range to read in full.

That lower bar buys real simplifications:

* **No OCR** (``--ocr`` to opt in). pymupdf4llm's OCR exists to recover text
  baked into diagram images. An inventory does not need that text -- the figure
  is reported as a ``[figure]`` marker instead. Leaving OCR off also dodges a
  live trap: installing Docling pulls RapidOCR, which pymupdf4llm then
  *prefers*, and RapidOCR reads vector diagrams as text. Measured on the EVC
  protocol page 13, OCR off cost **3 characters out of 1,613**.
* **No image files.** Figures become a marker, not a PNG on disk.
* **No table repair.** A flattened charging-profile block still carries every
  field name -- ``chargingProfileId``, ``recurrencyKind``, ``86400 (= 24
  hours)`` -- which is all an inventory needs to recognise the content type.
  Nesting is what the repair pass restores, and the inventory does not read
  nesting.

What it *does* do, because it is nearly free and the LLM step wants it:

* **Drops page furniture.** pymupdf4llm's layout pass already labels
  ``page-header`` / ``page-footer`` boxes and gives each box a ``pos``
  character range into the page text, so the footer is sliced out exactly
  rather than guessed at with a regex. Lines that repeat across most pages but
  were *not* labelled -- the EVC "confidential" banner arrives as plain
  ``text`` -- are caught by a second, corpus-level pass.
* **Marks figures**, so "page 14 has a diagram" survives into the LLM's view
  instead of a silent blank -- carrying the labels read inside the diagram
  (``[figure: CPO2 CPO1 CPO3]``), because on some pages those labels are the
  only text there is.
* **Reports per-page character counts**, so the caller can budget a context
  window and split a long document across calls.

Output is the array itself -- no wrapper object (``page`` is 1-based and
matches the printed page number)::

    [{"page": 1, "context": "# Title\\n\\n..."},
     {"page": 2, "context": "..."}]

Anything else -- page and character counts, the running lines that were
stripped -- is a diagnostic and goes to stderr, so nothing in the payload can
be mistaken for content.

Usage::

    uv run python pdf_pages.py CaseyDocumentation.pdf
    uv run python pdf_pages.py spec.pdf --pages 13-14 --out /tmp/probe.json
    uv run python pdf_pages.py . --out /tmp/pages --jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import NamedTuple

import pymupdf4llm

# Layout classes that are page furniture rather than content. pymupdf4llm labels
# these, which is what makes it possible to drop a footer by *classification*
# instead of pattern-matching the rendered text -- a regex can remove a trailing
# page number but never a running header.
DROPPED_BOX_CLASSES = frozenset({"page-header", "page-footer"})

# Stands in for a picture box. A human can grep for it (``grep -c '\[figure'``)
# to count a document's diagrams, and an LLM reading the page can see *that*
# something visual is there.
FIGURE_MARKER = "[figure]"
FIGURE_MARKER_PREFIX = "[figure"

# pymupdf4llm wraps text it reads inside a figure in these comments, and joins
# the lines with <br>. Both are markup, not labels.
PICTURE_TEXT_RE = re.compile(r"<!--\s*(?:Start|End) of picture text\s*-->", re.I)
BR_RE = re.compile(r"<br\s*/?>", re.I)

# Figure-interior text is worth keeping -- the OCPI architecture diagram's only
# text *is* its labels ("CPO1", "eMSP3"), so dropping it loses the one thing
# that makes that page findable. But it is also fragmentary and repetitive
# ("PLATFORM PLATFORM PLATFORM"), and a diagram can hold more text than the
# rest of its page, so it is capped. 400 was measured against this corpus: the
# median figure carries ~170 characters, so a 160 cap was truncating half of
# them for no reason, while 400 leaves ~73% whole and clips only the handful of
# genuinely dense diagrams.
FIGURE_TEXT_MAX_CHARS = 400


# A repeated line only counts as furniture if it is short and shows up on a good
# fraction of pages. Both bounds matter: the length cap keeps a repeated *table
# row* from being mistaken for a banner, and the page floor keeps the detector
# from firing on a two-page document.
RUNNING_LINE_MAX_CHARS = 120
RUNNING_LINE_MIN_PAGES = 3
RUNNING_LINE_PAGE_FRACTION = 0.3
# Only the outermost lines of a page are candidates. A repeated sentence in the
# middle of a body of text is emphasis, not furniture.
HEAD_LINES = 2
TAIL_LINES = 2

PAGE_RANGE_RE = re.compile(r"^(\d+)(?:\s*-\s*(\d+))?$")

# A printed page number: ``18``, ``**18**``, ``1 / 7``.
PAGE_NUMBER_RE = re.compile(r"^\*{0,2}\d+\*{0,2}(?:\s*/\s*\d+)?$")
PAGE_OF_RE = re.compile(r"^page\s+\d+(?:\s+of\s+\d+)?$", re.I)
# Any Unicode letter -- CJK included. Used to reject punctuation-only lines
# (a code fence, a lone brace) as running-header candidates: those repeat down
# the page edges of a code-heavy document and are structure, not furniture.
LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)

# A header/footer box is only believed when its text occurs on at least this
# fraction of the document's pages. A running header is on *most* pages; a
# table header is only on the pages that have that table.
FURNITURE_PAGE_FRACTION = 0.5
FURNITURE_MIN_PAGES = 3


def furniture_threshold(page_count: int) -> int:
    """How many pages a header/footer text must appear on to count as furniture."""
    return max(FURNITURE_MIN_PAGES, int(page_count * FURNITURE_PAGE_FRACTION))


def is_furniture(fragment: str, recurring: "Counter[str]", threshold: int) -> bool:
    """True if a header/footer box holds furniture rather than mislabelled content.

    The layout class is a hint, not ground truth, and trusting it on the text
    alone silently deletes content. Measured on this corpus:

    * Casey page 7: the body line ``and you can build it as a static website
      through`` is labelled ``page-header``.
    * Coupon page 4: the heading ``Api : ECAPI_APPLY_COUPON :`` likewise.
    * OCPP 1.6: the *table headers* ``**VALUE**`` and ``**Required/optional**
      required`` recur across pages, as does the sentence ``Status returned in
      response to GetCompositeSchedule.req.``

    So the class is only believed when a second signal agrees: the text is a
    printed page number, or it recurs on *most* of the document's pages. The
    fraction is what separates a running header (EVC's banner: 99 of 125 pages)
    from a table header that happens to repeat (OCPP's ``**VALUE**``: 4 of 116).
    Counting occurrences without that fraction deletes the table headers.
    """
    t = normalize_line(fragment)
    if not t:
        return True
    if PAGE_NUMBER_RE.match(t) or PAGE_OF_RE.match(t):
        return True
    return recurring[t] >= threshold


def header_footer_counts(chunks: list[dict]) -> "Counter[str]":
    """Count how often each header/footer text appears across the document."""
    counts: Counter[str] = Counter()
    for chunk in chunks:
        text = chunk.get("text") or ""
        for box in chunk.get("page_boxes") or []:
            if box.get("class") in DROPPED_BOX_CLASSES and box.get("pos"):
                start, end = box["pos"]
                counts[normalize_line(text[start:end])] += 1
    return counts


def normalize_line(line: str) -> str:
    """Collapse whitespace so lines can be compared across pages."""
    return re.sub(r"\s+", " ", line).strip()


def figure_marker(interior: str) -> str:
    """Marker for a figure, carrying whatever labels were read inside it."""
    cleaned = PICTURE_TEXT_RE.sub(" ", interior)
    cleaned = BR_RE.sub(" ", cleaned)
    cleaned = normalize_line(cleaned)
    if not cleaned:
        return FIGURE_MARKER
    if len(cleaned) > FIGURE_TEXT_MAX_CHARS:
        # Cut on a word boundary. Slicing mid-token *invents* identifiers that
        # look real -- FirmwareStatusNotification becomes FirmwareStatusN,
        # CorrelationId becomes Correlat -- and a corrupted identifier is worse
        # than a missing one: it is plausible, greppable, and reads as fact.
        # These are protocol specs; see "Faithful text" in EXTRACTION-HANDOFF.md.
        cut = cleaned[:FIGURE_TEXT_MAX_CHARS]
        if " " in cut:
            cut = cut[: cut.rfind(" ")]
        cleaned = cut.rstrip() + "..."
    return f"[figure: {cleaned}]"


def parse_pages_arg(spec: str) -> list[int]:
    """Parse a ``--pages`` spec like ``1-3,7,10-12`` into 1-based page numbers."""
    wanted: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        match = PAGE_RANGE_RE.match(part)
        if not match:
            raise argparse.ArgumentTypeError(
                f"bad page range {part!r}; expected N or N-M (e.g. 1-3,7)"
            )
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else start
        if start < 1 or end < start:
            raise argparse.ArgumentTypeError(f"bad page range {part!r}")
        wanted.extend(range(start, end + 1))
    return wanted


def boxes_to_context(
    chunk: dict, recurring: "Counter[str]", threshold: int, mark_figures: bool = True
) -> tuple[str, int]:
    """Rebuild one page's markdown from its layout boxes.

    pymupdf4llm labels every box and gives each a ``pos`` character range into
    the page text. Those ranges are contiguous and cover it exactly -- verified
    across this corpus, CJK documents included -- so walking them lets the
    furniture be dropped by *classification* instead of by pattern-matching the
    rendered text, which is what a last-line regex has to do and why running
    headers leak through one.

    Falls back to the untouched page text if ``pos`` is missing, so a future
    pymupdf4llm that renames the field degrades to "furniture not stripped"
    rather than to a silently empty document.
    """
    text = chunk.get("text") or ""
    boxes = chunk.get("page_boxes") or []
    if not boxes or any(b.get("pos") is None for b in boxes):
        return text, 0

    parts: list[str] = []
    figures = 0
    for box in boxes:
        cls = box.get("class")
        start, end = box["pos"]
        fragment = text[start:end]
        if cls == "picture":
            figures += 1
            # With markers off, the figure's own text is kept undecorated --
            # dropping it instead would silently lose the labels inside a
            # diagram, which on some pages is the only text there is.
            parts.append(
                f"\n\n{figure_marker(fragment)}\n\n" if mark_figures else fragment
            )
            continue
        if cls in DROPPED_BOX_CLASSES and is_furniture(fragment, recurring, threshold):
            continue
        parts.append(fragment)
    return "".join(parts), figures


def find_running_lines(contexts: list[str]) -> set[str]:
    """Find lines that repeat as page furniture across the document.

    This catches what the layout classes miss -- on the EVC protocol the
    "confidential" banner on every page arrives labelled ``text``, not
    ``page-header``. A line that sits at the very top or bottom of a third of
    the pages is furniture whatever the layout model called it.

    Returns normalised lines. Erring toward leaving a line in: a banner that
    survives is noise an LLM can skim past, whereas a content line wrongly
    removed is gone from every page at once.
    """
    if len(contexts) < RUNNING_LINE_MIN_PAGES:
        return set()

    seen: dict[str, set[int]] = {}
    for i, context in enumerate(contexts):
        lines = [line.strip() for line in context.splitlines() if line.strip()]
        for line in lines[:HEAD_LINES] + lines[-TAIL_LINES:]:
            # Letters required: a code fence (```` ``` ````) or a lone ``}``
            # repeats down the page edges of a code-heavy document and is
            # structure, not furniture. Stripping it would corrupt every page.
            # The figure marker is synthetic and never furniture either -- a
            # diagram-heavy document puts it near the top of every page, which
            # is exactly what this detector looks for.
            if line.startswith(FIGURE_MARKER_PREFIX):
                continue
            if len(line) <= RUNNING_LINE_MAX_CHARS and LETTER_RE.search(line):
                seen.setdefault(normalize_line(line), set()).add(i)

    threshold = max(
        RUNNING_LINE_MIN_PAGES, int(len(contexts) * RUNNING_LINE_PAGE_FRACTION)
    )
    return {line for line, pages in seen.items() if len(pages) >= threshold}


def strip_running_lines(context: str, running: set[str]) -> str:
    """Drop furniture lines from a page, at its edges only."""
    if not running:
        return context
    lines = context.splitlines()
    tail = len(lines) - TAIL_LINES
    return "\n".join(
        ""
        if (i < HEAD_LINES or i >= tail) and normalize_line(line) in running
        else line
        for i, line in enumerate(lines)
    )


class PageExtract(NamedTuple):
    """One PDF's pages, plus a note of what was stripped from them.

    ``pages`` is the whole payload and is handed straight to the caller; the
    dropped lines are a diagnostic, useful on stderr but not part of the data.
    """

    pages: list[dict]
    dropped_running_lines: list[str]


def parse_pdf(
    pdf: Path,
    pages: list[int] | None = None,
    use_ocr: bool = False,
    mark_figures: bool = True,
    drop_running: bool = True,
) -> PageExtract:
    """Return the page-keyed inventory for one PDF."""
    kwargs: dict = {
        "page_chunks": True,  # per-page dicts with metadata.page_number
        "show_progress": False,
        "use_ocr": use_ocr,
        # write_images stays off: figures are reported as a marker, not written.
    }
    if pages:
        kwargs["pages"] = [p - 1 for p in pages]  # pymupdf4llm takes 0-based
    if use_ocr:
        # Pin Tesseract. RapidOCR treats vector diagrams as text and pymupdf4llm
        # prefers it whenever Docling has installed it (see EXTRACTION-HANDOFF).
        from pymupdf4llm.ocr import tesseract_api

        kwargs["ocr_function"] = tesseract_api.exec_ocr

    chunks = pymupdf4llm.to_markdown(str(pdf), **kwargs)

    raw: list[str] = []
    page_numbers: list[int] = []
    recurring = header_footer_counts(chunks)
    threshold = furniture_threshold(len(chunks))
    for chunk in chunks:
        context, _ = boxes_to_context(chunk, recurring, threshold, mark_figures)
        raw.append(context)
        # pymupdf4llm 1.28 reports a 1-based metadata.page_number; keep a
        # fallback for the older 0-based "page" key.
        number = chunk.get("metadata", {}).get("page_number")
        if not isinstance(number, int):
            number = chunk.get("metadata", {}).get("page", 0) + 1
        page_numbers.append(number)

    # Count recurrences against the *unfiltered* page text, not the box-stripped
    # version. A banner the layout pass called page-header is already gone from
    # the latter, so counting there sees only the pages where it was labelled
    # plain text -- and strips it from those alone. Measured on the EVC
    # protocol, that left the banner on 26 of 125 pages, inconsistently, and
    # reported nothing. Counting on the original text sees all 99 occurrences
    # and removes it everywhere.
    running = (
        find_running_lines([c.get("text") or "" for c in chunks])
        if drop_running
        else set()
    )

    pages: list[dict] = []
    for number, context in zip(page_numbers, raw):
        context = strip_running_lines(context, running)
        context = re.sub(r"\n{3,}", "\n\n", context).strip()
        pages.append({"page": number, "context": context})

    return PageExtract(pages, sorted(running))


def find_pdfs(root: Path) -> list[Path]:
    return sorted(
        p for p in root.rglob("*.pdf") if ".venv" not in p.parts and p.is_file()
    )


def write_result(pages: list[dict], out: Path | None, as_jsonl: bool) -> None:
    """Write the pages. The payload is the array itself -- no wrapper object."""
    if as_jsonl:
        body = "\n".join(json.dumps(rec, ensure_ascii=False) for rec in pages)
    else:
        body = json.dumps(pages, ensure_ascii=False, indent=2)
    if out is None:
        print(body)
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Parse PDFs into per-page markdown chunks for LLM content inventory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage::")[-1].strip(),
    )
    parser.add_argument("path", type=Path, help="A PDF file, or a directory to search.")
    parser.add_argument(
        "--out",
        type=Path,
        help="Output file (single PDF) or directory (many). Default: stdout.",
    )
    parser.add_argument(
        "--jsonl",
        action="store_true",
        help="One JSON record per line, instead of a single JSON document.",
    )
    parser.add_argument(
        "--pages",
        type=parse_pages_arg,
        help="Only these pages, 1-based: e.g. 13-14 or 1-3,7.",
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        help="Run OCR (Tesseract) to recover text inside diagram images. Slower; "
        "not needed for an inventory.",
    )
    parser.add_argument(
        "--no-figures",
        action="store_true",
        help="Do not emit the [figure] marker for picture boxes.",
    )
    parser.add_argument(
        "--keep-running-headers",
        action="store_true",
        help="Keep repeated headers/footers instead of stripping them.",
    )
    args = parser.parse_args(argv)

    target = args.path.resolve()
    if target.is_file():
        pdfs = [target]
        per_pdf_out = False
    elif target.is_dir():
        pdfs = find_pdfs(target)
        # Keyed on the *input* being a directory, not on how many PDFs it holds:
        # a directory with a single PDF still needs --out to name a directory,
        # or that one document's JSON lands in a file named like a folder.
        per_pdf_out = True
    else:
        print(f"No such file or directory: {target}", file=sys.stderr)
        return 1

    if not pdfs:
        print(f"No PDFs found under {target}", file=sys.stderr)
        return 1

    if per_pdf_out and args.out is not None:
        args.out.mkdir(parents=True, exist_ok=True)

    failures: list[tuple[Path, str]] = []
    for pdf in pdfs:
        print(f"parse {pdf.name}", file=sys.stderr)
        try:
            result = parse_pdf(
                pdf,
                pages=args.pages,
                use_ocr=args.ocr,
                mark_figures=not args.no_figures,
                drop_running=not args.keep_running_headers,
            )
        except Exception as exc:  # keep going through the rest of the tree
            failures.append((pdf, f"{type(exc).__name__}: {exc}"))
            print(f"  FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue

        out = None
        if args.out is not None:
            suffix = ".pages.jsonl" if args.jsonl else ".pages.json"
            out = args.out / f"{pdf.stem}{suffix}" if per_pdf_out else args.out
        write_result(result.pages, out, args.jsonl)

        # Everything below is a diagnostic, and stays on stderr. It is not in
        # the payload: the output is exactly the {page, context} array, so
        # nothing here can be mistaken for part of the data.
        chars = sum(len(p["context"]) for p in result.pages)
        empty = sum(1 for p in result.pages if not p["context"])
        figures = sum(p["context"].count(FIGURE_MARKER_PREFIX) for p in result.pages)
        detail = [f"{len(result.pages)} pages", f"{chars:,} chars"]
        if figures:
            detail.append(f"{figures} figures")
        if empty:
            detail.append(f"{empty} empty")
        print(f"  {', '.join(detail)}" + (f" -> {out}" if out else ""), file=sys.stderr)
        for line in result.dropped_running_lines:
            print(f"  stripped running line: {line!r}", file=sys.stderr)

    if failures:
        print("\nFailed:", file=sys.stderr)
        for pdf, err in failures:
            print(f"  {pdf.name}: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
