# {{projectName}} — Prisma migration project (PostgreSQL)

Schema-only Prisma project for the **`{{databaseName}}`** PostgreSQL database.
This package owns the schema and migrations; application services consume
`@prisma/client` generated from `prisma/schema.prisma`.

## Layout

```
.
├── package.json            # env-scoped migrate scripts
├── prisma.config.ts        # Prisma 7 config (datasource URL from env)
├── tsconfig.json
├── .env.sample             # committed template
├── .env.local              # local DB (gitignored)
├── .env.dev                # shared dev (gitignored)
├── .env.prod               # production (gitignored)
└── prisma/
    ├── schema.prisma
    └── migrations/
        ├── migration_lock.toml
        ├── 20260101000000_init_db_functions/migration.sql   ← ship first
        └── <timestamp>_<name>/migration.sql
```

## Bootstrap functions (first migration)

`20260101000000_init_db_functions` installs:

| Function | Returns | Purpose |
|---|---|---|
| `gen_created_at()` | `float` | UTC epoch **milliseconds** |
| `gen_created_at_hk_timestr()` | `text` | `YYYY-MM-DD HH24:MI:SS` in GMT+8 |
| `ulid_as_uuid()` | `uuid` | time-sortable ULID encoded as UUID |
| `generate_ulid` / `parse_ulid` / `ulid_to_uuid` | helpers | used by `ulid_as_uuid` |

Also enables `pgcrypto` (`gen_random_bytes`). These must exist **before** any
table whose defaults call them. On a fresh DB, `npm run local:deploy` applies
this migration first.

## Environments

| File         | Used by scripts   | Typical target        |
|--------------|-------------------|-----------------------|
| `.env.local` | `local:*`         | localhost PostgreSQL  |
| `.env.dev`   | `migrate:dev:*`   | shared / RDS dev      |
| `.env.prod`  | `migrate:prod:*`  | production            |

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/{{databaseName}}?schema={{schemaName}}"
```

**Password special characters must be percent-encoded**.

## Workflow

### 1. Install

```bash
npm install
cp .env.sample .env.local   # if missing; then edit DATABASE_URL
```

### 2. Deploy bootstrap functions (fresh DB)

```bash
npm run local:deploy
npm run local:status
# expect 20260101000000_init_db_functions applied
```

### 3. Edit schema

```prisma
id            String @id @default(dbgenerated("ulid_as_uuid()")) @db.Uuid
created_at    Float  @default(dbgenerated("gen_created_at()"))
created_at_hk String @default(dbgenerated("gen_created_at_hk_timestr()"))
```

Prefer `snake_case` names. Use `Int @id @default(autoincrement())` only for
pure join / mapping tables.

### 4. Create + apply table migrations

```bash
npm run local:create -- --name <short_snake_description>
# review SQL
npm run local:deploy
```

### 5. Promote

```bash
npm run migrate:dev:deploy
npm run migrate:prod:deploy
```

Never run `prisma migrate dev` against shared/prod.

## Script reference

| Script                | Purpose |
|-----------------------|---------|
| `local:create`        | `migrate dev --create-only` (`.env.local`) |
| `local:deploy`        | `migrate deploy` (`.env.local`) |
| `local:apply`         | `migrate resolve --applied <name>` |
| `local:status`        | `migrate status` |
| `migrate:dev:deploy`  | deploy to `.env.dev` |
| `migrate:prod:deploy` | deploy to `.env.prod` |
| `generate` / `validate` | client gen / schema validate |

## Prisma 7 notes

- Datasource URL lives in **`prisma.config.ts`**, not in `schema.prisma`.
- `schema.prisma` only declares `provider = "postgresql"`.

## Gotchas

1. **Functions first.** Table migrations that call `ulid_as_uuid()` /
   `gen_created_at()` fail if `init_db_functions` is not applied.
2. **search_path trap.** PL/pgSQL resolves unqualified names inside a function
   body against the *caller's* session search_path at call time, not the schema
   the function lives in. The bootstrap migration schema-qualifies every
   internal call (`{{schemaName}}.generate_ulid()` etc.), which is why they work
   from any session. If an app still gets `function X() does not exist`, the
   connection lacks the schema in search_path — qualify the function calls, do
   not patch the connection.
3. Prefer create-only → review → deploy.
4. Never `migrate dev` on shared DBs.
5. Percent-encode passwords.
6. Never rewrite applied migrations; fix-forward.
7. Creating the database itself (`CREATE DATABASE`) is outside Prisma — create
   `{{databaseName}}` before first deploy.
