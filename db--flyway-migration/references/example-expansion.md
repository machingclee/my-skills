# Example expansion (two schemas: `billing`, `orders`)

Use this as a checklist when rendering `{{PROFILES}}` and `{{SCRIPTS}}`.

## Inputs

```
targetDir     = ./schema/billing-and-orders
projectName   = billing-and-orders
groupId       = com.example
artifactId    = db-migrations
schemas       = billing, orders
timezone      = Asia/Hong_Kong
localUser     = root
localPassword = root
devHost       = <DEV_HOST>
prodHost      = <PROD_HOST>
```

## Files created

```
billing-and-orders/
  pom.xml
  package.json
  README.md
  .gitignore
  flyway-billing-local.conf
  flyway-billing-dev.conf
  flyway-billing-prod.conf
  flyway-orders-local.conf
  flyway-orders-dev.conf
  flyway-orders-prod.conf
  src/main/resources/db/migration/billing/V0__baseline.sql
  src/main/resources/db/migration/orders/V0__baseline.sql
```

## `{{PROFILES}}` body (inside `<profiles>`)

```xml
        <profile>
            <id>billing-local</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/billing</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-billing-local.conf</flyway.configFiles>
            </properties>
        </profile>
        <profile>
            <id>billing-dev</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/billing</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-billing-dev.conf</flyway.configFiles>
            </properties>
        </profile>
        <profile>
            <id>billing-prod</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/billing</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-billing-prod.conf</flyway.configFiles>
            </properties>
        </profile>
        <profile>
            <id>orders-local</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/orders</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-orders-local.conf</flyway.configFiles>
            </properties>
        </profile>
        <profile>
            <id>orders-dev</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/orders</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-orders-dev.conf</flyway.configFiles>
            </properties>
        </profile>
        <profile>
            <id>orders-prod</id>
            <properties>
                <flyway.locations>filesystem:${project.basedir}/src/main/resources/db/migration/orders</flyway.locations>
                <flyway.configFiles>${project.basedir}/flyway-orders-prod.conf</flyway.configFiles>
            </properties>
        </profile>
```

Remove the `BEGIN_PROFILE_TEMPLATE` comment block from the rendered `pom.xml`.

## `{{SCRIPTS}}` body (inside `package.json` `"scripts"`)

Valid JSON — **commas between entries, no trailing comma on the last line**.

```json
    "info:local:billing": "mvn flyway:info -P billing-local",
    "info:local:orders": "mvn flyway:info -P orders-local",
    "info:dev:billing": "mvn flyway:info -P billing-dev",
    "info:dev:orders": "mvn flyway:info -P orders-dev",
    "info:prod:billing": "mvn flyway:info -P billing-prod",
    "info:prod:orders": "mvn flyway:info -P orders-prod",

    "baseline:local:billing": "mvn flyway:baseline -P billing-local",
    "baseline:local:orders": "mvn flyway:baseline -P orders-local",
    "baseline:dev:billing": "mvn flyway:baseline -P billing-dev",
    "baseline:dev:orders": "mvn flyway:baseline -P orders-dev",
    "baseline:prod:billing": "mvn flyway:baseline -P billing-prod",
    "baseline:prod:orders": "mvn flyway:baseline -P orders-prod",

    "migrate:local:billing": "mvn flyway:migrate -P billing-local",
    "migrate:local:orders": "mvn flyway:migrate -P orders-local",
    "migrate:dev:billing": "mvn flyway:migrate -P billing-dev",
    "migrate:dev:orders": "mvn flyway:migrate -P orders-dev",
    "migrate:prod:billing": "mvn flyway:migrate -P billing-prod",
    "migrate:prod:orders": "mvn flyway:migrate -P orders-prod",

    "repair:local:billing": "mvn flyway:repair -P billing-local",
    "repair:local:orders": "mvn flyway:repair -P orders-local",
    "repair:dev:billing": "mvn flyway:repair -P billing-dev",
    "repair:dev:orders": "mvn flyway:repair -P orders-dev",
    "repair:prod:billing": "mvn flyway:repair -P billing-prod",
    "repair:prod:orders": "mvn flyway:repair -P orders-prod",

    "validate:local:billing": "mvn flyway:validate -P billing-local",
    "validate:local:orders": "mvn flyway:validate -P orders-local",
    "validate:dev:billing": "mvn flyway:validate -P billing-dev",
    "validate:dev:orders": "mvn flyway:validate -P orders-dev",
    "validate:prod:billing": "mvn flyway:validate -P billing-prod",
    "validate:prod:orders": "mvn flyway:validate -P orders-prod"
```

## README substitutions

| Placeholder | Value |
|---|---|
| `{{projectName}}` | `billing-and-orders` |
| `{{SCHEMAS_LIST}}` | `` `billing`, `orders` `` |
| `{{exampleSchema}}` | `billing` (first schema) |
| `{{SCHEMAS_TABLE}}` | markdown table of schema → conf trio |

Example `{{SCHEMAS_TABLE}}`:

```markdown
| Schema | Local conf | Dev conf | Prod conf |
|--------|------------|----------|-----------|
| `billing` | `flyway-billing-local.conf` | `flyway-billing-dev.conf` | `flyway-billing-prod.conf` |
| `orders` | `flyway-orders-local.conf` | `flyway-orders-dev.conf` | `flyway-orders-prod.conf` |
```

## Single-schema case

Same algorithm with `schemas = [inventory]`: one migration folder, three confs,
three profiles, fifteen npm scripts (5 commands × 3 envs × 1 schema).
