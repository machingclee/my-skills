"""Create the configured schema and embeddings table. Does not touch public.embeddings."""
import sys

from pgvector.psycopg2 import register_vector

from env import pg_connect, schema_name

TABLE_SQL = """
CREATE TABLE IF NOT EXISTS {schema}.embeddings (
    id TEXT PRIMARY KEY,
    content TEXT,
    metadata JSONB,
    embedding vector(1536)
);
"""

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS embeddings_embedding_ivfflat
ON {schema}.embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
"""


def main() -> None:
    conn = pg_connect(register=False)
    schema = schema_name()
    cur = conn.cursor()
    try:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        conn.commit()
        print("Vector extension ready")
    except Exception as e:
        print(f"Error creating extension: {e}")
        conn.rollback()
        sys.exit(1)

    register_vector(conn)
    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
    cur.execute(TABLE_SQL.format(schema=schema))
    cur.execute(INDEX_SQL.format(schema=schema))
    conn.commit()
    print(f"Schema {schema} ready; table {schema}.embeddings ready (vector(1536) / ada-002)")
    conn.close()


if __name__ == "__main__":
    main()
