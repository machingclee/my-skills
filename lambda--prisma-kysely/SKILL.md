---
name: lambda--prisma-kysely
description: >-
  Wire Prisma as a schema source and Kysely as the query layer into a Node.js
  AWS Lambda deployed with the Serverless Framework. Two pinned layouts: Prisma
  5.9 (Alice Timetable) and Prisma 7.10 with prisma-kysely 3.2.1, kysely 0.27.6,
  and pg 8.23 (the current one). The Prisma 7 layout generates src/db/types.ts,
  qualifies the schema with Kysely's withSchema (a pooled connection rejects
  search_path as a startup option), loads a JSON env file through env-cmd and
  serverless-dotenv-plugin, and keeps the Lambda zip small by excluding the
  Prisma CLI and every package only the CLI reaches — pglite, effect, elkjs,
  react-dom, jiti, valibot, remeda. Use when adding Prisma + Kysely to a Node
  Lambda, slimming a Serverless package that pulls in Prisma, writing a Kysely
  nested left join, or adding Prisma migrate scripts to one.
---

# Prisma + Kysely on a Node.js Lambda (Serverless Framework)

Proven on the Alice Timetable backend (`feature/v2/james`). Prisma owns the
schema and generates types. **Kysely runs every query.** `PrismaClient` is
never instantiated at runtime, so the Lambda does not need the Prisma query
engine.

## Versions

Prisma 7 is the layout to copy. The 5.9 pins are only for a project that
already runs them — do not upgrade such a project past 5.x, because Prisma 7
moves the connection into `prisma.config.ts` and replaces the
`prisma-client-js` generator. That is section 2b, not a different skill.

### Prisma 7 (current)

| Package | Range in package.json | Where |
|---|---|---|
| `prisma` | `^7.10.0` | devDependencies |
| `@prisma/client` | `^7.10.0` | dependencies |
| `prisma-kysely` | `^3.2.1` | devDependencies (needs prisma >= 7) |
| `kysely` | `^0.27.6` | dependencies |
| `pg` | `^8.23.1` | dependencies |
| `@types/pg` | `^8.23.1` | devDependencies |
| `dotenv` | `^18.0.6` | devDependencies (`prisma.config.ts` loads it) |
| `env-cmd` | `^10.1.0` | devDependencies |

### Prisma 5.9 (do not start a new project on this)

| Package | Range in package.json | Installed when this was written |
|---|---|---|
| `prisma` | `^5.9.0` | 5.20.0 (dev machine only) |
| `@prisma/client` | `^5.9.0` | 5.17.0 |
| `prisma-kysely` | `^1.7.1` | 1.8.0 |
| `kysely` | `^0.27.2` | 0.27.4 |
| `pg` | `^8.11.3` | — |

`prisma` and `prisma-kysely` are **generate-time only**. They must not ship
inside the Lambda zip. `@prisma/client` stays only because application code
imports model/enum **types** from it (`import { Student } from "@prisma/client"`).
Those imports erase at compile time, but Serverless still packages
`node_modules`, so the client package has to be present and the engine binaries
have to be stripped (see packaging below).

## What each piece does

```
prisma/schema.prisma
  generator client   → generated types (Prisma 5: node_modules/.prisma/client,
                       Prisma 7: generated/prisma)
  generator kysely   → src/db/types.ts + src/db/enums.ts   (Prisma 5: db/)
                              │
src/db/database.ts  ─ new Kysely<DB>({ PostgresDialect, pg.Pool }).withSchema(schema)
                              │
dao / repository / controller   ← all queries go through `db`
```

- **Prisma generator `client`** — emits `@prisma/client` types used as DTOs.
  Not used for queries.
- **Prisma generator `kysely` (`prisma-kysely`)** — emits a `DB` interface whose
  keys are the Prisma model names (`Student`, `Student_package`, `Class`, …).
  Kysely table names are those keys, so SQL quotes them as `"Student"`.
- **`pg` Pool** — the only runtime database driver. Neon needs `ssl: true`.

## 1. schema.prisma generators (Prisma 5.9)

Prisma 7 uses the generators in section 2b instead. This block is the 5.9
layout, kept for a project that already runs it.

```prisma
generator client {
  provider = "prisma-client-js"
}

generator kysely {
  provider     = "prisma-kysely"
  output       = "../db"
  enumFileName = "enums.ts"
  fileName     = "types.ts"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`output = "../db"` is relative to the schema file, so this writes
`db/types.ts` and `db/enums.ts` at the project root. Commit both files — the
Lambda build does not run `prisma generate`.

No `binaryTargets` is set. The generated engine is the dev machine's
(`libquery_engine-darwin-arm64.dylib.node`). That is fine **because nothing
imports `PrismaClient`**. If a later change adds `new PrismaClient()`, you must
add `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (nodejs18 on Amazon
Linux 2023) and stop excluding the rhel engine in `serverless.yml`. Until then,
do not add it — it is ~15 MB of dead weight.

## 2. Generate

```bash
npx prisma generate
```

Regenerate after every schema change. `db/types.ts` is the file Kysely is
generic over; a stale copy compiles against columns that no longer exist.

Enums come out as const objects, not TS `enum`s:

```ts
export const Class_status = { PRESENT: "PRESENT", MAKEUP: "MAKEUP" } as const;
export type Class_status = (typeof Class_status)[keyof typeof Class_status];
```

Columns with `@default(...)` are wrapped in `Generated<T>`, so `insertInto`
does not require them.

## 2b. Prisma 7 — prisma.config.ts and the migrate scripts

Prisma 7 moves the connection out of `schema.prisma` into `prisma.config.ts`,
so the section 1 datasource above (with `url = env("DATABASE_URL")`) does not
apply. The generator also changes: `prisma-client-js` is replaced by
`prisma-client`, which requires an `output` and writes the client into the
project instead of `node_modules`. Use `prisma-kysely@^3.2.1` (it requires
prisma >= 7) and `dotenv`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

generator kysely {
  provider      = "prisma-kysely"
  output        = "../src/db"
  enumFileName  = "enums.ts"
  fileName      = "types.ts"
  // prisma-kysely prefixes a table name with its schema unless that schema is
  // the default, which would make Kysely emit "app_schema"."table". The
  // connection qualifies the schema itself (section 3), so the names stay bare.
  defaultSchema = "app_schema"
}

datasource db {
  provider = "postgresql"
  schemas  = ["app_schema"]
}
```

```ts
// prisma.config.ts — only `prisma generate` and the migrate commands read this.
// src/db/database.ts talks to Postgres through pg and never touches DATABASE_URL.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

`migrations.path` is mandatory. Prisma 7 refuses to run any migrate command
until the config says where the migrations live.

The scripts, using `env-cmd` because this layout keeps its env in a JSON file
rather than `.env`:

```json
{
  "scripts": {
    "generate": "env-cmd -f .env.local.json npx prisma generate",
    "migrate:create": "env-cmd -f .env.local.json npx prisma migrate dev --create-only",
    "migrate:diff": "env-cmd -f .env.local.json npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
    "migrate:deploy": "env-cmd -f .env.local.json npx prisma migrate deploy",
    "migrate:applied": "env-cmd -f .env.local.json npx prisma migrate resolve --applied "
  }
}
```

| Script | Runs | When |
|---|---|---|
| `generate` | `prisma generate` | after every schema change; writes the client and `src/db/types.ts` |
| `migrate:create` | `migrate dev --create-only` | writes the SQL for review, applies nothing |
| `migrate:diff` | `migrate diff` from the live database to the schema | the SQL the database is missing, printed to stdout, no shadow database |
| `migrate:deploy` | `migrate deploy` | applies pending migrations |
| `migrate:applied` | `migrate resolve --applied` | marks a migration applied without running it |

The trailing space on `migrate:applied` is deliberate: the migration folder
name you pass lands directly after `--applied`.

```bash
npm run migrate:create -- --name add_chat_session   # review the SQL it writes
npm run migrate:deploy
npm run migrate:applied -- 20260101000000_init      # SQL already in the database
```

### migrate:diff — when migrate dev demands a reset

`migrate dev` never diffs your files against the database directly. It replays
the whole migration history into a temporary shadow database and compares that
with the real one, and its only response to a mismatch is to drop and recreate
the schema. It reports drift, and offers the reset, in two situations:

- **Objects that predate the migrations.** Tables or extensions created outside
  Prisma (a schema another project already populated) are in the database but in
  no migration. Baseline them: put their `CREATE` statements in an early
  migration and record it with `migrate:applied` instead of running it.
- **Extensions shared with another schema.** Extensions are database-level, but a
  datasource scoped with `schemas = [...]` makes Prisma judge them per schema.
  An extension installed in `public` while the migration creates it unqualified,
  or one installed for a different project in the same database, shows up as
  "changed" or "added" and the reset offered would destroy the schema's data.

`migrate:diff` sidesteps the shadow database entirely. It reads the configured
database and prints the SQL that would bring it in line with the schema, so
extensions and pre-existing tables never appear in the output — only what is
actually missing. It writes nothing; save the output as a migration yourself:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_chat_session
npm run migrate:diff > prisma/migrations/<folder>/migration.sql   # review it
npm run migrate:deploy
```

`migrate:deploy` replays history into the shadow database too, so the same drift
blocks it. Apply the SQL yourself and record it instead:

```bash
npx env-cmd -f .env.local.json npx prisma db execute --file prisma/migrations/<folder>/migration.sql
npm run migrate:applied -- <folder>
```

`prisma generate` does not connect, but Prisma 7 still resolves `DATABASE_URL`
while loading the config, so the variable must be present even for `generate`.
`env-cmd -f .env.local.json` exports the JSON keys into the environment, which
is what `env("DATABASE_URL")` reads.

Two things that bite on the first run:

- **Baselining.** `migrate dev --create-only` diffs the whole schema against an
  empty history, so the first migration's SQL includes `CREATE TABLE` for tables
  that already exist. Review it and remove those statements before deploying, or
  the deploy fails on them. Use `migrate:applied` for a migration whose changes
  are already in the database.
- **`Unsupported(...)` columns vanish from `src/db/types.ts`.** `prisma-kysely`
  silently drops them on every generate — a `vector(1536)` column is the usual
  case. Add the field back by hand after each `npm run generate`, with a comment
  saying it is hand-kept, or the Kysely type loses the column.

## 3. Runtime client — db/database.ts

On the Prisma 7 layout this file lives at `src/db/database.ts`, next to the
generated `types.ts`, so it stays inside `tsconfig`'s `rootDir` (see section
5). The 5.9 layout keeps it at `db/database.ts`.

```ts
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

// The tables live in their own schema (see prisma/schema.prisma), but a fresh
// connection's search_path is "$user", public, so an unqualified table name
// misses and Postgres reports `relation "<table>" does not exist` for a table
// that is right there. A pooled connection (Neon) rejects `search_path` as a
// startup option, so the schema is qualified in the SQL instead.
export const db = new Kysely<DB>({
  dialect,
  log(event) {
    if (event.level === "query") {
      console.log(event.query.sql);
      console.log(event.query.parameters);
    }
  },
}).withSchema("app_schema");
```

`withSchema` emits `"app_schema"."table"` for every query, including the ones
inside `jsonArrayFrom` and `jsonObjectFrom`. Replace `app_schema` with the
schema the models declare. Skip the call only when the tables really are in
`public` and the role's `search_path` includes it.

Declare the pool at module scope so warm Lambda invocations reuse it. Do not
construct a new `Kysely` per request.

Two things that look like they would set the schema and do not:

- **`DATABASE_URL`'s `schema` query param.** Prisma reads it and sets
  `search_path` before running migrations, which is why `yarn migrate:deploy`
  lands tables in the right schema. node-postgres ignores the parameter, so
  handing the Pool that URL — or adding it to the Lambda environment — changes
  nothing about where queries look.
- **`options: "-c search_path=app_schema,public"` on the Pool.** Works against
  Postgres directly and fails through a transaction pooler. Neon replies
  `unsupported startup parameter in options: search_path` and points at its
  connection-errors page. `withSchema` is the fix that works in both cases.

Env vars the function needs (set under `provider.environment`, not hardcoded
with real secrets):

| Var | Used by |
|---|---|
| `DATABASE_URL` | `prisma generate` / migrate only. Not read by Kysely. Do not put it in `provider.environment`. |
| `DB_HOST` | `pg` Pool |
| `DB_DATABASE` | `pg` Pool |
| `DB_USER` | `pg` Pool |
| `DB_PASSWORD` | `pg` Pool |

## 4. Queries

Table names are the Prisma model names. Always qualify columns when more than
one table is in play.

```ts
import { db } from "../db/database";

const student = await db
  .selectFrom("Student")
  .selectAll()
  .where("Student.id", "=", studentId)
  .executeTakeFirst();

await db
  .insertInto("User")
  .values({ ...props, password_hash: hashedPassword, is_blocked: false, avatar_file_url: "" })
  .execute();

await db
  .updateTable("Student")
  .set(update)
  .where("Student.id", "=", update.id)
  .execute();

await db.deleteFrom("Class").where("Class.student_package_id", "=", packageId).execute();
```

Import row types from `@prisma/client` (`Student`, `Class`, `Student_package`)
and enum types from there too (`Role`, `Classroom`, `Class_status`). The
Kysely-side copies live in `db/enums.ts` if you would rather not depend on the
Prisma client types.

## 5. Lambda packaging — the part that keeps the zip deployable

`serverless-plugin-common-excludes` plus these `package.patterns`. Order
matters: a later positive pattern re-includes what an earlier `!` dropped.

```yaml
plugins:
  - serverless-plugin-typescript-express
  - serverless-plugin-common-excludes

package:
  patterns:
    # Drop every OS-specific query engine. None of them run — Kysely does.
    - "!node_modules/.prisma/client/libquery_engine-*"
    # Drop the Prisma CLI and its transitive deps (@prisma/engines,
    # @prisma/fetch-engine, @prisma/get-platform, …).
    - "!node_modules/prisma/**"
    - "!node_modules/@prisma/**"
    # Put the generated client back. Application code imports types from it,
    # and its index.js is what Node resolves if anything touches the package.
    # The libquery exclusion above still applies to files inside this tree
    # only if they match that earlier glob — they don't (engines live under
    # node_modules/.prisma, not @prisma/client), so this line is safe.
    - "node_modules/@prisma/client/**"
    # Prisma 7 moved the query engine into the client as base64 WASM, one copy
    # per database and per build, ~4 MB each. Nothing here constructs a
    # PrismaClient — Kysely runs the queries — so the whole runtime goes.
    # Must come after the re-include above, or that line puts it back.
    - "!node_modules/@prisma/client/runtime/**"
    # prisma-kysely is a generator plugin; nothing imports it at runtime.
    - "!node_modules/prisma-kysely/**"
    # Prisma 7's CLI pulls these in as separate packages, and each is only
    # reachable through the CLI: pglite (~15 MB of WASM), effect, and Prisma
    # Studio's react-dom and elkjs. jiti loads prisma.config.ts, and valibot
    # and remeda validate @prisma/dev's config. None are imported by the
    # function. The `!node_modules/prisma/**` line only matches that one
    # directory, so these need their own.
    - "!node_modules/@electric-sql/**"
    - "!node_modules/effect/**"
    - "!node_modules/elkjs/**"
    - "!node_modules/react-dom/**"
    - "!node_modules/jiti/**"
    - "!node_modules/valibot/**"
    - "!node_modules/remeda/**"
```

The `@prisma/client/runtime` line and the block from `@electric-sql` down are
Prisma 7 only. A 5.9 project has none of those packages; drop those lines
there. Drop the `@prisma/client` re-include as well if nothing imports from
it — with the types coming from `src/db/types.ts`, the client is optional.

What this removes, and why it is safe:

| Excluded | Why it is huge | Why the function still works |
|---|---|---|
| `libquery_engine-*` | native binary per OS, 10–20 MB each | no `PrismaClient`, so nothing dlopens it |
| `@prisma/client/runtime` | Prisma 7's query engine as base64 WASM, ~4 MB a copy | Kysely runs the queries |
| `node_modules/prisma/**` | the CLI | generate happens before deploy, on your machine |
| `node_modules/@prisma/**` except `client` | engines, internals | only `@prisma/client` type imports are used |
| `@electric-sql`, `effect`, `elkjs`, `react-dom` | pglite's WASM, Prisma Studio | only the CLI imports them |
| `jiti`, `valibot`, `remeda` | config loading and validation | only `prisma.config.ts` needs them |
| `prisma-kysely` | generator plugin | nothing imports it at runtime |

Do **not** exclude `kysely` or `pg`. Those are the runtime.

`serverless-plugin-typescript-express` rewrites the handler from
`src/server.handler` to `dist/server.handler` and compiles with plain `tsc`.
Keep `rootDir` at `src` and give `include` a single directory. The generated
types and `database.ts` therefore live under `src/db/`, not a top-level `db/`.
A second directory in `include` makes `tsc` treat the project root as the
compilation root and emit `dist/src/server.js`, which the handler never loads —
`serverless deploy` then reports "No changes to deploy" because the stale
`dist/server.js` is byte-identical to what is already up. Delete `dist/` and
redeploy after fixing it.

Runtime in the working project is `nodejs22.x`. The packaging rules do not
depend on the runtime version.

## 6. jsonArrayFrom and jsonObjectFrom

Both come from `kysely/helpers/postgres`. Each takes a correlated subquery
(correlated with `whereRef` back to the outer row) and Postgres nests the
result with `json_agg` / `to_json`. Because the subquery is a scalar select,
a missing match yields SQL `NULL` rather than dropping the parent row — that
is the left join.

```ts
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import { sql } from "kysely";
```

### jsonArrayFrom — one parent, many children, as an array

Use when the relation is `1:N` and you want `child[]` on each parent row.
This is the Student → Student_package load:

```ts
const studentAggQuery = db
  .selectFrom("Student")
  .selectAll("Student")
  .select((eb) => [
    jsonArrayFrom(
      eb
        .selectFrom("Student_package")
        .selectAll("Student_package")
        .whereRef("Student_package.student_id", "=", "Student.id"),
    ).as("studentPackages"),
  ]);

const row = await studentAggQuery.where("Student.id", "=", uuid).executeTakeFirst();
// row.studentPackages : Student_package[]   (empty array when none, not null)
const { studentPackages, ...student } = row;
```

Generated SQL shape:

```sql
select "Student".*,
       (select coalesce(json_agg(agg), '[]') from (
          select "Student_package".*
          from "Student_package"
          where "Student_package"."student_id" = "Student"."id"
       ) as agg) as "studentPackages"
from "Student"
```

`coalesce(..., '[]')` is why the field is `[]` and not `null` when the
student has no packages. Filter or order inside the subquery
(`.where(...)`, `.orderBy(...)`) — it only sees that parent's children.

### jsonObjectFrom — one parent, one related row (or one aggregate), as an object

Use when you want a single object: the one related row, or a one-row
aggregate. `null` when the subquery matches nothing.

First and last class of a package:

```ts
db.selectFrom("Student_package")
  .select("Student_package.id as packageId")
  .select((eb) => [
    jsonObjectFrom(
      eb
        .selectFrom("Class")
        .select("Class.day_unix_timestamp")
        .whereRef("Class.student_package_id", "=", "Student_package.id")
        .orderBy("Class.hour_unix_timestamp asc")
        .limit(1),
    ).as("firstClass"),
  ])
  .select((eb) => [
    jsonObjectFrom(
      eb
        .selectFrom("Class")
        .select("Class.day_unix_timestamp")
        .whereRef("Class.student_package_id", "=", "Student_package.id")
        .orderBy("Class.hour_unix_timestamp desc")
        .limit(1),
    ).as("lastClass"),
  ])
  .where("Student_package.id", "in", packageIds)
  .execute();
// row.firstClass : { day_unix_timestamp: number } | null
```

Always `.limit(1)` (or aggregate to one row) inside `jsonObjectFrom`. Without
it Postgres errors with "more than one row returned by a subquery".

Aggregate as an object — scheduled vs consumed minutes. The subquery returns
one row even when no classes match, so check the field inside, not the object:

```ts
.select((eb) => [
  jsonObjectFrom(
    eb
      .selectFrom("Class")
      .select(sql<number>`SUM("min")`.as("count"))
      .whereRef("Class.student_package_id", "=", "Student_package.id")
      .where("Class.class_status", "in", [
        "PRESENT", "MAKEUP", "ILLEGIT_ABSENCE",
        "CHANGE_OF_CLASSROOM", "RESERVED", "TRIAL",
      ]),
  ).as("scheduled_minutes"),
])
// row.scheduled_minutes : { count: number | null }
// count is null when the filter matched zero classes
```

A real `1:1` left join of the parent onto itself (useful when the aggregate
type should be the whole row, nullable):

```ts
jsonObjectFrom(
  eb.selectFrom("Student_package as tmp_package")
    .selectAll()
    .whereRef("tmp_package.id", "=", "Student_package.id"),
).as("studentPackage")
// studentPackage : Student_package | null
```

### Which helper

| You want | Helper | Empty result |
|---|---|---|
| `Child[]` on each parent | `jsonArrayFrom` | `[]` |
| one related row, or null | `jsonObjectFrom` + `limit(1)` | `null` |
| `SUM` / `COUNT` beside the parent | `jsonObjectFrom` over an aggregate | `{ count: null }` |
| a column from a has-one table | `jsonObjectFrom` or a plain `.leftJoin` | `null` |

Prefer a plain `.leftJoin(...).select("Course.course_name")` when you only
need a couple of scalar columns from a has-one table. Reach for the helpers
when the nested value is an array or a structured object.

## 7. Env file and serverless.yml

The env lives in JSON, not `.env`, so both the scripts and the deploy need a
reader for it. `env-cmd -f .env.local.json` covers the scripts.
`serverless-dotenv-plugin` covers the deploy, but it parses `KEY=VALUE`, so it
needs a parser that reads JSON. `jsonParser.js` at the project root:

```js
const fs = require("fs");

// Reads env values from JSON files (NOT KEY=VALUE .env): scalars become
// strings, arrays join with commas, objects are ignored. Multiple `path`
// entries merge in order, later wins.
module.exports = function ({ paths }) {
  const envVarsArray = paths.map((path) => {
    try {
      const jsonData = JSON.parse(fs.readFileSync(path, "utf8"));
      const stringifiedData = {};
      for (const key in jsonData) {
        const value = jsonData[key];
        if (["string", "boolean", "number"].includes(typeof value)) {
          stringifiedData[key] = jsonData[key];
        } else if (Array.isArray(jsonData[key])) {
          stringifiedData[key] = jsonData[key].map((v) => String(v)).join(",");
        }
      }
      return stringifiedData;
    } catch (error) {
      console.error(`Error reading/parsing ${path}:`, error.message);
      return {};
    }
  });
  return envVarsArray.reduce((acc, curr) => ({ ...acc, ...curr }), {});
};
```

`.env.local.example.json`, committed with empty values. Copy it to
`.env.local.json` and fill it locally:

```json
{
  "DB_HOST": "",
  "DB_DATABASE": "",
  "DB_USER": "",
  "DB_PASSWORD": "",
  "DATABASE_URL": "postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&schema=app_schema"
}
```

`&schema=app_schema` is for Prisma. It is what makes `yarn migrate:deploy`
create tables in that schema, and it is not read by the function.

`serverless.yml`:

```yaml
plugins:
  - serverless-plugin-typescript-express
  - serverless-plugin-common-excludes
  - serverless-dotenv-plugin

custom:
  dotenv:
    path:
      - .env.local.json
    dotenvParser: "./jsonParser.js"
    logging: false

provider:
  environment:
    # Read by src/db/database.ts. DATABASE_URL is for prisma only — do not add it.
    DB_HOST: ${env:DB_HOST, ''}
    DB_DATABASE: ${env:DB_DATABASE, ''}
    DB_USER: ${env:DB_USER, ''}
    DB_PASSWORD: ${env:DB_PASSWORD, ''}
```

`.gitignore`:

```
# `prisma generate` output. Committed on purpose: the Lambda build does not
# run prisma generate, and src/db/database.ts imports DB from src/db/types.ts.
!src/db/types.ts
!src/db/enums.ts
```

The `!` lines only matter if a parent gitignore ignores `*.ts` or the whole
`db/` directory. Either way, commit `src/db/types.ts`.

## Adding this to another Serverless Node Lambda

1. Install the Prisma 7 packages from the versions table: `prisma@^7.10.0` and
   `dotenv` as dev dependencies, `@prisma/client@^7.10.0`, `kysely@^0.27.6`,
   and `pg@^8.23.1` as dependencies, plus `@types/pg` and `env-cmd`.
2. Add `prisma.config.ts` and both generators from section 2b, with the kysely
   generator's `output` at `../src/db` and `defaultSchema` set to the schema.
3. Add the five scripts from section 2b. Run `npm run generate` and commit
   `src/db/types.ts`.
4. Add `src/db/database.ts` from section 3, with `withSchema` set to the same
   schema. Do not set `search_path` on the Pool.
5. Add `.env.local.example.json`, `jsonParser.js`, and the `serverless.yml`
   blocks from section 7. Fill `.env.local.json` locally.
6. Paste the `package.patterns` from section 5 into `serverless.yml`, including
   the Prisma 7 exclusions.
7. Query only through `db`. Do not import `PrismaClient` unless you also change
   `binaryTargets` and the exclude list.
8. For nested reads, copy the `jsonArrayFrom` / `jsonObjectFrom` shapes from
   section 6. Correlate with `whereRef`, and `limit(1)` every `jsonObjectFrom`
   that is not an aggregate.
