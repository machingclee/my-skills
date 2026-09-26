import os
from openai import AzureOpenAI, OpenAI
from pydantic import BaseModel, Field, ValidationError
from pathlib import Path
import frontmatter
import re
import time
import json
import math
from typing import TypedDict
from tqdm import tqdm

from env import load_env, pg_connect
from article_fingerprint import content_hash_for, source_path_for

load_env()

# Encoded diagrams.net / draw.io URLs paste the whole mxfile (or a deflated #R
# blob) into the markdown link. DeepSeek then has to echo that as JSON
# original_text, hits the output cap, and returns unterminated JSON.
_ENCODED_DIAGRAM_MIN_LEN = 800
_DIAGRAM_PAYLOAD_HINT = re.compile(
    r"diagrams\.net|draw\.io|mxfile|%3Cmxfile|#R",
    re.IGNORECASE,
)
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((https?://[^)]+)\)")
_BARE_URL_RE = re.compile(r"(?<!\()(https?://[^\s)]+)")


def is_encoded_diagram_url(url: str) -> bool:
    return len(url) >= _ENCODED_DIAGRAM_MIN_LEN and bool(
        _DIAGRAM_PAYLOAD_HINT.search(url)
    )


def shorten_diagram_url(url: str) -> str:
    """Keep query params (title, etc.) but drop the encoded #R / #U payload."""
    for marker in ("#R", "#U"):
        cut = url.find(marker)
        if cut != -1:
            return url[:cut]
    return url[:240].rstrip("&?") + "…"


def strip_encoded_diagram_payloads(text: str) -> tuple[str, int]:
    """Replace giant encoded draw.io URLs with a short stub.

    Returns (cleaned_text, number of payloads stripped).
    """
    stripped = 0

    def repl_md(match: re.Match[str]) -> str:
        nonlocal stripped
        label, url = match.group(1), match.group(2)
        if not is_encoded_diagram_url(url):
            return match.group(0)
        stripped += 1
        return (
            f"[{label}]({shorten_diagram_url(url)}) "
            "[encoded draw.io diagram omitted]"
        )

    cleaned = _MD_LINK_RE.sub(repl_md, text)

    def repl_bare(match: re.Match[str]) -> str:
        nonlocal stripped
        url = match.group(1)
        if not is_encoded_diagram_url(url):
            return url
        stripped += 1
        return f"{shorten_diagram_url(url)} [encoded draw.io diagram omitted]"

    cleaned = _BARE_URL_RE.sub(repl_bare, cleaned)
    return cleaned, stripped


# Summariser section headings, e.g. `## p1`, `## p13-16`. These are the LLM's
# grouping of the PDF — the page range a reader should open.
SECTION_HEADING_RE = re.compile(
    r"^## p(\d+)(?:-(\d+))?[ \t]*$",
    re.MULTILINE | re.IGNORECASE,
)

# Extraction markers from pdf_pages.py. They name the printed page a fragment
# starts on, which is more precise than the heading range but is not the
# summariser's grouping. Stored separately as metadata "page".
PAGE_MARKER_RE = re.compile(r"<!--\s*page\s+(\d+)\s*-->", re.IGNORECASE)


def build_section_index(text: str) -> list[tuple[int, str]]:
    """[(char offset, '1-6' | '14')] for every `## pN` / `## pN-M` heading."""
    index: list[tuple[int, str]] = []
    for m in SECTION_HEADING_RE.finditer(text):
        first, last = m.group(1), m.group(2)
        index.append((m.start(), f"{first}-{last}" if last else first))
    return index


def _range_bounds(page_range: str) -> tuple[int, int] | None:
    token = (page_range or "").strip()
    if not token:
        return None
    parts = token.split("-", 1)
    try:
        lo = int(parts[0])
        hi = int(parts[1]) if len(parts) == 2 else lo
    except ValueError:
        return None
    return (lo, hi) if lo <= hi else (hi, lo)


def page_range_for(text: str, original_text: str, index: list[tuple[int, str]]) -> str:
    """The summariser section a chunk sits in — "7-10", "7", or "".

    Locate the chunk in the source, then read the last `## pN-M` heading at or
    before each end. A chunk that only contains fenced original_text still
    resolves, because that fence lives under its section heading. If the chunk
    straddles two sections (overlap), the two ranges are merged.
    """
    if not index or not original_text:
        return ""

    start = text.find(original_text)
    if start < 0:
        probe = original_text[:200]
        start = text.find(probe)
        if start < 0:
            return ""
        end = start + len(probe)
    else:
        end = start + len(original_text)

    def range_at(offset: int) -> str:
        rng = ""
        for position, value in index:
            if position > offset:
                break
            rng = value
        return rng

    first = range_at(start)
    last = range_at(max(start, end - 1))
    if not first:
        return ""
    if not last or last == first:
        return first
    a = _range_bounds(first)
    b = _range_bounds(last)
    if a is None:
        return first
    if b is None:
        return first
    lo, hi = min(a[0], b[0]), max(a[1], b[1])
    return str(lo) if lo == hi else f"{lo}-{hi}"


def exact_page_for(original_text: str, source_text: str = "") -> str:
    """Printed page this fragment starts on, or "".

    Prefer the first `<!-- page N -->` still inside the chunk. The chunker often
    drops those comments, so fall back to the last marker in the source at or
    before this text. That is the same positional rule as headings, but on
    extraction markers — optional precision, not the section range.
    """
    m = PAGE_MARKER_RE.search(original_text or "")
    if m:
        return m.group(1)
    if not source_text or not original_text:
        return ""
    start = source_text.find(original_text)
    if start < 0:
        probe = original_text[:200]
        start = source_text.find(probe)
        if start < 0:
            return ""
    page = ""
    for m in PAGE_MARKER_RE.finditer(source_text):
        if m.start() > start:
            break
        page = m.group(1)
    return page


class CustomDocument(TypedDict):
    tags: str
    title: str
    text: str
    slug: str
    source_path: str
    content_hash: str
    # Optional link to the source PDF in the repo's files/ dir, straight from the
    # frontmatter `pdf-filepath` key. Stored in metadata as "pdf-filepath".
    pdf_filepath: str


class Result(BaseModel):
    page_content: str
    metadata: dict


class Chunk(BaseModel):
    headline: str = Field(
        description="A brief heading for this chunk, typically a few words, that is most likely to be surfaced in a query. This headline must be in English")
    summary: str = Field(
        description="A few sentences summarizing the content of this chunk to answer common questions, this summary must be in English")
    original_text: str = Field(
        description="The original text of this chunk from the provided document, exactly as is, not changed in any way")

    def as_result(self, document, section_index: list[tuple[int, str]] | None = None):
        metadata = {
            "title": document["title"],
            "tags": document["tags"],
            "slug": document.get("slug") or "",
            "source_path": document.get("source_path") or "",
            "content_hash": document.get("content_hash") or "",
            "pdf-filepath": document.get("pdf_filepath") or "",
            "page_range": page_range_for(
                document.get("text") or "", self.original_text, section_index or []
            ),
            "page": exact_page_for(
                self.original_text, document.get("text") or ""
            ),
        }
        return Result(page_content=self.headline + "\n\n" + self.summary + "\n\n" + self.original_text, metadata=metadata)


class Chunks(BaseModel):
    chunks: list[Chunk]


class ArticleInjector:
    """Inject new articles into PostgreSQL vector database"""

    def __init__(self, average_chunk_size: int = 2500):
        self.conn = pg_connect()

        # Azure embeddings only — same ada-002 space as the AgentCore query embed.
        self.embedding_client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_API_VERSION"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            timeout=60.0 * 20
        )

        # DeepSeek V4 Flash for semantic chunking (chat / structured JSON).
        deepseek_key = os.getenv("DEEPSEEK_API_KEY")
        if not deepseek_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY is not set. Add it to the repo-root .env "
                "so local inject/update skills can chunk with DeepSeek."
            )
        self.chunk_client = OpenAI(
            api_key=deepseek_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout=60.0 * 20,
        )

        self.embedding_model = "text-embedding-ada-002"
        self.chunk_model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
        self.average_chunk_size = average_chunk_size

    def get_tags_and_title_from_blogpost(self, filepath: str) -> tuple[str, str, str]:
        try:
            blog_post = frontmatter.load(filepath)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
            raise

        tags = blog_post.get("tags") or blog_post.get("tag", "")
        title = blog_post.get("title", "")
        slug = str(blog_post.get("slug") or "").strip()
        if not slug:
            stem = Path(filepath).stem
            slug = re.sub(r"^\d+[._-]", "", stem).lower()
            slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")

        if isinstance(tags, list):
            tags = ",".join(sorted(str(t).strip() for t in tags if str(t).strip()))
        elif isinstance(tags, str) and "," in tags:
            tags = ",".join(sorted([t.strip() for t in tags.split(",")]))
        return tags, title, slug

    def load_document(self, filepath: str) -> CustomDocument:
        """Load a single markdown file and return as CustomDocument"""
        blog_post = frontmatter.load(filepath)
        tags, title, slug = self.get_tags_and_title_from_blogpost(filepath)

        # Get content without frontmatter
        text = blog_post.content

        # Remove <style>...</style> blocks (including multiline)
        text = re.sub(r'<style[^>]*>.*?</style>', '',
                      text, flags=re.DOTALL | re.IGNORECASE)

        # Clean up extra whitespace
        text = text.strip()
        source_path = source_path_for(filepath)
        pdf_filepath = str(blog_post.get("pdf-filepath") or "").strip()
        # A space in the filename terminates a markdown link destination, so
        # files/ PDFs are hyphenated. Refuse to store a path that would break
        # the citation chip.
        if " " in pdf_filepath:
            raise ValueError(
                f"{filepath}: pdf-filepath must not contain spaces "
                f"(got {pdf_filepath!r}); hyphenate the filename in files/."
            )

        return CustomDocument(
            tags=tags,
            title=title,
            text=text,
            slug=slug,
            source_path=source_path,
            content_hash=content_hash_for(filepath, source_path),
            pdf_filepath=pdf_filepath,
        )

    def make_user_prompt(self, document: CustomDocument):
        how_many = (len(document["text"]) // self.average_chunk_size) + 1
        return f"""
            You take a document and you split the document into overlapping chunks for a KnowledgeBase.

            The document is from {{DOMAIN_DESCRIPTION}}.
            The document is of tags: {document["tags"]}
            The document has title: {document["title"]}

            A chatbot will use these chunks to answer questions about the articles and retrieve a related list of articles for the reader.
            You should divide up the document as you see fit, being sure that the entire document is returned in the chunks - don't leave anything out.
            This document should probably be split into {how_many} chunks, but you can have more or less as appropriate.
            There should be overlap between the chunks as appropriate; typically about 25% overlap or about 50 words, so you have the same text in multiple chunks for best retrieval results.

            For each chunk, you should provide a headline, a summary, and the original text of the chunk.
            Together your chunks should represent the entire document with overlap.

            Here is the document:

            {document["text"]}

            Respond with the chunks.
        """

    def _parse_chunks_json(self, content: str) -> list[Chunk]:
        text = (content or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        payload = json.loads(text)
        if isinstance(payload, list):
            payload = {"chunks": payload}
        chunks = payload.get("chunks", payload)
        normalized = []
        for item in chunks:
            if isinstance(item, str):
                normalized.append({
                    "headline": item[:80],
                    "summary": item,
                    "original_text": item,
                })
            else:
                normalized.append(item)
        return Chunks.model_validate({"chunks": normalized}).chunks

    def _request_chunks(self, messages: list[dict]) -> list[Chunk]:
        """Chunk via DeepSeek json_object (V4 Flash has no json_schema parse)."""
        response = self.chunk_client.chat.completions.create(
            model=self.chunk_model,
            messages=messages,
            response_format={"type": "json_object"},
            timeout=30 * 60,
            extra_body={"thinking": {"type": "disabled"}},
        )
        return self._parse_chunks_json(response.choices[0].message.content)

    def _fallback_chunks(self, document: CustomDocument) -> list[Result]:
        """Split without the LLM when DeepSeek JSON is truncated or skipped."""
        text = document["text"] or document["title"]
        size = self.average_chunk_size
        overlap = max(200, size // 4)
        results: list[Result] = []
        index = build_section_index(text)
        start = 0
        part = 0
        while start < len(text):
            end = min(start + size, len(text))
            part += 1
            chunk = Chunk(
                headline=f"{document['title']} (part {part})",
                summary=f"Excerpt from {document['title']}.",
                original_text=text[start:end],
            )
            results.append(chunk.as_result(document, index))
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
        print(f"Fallback splitter created {len(results)} chunks")
        return results

    def _diagram_chunks(self, document: CustomDocument) -> list[Result]:
        """One searchable chunk for a draw.io article after the encoded blob is gone."""
        chunk = Chunk(
            headline=document["title"],
            summary=(
                f"{document['title']} is a draw.io / diagrams.net article. "
                "The encoded diagram XML was omitted; editable and viewer links remain."
            ),
            original_text=document["text"] or document["title"],
        )
        print("Skipped LLM chunker for encoded draw.io payload")
        return [chunk.as_result(document, build_section_index(document["text"] or ""))]

    def process_document(self, document: CustomDocument) -> list[Result]:
        """Process document into chunks using DeepSeek with retry on timeout / truncated JSON.

        Long articles are split first: the chunker copies original_text into JSON, so a
        ~32k-char post plus overlap exceeds DeepSeek's output cap and comes back as
        unterminated JSON.

        Encoded draw.io / diagrams.net URL payloads are stripped and never sent to
        the LLM — echoing a 4k–12k #R blob as JSON original_text always truncates.
        """
        cleaned, n_payloads = strip_encoded_diagram_payloads(document["text"])
        if n_payloads:
            print(
                f"Stripped {n_payloads} encoded draw.io payload(s); "
                "skipping LLM chunker"
            )
            diagram_doc = CustomDocument(
                tags=document["tags"],
                title=document["title"],
                text=cleaned.strip() or document["title"],
                slug=document.get("slug") or "",
                source_path=document.get("source_path") or "",
                content_hash=document.get("content_hash") or "",
                pdf_filepath=document.get("pdf_filepath") or "",
            )
            return self._diagram_chunks(diagram_doc)

        max_part_chars = 14000
        overlap_chars = 400
        text = document["text"]
        if len(text) <= max_part_chars:
            return self._chunk_document(document)

        # The loop advances by `step` per iteration and the last one clips at
        # len(text), so the total is known before any model call -- which is what
        # lets the bar below show a real ETA rather than just a running count.
        step = max_part_chars - overlap_chars
        total_parts = 1 + math.ceil((len(text) - max_part_chars) / step)
        label = document["title"][:38]
        print(f"Splitting long article into {total_parts} parts ({len(text):,} chars)")

        results: list[Result] = []
        start = 0
        part_idx = 0
        # leave=True so each article closes with one summary line in the log
        # (elapsed + s/part) instead of a trail of bar redraws.
        with tqdm(total=total_parts, desc=f"  {label}", unit="part", leave=True) as bar:
            while start < len(text):
                end = min(start + max_part_chars, len(text))
                part_idx += 1
                part_doc = CustomDocument(
                    tags=document["tags"],
                    title=document["title"],
                    text=text[start:end],
                    slug=document.get("slug") or "",
                    source_path=document.get("source_path") or "",
                    content_hash=document.get("content_hash") or "",
                    pdf_filepath=document.get("pdf_filepath") or "",
                )
                results.extend(self._chunk_document(part_doc))
                bar.update(1)
                if end >= len(text):
                    break
                start = end - overlap_chars
        return results

    def _chunk_document(self, document: CustomDocument) -> list[Result]:
        """Chunk one (possibly already-split) document via DeepSeek."""
        messages = [
            {
                "role": "system",
                "content": (
                    "You split documents into overlapping knowledge-base chunks. "
                    "Respond with a single JSON object of the form "
                    '{"chunks":[{"headline":"...","summary":"...","original_text":"..."}]}. '
                    "headline and summary must be English. original_text must be copied "
                    "verbatim from the document. Do not wrap the JSON in markdown fences."
                ),
            },
            {"role": "user", "content": self.make_user_prompt(document)},
        ]

        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(
                    f"Processing document with {self.chunk_model} "
                    f"(attempt {attempt + 1}/{max_retries})...")
                doc_as_chunks = self._request_chunks(messages)
                index = build_section_index(document["text"] or "")
                return [chunk.as_result(document, index) for chunk in doc_as_chunks]
            except Exception as e:
                error_msg = str(e).lower()
                # ValidationError is a syntactically valid response whose chunks
                # are missing fields -- the same class of transient model
                # misbehaviour as truncated JSON, so it retries rather than
                # aborting the run mid-article.
                retryable = (
                    "timeout" in error_msg
                    or "timed out" in error_msg
                    or "unterminated string" in error_msg
                    or isinstance(e, json.JSONDecodeError)
                    or isinstance(e, ValidationError)
                )
                if retryable and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 30  # 30s, 60s, 90s
                    print(f"Chunker error ({e}), retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                elif retryable:
                    print(
                        f"Chunker failed after {max_retries} attempts ({e}); "
                        "using fallback splitter"
                    )
                    return self._fallback_chunks(document)
                else:
                    raise

    def create_embeddings_batched(self, texts: list[str], batch_size: int = 50) -> list[list[float]]:
        """Create embeddings in batches to avoid rate limits"""
        all_embeddings = []

        for i in tqdm(range(0, len(texts), batch_size), desc="Creating embeddings"):
            batch = texts[i:i + batch_size]

            try:
                response = self.embedding_client.embeddings.create(
                    model=self.embedding_model,
                    input=batch
                )
                all_embeddings.extend([e.embedding for e in response.data])
            except Exception as e:
                if "rate limit" in str(e).lower():
                    print(f"Rate limit hit, waiting 60 seconds...")
                    time.sleep(60)
                    # Retry the same batch
                    response = self.embedding_client.embeddings.create(
                        model=self.embedding_model,
                        input=batch
                    )
                    all_embeddings.extend([e.embedding for e in response.data])
                else:
                    raise

            # Add delay between batches to avoid rate limits
            if i + batch_size < len(texts):
                time.sleep(2)

        return all_embeddings

    def reconnect(self):
        """Reconnect to PostgreSQL if connection is closed"""
        try:
            self.conn.close()
        except:
            pass

        self.conn = pg_connect()
        print("Reconnected to PostgreSQL")

    def clean_text(self, text):
        """Remove null bytes and other problematic characters"""
        if text is None:
            return ""
        return text.replace('\x00', '')

    def get_next_id(self) -> int:
        """Get the next available ID from PostgreSQL"""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 FROM embeddings WHERE id ~ '^[0-9]+$'")
        next_id = cur.fetchone()[0]
        return next_id

    def insert_embedding(self, cur, doc_id: str, cleaned_doc: str, cleaned_metadata: dict, embedding: list[float]):
        """Insert or update a single embedding in the database"""
        cur.execute(
            """
            INSERT INTO embeddings (id, content, metadata, embedding)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET content = EXCLUDED.content,
                metadata = EXCLUDED.metadata,
                embedding = EXCLUDED.embedding
            """,
            (doc_id, cleaned_doc, json.dumps(cleaned_metadata), embedding)
        )

    def _is_wip(self, filepath: str) -> bool:
        """Check if the article has wip: true in frontmatter"""
        try:
            post = frontmatter.load(filepath)
            wip = post.get("wip", False)
            if isinstance(wip, str):
                wip = wip.lower() in ("true", "yes")
            return bool(wip)
        except Exception:
            return False

    def inject_article(self, filepath: str):
        """
        Load a markdown article, chunk it, create embeddings, and insert into PostgreSQL

        Args:
            filepath: Absolute path to the markdown file
        """
        print(f"Loading article from: {filepath}")

        # Check for wip
        if self._is_wip(filepath):
            print("SKIPPED: article has wip: true")
            return

        # Get starting ID
        print(f"Getting Starting ID ...")
        start_id = self.get_next_id()
        print(f"Starting ID: {start_id}")

        # Load document
        document = self.load_document(filepath)
        print(f"Title: {document['title']}")
        print(f"Tags: {document['tags']}")
        print(f"Path: {document['source_path']}")
        print(f"Hash: {document['content_hash']}")

        # Process into chunks
        print("Processing document into chunks...")
        chunks = self.process_document(document)
        print(f"Created {len(chunks)} chunks")

        # Create embeddings
        texts = [chunk.page_content for chunk in chunks]
        vectors = self.create_embeddings_batched(texts, batch_size=50)

        # Insert into PostgreSQL
        cur = self.conn.cursor()

        for i, (chunk, embedding) in enumerate(zip(chunks, vectors)):
            doc_id = str(start_id + i)
            cleaned_doc = self.clean_text(chunk.page_content)

            # Clean metadata values if they're strings
            cleaned_metadata = {}
            for key, value in chunk.metadata.items():
                if isinstance(value, str):
                    cleaned_metadata[key] = self.clean_text(value)
                else:
                    cleaned_metadata[key] = value

            try:
                self.insert_embedding(
                    cur, doc_id, cleaned_doc, cleaned_metadata, embedding
                )
            except Exception as e:
                error_msg = str(e).lower()
                # Check for any connection-related errors
                is_connection_error = any(keyword in error_msg for keyword in [
                    "connection", "closed", "ssl", "timeout", "network"
                ])

                if is_connection_error:
                    print(
                        f"Connection error: {e}")
                    print(f"Reconnecting and retrying chunk {i}...")
                    self.reconnect()
                    cur = self.conn.cursor()
                    try:
                        self.insert_embedding(
                            cur, doc_id, cleaned_doc, cleaned_metadata, embedding
                        )
                        print(
                            f"Successfully inserted chunk {i} after reconnect")
                    except Exception as retry_error:
                        print(
                            f"Error inserting chunk {i} after reconnect: {retry_error}")
                        continue
                else:
                    print(f"Error inserting chunk {i} (id: {doc_id}): {e}")
                    self.conn.rollback()
                    continue

        self.conn.commit()
        print(f"Successfully injected {len(chunks)} chunks into PostgreSQL")

        # Verify
        cur.execute("SELECT COUNT(*) FROM embeddings")
        total = cur.fetchone()[0]
        print(f"Total documents in database: {total}")

    def close(self):
        """Close database connection"""
        self.conn.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: uv run step3_inject_new_article.py <path_to_markdown_file>")
        sys.exit(1)

    filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(f"Error: File not found: {filepath}")
        sys.exit(1)

    injector = ArticleInjector(average_chunk_size=2500)

    try:
        injector.inject_article(filepath)
    finally:
        injector.close()
