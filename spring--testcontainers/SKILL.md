---
name: spring--testcontainers
description: >-
  Create a complete Testcontainers integration-test setup in a Spring Boot
  project from scratch: pom dependencies, the reusable MySQL container
  configuration with a fixed host port starting at 4000 (incrementing by 1 when
  busy), BaseTest with @DynamicPropertySource and per-test truncation, the test
  profile YAML, and the schema-apply / truncate lifecycle. Use whenever the
  user asks to add, set up, or fix Testcontainers in a Spring Boot project, or
  to wire a test database for integration tests.
---

# Testcontainers Setup for Spring Boot

This skill builds the complete Testcontainers setup used by this project's
integration tests. It is a reusable recipe: every file listed here is created
from scratch, with the fixed host port strategy starting at 4000.

## Mandatory Trigger

Invoke this skill when the user:

- Asks to **add**, **set up**, or **fix** Testcontainers in a Spring Boot project.
- Wants a **test database** for integration tests (MySQL, PostgreSQL, etc.).
- Asks for a **reusable container**, a **fixed port 4000**, or a
  **schema-on-first-start** test lifecycle.
- Mentions `TestcontainersConfiguration`, `BaseTest`, `@DynamicPropertySource`,
  `@ServiceConnection`, or `testcontainers.reuse.enable`.
- Says **"create the testcontainers setup from scratch"** or similar.

## Prerequisites

Before writing any code, confirm the environment:

1. Docker is running (Docker Desktop on macOS).
2. `~/.testcontainers.properties` exists and contains:
   ```properties
   testcontainers.reuse.enable=true
   docker.client.strategy=org.testcontainers.dockerclient.UnixSocketClientProviderStrategy
   ```
   Without `testcontainers.reuse.enable=true`, `withReuse(true)` is ignored and
   the container is removed when the test JVM exits.
3. A schema file exists. This project uses `test-container/esales-schema.sql`
   (a Prisma-generated MySQL schema). The configuration resolves it in order:
   system property `testcontainers.schema.file` → classpath `schema.sql` →
   classpath `esales-schema.sql` → `test-container/esales-schema.sql`.

## Files to Create

Create or update these files:

1. `pom.xml` — add the test dependencies (see below).
2. `src/test/java/<base-package>/testcontainers/TestcontainersConfiguration.java`
3. `src/test/java/<base-package>/testcontainers/BaseTest.java`
4. `src/test/resources/application-test.yml`
5. (optional) `test-container/esales-schema.sql` — the schema source.

### 1. pom.xml Dependencies

Add under the test dependencies section. The `testcontainers.version` is
managed by the Spring Boot BOM (e.g. Spring Boot 4.0.0 → Testcontainers 2.0.2).
Use the `testcontainers-mysql` artifact (not `mysql`) for MySQL in Testcontainers 2.x.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers-mysql</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-testcontainers</artifactId>
    <scope>test</scope>
</dependency>
```

If the project pulls `commons-compress` transitively below 1.26 (e.g. via
`poi-ooxml`), pin it, because Testcontainers 2.x requires >= 1.26:

```xml
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-compress</artifactId>
    <version>1.28.0</version>
</dependency>
```

### 2. TestcontainersConfiguration.java

The core class. Key design points:

- The container is a **static singleton** started in a static initializer so it
  exists before Spring builds the context (needed by `@DynamicPropertySource`).
- The host port is **fixed at 4000** and increments by 1 (4001, 4002, …) until a
  free port is found, instead of a random port.
- The port binding is injected with `withCreateContainerCmdModifier`. The
  modifier runs inside Testcontainers' `applyConfiguration`, which is BEFORE
  the reuse hash is computed, so the fixed binding is part of the container's
  reuse identity: an existing reusable container is found by hash and reused
  as-is on its original port (no conflict); only a fresh container binds the
  port, and if it is busy we detect the conflict and retry with the next port.
- `withReuse(true)` keeps the container alive across runs; it is only removed
  with `docker stop` / `docker rm`.
- On first start the schema is applied from the resolved resource; on reuse the
  whole database is truncated instead.

```java
package com.echarge.sales.testcontainers;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    private static final Logger log = LoggerFactory.getLogger(TestcontainersConfiguration.class);

    // region Constants
    private static final DockerImageName MYSQL_IMAGE = DockerImageName.parse("mysql:8.4.8");

    /** Default host port for the MySQL container; falls back to the next free port when busy. */
    private static final int DEFAULT_MYSQL_PORT = 4000;

    /** Maximum host port to try before giving up (inclusive). */
    private static final int MAX_MYSQL_PORT = 4999;

    private static final String SCHEMA_FILE_PROPERTY = "testcontainers.schema.file";
    // endregion

    // region Shared container (singleton)
    private static final MySQLContainer<?> MYSQL_CONTAINER = createAndStartContainer();
    // endregion

    // region Spring beans
    @Bean
    @ServiceConnection
    public MySQLContainer<?> mysqlContainer() {
        initializeDatabase(MYSQL_CONTAINER);
        return MYSQL_CONTAINER;
    }

    public static MySQLContainer<?> container() {
        return MYSQL_CONTAINER;
    }
    // endregion

    // region Container lifecycle
    private static MySQLContainer<?> createAndStartContainer() {
        // Fixed host port instead of a random one: start at DEFAULT_MYSQL_PORT and
        // increment by 1 until the port is free. The reuse hash includes the port
        // binding, so an existing reusable container with the same config is still
        // found by hash — the fixed port only matters when a NEW container must be
        // created (or the reused container's port genuinely becomes busy).
        for (int port = DEFAULT_MYSQL_PORT; port <= MAX_MYSQL_PORT; port++) {
            MySQLContainer<?> container = new MySQLContainer<>(MYSQL_IMAGE)
                    .withDatabaseName("sales")
                    .withUsername("root")
                    .withPassword("root")
                    .withStartupTimeout(Duration.ofMinutes(2))
                    .withUrlParam("serverTimezone", "UTC")
                    .withReuse(true);

            // Pin host port → 3306. The modifier runs inside applyConfiguration
            // (before the reuse hash is computed), so reuse lookup matches on this
            // binding; when a fresh container is created, Docker binds 3306 to the
            // requested host port.
            int hostPort = port;
            container.withCreateContainerCmdModifier(cmd ->
                    cmd.withPortBindings(new PortBinding(Ports.Binding.bindPort(hostPort),
                            ExposedPort.tcp(MySQLContainer.MYSQL_PORT))));

            try {
                container.start();
                log.info("   ✓ MySQL container started on host port {}", hostPort);
                printConnectionInfo(container);
                return container;
            } catch (Exception e) {
                if (isPortInUse(e)) {
                    log.info("   Port {} is in use, trying {} ...", hostPort, hostPort + 1);
                    continue;
                }
                throw new IllegalStateException(
                        "Failed to start MySQL container on host port " + hostPort, e);
            }
        }
        throw new IllegalStateException(
                "No free host port found for MySQL container in range "
                        + DEFAULT_MYSQL_PORT + ".." + MAX_MYSQL_PORT);
    }

    /** True when the failure is "host port already allocated" rather than a real startup error. */
    private static boolean isPortInUse(Throwable throwable) {
        for (Throwable t = throwable; t != null; t = t.getCause()) {
            if (t instanceof com.github.dockerjava.api.exception.ConflictException) {
                return true;
            }
            String message = t.getMessage();
            if (message != null && message.toLowerCase().contains("port is already allocated")) {
                return true;
            }
        }
        return false;
    }
    // endregion

    private static void initializeDatabase(MySQLContainer<?> container) {
        if (schemaExists(container)) {
            log.info("✓ Schema already exists - skipping migration (container reuse)");
            log.info("  Truncating all tables to clear test data...");
            truncateAllTables(container);
        } else {
            log.info("  Applying schema from schema file (first time)...");
            applySchemaFromFile(container);
        }
        verifySchema(container);
    }

    // region Schema and truncate helpers
    public static void truncateAllTables() {
        truncateAllTables(MYSQL_CONTAINER);
    }

    private static void truncateAllTables(MySQLContainer<?> container) {
        try (Connection connection = openConnection(container);
             Statement statement = connection.createStatement()) {
            statement.execute("SET FOREIGN_KEY_CHECKS = 0");
            try (ResultSet rs = statement.executeQuery(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")) {
                List<String> tables = new ArrayList<>();
                while (rs.next()) {
                    tables.add(rs.getString("table_name"));
                }
                if (!tables.isEmpty()) {
                    for (String table : tables) {
                        statement.execute("TRUNCATE TABLE `" + table + "`");
                    }
                    log.info("   ✓ Truncated {} table(s): {}", tables.size(), String.join(", ", tables));
                } else {
                    log.info("   ℹ️  No tables to truncate");
                }
            }
            statement.execute("SET FOREIGN_KEY_CHECKS = 1");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to truncate tables", e);
        }
    }

    private static boolean schemaExists(MySQLContainer<?> container) {
        try (Connection connection = openConnection(container);
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()")) {
            if (rs.next()) {
                int tableCount = rs.getInt("table_count");
                log.info("   ℹ️  Found {} existing table(s) in database", tableCount);
                return tableCount > 0;
            }
            return false;
        } catch (Exception e) {
            log.warn("   ⚠️  Could not check if schema exists: {}", e.getMessage());
            return false;
        }
    }

    private static void applySchemaFromFile(MySQLContainer<?> container) {
        Resource schemaResource = resolveSchemaResource();
        log.info("   📖 Applying schema from: {}", schemaResource.getDescription());
        try (Connection connection = openConnection(container)) {
            ScriptUtils.executeSqlScript(connection, schemaResource);
            log.info("   ✓ Schema applied successfully");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to apply schema file: " + schemaResource, e);
        }
    }

    private static void verifySchema(MySQLContainer<?> container) {
        try (Connection connection = openConnection(container);
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")) {
            List<String> tables = new ArrayList<>();
            while (rs.next()) {
                tables.add(rs.getString("table_name"));
            }
            if (tables.isEmpty()) {
                log.warn("   ⚠️  WARNING: No tables found in the database!");
            } else {
                log.info("   ✓ Verified {} table(s) created:", tables.size());
                tables.stream().sorted().forEach(t -> log.info("      • {}", t));
            }
        } catch (Exception e) {
            log.warn("   ⚠️  Could not verify schema: {}", e.getMessage());
        }
    }
    // endregion

    // region Schema file resolution
    private static Resource resolveSchemaResource() {
        String propertyPath = System.getProperty(SCHEMA_FILE_PROPERTY);
        if (propertyPath != null) {
            File file = new File(propertyPath);
            if (file.isFile()) {
                return new FileSystemResource(file);
            }
            throw new IllegalStateException("Schema file from -D" + SCHEMA_FILE_PROPERTY + " not found: " + propertyPath);
        }

        for (String classpath : new String[]{"schema.sql", "esales-schema.sql"}) {
            ClassPathResource resource = new ClassPathResource(classpath);
            if (resource.exists()) {
                return resource;
            }
        }

        File projectSchema = new File("test-container", "esales-schema.sql");
        if (projectSchema.isFile()) {
            return new FileSystemResource(projectSchema);
        }

        throw new IllegalStateException(
                "Schema file not found. Place it at test-container/esales-schema.sql, on the classpath as schema.sql, "
                        + "or point to it with -D" + SCHEMA_FILE_PROPERTY + "=...");
    }
    // endregion

    // region Connection helpers
    private static Connection openConnection(MySQLContainer<?> container) throws Exception {
        return DriverManager.getConnection(container.getJdbcUrl(), container.getUsername(), container.getPassword());
    }

    private static void printConnectionInfo(MySQLContainer<?> container) {
        String separator = "=".repeat(80);
        log.info(separator);
        log.info("🔗 TESTCONTAINERS DATABASE CONNECTION INFO");
        log.info(separator);
        log.info("Host:     {}", container.getHost());
        log.info("Port:     {}", container.getMappedPort(MySQLContainer.MYSQL_PORT));
        log.info("Database: {}", container.getDatabaseName());
        log.info("Username: {}", container.getUsername());
        log.info("Password: {}", container.getPassword());
        log.info("JDBC URL: {}", container.getJdbcUrl());
        log.info("");
        log.info("   GUI Tool Connection (DataGrip, DBeaver, TablePlus, etc.):");
        log.info("   Host: {}", container.getHost());
        log.info("   Port: {}", container.getMappedPort(MySQLContainer.MYSQL_PORT));
        log.info("   Database: {}", container.getDatabaseName());
        log.info("   User: {}", container.getUsername());
        log.info("   Password: {}", container.getPassword());
        log.info("");
        log.info("   Container will stay alive with reuse=true");
        log.info("   To find it: docker ps | grep mysql");
        log.info("   To stop/remove it intentionally: docker stop <container> && docker rm <container>");
        log.info(separator);
    }
    // endregion
}
```

Adjust for non-MySQL engines: for PostgreSQL use the `postgresql` artifact and
`PostgreSQLContainer`, and the schema-exists query becomes `pg_tables` for the
`public` schema.

### 3. BaseTest.java

`BaseTest` is the abstract superclass every integration test extends. It
activates the `test` profile, imports the container configuration, points the
app datasource at the container, and wipes every table before each test method.

```java
package com.echarge.sales.testcontainers;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;

import java.util.List;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
public abstract class BaseTest {

    @DynamicPropertySource
    static void registerDatasourceProperties(DynamicPropertyRegistry registry) {
        MySQLContainer<?> mysql = TestcontainersConfiguration.container();
        registry.add("app.datasource.write.urls", () -> List.of(mysql.getJdbcUrl()));
        registry.add("app.datasource.read.urls", () -> List.of(mysql.getJdbcUrl()));
        registry.add("app.datasource.write.username", mysql::getUsername);
        registry.add("app.datasource.read.username", mysql::getUsername);
        registry.add("app.datasource.write.password", mysql::getPassword);
        registry.add("app.datasource.read.password", mysql::getPassword);
    }

    @BeforeEach
    void wipeAllDataBeforeEachTest() {
        TestcontainersConfiguration.truncateAllTables();
    }
}
```

Notes:

- The property names (`app.datasource.write.urls` etc.) are this project's
  custom datasource keys. For a standard Spring Boot app, register
  `spring.datasource.url`, `spring.datasource.username`, and
  `spring.datasource.password` instead.
- `@DynamicPropertySource` runs BEFORE the context is built, which is why the
  container must be a static singleton already started.
- The `@BeforeEach` gives full test isolation: every table is truncated before
  every test method.

### 4. application-test.yml

The test profile must not let Hibernate or Spring Boot create or migrate the
schema; the container configuration owns it entirely.

```yaml
stage: test

spring:
  sql:
    init:
      mode: never
  jpa:
    hibernate:
      ddl-auto: none
    show-sql: false
    properties:
      hibernate:
        format_sql: true
  flyway:
    enabled: false

# Fallback URLs only — replaced at runtime by the container JDBC URL via
# @DynamicPropertySource in BaseTest.
app:
  datasource:
    write:
      urls:
        - "jdbc:mysql://localhost:3306/sales?serverTimezone=Asia/Hong_Kong&useSSL=false&allowPublicKeyRetrieval=true"
      driver-class-name: com.mysql.cj.jdbc.Driver
      username: root
      password: root
    read:
      urls:
        - "jdbc:mysql://localhost:3306/sales?serverTimezone=Asia/Hong_Kong&useSSL=false&allowPublicKeyRetrieval=true"
      driver-class-name: com.mysql.cj.jdbc.Driver
      username: root
      password: root
```

## How to Verify

1. **Compile**: `mvn -DskipTests test-compile`
2. **Run one test class**:
   ```bash
   mvn test -Dtest=<SomeTestClass> -Dsurefire.failIfNoSpecifiedTests=false
   ```
   The startup log must show `MySQL container started on host port 4000`.
3. **Confirm the fixed port**:
   ```bash
   docker ps | grep mysql        # 0.0.0.0:4000->3306/tcp
   ```
4. **Confirm reuse**: run the same test again. The same container is reused
   (no new container id), and the log shows "Schema already exists - skipping
   migration (container reuse)" followed by "Truncated 47 table(s)".
5. **Confirm the port fallback** (optional): hold port 4000 with another
   process or container, then run a test. The log must show
   `Port 4000 is in use, trying 4001 ...` and the container must start on 4001.
6. **Remove the container intentionally**:
   ```bash
   docker ps | grep mysql
   docker stop <container> && docker rm <container>
   ```
   The next run creates a brand new container on 4000 and applies the schema
   again.

## Common Pitfalls

- `withReuse(true)` requires `testcontainers.reuse.enable=true` in
  `~/.testcontainers.properties`; otherwise the container dies with the JVM.
- Do not probe the port with a raw socket before building the container. The
  reused container itself holds port 4000, so a probe would see it busy and
  pick 4001, orphaning the reusable container. The retry-on-start approach
  above is the correct one: reuse is found by hash (no binding attempted), and
  only a fresh create binds the port and can conflict.
- The fixed port binding MUST go through `withCreateContainerCmdModifier`
  (runs before the reuse hash). Calling `container.setPortBindings(...)` after
  start, or setting the binding another way, would not be part of the reuse
  identity.
- Detect port conflicts by walking the cause chain for
  `ConflictException` or `port is already allocated`; do not retry on every
  exception, or real startup failures would loop.
- MySQL specifics: `information_schema.tables` (not `pg_tables`), backticks
  around reserved names like `event`, and `SET FOREIGN_KEY_CHECKS = 0/1`
  around the truncate loop.
- `ScriptUtils.executeSqlScript(Connection, Resource)` executes the schema in
  one call; no custom statement splitting is needed.
- The database name must match the JPA entity catalog (e.g. `sales` for
  `@Table(name = "event", catalog = "sales")`); in MySQL the catalog is the
  database name.
- If you see `client version X is too new` from docker-java, the daemon caps
  the Docker API below the default (1.44); pin `api.version` to the daemon's
  maximum in surefire as a temporary fallback.

## Example

```
User: "Set up Testcontainers for our Spring Boot project so tests use a real
      MySQL on port 4000"

Agent:
  1. Confirms Docker is running and ~/.testcontainers.properties has
     testcontainers.reuse.enable=true
  2. Adds testcontainers-mysql + spring-boot-testcontainers (and the
     commons-compress pin if needed) to pom.xml
  3. Creates src/test/java/<pkg>/testcontainers/TestcontainersConfiguration.java
     with the fixed-port loop above (DEFAULT_MYSQL_PORT = 4000)
  4. Creates BaseTest.java with @DynamicPropertySource + @BeforeEach truncate
  5. Creates application-test.yml with ddl-auto=none, sql.init.mode=never,
     flyway disabled
  6. Runs mvn -DskipTests test-compile, then mvn test -Dtest=...
  7. Confirms docker ps shows 0.0.0.0:4000->3306/tcp and reuse on the next run
```
