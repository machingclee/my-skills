package com.example.project.testcontainerdb;

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

    /**
     * Registers the container's connection details as {@code app.datasource.*}
     * properties BEFORE the Spring context is created.
     */
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

    /**
     * Test-level cleanup: wipe ALL tables before each test method so tests are
     * completely isolated while the reusable container stays alive. This cannot
     * be replaced by requestId scoping, because entity-level assertions
     * (count(), findAll(), hasSize(n)) have no request_id column to filter on.
     */
    @BeforeEach
    void wipeAllDataBeforeEachTest() {
        TestcontainersConfiguration.truncateAllTables();
    }
}
