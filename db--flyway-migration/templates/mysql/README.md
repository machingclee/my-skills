# {{projectName}} — Flyway migration project

Standalone Flyway project for MySQL schema(s): {{SCHEMAS_LIST}}.

Each schema has an **independent** migration history and version stream. The
JDBC URL selects the schema; migration SQL must **not** include `USE <schema>;`.

## Layout

```
.
├── pom.xml                          # Maven Flyway plugin + profiles
├── package.json                     # npm wrappers: info|baseline|migrate|repair|validate
├── flyway-<schema>-local.conf
├── flyway-<schema>-dev.conf
├── flyway-<schema>-prod.conf
└── src/main/resources/db/migration/
    └── <schema>/
        ├── V0__baseline.sql         # optional baseline marker
        └── V1__….sql
```

## Profiles

| Maven profile        | Conf file                      | Target        |
|----------------------|--------------------------------|---------------|
| `<schema>-local`     | `flyway-<schema>-local.conf`   | localhost     |
| `<schema>-dev`       | `flyway-<schema>-dev.conf`     | shared / RDS  |
| `<schema>-prod`      | `flyway-<schema>-prod.conf`    | production    |

Always pass an explicit profile: `mvn flyway:info -P billing-local`.

## npm scripts

Pattern: `<command>:<env>:<schema>`

```bash
npm run info:local:{{exampleSchema}}
npm run baseline:local:{{exampleSchema}}
npm run migrate:local:{{exampleSchema}}
npm run repair:local:{{exampleSchema}}
npm run validate:local:{{exampleSchema}}

npm run info:dev:{{exampleSchema}}
npm run migrate:dev:{{exampleSchema}}

npm run info:prod:{{exampleSchema}}
npm run migrate:prod:{{exampleSchema}}
```

Equivalent Maven:

```bash
mvn flyway:info -P {{exampleSchema}}-local
mvn flyway:baseline -P {{exampleSchema}}-local
mvn flyway:migrate -P {{exampleSchema}}-local
```

## Workflow

### 1. Prerequisites

- JDK 17+, Maven 3.8+
- MySQL 8.x with each schema already created (`CREATE DATABASE …`)
- Credentials filled in the relevant `flyway-*.conf`

### 2. First-time setup

**Empty schema:**

```bash
npm run migrate:local:{{exampleSchema}}
```

**Existing schema that already has tables** (do not re-run old DDL):

```bash
npm run baseline:local:{{exampleSchema}}
# then add only new V1__*.sql files and migrate
npm run migrate:local:{{exampleSchema}}
```

### 3. Add a migration

Create a new file under the schema folder:

```
src/main/resources/db/migration/{{exampleSchema}}/V1__create_example_table.sql
```

Naming: `V<version>__<snake_description>.sql` (double underscore). Never edit
scripts that already ran on a shared environment — fix-forward with a new version.

```bash
npm run info:local:{{exampleSchema}}
npm run migrate:local:{{exampleSchema}}
```

### 4. Promote to dev / prod

1. Commit the SQL under `migration/<schema>/`.
2. Fill `flyway-<schema>-dev.conf` / `flyway-<schema>-prod.conf`.
3. **Always `info` before `migrate` on shared DBs.**

```bash
npm run info:dev:{{exampleSchema}}
npm run migrate:dev:{{exampleSchema}}

npm run info:prod:{{exampleSchema}}
npm run migrate:prod:{{exampleSchema}}
```

## Schema isolation

- History table: `flyway_schema_history` **inside each schema**.
- Version numbers restart independently per folder.
- `flyway.locations` is profile-specific — one schema per folder.
- No cross-schema scripts in a single migration file unless you intentionally
  use fully-qualified names (prefer separate schemas and separate deploys).

## Production notes

- ⚠️ Run `info` first and read the pending list before `migrate`.
- ⚠️ Prefer not committing real prod passwords. Use placeholders in git and
  machine-local confs, or gitignore `*-prod.conf`.
- First time on a prod DB that already has objects: `baseline` then `migrate`.

## Schemas in this project

{{SCHEMAS_TABLE}}
