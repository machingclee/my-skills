import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { DB } from "./types";

const { DB_DATABASE, DB_HOST, DB_USER, DB_PASSWORD } = process.env;

const dialect = new PostgresDialect({
  pool: new Pool({
    database: DB_DATABASE,
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: 5432,
    max: 10,
    ssl: true,
  }),
});

// The tables live in `{{POSTGRES_SCHEMA}}` (see prisma/schema.prisma), but a
// fresh connection's search_path is "$user", public, so an unqualified
// `chat_session` misses. A pooled connection (Neon) rejects `search_path` as a
// startup option, so the schema is qualified in the SQL instead.
export const db = new Kysely<DB>({
  dialect,
  log(event) {
    if (event.level === "query") {
      console.log(event.query.sql);
      console.log(event.query.parameters);
    }
  },
}).withSchema("{{POSTGRES_SCHEMA}}");
