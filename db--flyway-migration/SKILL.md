---
name: db--flyway-migration
description: >-
  Scaffold a reusable multi-schema Flyway migration project (Maven + Makefile,
  no npm, no Maven profiles) for MySQL: per-schema migration folders,
  flyway-*-{local,dev,prod}.conf files, Makefile targets that pass
  -Dflyway.configFiles, baseline SQL, and README workflow. Use when the user
  wants to create a Flyway migration project, bootstrap schema migrations for
  one or more MySQL schemas, set up local/dev/prod Flyway confs, clone the
  working db-migration layout, or start a new Flyway project.
---

# Flyway multi-schema migration project scaffold

Creates a **standalone Flyway migration project** (Maven `pom` packaging) that
owns DDL for one or more MySQL schemas. Each schema gets:

- its own `src/main/resources/db/migration/<schema>/` folder
- independent version numbering (`V1__…` can exist in every schema)
- its own `flyway_schema_history` table (via JDBC URL → schema)
- conf files for **local / dev / prod**
- Makefile targets that pass the conf file on the `mvn` command

Reference layout (known working): `web.v2.centralsystem/db-migration` — the
`echarge` schema. Maven plugin only, Makefile, no profiles, no npm.

The package is intentionally thin: no application code. It holds SQL migrations,
Flyway confs, a Maven Flyway plugin, and a Makefile that wraps `mvn flyway:*`.

## Mandatory trigger

Invoke this skill before writing project/bootstrap files when the user asks to:

- "create a Flyway migration project" / "scaffold Flyway schemas"
- "set up multi-schema Flyway" / "local + dev + prod Flyway confs"
- "new Flyway project for \<schema(s)\>"
- "clone a multi-schema Flyway layout" / "bootstrap Flyway for two schemas"
- start a dedicated Flyway package under a monorepo `schema/` (or similar) folder

## Inputs

Collect (or infer) before generating. **Ask for anything missing.**

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | where to create the project | `./db-migration` |
| `projectName` | human / package label | last path segment of `targetDir` |
| `groupId` | Maven groupId | `com.example` (ask if unknown) |
| `artifactId` | Maven artifactId | `db-migrations` (default) |
| `schemas` | **one or more** MySQL schema names | `["echarge"]` — **required** |
| `timezone` | JDBC `serverTimezone` | `Asia/Hong_Kong` (default) |
| `includeBaseline` | ship empty `V0__baseline.sql` per schema | `true` (default) |
| `localUser` / `localPassword` | local MySQL creds | `root` / `root` |
| `devHost` / `prodHost` | optional host placeholders | leave as `<DEV_HOST>` / `<PROD_HOST>` if unknown |

### Schema list (do this first)

If `schemas` is not clear, ask. Support:

1. **Single schema** — e.g. only `echarge`
2. **Multiple schemas** — e.g. `billing` + `orders` (independent histories)

Normalize each name to a valid MySQL identifier (lowercase snake preferred).
Confirm `targetDir` is empty or user accepts overwrite before writing.

## What it produces

```
<targetDir>/
  pom.xml                 # plugin + driver only — NO <profiles>
  Makefile                # one target per schema × env × {baseline,info,migrate}
  README.md
  .gitignore              # flyway-*-prod.conf is ignored
  flyway-<schema>-local.conf     × N schemas
  flyway-<schema>-dev.conf       × N schemas  (placeholders, committed)
  flyway-<schema>-prod.conf      × N schemas  (placeholders, gitignored)
  src/main/resources/db/migration/
    <schema>/
      V0__baseline.sql           (if includeBaseline)
```

Do **not** generate `package.json`. Secrets in prod confs stay placeholders and
the file is gitignored — never invent real passwords. Dev confs are committed
with `<DEV_HOST>` / `<DEV_USER>` / `<DEV_PASSWORD>` placeholders.

## How to use

1. **Resolve inputs.** Ask for `schemas` and `targetDir` if missing. Default
   `projectName` from `targetDir`. Default `timezone` to `Asia/Hong_Kong`.

2. **Create directories.**

   ```bash
   mkdir -p <targetDir>/src/main/resources/db/migration
   for s in <schemas>; do
     mkdir -p <targetDir>/src/main/resources/db/migration/$s
   done
   ```

3. **Copy / render templates** from
   `<this skill>/templates/mysql/`:

   | Template | Action |
   |---|---|
   | `pom.xml` | Substitute project placeholders. **Do not add `<profiles>`.** |
   | `Makefile` | Expand `{{PHONY}}`, `{{HELP_ECHOES}}`, `{{RECIPES}}` — see below |
   | `README.md` | Substitute project + schema list + make target names |
   | `.gitignore` | Copy as-is (`flyway-*-prod.conf` stays ignored) |
   | `flyway-__SCHEMA__-local.conf` | One file per schema |
   | `flyway-__SCHEMA__-dev.conf` | same; host/user/password stay `<DEV_*>` unless given |
   | `flyway-__SCHEMA__-prod.conf` | same; host/user/password stay `<PROD_*>` |
   | `src/.../__SCHEMA__/V0__baseline.sql` | One per schema if `includeBaseline` |

   There is no `package.json` template. Do not create one.

4. **Substitute placeholders** in every generated text file:

   | Placeholder | Example |
   |---|---|
   | `{{projectName}}` | `db-migration` |
   | `{{groupId}}` | `com.example` |
   | `{{artifactId}}` | `db-migrations` |
   | `{{timezone}}` | `Asia/Hong_Kong` |
   | `{{schema}}` | current schema in per-schema files |
   | `{{SCHEMAS_LIST}}` | `` `echarge` `` or `` `billing`, `orders` `` |
   | `{{exampleSchema}}` | first schema |
   | `{{localUser}}` / `{{localPassword}}` | `root` / `root` |
   | `{{devHost}}` / `{{prodHost}}` | host or `<DEV_HOST>` / `<PROD_HOST>` |
   | `{{devUser}}` / `{{devPassword}}` | or `<DEV_USER>` / `<DEV_PASSWORD>` |
   | `{{prodUser}}` / `{{prodPassword}}` | or `<PROD_USER>` / `<PROD_PASSWORD>` |
   | `{{baselineLocal}}` `{{infoLocal}}` `{{migrateLocal}}` | see target naming |
   | `{{infoDev}}` `{{migrateDev}}` `{{infoProd}}` `{{migrateProd}}` | see target naming |
   | `{{COMMAND_BLOCK}}` | the `make` lines from the help target, without `@echo` |
   | `{{MULTI_SCHEMA_NOTE}}` | empty for one schema; otherwise `, and the matching schema suffix for every other schema` |
   | `{{SCHEMAS_TABLE}}` | markdown table, one row per schema |

5. **Makefile target naming.**

   | Schemas | Shape | Examples |
   |---|---|---|
   | **one** | `<goal>-<env>` | `baseline-local`, `info-dev`, `migrate-prod` |
   | **two or more** | `<goal>-<env>-<schema>` | `baseline-local-billing`, `migrate-dev-orders` |

   Goals that get a target: `baseline`, `info`, `migrate`.
   Envs: `local`, `dev`, `prod`.
   Do **not** add `validate` or `repair` targets. Those are recovery commands
   and stay as hand-typed `mvn` lines in the README.

   **`{{PHONY}}`** — continuation lines, each indented to line up under `help`,
   ending in ` \`. One line per schema per env feels noisy; group as one line
   per env (single schema) or one line per schema (multi), three targets on it
   (`baseline-… info-… migrate-…`). No trailing `\` on the last line.

   **`{{HELP_ECHOES}}`** — one `@echo` per target, two padded columns:

   ```
   	@echo "conf file                         command"
   	@echo "flyway-<schema>-<env>.conf        make <target>"
   ```

   Pad so `command` starts in the same column on every line. Recipe lines and
   `@echo` lines are **tabs**, not spaces.

   **`{{RECIPES}}`** — one stanza per target:

   ```makefile
   baseline-local:
   	mvn flyway:baseline -Dflyway.configFiles=flyway-echarge-local.conf

   info-local:
   	mvn flyway:info -Dflyway.configFiles=flyway-echarge-local.conf

   migrate-local:
   	mvn flyway:migrate -Dflyway.configFiles=flyway-echarge-local.conf
   ```

   Blank line between stanzas. Order: local, dev, prod; within an env the
   schema order from `schemas`. Full worked examples are in
   `references/example-expansion.md`.

6. **Do not add Maven profiles.** The plugin has no `<configuration>` block.
   The conf file is selected only by `-Dflyway.configFiles=` from the Makefile.
   `pom.xml` properties are `project.build.sourceEncoding`, `flyway.version`
   (`10.21.0`), `mysql.connector.version` (`8.4.0`). No compiler source/target
   properties — this module has no Java sources.

7. **Baseline file.** If `includeBaseline` is true, write `V0__baseline.sql`
   per schema (comment-only marker) and put the matching `make` target in the
   comment (`make baseline-local`, or `make baseline-local-<schema>` when there
   is more than one schema). Tell the user:

   - **Existing DB with tables:** run `baseline` first, keep `V0`, add new
     work as `V1__…` forward.
   - **Brand-new empty schema:** skip baseline. `migrate` creates the history
     table and applies `V1` onward. `V0` may be deleted.

8. **Stop after scaffold** unless the user also asked for domain SQL or to run
   migrate. Report created paths + the cheat sheet below.

## Encoded workflow (do not invent alternate commands)

Single schema (the default shape — matches the working `echarge` project):

```bash
# Preview pending migrations
make info-local
# or: mvn flyway:info -Dflyway.configFiles=flyway-<schema>-local.conf

# First time on a DB that already has objects
make baseline-local

# Apply
make migrate-local
```

Multiple schemas — append `-<schema>`:

```bash
make info-local-billing
make baseline-local-billing
make migrate-local-billing
```

**Promotion:** commit SQL under `migration/<schema>/` →
`make info-dev` → `make migrate-dev` → later
`make info-prod` → `make migrate-prod`.

**Always run `info` before `migrate` on shared/prod.**

**Run from the migration directory.** `flyway.locations` is relative
(`filesystem:src/main/resources/db/migration/<schema>`), and a parent
application POM will not have this plugin.

## Schema isolation rules (encode in README; do not break)

1. **No `USE schema;`** in migration SQL. The JDBC URL already selects the
   schema (`jdbc:mysql://host:3306/<schema>?…`).
2. **One history table per schema** — default name `flyway_schema_history`
   inside that schema.
3. **Independent version streams** — `billing/V1__…` and `orders/V1__…` do not
   conflict.
4. **Locations live in the conf file**, not in a Maven profile. Never point
   two schemas at the same folder.
5. **Out of order** stays `false`; `validateOnMigrate` stays `true` unless the
   user overrides.
6. **`baselineOnMigrate` stays `false`.** Baselining is an explicit `make`
   target, never a side effect of `migrate`.

## Adding a migration (agent guidance after scaffold)

```
src/main/resources/db/migration/<schema>/
  V1__create_payment_record.sql
  V2__add_status_column.sql
```

Naming: `V<version>__<snake_description>.sql` (double underscore). Prefer
integer versions (`V1`, `V2`, …) matching the reference project. Do not edit
already-applied scripts; fix-forward with a new version.

## Template files

```
templates/mysql/
  pom.xml
  Makefile
  README.md
  .gitignore
  flyway-__SCHEMA__-local.conf
  flyway-__SCHEMA__-dev.conf
  flyway-__SCHEMA__-prod.conf
  src/main/resources/db/migration/__SCHEMA__/V0__baseline.sql
```

When scaffolding, **never** leave the literal `__SCHEMA__` path or any
`{{…}}` token on disk — always expand to real schema names and real Make
targets.

### Conf file shape (per schema × env)

```properties
# Flyway configuration - {{schema}} schema (LOCAL|DEV|PROD)

flyway.url=jdbc:mysql://{{host}}:3306/{{schema}}?useSSL={{ssl}}&allowPublicKeyRetrieval=true&serverTimezone={{timezone}}
flyway.user={{user}}
flyway.password={{password}}

flyway.locations=filesystem:src/main/resources/db/migration/{{schema}}
flyway.table=flyway_schema_history

flyway.baselineOnMigrate=false
flyway.baselineVersion=0
flyway.outOfOrder=false
flyway.validateOnMigrate=true
```

Env defaults for URL flags:

| Env | host default | useSSL | allowPublicKeyRetrieval |
|---|---|---|---|
| local | `localhost` | `false` | `true` |
| dev | `{{devHost}}` or `<DEV_HOST>` | `false` | `true` |
| prod | `{{prodHost}}` or `<PROD_HOST>` | `true` | omit |

Prod URL has **no** `allowPublicKeyRetrieval`. Dev and prod confs carry the
"fill in before running" comment block from the templates.

## Notes / gotchas

- **No npm, no Maven profiles.** The working setup passes the conf file with
  `-Dflyway.configFiles=flyway-<schema>-<env>.conf`. A profile named in
  `package.json` but missing from the pom (or the reverse) was the failure
  mode this layout replaces. Do not reintroduce either.
- **Makefile tabs.** Recipe bodies and `@echo` lines must be real tabs. Spaces
  make `make` fail with "missing separator".
- **Single vs multi target names.** One schema omits the schema suffix so the
  commands stay `make migrate-local`. Adding a second schema means **every**
  target grows a `-<schema>` suffix, including the first schema's — do not mix
  the two shapes in one Makefile.
- **Versions pinned in template:** Flyway `10.21.0`, `mysql-connector-j`
  `8.4.0`, plus `flyway-mysql` at the same Flyway version (required; without
  it the MySQL plugin fails to load). Java 17. Bump only if the user asks.
- **Database creation is out of band.** Flyway does not `CREATE DATABASE`; each
  schema must already exist on the server.
- **Prod credentials.** `flyway-*-prod.conf` is gitignored. Generate the file
  anyway (placeholders) so the Makefile targets have something to point at,
  and say so in the report — the user fills it on the machine that migrates.
  Dev confs are committed with placeholders.
- **Password special characters.** Conf values are literal properties (not
  URI-encoded).
- **Baseline vs migrate.** On an existing populated schema: `baseline` then only
  new versions. On empty: `migrate` from `V1` (optional `V0` baseline marker).
- **Working directory.** Commands run inside the migration project. Relative
  `flyway.locations` breaks if invoked from a parent module.
- **No mixed engines in this skill.** Templates are MySQL-only. If the user
  needs PostgreSQL Flyway, ask before inventing — extend templates rather than
  silently swapping drivers.
- **`pom` packaging.** This is not a jar application module; keep
  `<packaging>pom</packaging>`.
- **Standalone.** Do not nest under a parent multi-module POM unless the user
  explicitly wants that.

## Verify

After scaffold:

- [ ] Every schema has `src/main/resources/db/migration/<schema>/`
- [ ] Every schema has local + dev + prod conf files with that schema in the JDBC URL path
- [ ] `pom.xml` has the Flyway plugin, `mysql-connector-j`, and `flyway-mysql` — and **no** `<profiles>` and **no** `<configuration>`
- [ ] No `package.json`
- [ ] `Makefile` recipes use tabs and `-Dflyway.configFiles=flyway-<schema>-<env>.conf`
- [ ] One schema → targets are `<goal>-<env>`; two or more → `<goal>-<env>-<schema>` on **every** target
- [ ] `make` (no args) prints the conf-file / command table and is the default goal (`help` is first)
- [ ] No `validate` / `repair` Make targets; README shows them as raw `mvn` lines
- [ ] No leftover `__SCHEMA__` or `{{…}}` placeholders (except intentional
      `<DEV_HOST>`-style credential stubs)
- [ ] `.gitignore` ignores `flyway-*-prod.conf`
- [ ] README documents `info` → `migrate` and baseline for existing DBs
- [ ] `V0__baseline.sql` is comment-only (no DDL) when included, and names the
      real `make baseline-…` target

Optional smoke (requires local MySQL + schema created):

```bash
make info-local          # single schema
make info-local-<schema> # multi schema
```

## Dependencies

- JDK 17+
- Maven 3.8+
- MySQL 8.x reachable for actual migrate (not required merely to scaffold files)
- `make` (the targets are thin wrappers; no extra Make features)

## Cheat sheet to report after scaffold

Single schema:

```bash
make info-local
make baseline-local   # first time on existing DB
make migrate-local

make info-dev         # fill flyway-<schema>-dev.conf first
make migrate-dev
make info-prod        # always info before migrate; prod conf is gitignored
make migrate-prod
```

Multiple schemas — same commands with `-<schema>` appended
(`make migrate-local-billing`).

Add a migration: create
`src/main/resources/db/migration/<schema>/V<n>__<description>.sql` then
`make migrate-local` (or `make migrate-local-<schema>`).
