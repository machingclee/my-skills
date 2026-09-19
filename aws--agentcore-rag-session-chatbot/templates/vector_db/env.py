"""Load env files and open Postgres with search_path set to POSTGRES_SCHEMA."""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from pgvector.psycopg2 import register_vector

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCHEMA = "{{POSTGRES_SCHEMA}}"


def load_env() -> None:
    load_dotenv(override=True)
    load_dotenv(ROOT / ".env", override=False)
    load_dotenv(ROOT / "agentcore" / "agentcore" / ".env.local", override=False)
    load_dotenv(ROOT / "agentcore" / ".env.local", override=False)


def schema_name() -> str:
    name = os.getenv("POSTGRES_SCHEMA", DEFAULT_SCHEMA).strip() or DEFAULT_SCHEMA
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Invalid POSTGRES_SCHEMA: {name!r}")
    return name


def pg_connect(*, register: bool = True):
    load_env()
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST"),
        database=os.getenv("POSTGRES_DATABASE"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
        sslmode=os.getenv("POSTGRES_SSLMODE", "require"),
    )
    schema = schema_name()
    with conn.cursor() as cur:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
        cur.execute(f"SET search_path TO {schema}, public")
    conn.commit()
    if register:
        register_vector(conn)
    return conn
