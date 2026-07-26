---
name: spring--hibernate-sql-logger
description: >-
  Scaffold a @LogQuery annotation + AOP aspect + Hibernate StatementInspector
  that deduplicates SQL and prints an N+1 summary at the end of annotated
  controller or handler methods. Replaces the old QueryLogger utility.
  Use when the user wants to detect N+1 queries, log scoped SQL, add a
  @LogQuery annotation, or build a Hibernate StatementInspector that groups
  and counts repeated SQL patterns.
---

# @LogQuery — Scoped SQL Logging With N+1 Detection

This skill scaffolds four classes plus the necessary wiring to enable per-method
SQL introspection. The annotation works at both **class level** (controller) and
**method level** (individual handler).

## Mandatory Trigger

Invoke this skill before writing any files when the user asks to:

- "Add @LogQuery annotation" / "scaffold LogQuery" / "add SQL logging with N+1 detection".
- "Replace the old QueryLogger with the new N+1-detecting version".
- "Set up a Hibernate StatementInspector that deduplicates SQL".
- "Add scoped SQL logging that groups repeated queries".

## What It Produces

```
src/main/java/{{basePackage}}/common/aop/logging/
  LogQuery.java                     -- annotation (TYPE + METHOD)
  LogQueryAspect.java               -- Spring @Aspect
  LogQueryContext.java              -- thread-local state + summary printer
  LogQueryStatementInspector.java   -- Hibernate StatementInspector
```

Plus one registration step: either in `application.yml` (simple path) or in a
custom `JpaConfiguration` class (when the project defines its own
`LocalContainerEntityManagerFactoryBean`).

## How It Works

1. `@LogQuery` on a class or method activates the `LogQueryAspect`.
2. The aspect elevates `org.hibernate.SQL` to `DEBUG` and calls `LogQueryContext.enter()`.
3. `LogQueryStatementInspector.inspect(sql)` is called for every SQL execution.
   It fingerprints the SQL (normalises literal values), walks the call stack to
   find the entity getter that triggered the load, and records the call site.
4. When the aspect exits, `LogQueryContext.exit()` prints a deduplicated summary:

   ```
   -- SQL summary: 19 queries, 7 unique patterns --
     N+1 candidates (>=3 repeats):
       6x  BookingAssignedCustomer  <- GetScheduledCarsByScheduleQueryHandler.handle:23
           joins: booking_scheduled_car_assignee -> booking_assigned_sales -> booking_selected_timeslot
   ```

## Registration (Choose One)

### Option A: Spring Boot Auto-Configuration

When the project uses Spring Boot's JPA auto-configuration (no custom
`LocalContainerEntityManagerFactoryBean`), add this property:

```yaml
spring:
  jpa:
    properties:
      "[hibernate.session_factory.statement_inspector]": {{basePackage}}.common.aop.logging.LogQueryStatementInspector
```

### Option B: Custom EntityManagerFactory

When the project defines its own `LocalContainerEntityManagerFactoryBean` (check
for a class annotated `@Configuration` that creates one), add this inside the
factory bean setup method:

```java
import {{basePackage}}.common.aop.logging.LogQueryStatementInspector;
import org.hibernate.cfg.AvailableSettings;

em.setJpaPropertyMap(Map.of(
    AvailableSettings.STATEMENT_INSPECTOR, new LogQueryStatementInspector()
));
```

## Usage

```java
@RestController
@LogQuery  // logs SQL for every endpoint in this controller
public class BookingController { ... }

// Or on a single method:
@LogQuery
@GetMapping("/scheduled-cars")
public List<DTO> getScheduledCars() { ... }
```
