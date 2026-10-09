# Example expansion

The working layout is Maven + Makefile. There is no `package.json` and no
Maven `<profiles>` block. The conf file is named on the `mvn` command via
`-Dflyway.configFiles=…`, which is what the Makefile targets wrap.

## Target naming

| Schemas | Target shape | Example |
|---|---|---|
| one | `<goal>-<env>` | `make migrate-local` |
| two or more | `<goal>-<env>-<schema>` | `make migrate-local-billing` |

Goals in the Makefile: `baseline`, `info`, `migrate`.
`validate` and `repair` are typed by hand so the conf file is a deliberate choice.

## Inputs (two schemas)

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
  Makefile
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

No `package.json`. `pom.xml` has the Flyway plugin and the MySQL driver only —
no `<profiles>`, no `<configuration><configFiles>`.

## Makefile (multi-schema)

Tabs, not spaces, before each recipe line and each `@echo`.

```makefile
# Run from this directory: make info-local-billing, make migrate-dev-orders, ...
# `make` on its own lists the targets.

.PHONY: help \
        baseline-local-billing info-local-billing migrate-local-billing \
        baseline-dev-billing info-dev-billing migrate-dev-billing \
        baseline-prod-billing info-prod-billing migrate-prod-billing \
        baseline-local-orders info-local-orders migrate-local-orders \
        baseline-dev-orders info-dev-orders migrate-dev-orders \
        baseline-prod-orders info-prod-orders migrate-prod-orders

help:
	@echo "conf file                       command"
	@echo "flyway-billing-local.conf       make baseline-local-billing"
	@echo "flyway-billing-local.conf       make info-local-billing"
	@echo "flyway-billing-local.conf       make migrate-local-billing"
	@echo "flyway-billing-dev.conf         make baseline-dev-billing"
	@echo "flyway-billing-dev.conf         make info-dev-billing"
	@echo "flyway-billing-dev.conf         make migrate-dev-billing"
	@echo "flyway-billing-prod.conf        make baseline-prod-billing"
	@echo "flyway-billing-prod.conf        make info-prod-billing"
	@echo "flyway-billing-prod.conf        make migrate-prod-billing"
	@echo "flyway-orders-local.conf        make baseline-local-orders"
	@echo "flyway-orders-local.conf        make info-local-orders"
	@echo "flyway-orders-local.conf        make migrate-local-orders"
	@echo "flyway-orders-dev.conf          make baseline-dev-orders"
	@echo "flyway-orders-dev.conf          make info-dev-orders"
	@echo "flyway-orders-dev.conf          make migrate-dev-orders"
	@echo "flyway-orders-prod.conf         make baseline-prod-orders"
	@echo "flyway-orders-prod.conf         make info-prod-orders"
	@echo "flyway-orders-prod.conf         make migrate-prod-orders"

baseline-local-billing:
	mvn flyway:baseline -Dflyway.configFiles=flyway-billing-local.conf

info-local-billing:
	mvn flyway:info -Dflyway.configFiles=flyway-billing-local.conf

migrate-local-billing:
	mvn flyway:migrate -Dflyway.configFiles=flyway-billing-local.conf

# ... same three recipes for billing-dev, billing-prod,
#     and orders-local / orders-dev / orders-prod
```

Pad the two help columns so the commands line up. Column 1 is the conf file,
column 2 is `make <target>`.

## Makefile (single schema)

Drop the schema suffix. This is the shape that is known to work
(`db-migration` for the `echarge` schema):

```makefile
.PHONY: help \
        baseline-local info-local migrate-local \
        baseline-dev info-dev migrate-dev \
        baseline-prod info-prod migrate-prod

help:
	@echo "conf file                         command"
	@echo "flyway-inventory-local.conf       make baseline-local"
	@echo "flyway-inventory-local.conf       make info-local"
	@echo "flyway-inventory-local.conf       make migrate-local"
	@echo "flyway-inventory-dev.conf         make baseline-dev"
	@echo "flyway-inventory-dev.conf         make info-dev"
	@echo "flyway-inventory-dev.conf         make migrate-dev"
	@echo "flyway-inventory-prod.conf        make baseline-prod"
	@echo "flyway-inventory-prod.conf        make info-prod"
	@echo "flyway-inventory-prod.conf        make migrate-prod"

baseline-local:
	mvn flyway:baseline -Dflyway.configFiles=flyway-inventory-local.conf

info-local:
	mvn flyway:info -Dflyway.configFiles=flyway-inventory-local.conf

migrate-local:
	mvn flyway:migrate -Dflyway.configFiles=flyway-inventory-local.conf
```

## README substitutions

| Placeholder | One schema (`inventory`) | Two schemas |
|---|---|---|
| `{{projectName}}` | `inventory` | `billing-and-orders` |
| `{{SCHEMAS_LIST}}` | `` `inventory` `` | `` `billing`, `orders` `` |
| `{{exampleSchema}}` | `inventory` | `billing` (first) |
| `{{baselineLocal}}` etc. | `baseline-local` | `baseline-local-billing` |
| `{{MULTI_SCHEMA_NOTE}}` | empty | `, and the matching schema suffix for every other schema` |
| `{{COMMAND_BLOCK}}` | the nine `make` lines, no schema suffix | the eighteen `make` lines, schema suffix on each |
| `{{SCHEMAS_TABLE}}` | one row | one row per schema |

`{{SCHEMAS_TABLE}}` matches the working README: host/credential status, not a
conf-file inventory (the layout section already lists the files).

```markdown
| Schema | Local | Dev | Prod |
|--------|-------|-----|------|
| `billing` | `localhost` / `root` | placeholders — fill before use | placeholders — fill before use; gitignored |
| `orders` | `localhost` / `root` | placeholders — fill before use | placeholders — fill before use; gitignored |
```

## pom.xml

Copy the template and substitute `{{groupId}}`, `{{artifactId}}`,
`{{projectName}}`, `{{SCHEMAS_LIST}}`. Do not add profiles. Do not add a
`<configuration>` block — the Makefile passes the conf file.
