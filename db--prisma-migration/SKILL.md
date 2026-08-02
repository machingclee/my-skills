---
name: db--prisma-migration
description: >-
  Scaffold a reusable Prisma 7 schema + multi-env migration project for MySQL
  or PostgreSQL: package.json scripts for local create-only / deploy and
  env-scoped deploy to dev/prod via dotenv-cli, prisma.config.ts with
  DATABASE_URL, provider-specific schema conventions, .env templates,
  migration_lock.toml, and a README workflow. PostgreSQL includes a first
  migration that installs gen_created_at, gen_created_at_hk_timestr, and
  ulid_as_uuid. Use when the user wants to create a Prisma migration project,
  bootstrap a schema-only Prisma package, set up multi-environment migrate
  scripts, clone a sales/wonderbricks schema layout, or start a new
  prisma/migrations project.
---

# Prisma multi-env migration project scaffold

Creates a **schema-only Prisma 7 project** dedicated to owning DDL via Prisma
Migrate. Two complete template trees ship with the skill:

| Provider | Template root | Reference style |
|---|---|---|
| **MySQL** | `templates/mysql/` | echarge `schema/sales` (inline `dbgenerated` timestamps, `Int` autoincrement) |
| **PostgreSQL** | `templates/postgresql/` | wonderbricks (custom SQL functions + UUID ULID PKs) |

**Always ask which SQL engine the user wants** (unless they already said so),
then copy **only** that tree into the target directory.

The generated package is intentionally thin: no application routes, no server.
It holds `prisma/schema.prisma`, versioned SQL under `prisma/migrations/`, and
npm scripts that pin each command to `.env.local` / `.env.dev` / `.env.prod`.

## Mandatory trigger

Invoke this skill before writing project/bootstrap files when the user asks to:

- "create a Prisma migration project" / "scaffold a schema package"
- "set up multi-env Prisma migrate" / "local + dev + prod migrate scripts"
- "new prisma migrations project for \<database\>"
- "clone the sales schema layout" / "bootstrap like wonderbricks / schema/sales"
- start a dedicated Prisma package under a monorepo `schema/` (or similar) folder

## Inputs

Collect (or infer) before generating. **Ask for anything missing.**

| Input | Meaning | Example / default |
|---|---|---|
| `provider` | SQL engine | **`mysql`** or **`postgresql`** — **required**; ask if omitted |
| `targetDir` | where to create the project | `./schema/billing` |
| `projectName` | npm package name | `billing` (default: last path segment of `targetDir`) |
| `databaseName` | DB name in `DATABASE_URL` | `billing` (default: same as `projectName`) |
| `schemaName` | PostgreSQL schema the helpers/tables live in | `public` (default); e.g. `blog_system` for a dedicated schema |
| `sampleModel` | include starter `example_item` | `true` (default) |

### Provider selection (do this first)

If `provider` is not clear from the user message, ask with a choice:

1. **MySQL** — inline timestamp defaults; `Int` autoincrement PKs; no custom functions
2. **PostgreSQL** — first migration installs `gen_created_at`, `gen_created_at_hk_timestr`, `ulid_as_uuid` (+ ULID helpers + `pgcrypto`); UUID PKs by default

Then set:

```
templateRoot = <this skill>/templates/<mysql|postgresql>/
```

Confirm `targetDir` does not already contain a `prisma/schema.prisma` unless the
user explicitly wants to overwrite / merge.

## What it produces

```
<targetDir>/
  package.json                 ← templateRoot/package.json
  prisma.config.ts             ← templateRoot/prisma.config.ts
  tsconfig.json                ← templateRoot/tsconfig.json
  .gitignore                   ← templateRoot/.gitignore
  .env.sample                  ← templateRoot/.env.sample
  .env.local                   ← templateRoot/.env.local
  README.md                    ← templateRoot/README.md
  prisma/
    schema.prisma              ← templateRoot/prisma/schema.prisma
    migrations/
      migration_lock.toml      ← provider-specific
      # PostgreSQL only:
      20260101000000_init_db_functions/migration.sql
```

Not written automatically (user fills secrets):

- `.env.dev`
- `.env.prod`

Copy from `.env.sample` when needed. Both are gitignored.

## How to use

1. **Resolve `provider`** (ask if needed). Set `templateRoot` to
   `templates/mysql` or `templates/postgresql`.

2. **Resolve other inputs.** Default `projectName` / `databaseName` from
   `targetDir` when omitted. Reconfirm before writing if the directory already
   exists and is non-empty.

3. **Create the tree.** Ensure `<targetDir>/prisma/migrations/` exists
   (PostgreSQL also needs the `20260101000000_init_db_functions/` subfolder).

4. **Copy the entire `templateRoot/`** into `<targetDir>/`, preserving relative
   paths (all files under that provider only — do **not** mix providers).

5. **Substitute placeholders** in every copied text file:
   - `{{projectName}}` → e.g. `billing`
   - `{{databaseName}}` → e.g. `billing`
   - `{{schemaName}}` → e.g. `public` or `blog_system` (PostgreSQL only; appears
     in the functions migration, the DATABASE_URL scheme, and the README)

6. **Optional: empty schema.** If `sampleModel` is `false`, strip the
   `example_item` model from `schema.prisma` and leave only the `generator` +
   `datasource` blocks (keep the convention comment block).

7. **Install deps.** From `<targetDir>`:

   ```bash
   npm install
   # or: yarn
   ```

8. **Wire real URLs.** Edit `.env.local`. Create `.env.dev` / `.env.prod` from
   `.env.sample` for remote targets. Percent-encode special characters in
   passwords.

9. **First deploy**
   - **PostgreSQL:** `npm run local:deploy` applies
     `20260101000000_init_db_functions` (extensions + functions). Domain tables
     come later via `local:create`.
   - **MySQL:** after adding models, `local:create` → `local:deploy`.

10. **Stop after scaffold** unless the user also asked to define domain models
    or run migrations. Report the chosen provider, created paths, and the
    next-command cheat sheet from the README.

## Encoded workflow (do not invent alternate scripts)

Mirror these npm scripts exactly (already in both templates). They use
`dotenv -o -e <file>` so the file **overrides** ambient `DATABASE_URL`.

| Script | Purpose |
|---|---|
| `local:create` | `prisma migrate dev --create-only` on `.env.local` |
| `local:deploy` | `prisma migrate deploy` on `.env.local` |
| `local:apply` | `prisma migrate resolve --applied` on `.env.local` (trailing space — pass migration name after `--`) |
| `local:status` | `prisma migrate status` on `.env.local` |
| `local:studio` | `prisma studio` on `.env.local` |
| `migrate:dev:deploy` / `apply` / `status` | same against `.env.dev` |
| `migrate:prod:deploy` / `status` | deploy + status against `.env.prod` |
| `generate` / `validate` | `prisma generate` / `prisma validate` |

**Local loop:** edit schema → `local:create -- --name <snake_name>` → review SQL
→ `local:deploy`.

**Promotion:** commit migration folders → `migrate:dev:deploy` → later
`migrate:prod:deploy`. **Never** run `prisma migrate dev` against shared/prod.

## Schema conventions by provider

### MySQL (`templates/mysql`)

1. **Naming:** `snake_case` models/fields (≈ MySQL names). `@@map` only when needed.
2. **PKs:** `id Int @id @default(autoincrement())` unless a natural key is required.
3. **Timestamps (inline — no custom functions):**

   ```prisma
   created_at    BigInt @default(dbgenerated("(UNIX_TIMESTAMP(UTC_TIMESTAMP(3)) * 1000)"))
   created_at_hk String @default(dbgenerated("(DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 8 HOUR, '%Y-%m-%d %H:%i:%s'))"))
   ```

4. **Text sizes:** `@db.MediumText` / `@db.Text` / `@db.LongText` when `VARCHAR(191)` is too small.
5. **Indexes:** `@@index` on FKs/filters; `@@unique` for natural uniqueness.
6. **Prisma 7:** `datasource db { provider = "mysql" }` only; URL in `prisma.config.ts`.

### PostgreSQL (`templates/postgresql`)

1. **Bootstrap migration (always ship first):**
   `prisma/migrations/20260101000000_init_db_functions/migration.sql`

   Creates / replaces (in the `{{schemaName}}` schema):
   - `CREATE SCHEMA IF NOT EXISTS "{{schemaName}}"`
   - `CREATE EXTENSION IF NOT EXISTS pgcrypto`
   - `gen_created_at() → float` (UTC epoch ms)
   - `gen_created_at_hk_timestr() → text` (`YYYY-MM-DD HH24:MI:SS` GMT+8)
   - `generate_ulid()`, `parse_ulid(text)`, `ulid_to_uuid(text)`, `ulid_as_uuid() → uuid`

   Copied from the wonderbricks / wb-backend-node pattern. Do **not** omit this
   folder when scaffolding PostgreSQL.

2. **Search_path trap — schema-qualify every internal call.** PL/pgSQL resolves
   unqualified names *inside* a function body against the **caller's session
   search_path at call time** (proconfig is NULL unless a `SET search_path`
   clause is attached), NOT the schema the function lives in. So
   `ulid_as_uuid()` calling bare `generate_ulid()` fails from any session whose
   search_path lacks the schema — e.g. a JDBC connection without
   `currentSchema`, or psql defaults (`"$user", public`). The template
   therefore qualifies all cross-function calls (`{{schemaName}}.generate_ulid()`
   etc.) and `SET search_path` scopes creation. **Never "simplify" those
   qualifications away**, and if adding new helper functions to this migration,
   keep every internal call schema-qualified.

4. **Naming:** `snake_case` preferred for new projects (wonderbricks legacy may use camelCase — do not mix styles inside one new package).

5. **PKs:** prefer

   ```prisma
   id String @id @default(dbgenerated("ulid_as_uuid()")) @db.Uuid
   ```

   Use `Int @id @default(autoincrement())` only for pure join tables.

6. **Timestamps (call the functions):**

   ```prisma
   created_at    Float  @default(dbgenerated("gen_created_at()"))
   created_at_hk String @default(dbgenerated("gen_created_at_hk_timestr()"))
   ```

7. **Order matters:** functions migration must be applied before any table that
   references those defaults. Timestamp `20260101000000` keeps it first
   alphabetically/chronologically among normal Prisma migration folders.

8. **Prisma 7:** `datasource db { provider = "postgresql" }` only; URL in `prisma.config.ts`.

Do **not** put `url = env("DATABASE_URL")` back into `schema.prisma` for this layout.

## Template files

```
templates/
  mysql/
    package.json
    prisma.config.ts
    tsconfig.json
    .gitignore
    .env.sample
    .env.local
    README.md
    prisma/schema.prisma
    prisma/migrations/migration_lock.toml   # provider = "mysql"
  postgresql/
    package.json
    prisma.config.ts
    tsconfig.json
    .gitignore
    .env.sample
    .env.local
    README.md
    prisma/schema.prisma
    prisma/migrations/migration_lock.toml   # provider = "postgresql"
    prisma/migrations/20260101000000_init_db_functions/migration.sql
```

Shared behaviour (scripts, dotenv-cli, prisma.config.ts shape) is identical;
provider-specific pieces are schema, lockfile, env URL scheme, README, and the
PostgreSQL functions migration.

## Notes / gotchas

- **Never mix providers.** Copy exactly one of `templates/mysql` or
  `templates/postgresql`. Mixing lockfile + schema provider causes migrate errors.
- **Prisma version pin.** Templates target **Prisma `^7.8.0`**. Bump `prisma` and
  `@prisma/client` together if the user requests a newer line.
- **`dotenv -o`.** Forces the env file to win over a pre-exported `DATABASE_URL`.
- **Create-only is intentional.** Default local loop is reviewable SQL, not blind
  `migrate dev` apply.
- **Password encoding.** Special characters in passwords must be percent-encoded.
- **No rewrite of applied migrations.** Fix-forward with a new migration.
- **`local:apply` trailing space.** Keep
  `npm run local:apply -- <migration_folder_name>`.
- **PostgreSQL privileges.** Installing extensions/functions needs a role that can
  `CREATE EXTENSION` (often superuser or rds_superuser on managed PG). Mention
  this if deploy fails on `pgcrypto`.
- **PostgreSQL search_path trap.** A function's internal unqualified calls
  resolve against the *caller's* search_path, so a working migration session
  does not guarantee working app inserts (see the PostgreSQL conventions,
  item 2). If the app still reports `function X() does not exist` from a
  JDBC/Hibernate insert, the connection is missing the schema in search_path —
  fix the functions (schema-qualify) rather than the connection.
- **Database creation is out of band.** Prisma does not `CREATE DATABASE`; the
  target DB must already exist.
- **Monorepo placement.** Typical path is `schema/<projectName>/`.
- **Client consumers.** Path-link or publish after `prisma generate` only if asked.

## Verify

After scaffold:

- [ ] Chosen provider matches `schema.prisma` `provider` and `migration_lock.toml`
- [ ] PostgreSQL includes `20260101000000_init_db_functions/migration.sql` with
      `gen_created_at`, `gen_created_at_hk_timestr`, `ulid_as_uuid`
- [ ] PostgreSQL functions migration has **no bare cross-function calls** —
      `generate_ulid`, `parse_ulid`, `ulid_to_uuid`, `gen_random_bytes` are all
      schema-qualified (`{{schemaName}}.`)
- [ ] `{{schemaName}}` placeholder substituted everywhere (migration SQL,
      README `?schema=`), default `public` when omitted
- [ ] MySQL does **not** include that functions migration
- [ ] `package.json` name is `projectName`
- [ ] `schema.prisma` has no `url =`
- [ ] `prisma.config.ts` reads `process.env.DATABASE_URL`
- [ ] `.env.sample` / `.env.local` use the correct URL scheme for the provider
- [ ] `.gitignore` includes `.env.local`, `.env.dev`, `.env.prod`
- [ ] `npm install` succeeds

Optional smoke:

```bash
# PostgreSQL: apply functions first
npm run local:deploy
npm run local:status

# Either provider: after schema models exist
npm run local:create -- --name init_tables
npm run local:deploy
```

## Dependencies

- Node.js + npm or yarn
- Prisma CLI + Client `^7.8.0`
- `dotenv` + `dotenv-cli`
- Reachable MySQL 8.x **or** PostgreSQL (with permission to create extensions)
  for actual migrate/deploy — not required merely to scaffold files
