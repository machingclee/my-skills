import os
from openai import AzureOpenAI, OpenAI
from pydantic import BaseModel, Field
from pathlib import Path
import frontmatter
import re
import time
import json
from typing import TypedDict
from tqdm import tqdm

from env import load_env, pg_connect

load_env()


class CustomDocument(TypedDict):
    tags: str
    title: str
    text: str
    slug: str


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

    def as_result(self, document):
        metadata = {
            "title": document["title"],
            "tags": document["tags"],
            "slug": document.get("slug") or "",
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

        return CustomDocument(tags=tags, title=title, text=text, slug=slug)

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

    def process_document(self, document: CustomDocument) -> list[Result]:
        """Process document into chunks using DeepSeek with retry on timeout / truncated JSON.

        Long articles are split first: the chunker copies original_text into JSON, so a
        ~32k-char post plus overlap exceeds DeepSeek's output cap and comes back as
        unterminated JSON.
        """
        max_part_chars = 14000
        overlap_chars = 400
        text = document["text"]
        if len(text) <= max_part_chars:
            return self._chunk_document(document)

        results: list[Result] = []
        start = 0
        part_idx = 0
        while start < len(text):
            end = min(start + max_part_chars, len(text))
            part_idx += 1
            print(
                f"Splitting long article into parts "
                f"(part {part_idx}, chars {start}:{end} of {len(text)})..."
            )
            part_doc = CustomDocument(
                tags=document["tags"],
                title=document["title"],
                text=text[start:end],
            )
            results.extend(self._chunk_document(part_doc))
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
                return [chunk.as_result(document) for chunk in doc_as_chunks]
            except Exception as e:
                error_msg = str(e).lower()
                retryable = (
                    "timeout" in error_msg
                    or "timed out" in error_msg
                    or "unterminated string" in error_msg
                    or isinstance(e, json.JSONDecodeError)
                )
                if retryable and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 30  # 30s, 60s, 90s
                    print(f"Chunker error ({e}), retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
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
