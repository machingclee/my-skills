# {{projectName}} — Flyway migration project

Standalone Flyway project for MySQL schema(s): {{SCHEMAS_LIST}}. Maven only —
there is no `package.json`.

Each schema has an **independent** migration history and version stream. The
JDBC URL selects the schema; migration SQL must **not** include `USE <schema>;`.

**Run every command from this directory**, not from an application module root.
`flyway.locations` is a relative path, and the application POM has no Flyway
plugin.

## Layout

```
.
├── pom.xml
├── Makefile
├── flyway-<schema>-local.conf
├── flyway-<schema>-dev.conf
├── flyway-<schema>-prod.conf
└── src/main/resources/db/migration/
    └── <schema>/
        ├── V0__baseline.sql         # comment-only baseline marker
        └── V1__….sql
```

There are no Maven profiles and no default conf file. The `Makefile` names the
conf file in each target, so the database you are targeting is visible in the
command itself. The conf file holds the JDBC url, the credentials and the path
to the SQL.

## Commands

`make` with no target prints the list.

```bash
{{COMMAND_BLOCK}}
```

`baseline` creates `flyway_schema_history` and marks the schema at version 0. Run
it once, on a database that already has objects; it does not run SQL.
`info` lists applied and pending versions and changes nothing — run it before
`migrate`. `migrate` applies every pending version, in order.

The targets expand to:

```bash
mvn flyway:baseline -Dflyway.configFiles=flyway-{{exampleSchema}}-local.conf
mvn flyway:info     -Dflyway.configFiles=flyway-{{exampleSchema}}-local.conf
mvn flyway:migrate  -Dflyway.configFiles=flyway-{{exampleSchema}}-local.conf
```

with the matching conf file for dev and prod{{MULTI_SCHEMA_NOTE}}.

`validate` and `repair` are not in the Makefile. They are recovery tools and
worth typing out so the conf file is a deliberate choice:

```bash
mvn flyway:validate -Dflyway.configFiles=flyway-{{exampleSchema}}-local.conf
mvn flyway:repair   -Dflyway.configFiles=flyway-{{exampleSchema}}-local.conf
```

| Goal | What it does |
|------|----------------|
| `validate` | Compare recorded checksums with the files on disk. |
| `repair` | Realign checksums and remove failed rows. Only after you know why `validate` failed. |

## Workflow

### 1. Prerequisites

- JDK 17+, Maven 3.8+
- MySQL 8.x with the schema already created (`CREATE DATABASE …`). Flyway does not create it.
- Credentials filled in the relevant `flyway-*.conf`

### 2. First-time setup

**Database that already has tables** — baseline once, which creates
`{{exampleSchema}}.flyway_schema_history`, then migrate only the versions above it:

```bash
make {{baselineLocal}}
make {{infoLocal}}
make {{migrateLocal}}
```

**Empty database** — skip baseline. `migrate` creates the history table itself
and applies `V1` onward:

```bash
make {{migrateLocal}}
```

### 3. Add a migration

Create the next version under the schema folder:

```
src/main/resources/db/migration/{{exampleSchema}}/V2__create_example_table.sql
```

Naming: `V<version>__<snake_description>.sql` (double underscore). Never edit a
script that has already run on a shared environment — fix-forward with a new
version.

```bash
make {{infoLocal}}
make {{migrateLocal}}
```

### 4. Promote to dev / prod

1. Commit the SQL under `migration/<schema>/`.
2. Fill `flyway-<schema>-dev.conf` / `flyway-<schema>-prod.conf`.
3. **Always `info` before `migrate` on a shared database.**

```bash
make {{infoDev}}
make {{migrateDev}}

make {{infoProd}}
make {{migrateProd}}
```

## Schema isolation

- History table: `flyway_schema_history` **inside the schema**.
- Version numbers restart independently per folder.
- `flyway.locations` is set in each conf file — one schema per folder.
- No cross-schema scripts in a single migration file unless you intentionally
  use fully-qualified names.

## Production notes

- Run `info` first and read the pending list before `migrate`.
- `flyway-<schema>-prod.conf` is gitignored (`flyway-*-prod.conf`). Fill it in
  on the machine that runs the migration; it is never committed. Dev is
  committed with placeholders, so replace `<DEV_HOST>`, `<DEV_USER>` and
  `<DEV_PASSWORD>` before use or pass `-Dflyway.password` on the command.
- First time on a prod database that already has objects: `baseline`, then `migrate`.

## Schemas in this project

{{SCHEMAS_TABLE}}
