import os

import psycopg2
from dotenv import load_dotenv
from openai import AzureOpenAI
from pgvector.psycopg2 import register_vector

load_dotenv(override=True)

PG_CONFIG = {
    "host": os.getenv("POSTGRES_HOST"),
    "database": os.getenv("POSTGRES_DATABASE"),
    "user": os.getenv("POSTGRES_USER"),
    "password": os.getenv("POSTGRES_PASSWORD"),
    "sslmode": os.getenv("POSTGRES_SSLMODE", "require"),
}


def _schema_name() -> str:
    name = (os.getenv("POSTGRES_SCHEMA") or "{{POSTGRES_SCHEMA}}").strip()
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Invalid POSTGRES_SCHEMA: {name!r}")
    return name

_embedding_client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_API_VERSION", "2025-01-01-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
)
EMBEDDING_MODEL = os.getenv("AZURE_EMBEDDING_MODEL", "text-embedding-ada-002")


def get_conn():
    """Return a new PostgreSQL connection with pgvector and search_path={{POSTGRES_SCHEMA}}."""
    conn = psycopg2.connect(**PG_CONFIG)
    schema = _schema_name()
    with conn.cursor() as cur:
        cur.execute(f"SET search_path TO {schema}, public")
    conn.commit()
    register_vector(conn)
    return conn


def load_tags() -> list[str]:
    """Every tag in {{POSTGRES_SCHEMA}}.tags, ordered.

    Called on each find_tags invocation so a vocabulary written by sync is
    visible without redeploying the agent.
    """
    schema = _schema_name()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT tag FROM {schema}.tags ORDER BY tag")
            return [row[0] for row in cur.fetchall() if row[0]]
    finally:
        conn.close()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch-embed texts via Azure OpenAI ada-002."""
    resp = _embedding_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [e.embedding for e in resp.data]
