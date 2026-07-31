# {{projectName}} — Prisma migration project (MySQL)

Schema-only Prisma project for the **`{{databaseName}}`** MySQL database.
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
├── .env.dev                # shared dev / RDS (gitignored)
├── .env.prod               # production (gitignored)
└── prisma/
    ├── schema.prisma
    └── migrations/
        ├── migration_lock.toml
        └── <timestamp>_<name>/migration.sql
```

## Environments

| File         | Used by scripts   | Typical target   |
|--------------|-------------------|------------------|
| `.env.local` | `local:*`         | localhost MySQL  |
| `.env.dev`   | `migrate:dev:*`   | shared / RDS dev |
| `.env.prod`  | `migrate:prod:*`  | production       |

```bash
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/{{databaseName}}"
```

**Password special characters must be percent-encoded**
(`"` → `%22`, `]` → `%5D`, `@` → `%40`, `#` → `%23`, space → `%20`).

## Workflow

### 1. Install

```bash
npm install
cp .env.sample .env.local   # if missing; then edit DATABASE_URL
```

### 2. Edit schema

Prefer:

- `snake_case` model/field names matching MySQL
- `Int @id @default(autoincrement())`
- inline timestamp pair (MySQL has no custom SQL functions like PostgreSQL):

```prisma
created_at    BigInt @default(dbgenerated("(UNIX_TIMESTAMP(UTC_TIMESTAMP(3)) * 1000)"))
created_at_hk String @default(dbgenerated("(DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 8 HOUR, '%Y-%m-%d %H:%i:%s'))"))
```

### 3. Create a migration (local only)

```bash
npm run local:create -- --name <short_snake_description>
```

Review `prisma/migrations/<timestamp>_<name>/migration.sql`.

### 4. Apply to local

```bash
npm run local:deploy
npm run local:status
```

### 5. Promote to dev / prod

```bash
npm run migrate:dev:deploy
npm run migrate:prod:deploy
```

Never run `prisma migrate dev` against shared/prod — only `migrate deploy`.

## Script reference

| Script                  | Command essence                                  |
|-------------------------|--------------------------------------------------|
| `local:create`          | `migrate dev --create-only` against `.env.local` |
| `local:deploy`          | `migrate deploy` against `.env.local`            |
| `local:apply`           | `migrate resolve --applied <migration>`          |
| `local:status`          | `migrate status` (local)                         |
| `migrate:dev:deploy`    | `migrate deploy` against `.env.dev`              |
| `migrate:prod:deploy`   | `migrate deploy` against `.env.prod`             |
| `generate` / `validate` | `prisma generate` / `prisma validate`            |

All scripts use `dotenv -o -e <file>` so the file **overrides** any shell
`DATABASE_URL`.

## Prisma 7 notes

- Datasource URL lives in **`prisma.config.ts`**, not in `schema.prisma`.
- `schema.prisma` only declares `provider = "mysql"`.

## Gotchas

1. Prefer create-only → review → deploy.
2. Never `migrate dev` on shared DBs.
3. Percent-encode passwords.
4. Never rewrite applied migrations; fix-forward.
5. MySQL cannot host PostgreSQL-style custom helpers (`ulid_as_uuid`,
   `gen_created_at`, …). Keep defaults as **inline** `dbgenerated(...)`.
