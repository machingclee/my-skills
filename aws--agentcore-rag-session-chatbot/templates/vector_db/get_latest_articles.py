from psycopg2.extras import RealDictCursor

from env import pg_connect


def main() -> None:
    conn = pg_connect()

    query = """
    WITH result AS (
      SELECT
          DISTINCT ON (metadata->>'title')
          id,
          CAST(id AS INTEGER) AS count_id,
          metadata->>'title' AS current_title,
          content
      FROM embeddings
      ORDER BY metadata->>'title', count_id DESC
    )
    SELECT * FROM result ORDER BY count_id DESC
    LIMIT 10;
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        rows = cur.fetchall()

    conn.close()

    if not rows:
        print("No articles found in the vector database.")
        return

    print(f"{'Count ID':<10} {'Title'}")
    print("-" * 80)
    for row in rows:
        count_id = row["count_id"]
        title = row["current_title"]
        print(f"{count_id:<10} {title}")


if __name__ == "__main__":
    main()
