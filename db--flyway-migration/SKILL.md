---
name: db--flyway-migration
description: >-
  Scaffold a reusable multi-schema Flyway migration project (Maven + npm
  scripts) for MySQL: per-schema migration folders, flyway-*-{local,dev,prod}.conf
  files, Maven profiles, package.json env/schema-scoped scripts, baseline SQL,
  and README workflow. Use when the user wants to create a Flyway migration
  project, bootstrap schema migrations for multiple MySQL schemas, set up
  local/dev/prod Flyway profiles, clone the echarge-and-ecapi layout, or start
  a new Flyway project under a monorepo schema/ folder.
---

# Flyway multi-schema migration project scaffold

Creates a **standalone Flyway migration project** (Maven `pom` packaging) that
owns DDL for one or more MySQL schemas. Each schema gets:

- its own `src/main/resources/db/migration/<schema>/` folder
- independent version numbering (`V1__…` can exist in every schema)
- its own `flyway_schema_history` table (via JDBC URL → schema)
- conf files + Maven profiles for **local / dev / prod**

Reference layout: `echarge-schema-migration/schema/echarge-and-ecapi`.

The package is intentionally thin: no application code. It holds SQL migrations,
Flyway confs, a Maven Flyway plugin, and npm scripts that wrap `mvn flyway:*`.

## Mandatory trigger

Invoke this skill before writing project/bootstrap files when the user asks to:

- "create a Flyway migration project" / "scaffold Flyway schemas"
- "set up multi-schema Flyway" / "local + dev + prod Flyway confs"
- "new Flyway project for \<schema(s)\>"
- "clone the echarge-and-ecapi layout" / "bootstrap like echarge Flyway"
- start a dedicated Flyway package under a monorepo `schema/` (or similar) folder

## Inputs

Collect (or infer) before generating. **Ask for anything missing.**

| Input | Meaning | Example / default |
|---|---|---|
| `targetDir` | where to create the project | `./schema/billing-and-orders` |
| `projectName` | human / package label | last path segment of `targetDir` |
| `groupId` | Maven groupId | `com.example` (ask if unknown) |
| `artifactId` | Maven artifactId | `db-migrations` (default) |
| `schemas` | **one or more** MySQL schema names | `["billing","orders"]` — **required** |
| `timezone` | JDBC `serverTimezone` | `Asia/Hong_Kong` (default) |
| `includeBaseline` | ship empty `V0__baseline.sql` per schema | `true` (default) |
| `localUser` / `localPassword` | local MySQL creds | `root` / `root` |
| `devHost` / `prodHost` | optional host placeholders | leave as `<DEV_HOST>` / `<PROD_HOST>` if unknown |

### Schema list (do this first)

If `schemas` is not clear, ask. Support:

1. **Single schema** — e.g. only `billing`
2. **Multiple schemas** — e.g. `echarge` + `ecapi` (independent histories)

Normalize each name to a valid MySQL identifier (lowercase snake preferred).
Confirm `targetDir` is empty or user accepts overwrite before writing.

## What it produces

```
<targetDir>/
  pom.xml
  package.json
  README.md
  .gitignore
  flyway-<schema>-local.conf     × N schemas
  flyway-<schema>-dev.conf       × N schemas
  flyway-<schema>-prod.conf      × N schemas
  src/main/resources/db/migration/
    <schema>/
      V0__baseline.sql           (if includeBaseline)
```

Secrets in prod (and often dev) confs should stay placeholders or gitignored —
never invent real passwords.

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
   | `pom.xml` | Expand `{{PROFILES}}` for every schema × env |
   | `package.json` | Expand scripts for every schema × env × command |
   | `README.md` | Substitute project + schema list |
   | `.gitignore` | Copy as-is |
   | `flyway-__SCHEMA__-local.conf` | One file per schema; substitute `__SCHEMA__` / placeholders |
   | `flyway-__SCHEMA__-dev.conf` | same |
   | `flyway-__SCHEMA__-prod.conf` | same |
   | `src/.../__SCHEMA__/V0__baseline.sql` | One per schema if `includeBaseline` |

4. **Substitute placeholders** in every generated text file:

   | Placeholder | Example |
   |---|---|
   | `{{projectName}}` | `billing-and-orders` |
   | `{{groupId}}` | `com.example` |
   | `{{artifactId}}` | `db-migrations` |
   | `{{timezone}}` | `Asia/Hong_Kong` |
   | `{{schema}}` | current schema in per-schema files |
   | `{{SCHEMAS_LIST}}` | `` `billing`, `orders` `` |
   | `{{localUser}}` / `{{localPassword}}` | `root` / `root` |
   | `{{devHost}}` / `{{prodHost}}` | host or `<DEV_HOST>` / `<PROD_HOST>` |
   | `{{devUser}}` / `{{devPassword}}` | or `<DEV_USER>` / `<DEV_PASSWORD>` |
   | `{{prodUser}}` / `{{prodPassword}}` | or `<PROD_USER>` / `<PROD_PASSWORD>` |

5. **Expand Maven profiles** (see template comments). For **each** schema `S`
   create three profiles:

   | Profile id | conf file | locations |
   |---|---|---|
   | `S-local` | `flyway-S-local.conf` | `.../migration/S` |
   | `S-dev` | `flyway-S-dev.conf` | `.../migration/S` |
   | `S-prod` | `flyway-S-prod.conf` | `.../migration/S` |

   Mark the **first schema’s `S-dev`** profile `activeByDefault` only if a
   default is useful; otherwise leave none active (force explicit `-P`).

6. **Expand npm scripts.** For each schema `S` and each env
   `E ∈ {local,dev,prod}`:

   ```
   info:E:S      → mvn flyway:info -P S-E
   baseline:E:S  → mvn flyway:baseline -P S-E
   migrate:E:S   → mvn flyway:migrate -P S-E
   repair:E:S    → mvn flyway:repair -P S-E
   validate:E:S  → mvn flyway:validate -P S-E
   ```

   Profile ids **must** match package.json (`S-local`, `S-dev`, `S-prod`).
   Do not invent short aliases like `-P S` unless the user asks — keep names
   consistent so local/dev/prod never collide.

7. **Baseline file.** If `includeBaseline` is true, write
   `V0__baseline.sql` per schema (comment-only marker). Tell the user:

   - **Existing DB with tables:** run `baseline` first, keep `V0`, add new
     work as `V1__…` forward.
   - **Brand-new empty schema:** may delete `V0` and start at `V1__…`, or
     baseline at 0 and migrate from `V1`.

8. **Stop after scaffold** unless the user also asked for domain SQL or to run
   migrate. Report created paths + the cheat sheet below.

## Encoded workflow (do not invent alternate commands)

```bash
# Preview pending migrations
npm run info:local:<schema>
# or: mvn flyway:info -P <schema>-local

# First time on a DB that already has objects
npm run baseline:local:<schema>

# Apply
npm run migrate:local:<schema>

# Repair failed checksums / failed rows (careful)
npm run repair:local:<schema>

# Validate applied vs local scripts
npm run validate:local:<schema>
```

**Promotion:** commit SQL under `migration/<schema>/` →
`info:dev:<schema>` → `migrate:dev:<schema>` → later
`info:prod:<schema>` → `migrate:prod:<schema>`.

**Always run `info` before `migrate` on shared/prod.**

## Schema isolation rules (encode in README; do not break)

1. **No `USE schema;`** in migration SQL. The JDBC URL already selects the
   schema (`jdbc:mysql://host:3306/<schema>?…`).
2. **One history table per schema** — default name `flyway_schema_history`
   inside that schema.
3. **Independent version streams** — `echarge/V1__…` and `ecapi/V1__…` do not
   conflict.
4. **Locations are per profile** — never point two schemas at the same folder.
5. **Out of order** stays `false`; `validateOnMigrate` stays `true` unless the
   user overrides.

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
  package.json
  README.md
  .gitignore
  flyway-__SCHEMA__-local.conf
  flyway-__SCHEMA__-dev.conf
  flyway-__SCHEMA__-prod.conf
  src/main/resources/db/migration/__SCHEMA__/V0__baseline.sql
```

When scaffolding, **never** leave the literal `__SCHEMA__` path on disk — always
expand to real schema names.

### Profile snippet (repeat per schema)

```xml
<profile>
    <id>{{schema}}-local</id>
    <properties>
        <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/{{schema}}</flyway.locations>
        <flyway.configFiles>${project.basedir}/flyway-{{schema}}-local.conf</flyway.configFiles>
    </properties>
</profile>
<profile>
    <id>{{schema}}-dev</id>
    <properties>
        <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/{{schema}}</flyway.locations>
        <flyway.configFiles>${project.basedir}/flyway-{{schema}}-dev.conf</flyway.configFiles>
    </properties>
</profile>
<profile>
    <id>{{schema}}-prod</id>
    <properties>
        <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/{{schema}}</flyway.locations>
        <flyway.configFiles>${project.basedir}/flyway-{{schema}}-prod.conf</flyway.configFiles>
    </properties>
</profile>
```

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
| prod | `{{prodHost}}` or `<PROD_HOST>` | `true` | omit or `false` |

## Notes / gotchas

- **Profile id consistency.** npm scripts and Maven `-P` must use the same ids
  (`billing-local`, not `billing` vs `billing-local`). The historical echarge
  package.json used short `-P echarge` while pom used `echarge-dev` — **do not
  reproduce that drift** in new projects.
- **Versions pinned in template:** Flyway `10.21.0`, `mysql-connector-j` `8.4.0`,
  Java 17. Bump only if the user asks.
- **Database creation is out of band.** Flyway does not `CREATE DATABASE`; each
  schema must already exist on the server.
- **Prod credentials.** Prefer placeholders + gitignore of `*-prod.conf` (or
  fill secrets only on the machine that deploys). Never commit real prod
  passwords in the skill output.
- **Password special characters.** In conf files, values are literal properties
  (not URI-encoded). Quote carefully if using XML overrides; prefer conf files.
- **Baseline vs migrate.** On an existing populated schema: `baseline` then only
  new versions. On empty: `migrate` from `V1` (optional `V0` baseline marker).
- **Monorepo placement.** Typical path: `schema/<projectName>/`.
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
- [ ] Every schema has Maven profiles `<schema>-local|dev|prod`
- [ ] `package.json` scripts use the same profile ids
- [ ] No leftover `__SCHEMA__` or `{{…}}` placeholders (except intentional
      `<DEV_HOST>`-style credential stubs)
- [ ] `.gitignore` covers `target/`, IDE junk; optionally `*-prod.conf` if secrets live there
- [ ] README documents `info` → `migrate` and baseline for existing DBs
- [ ] `V0__baseline.sql` is comment-only (no DDL) when included

Optional smoke (requires local MySQL + schema created):

```bash
mvn -q flyway:info -P <schema>-local
# or
npm run info:local:<schema>
```

## Dependencies

- JDK 17+
- Maven 3.8+
- MySQL 8.x reachable for actual migrate (not required merely to scaffold files)
- Node/npm only if the user wants the `package.json` script wrappers (optional but always generated)

## Cheat sheet to report after scaffold

```bash
# Local
npm run info:local:<schema>
npm run baseline:local:<schema>   # first time on existing DB
npm run migrate:local:<schema>

# Dev / prod (fill conf credentials first)
npm run info:dev:<schema>
npm run migrate:dev:<schema>
npm run info:prod:<schema>        # always info before migrate
npm run migrate:prod:<schema>
```

Add a migration: create
`src/main/resources/db/migration/<schema>/V<n>__<description>.sql` then
`npm run migrate:local:<schema>`.
