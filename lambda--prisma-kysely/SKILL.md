---
name: lambda--prisma-kysely
description: >-
  Wire Prisma as a schema source and Kysely as the query layer into a Node.js
  AWS Lambda deployed with the Serverless Framework. Pins the versions used by
  Alice Timetable (Prisma 5.9 / @prisma/client 5.9, prisma-kysely 1.7.1, kysely
  0.27.2, pg 8.11), generates db/types.ts + db/enums.ts, connects with a
  PostgresDialect pool, and keeps the Lambda zip small by excluding the Prisma
  CLI, engines, and query binaries. Documents jsonArrayFrom (1:N left join into
  an array) and jsonObjectFrom (1:1 / aggregate left join into an object). The
  Prisma 7 variant (section 2b) adds prisma.config.ts with a migrations path and
  the migrate:create (--create-only), migrate:diff (live database to schema,
  bypassing the shadow database), migrate:deploy, and migrate:applied
  (--applied) scripts, env-cmd loaded from a JSON env file. Use when adding
  Prisma + Kysely to another Node Lambda, slimming a Serverless package that
  pulls in Prisma, writing a Kysely nested left join, or adding Prisma migrate
  scripts to one.
---

# Prisma + Kysely on a Node.js Lambda (Serverless Framework)

Proven on the Alice Timetable backend (`feature/v2/james`). Prisma owns the
schema and generates types. **Kysely runs every query.** `PrismaClient` is
never instantiated at runtime, so the Lambda does not need the Prisma query
engine.

## Versions (pin these)

| Package | Range in package.json | Installed when this was written |
|---|---|---|
| `prisma` | `^5.9.0` | 5.20.0 (dev machine only) |
| `@prisma/client` | `^5.9.0` | 5.17.0 |
| `prisma-kysely` | `^1.7.1` | 1.8.0 |
| `kysely` | `^0.27.2` | 0.27.4 |
| `pg` | `^8.11.3` | — |

Do not upgrade Prisma past 5.x in a project that copies the layout above.
Prisma 7 moves the connection into `prisma.config.ts`, replaces the
`prisma-client-js` generator, and needs the migrate scripts — that variant is
section 2b below, not a different skill.

`prisma` and `prisma-kysely` are **generate-time only**. They must not ship
inside the Lambda zip. `@prisma/client` stays only because application code
imports model/enum **types** from it (`import { Student } from "@prisma/client"`).
Those imports erase at compile time, but Serverless still packages
`node_modules`, so the client package has to be present and the engine binaries
have to be stripped (see packaging below).

## What each piece does

```
prisma/schema.prisma
  generator client   → node_modules/.prisma/client   (TS types: Student, Role, …)
  generator kysely   → db/types.ts + db/enums.ts     (Kysely DB interface)
                              │
db/database.ts  ─ new Kysely<DB>({ PostgresDialect, pg.Pool })
                              │
dao / repository / controller   ← all queries go through `db`
```

- **Prisma generator `client`** — emits `@prisma/client` types used as DTOs.
  Not used for queries.
- **Prisma generator `kysely` (`prisma-kysely`)** — emits a `DB` interface whose
  keys are the Prisma model names (`Student`, `Student_package`, `Class`, …).
  Kysely table names are those keys, so SQL quotes them as `"Student"`.
- **`pg` Pool** — the only runtime database driver. Neon needs `ssl: true`.

## 1. schema.prisma generators

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

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma.config.ts — only `prisma generate` and the migrate commands read this.
// db/database.ts talks to Postgres through pg and never touches DATABASE_URL.
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
| `generate` | `prisma generate` | after every schema change; writes the client and `db/types.ts` |
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
- **`Unsupported(...)` columns vanish from `db/types.ts`.** `prisma-kysely`
  silently drops them on every generate — a `vector(1536)` column is the usual
  case. Add the field back by hand after each `npm run generate`, with a comment
  saying it is hand-kept, or the Kysely type loses the column.

## 3. Runtime client — db/database.ts

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

export const db = new Kysely<DB>({
  dialect,
  log(event) {
    if (event.level === "query") {
      console.log(event.query.sql);
      console.log(event.query.parameters);
    }
  },
});
```

Declare the pool at module scope so warm Lambda invocations reuse it. Do not
construct a new `Kysely` per request.

Env vars the function needs (set under `provider.environment`, not hardcoded
with real secrets):

| Var | Used by |
|---|---|
| `DATABASE_URL` | `prisma generate` / migrate only. Not read by Kysely. |
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
    # Dev-only tools that sometimes get hoisted into dependencies.
    - "!node_modules/nodemon/**"
    - "!node_modules/cross-env/**"
```

What this removes, and why it is safe:

| Excluded | Why it is huge | Why the function still works |
|---|---|---|
| `libquery_engine-*` | native binary per OS, 10–20 MB each | no `PrismaClient`, so nothing dlopens it |
| `node_modules/prisma/**` | the CLI | generate happens before deploy, on your machine |
| `node_modules/@prisma/**` except `client` | engines, internals | only `@prisma/client` type imports are used |

Also exclude `prisma-kysely` if Serverless starts packaging it (`"!node_modules/prisma-kysely/**"`). It is a generator plugin; nothing imports it at runtime.

Do **not** exclude `kysely` or `pg`. Those are the runtime.

Runtime in the working project is `nodejs18.x`. The packaging rules do not
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

## Adding this to another Serverless Node Lambda

1. Install the pinned packages: `prisma@^5.9.0`, `@prisma/client@^5.9.0`,
   `prisma-kysely@^1.7.1`, `kysely@^0.27.2`, `pg@^8.11.3`.
2. Add both generators to `schema.prisma` exactly as in section 1.
3. `npx prisma generate` (or `npm run generate` on the Prisma 7 layout in
   section 2b) and commit `db/types.ts` + `db/enums.ts`. On Prisma 7, also add
   the `migrate:create`, `migrate:deploy`, and `migrate:applied` scripts from
   that section.
4. Add `db/database.ts` from section 3. Put `DB_HOST`, `DB_DATABASE`,
   `DB_USER`, `DB_PASSWORD` in `provider.environment`.
5. Paste the `package.patterns` from section 5 into `serverless.yml`.
6. Query only through `db`. Do not import `PrismaClient` unless you also
   change `binaryTargets` and the exclude list.
7. For nested reads, copy the `jsonArrayFrom` / `jsonObjectFrom` shapes from
   section 6. Correlate with `whereRef`, and `limit(1)` every `jsonObjectFrom`
   that is not an aggregate.
