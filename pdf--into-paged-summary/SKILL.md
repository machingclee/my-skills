---
name: pdf--into-paged-summary
description: >-
  Turn a PDF corpus into per-page JSON and then into a markdown summary: one
  section per page range, each carrying a model-written summary plus the exact
  original text. Two bundled scripts, pdf_pages.py (PDF -> {page, context}[]
  JSON) and summarize_pages.py (JSON -> markdown). Use when the user wants to
  index, inventory, summarize, or RAG-prepare a set of PDFs, asks "which pages
  cover what", wants a per-page/per-section digest of a long document, or finds
  full-fidelity PDF-to-markdown conversion unreliable.
---

# PDF → per-page JSON → paged summary

Two stages, each usable alone:

```
a.pdf  ──pdf_pages.py──▶  a.pages.json  ──summarize_pages.py──▶  a.summary.md
        {page, context}[]                ## p13-16 / ### summary
                                         ### original_text
```

## Mandatory Trigger

Invoke this skill when the user asks to:

- "summarize this PDF" / "summarize these PDFs"
- "make a per-page index" / "which pages cover what"
- "prepare these PDFs for RAG" / "chunk this PDF"
- "convert PDF to markdown" and full-fidelity conversion has already failed or is not needed
- anything producing `{page, context}[]` or a `## pN-M` summary document

## Why not full-fidelity PDF → markdown

Converting a whole PDF into *good* markdown is a losing game on real corpora.
Borderless Word tables, vector diagrams, running headers and unreliable heading
levels each need their own repair, and the repairs fight each other. Four
engines were measured against that bar and each failed a different document.

Stage 1 aims lower deliberately: a page-keyed, readable-enough markdown string.
That removes OCR, image extraction and table repair entirely — see
`references/extraction-notes.md` for what was measured and why.

## Setup

```bash
uv add pymupdf4llm litellm python-dotenv      # or pip install
```

Copy both scripts from `templates/` into the project — anywhere, including a
`scripts/` subfolder. They are standalone; `summarize_pages.py` does not import
`pdf_pages.py`.

**If the project already has a `.env`, that is all the setup there is.** No key
needs to be passed on the command line. The key is searched for in this order:

1. the shell environment
2. `.env` beside the script
3. `.env` in the working directory, or **any parent of it**

So running `python scripts/summarize_pages.py …` from the project root picks up
a `.env` at that root. A variable exported in the shell always wins — dotenv
does not override — which also means a stale exported key silently shadows the
file; `env -u DEEPSEEK_API_KEY` if a changed key seems to have no effect.

Variable names must be the standard ones litellm reads — `DEEPSEEK_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AZURE_API_KEY`. A key
under a house name loads fine but is invisible to litellm, surfacing as "no
credentials found", which looks like a model problem rather than a config one.

If no key is found, the script says so and lists exactly what it looked for.

`.env` must be gitignored.

## Stage 1 — PDF to page JSON

```bash
uv run python pdf_pages.py spec.pdf --out spec.json   # one PDF -> one JSON
uv run python pdf_pages.py . --out pages              # every PDF -> one JSON each
```

The payload is the array itself — no wrapper object:

```json
[{"page": 1, "context": "# Title\n\n..."},
 {"page": 2, "context": "..."}]
```

`page` is 1-based and matches the printed page number where the PDF has one.
`--jsonl` gives one record per line.

Everything that is not data — page and character counts, and the running lines
that were stripped — goes to **stderr**, so nothing in the payload can be
mistaken for content.

Useful flags: `--pages 13-14` (1-based range), `--ocr` (off by default; see
below), `--no-figures`, `--keep-running-headers`.

## Stage 2 — page JSON to summary markdown

```bash
uv run python summarize_pages.py pages --out summaries
uv run python summarize_pages.py pages --model azure/gpt-4o --jobs 8
```

`--model` is optional: with none given, the script infers a **cheap** model from
whichever provider key is present (`DEEPSEEK_API_KEY` → `deepseek/deepseek-chat`,
and so on). Cheap is the right default — this runs once per page range, 140
calls on a 500-page corpus. `$SUMMARIZE_MODEL` overrides the table; `--model`
overrides everything.

Azure has no inferred default on purpose: it needs a deployment name and
endpoint that cannot be guessed from a key, so name it explicitly.

Output is one markdown file per input, in exactly this shape:

```markdown
## p13-16

### summary

- Three worked charging-profile examples.
- Profile 2 is a TxDefaultProfile that recurs daily at 07:00.
- Both examples use the same `connectorId` 1 but differ in `stackLevel`.

### original_text

```markdown
<!-- page 13 -->
E.g 1. Assume the Charge Point consist three Charging Profile
...
```
```

Three format decisions worth keeping:

- **`summary` is a bullet list, not a paragraph.** 2-5 one-line bullets, no
  nesting, each written to stand on its own. The summary is what gets quoted
  and embedded downstream, and a paragraph is one blob whose meaning lives in
  the whole of it — a reader meeting a single line in a search result learns
  nothing from "The following section describes …". The first bullet names the
  kind of content so a range is still classifiable from its opening line.
- **`original_text` is fenced, not inlined.** The page text carries its own `#`
  headings; inlined under `### original_text`, those would become siblings of
  the `##` ranges and destroy the document structure. The fence is sized to the
  content, so text that itself contains ``` cannot close it early.
- **Pages group by a character budget** (`--budget`, default 8000), never
  splitting a page. A page over budget becomes a range of its own rather than
  being truncated.

Summaries are cached in `.summary-cache.json` beside the output, keyed by
model + prompt + text, so a re-run costs nothing for work already done. Bump
`PROMPT_VERSION` in the script when you change the prompt, or the cache will
serve summaries written under the old instructions.

## Verify before trusting the output

Do not eyeball this. Token-multiset diff every page against the raw pymupdf4llm
text — the harness is in `references/extraction-notes.md`.

- `added` should contain **only** `figure`. Anything else means text is being
  invented, and truncation mid-token is the usual cause (`CorrelationId` →
  `Correlat` reads as a real identifier but is not).
- Losses should be page furniture and figure markup. A loss of ordinary prose
  means the furniture detector is over-firing.

## Constants that must be re-checked on a new corpus

These were tuned against a specific 8-PDF / 500-page corpus. They are not
derived from first principles — test them before trusting them:

| constant | file | what it does |
|---|---|---|
| `FURNITURE_PAGE_FRACTION = 0.5` | `pdf_pages.py` | how often a header/footer must recur before it is stripped |
| `RUNNING_LINE_PAGE_FRACTION = 0.3` | `pdf_pages.py` | same, for banners the layout pass did not label |
| `FIGURE_TEXT_MAX_CHARS = 400` | `pdf_pages.py` | cap on labels read inside a diagram |
| `CHUNK_CHAR_BUDGET = 8000` | `summarize_pages.py` | characters per page range |

Raising a furniture threshold errs toward keeping noise; lowering it errs toward
deleting content. Prefer keeping noise: a banner an LLM skims past is cheap, a
content line removed is gone from every page at once.

## Gotchas

The non-obvious ones, in short — full detail and measurements in
`references/extraction-notes.md`:

- **Layout box classes are hints, not ground truth.** Boxes labelled
  `page-header`/`page-footer` have contained body text, headings, and a JSON
  document's closing brace. Only strip when a second signal agrees (it is a page
  number, or it recurs on most pages).
- **Recurrence must be a fraction, not a count.** A table header recurs across
  the pages that have that table; a running banner recurs on nearly all of them.
  Counting without the fraction deletes the table headers.
- **Count recurrences before the other stripper runs.** Two mechanisms remove
  furniture; taking one's count after the other has already removed its share
  makes the survivor fall under threshold and nothing gets stripped.
- **Never strip a line just because it repeats** — a code fence (```` ``` ````) or
  a figure marker repeats down a code-heavy or diagram-heavy document and is
  structure.
- **Cut figure text on word boundaries.** Slicing mid-token invents identifiers.
- **`page_boxes` may lack `pos`** — the scripts fall back to unfiltered text
  rather than emitting empty pages.
