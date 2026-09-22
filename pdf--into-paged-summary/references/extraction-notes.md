# Extraction notes

Measurements and traps behind the defaults in `templates/`. Everything here was
measured on an 8-PDF / 500-page corpus of technical specifications — badly
enough behaved to be a useful test, and not a representative one. Re-check the
constants elsewhere.

## What the corpus looked like

| document | pages | why it is a useful test |
|---|---|---|
| a protocol spec | 125 | borderless Word tables, a banner on every page labelled plain `text`, 30 diagrams |
| an API spec | 211 | scale; 51 diagrams whose only text is their labels |

Deliberately awkward cases worth reproducing if you tune this:

- **Borderless "simulated tables"** — authored in Word as space-and-colon aligned
  text with no ruling lines. `page.find_tables()` returns 0 under every strategy.
- **Vector diagrams** — `page.get_images()` sees only embedded rasters, so a
  naive figure pass collapses a document from 51 figures to 4.
- **CJK documents** — validate any text metric against one; Chinese does not use
  spaces, so space-based measures are meaningless there.

## Measured results

Over the 500-page corpus, **125,779 of 131,683 alphanumeric tokens survive
(95.5%)**, with 119 figures marked. Every loss is either page furniture or
markup inside a figure. Two clean documents lost **nothing**.

## Validation harness

Run after any change to the stripping logic:

```bash
.venv/bin/python - <<'PY'
import collections, re, sys
sys.path.insert(0, ".")
import pymupdf4llm, pdf_pages
from pathlib import Path

TOK = re.compile(r"[A-Za-z0-9]+")
tot_w = tot_g = 0
for f in sorted(Path(".").rglob("*.pdf")):
    if {".venv", ".mineru"} & set(f.parts): continue
    raw = pymupdf4llm.to_markdown(str(f), page_chunks=True, show_progress=False, use_ocr=False)
    res = pdf_pages.parse_pdf(f)
    want = collections.Counter(); got = collections.Counter()
    for c in raw: want += collections.Counter(TOK.findall(c["text"] or ""))
    for p in res.pages: got += collections.Counter(TOK.findall(p["context"]))
    tot_w += sum(want.values()); tot_g += sum(got.values())
    print(f"{f.name[:40]:42s} lost={(want-got).most_common(3)} added={(got-want).most_common(3)}")
print(f"\nTOTAL kept {tot_g:,} / {tot_w:,} = {100*tot_g/tot_w:.1f}%")
PY
```

`added` is the more sensitive signal. It should be `figure` and nothing else —
anything else means truncation is mangling tokens.

## Why strip by box classification

pymupdf4llm's layout pass labels every box (`text`, `section-header`, `picture`,
`page-header`, `page-footer`, `table`, …) and gives each a `pos` character range
into the page text. Those ranges are **contiguous and cover the page exactly**
(verified across the corpus, CJK included), so a page can be rebuilt from its
boxes and furniture dropped by classification.

This beats a last-line regex, which can drop a trailing page number but never a
running header. If `pos` is ever missing, `boxes_to_context()` returns the raw
page text — it degrades to "furniture not stripped", never to an empty page.

## Why the class alone is not enough

Trusting the label silently deletes content. Four measured cases:

| box said | actually was |
|---|---|
| `page-header` | a body line of prose |
| `page-header` | a section heading |
| `page-footer` | a JSON document's outermost `}` |
| `page-header`/`page-footer` | table headers (`**VALUE**`, `**Required/optional** required`) |

So a header/footer box is dropped only when a second signal agrees: the text is
a printed page number, **or** it recurs on most of the document's pages.

The fraction is doing real work. A running header is on most pages (99 of 125 in
one document). A table header recurs too — but only on the pages that have that
table (4 of 116 in another). Counting occurrences *without* the fraction deletes
the table headers. That is not hypothetical; an earlier revision did exactly
that.

## Order of operations

Two mechanisms remove furniture:

1. `boxes_to_context()` — drops boxes the layout pass labelled header/footer
2. `find_running_lines()` — catches banners the layout pass labelled plain `text`

**Mechanism 2 must count recurrences against the unfiltered page text.** It was
originally counting on mechanism 1's output, so it saw only the pages where the
banner was mislabelled — the rest had already been removed — and fell under
threshold. Result: the banner survived on 26 of 125 pages, and inconsistently.
Counting before mechanism 1 runs sees all 99 occurrences and removes it
everywhere.

## Figure markers

A `picture` box becomes `[figure]`, or `[figure: <labels>]` when text was read
inside the diagram. Keep the labels: some diagrams' only text *is* their labels,
so a bare `[figure]` makes those pages unfindable.

The label text is capped at 400 characters, **cut on a word boundary**. The cap
was measured — the median figure carries ~170 characters, so a smaller cap was
truncating half of them for nothing. The word boundary is not cosmetic: slicing
mid-token invents identifiers (`FirmwareStatusNotification` → `FirmwareStatusN`,
`CorrelationId` → `Correlat`) that are plausible, greppable, and wrong. On a
specification that is the worst available failure mode.

## OCR stays off

OCR exists to recover text baked into diagram images, which an inventory does not
need, and it cost **3 characters out of 1,613** on the page measured — while
being far slower.

There is a live trap if you turn it on. Installing Docling pulls **RapidOCR**,
which pymupdf4llm then *prefers* over Tesseract, and RapidOCR reads vector
diagrams as text. `--ocr` pins Tesseract explicitly to avoid this. Measured
effect of letting RapidOCR win: one document's figures collapsed from 30 to 7,
and a graph became a garbled heading.

## Traps that cost time

- **A code fence (` ``` `) repeats at page edges** in code-heavy documents and is
  structure, not furniture. Running-line candidates must contain a letter.
- **Figure markers repeat too.** A diagram-heavy document puts `[figure]` near the
  top of most pages — exactly what a running-line detector looks for. Exclude it.
- **Rows are not in document order.** If you ever fall back to geometry: sort by
  x within a y-cluster, because fragments on one visual row differ slightly in y.
- **Page numbering.** `metadata["page_number"]` is 1-based (pymupdf4llm 1.28);
  the older `metadata["page"]` is 0-based.
- **`--out` with a directory input is a directory**, even when that directory
  holds a single PDF.

## Things that were tried and rejected

Recorded so they are not re-attempted. All were measured on the same corpus, and
all failed on borderless Word-authored tables — the region simply is not detected
as a table by any layout model, so tuning the table model cannot help.

| engine | outcome |
|---|---|
| MarkItDown | detects the borderless tables natively, but emits **0 headings** where pymupdf4llm emits 421, and glues words whose breaks live in glyph position |
| Docling (TableFormer) | clean on real ruled tables; on borderless ones the layout stage usually does not tag them `Table`, so TableFormer never gets a crop. `do_cell_matching=False` hallucinates hundreds of rows — do not retry |
| MinerU | same miss; the VLM tier additionally **renamed an identifier** (`recurrencyKind` → `recurrenceKind`) |
| `table_strategy="text"` in pymupdf4llm | byte-identical output to the default — no help |
| `pymupdf4llm` `footer=False` | unsafe: one document mislabels a JSON `}` as a page footer, and the flag deletes it |

The general lesson: when a region is not detected as a table, changing the table
model changes nothing. Geometry-based reconstruction can work, but it is a large
amount of custom code for structure an LLM summary does not read.
