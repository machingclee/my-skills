---
name: spring--read-write-datasource
description: >-
  Scaffold a read/write routing DataSource in a Spring Boot + Spring Data JPA
  project: an AbstractRoutingDataSource that sends @Transactional(readOnly=true)
  traffic to a read replica and everything else to the primary, wired through a
  LazyConnectionDataSourceProxy, a single EntityManagerFactory and transaction
  manager, a @ConfigurationProperties YAML binding that supports multiple replica
  URLs, and an optional round-robin load balancer. Use when setting up database
  read/write splitting, configuring a routing or abstract routing datasource,
  separating read-replica traffic from primary writes, adding a read replica to a
  Spring Boot app, or replacing a manual two-datasource / two-repository-package
  setup with automatic read-only routing.
---

# Read/Write Routing DataSource Scaffold

This skill scaffolds a routing DataSource that splits read-only traffic to a
replica and everything else to the primary, driven entirely by the current
transaction's read-only flag. It replaces the manual two-datasource,
two-EntityManagerFactory, two-repository-package approach with a single
configuration and a single flat repository package.

## Mandatory Trigger

Invoke this skill before writing datasource or JPA configuration code when the
user asks to:

- "set up a read/write split" / "route reads to a replica" / "routing datasource".
- "add a read replica" to a Spring Boot app.
- "configure AbstractRoutingDataSource" or "LazyConnectionDataSourceProxy".
- "separate read and write databases" / "read-only transaction routing".
- replace a manual two-datasource setup (two EMFs, `repository.read` +
  `repository.write`) with automatic routing.

## What It Produces

Create this layout under the project's source root. Rename `com.example` to the
project's base package in every file.

```
src/main/java/com/example/config/
  datasource/
    DataSourceProperties.java     # @ConfigurationProperties("app.datasource")
    RoutingDataSource.java        # AbstractRoutingDataSource, switches on readOnly
    LoadBalancedDataSource.java   # round-robin over multiple read URLs (optional)
    DataSourceConfiguration.java  # builds pools, wires routing + lazy proxy (@Primary)
  jpa/
    JpaConfiguration.java         # one EntityManagerFactory + one transaction manager
src/main/resources/
  application.yml                 # add the app.datasource block
```

The templates under `templates/` in this skill folder map 1:1 to the tree above.

## How To Use

1. Copy each template under `templates/` into the matching path, renaming
   `com.example` to the project's base package in every file.
2. Update `basePackages` in `@EnableJpaRepositories` and `setPackagesToScan` in
   the EntityManagerFactory to point at the project's repository and entity
   packages.
3. Add the `app.datasource` block (see `templates/application-datasource.snippet.yml`)
   to each `application-*.yml` profile, with the write URL on the primary and the
   read URL(s) on the replica.
4. If the project already has a monitoring `DataSource` wrapper, wrap each
   HikariCP pool with it inside `buildPool`. The template returns the raw
   `HikariDataSource`.
5. Delete any pre-existing read-specific JPA config and `repository.read`
   package. Move their repositories into the single repository package.

## Wiring Rules (do not violate these)

- The `@Primary` bean is the `LazyConnectionDataSourceProxy`, not the write
  pool. The write pool is only the routing datasource's default target. Never
  expose the raw pools as `@Primary`.
- Always wrap the `RoutingDataSource` in `LazyConnectionDataSourceProxy` before
  handing it to JPA. Without the proxy, JPA acquires the connection before the
  read-only flag is set, and every read silently routes to the primary.
- Spring Data JPA repositories are read-only by default. `SimpleJpaRepository`
  carries a class-level `@Transactional(readOnly = true)`, so finder methods
  route to the replica automatically. Do not add `@Transactional(readOnly = true)`
  to every read endpoint, and do not duplicate repositories into a read package.
- To force a specific read onto the primary (read-your-writes), annotate the
  method with plain `@Transactional`. The outer read-write transaction overrides
  the repository default.
- Keep exactly one `EntityManagerFactory`, one `PlatformTransactionManager`, and
  one repository package. Splitting them is the manual approach this setup
  replaces.
- If a shared query-invoker library hardcodes `@Transactional(readOnly = true)`
  on query dispatch, it is redundant with the repository default. Leaving it or
  removing it does not change routing.

## Health Check

Multiple `DataSource` beans cause Spring Boot to create a
`DataSourceHealthIndicator` per bean. On profiles where the replica is
unreachable (typical in local dev), disable the indicator so the actuator does
not mark the app down:

```yaml
management:
  health:
    db:
      enabled: false
```

## Verify

- A read-only transaction routes to the read pool; a write transaction routes to
  the write pool.
- Confirm the `@Primary` bean via the actuator beans endpoint, expecting
  `primary: true` on the lazy proxy and `primary: false` on the raw pools.
- If reads still hit the primary after setup, the lazy proxy is missing or the
  EntityManagerFactory is wired to the raw `RoutingDataSource` instead of the
  proxy.

## Dependencies

Requires `spring-boot-starter-data-jpa` (pulls in Hibernate, HikariCP, and
Spring Data JPA) and a JDBC driver on the runtime classpath.
