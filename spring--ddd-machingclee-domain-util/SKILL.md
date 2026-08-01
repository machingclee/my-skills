---
name: spring--ddd-machingclee-domain-util
description: >-
  How to use the open-source com.machingclee:domain-util library
  (https://github.com/machingclee/domain.util) in a Spring Boot project:
  Maven coordinates, single-pipeline glue beans (Event entity + repository,
  CommandAuditor, CommandInvoker, DomainEventLogger), Command/Handler/Policy
  flow, audit table DDL, and command-visualization docs UI. No @TargetSchema
  / SchemaIdentifier — physical storage is entity @Table + repository only.
  Use when wiring domain-util into a new or existing Spring Boot app, scaffolding
  a Command → Event → Policy pipeline with the personal library, or when the user
  mentions machingclee domain-util / domain.util GitHub.
---

# Use `com.machingclee:domain-util`

Source: https://github.com/machingclee/domain.util  
Local clone (if present): `~/Repos/java/2026-08-01-domain-util`  
Package root: `com.machingclee.domain.util`  
Coordinates: `com.machingclee:domain-util:0.1.0-SNAPSHOT` (bump when released)

This skill describes **how to consume** the library after multi-schema routing was
removed. Prefer **one invoker + one event logger** per application.

## Mandatory trigger

Invoke before writing pipeline wiring when the user asks to:

- "use machingclee domain-util" / "wire domain-util from GitHub"
- "scaffold Command → Event → Policy" with the **personal** library (not echarge)
- "add CommandInvoker / DomainEventLogger / AuditEvent" for a Spring Boot app
- migrate off `@TargetSchema` / `SchemaIdentifier`

**Do not** use this for the company monorepo `com.echarge:domain.util` unless the
user explicitly wants the same single-pipeline style there (already applied in
echarge as of the schema-removal change). The echarge historical skill
`spring--init-command-event-policy` still mentions `@TargetSchema` — ignore that
when following **this** skill.

## Mental model

```
Controller ── invoker.invoke(cmd) ──▶ AbstractCommandInvoker
                                         │  tx + command audit row
                                         ▼
                                   CommandHandler.handle(EventQueue, cmd)
                                         │  mutates aggregates
                                         │  eventQueue.add / addTransactional(domainEvent)
                                         ▼
                                   DomainEventDispatcher
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
           DomainEventLogger                          @EventListener Policy
           (persist AuditEvent via                    (invariants / follow-on
            injected repo + @Table)                    commands via invoker)
```

There is **no** logical "schema" router:

| Concern | Who decides |
|---------|-------------|
| Which handlers run | **All** `CommandHandler` beans in the context (one invoker) |
| Where audit rows land | Your `AuditEvent` entity `@Table` + `AuditEventRepository` + datasource |
| Multi-store apps | Separate apps / persistence units — not multiple `@TargetSchema` tags |

Prefer one `DomainEventLogger` bean. Multiple loggers would each receive every
`EventWrapper` and may double-write.

## Placeholders

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{{basePackage}}` | project base package | `com.example.orders` |
| `{{context}}` | domain slice path segment (lowercase) | `orders` |
| `{{Context}}` | PascalCase prefix for glue types | `Orders` |
| `{{Entity}}` | sample aggregate PascalCase | `Order` |
| `{{entity}}` | sample aggregate camelCase | `order` |
| `{{tableName}}` | aggregate table | `orders` |
| `{{catalogOrSchema}}` | DB catalog (MySQL) or schema (Postgres) if used | `orders` |
| `{{version}}` | library version | `0.1.0-SNAPSHOT` |

## Maven dependency

Merge `templates/pom.snippet.xml` into the consumer `pom.xml`.

```xml
<dependency>
    <groupId>com.machingclee</groupId>
    <artifactId>domain-util</artifactId>
    <version>{{version}}</version>
</dependency>
```

Obtain the JAR via:

1. `mvn clean install` in the domain-util repo (local `~/.m2`), or  
2. GitHub Packages once published (`maven.pkg.github.com/machingclee/domain.util`).

Spring Boot auto-configuration is registered via  
`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`  
— no `@Import` required. It wires `SpringDomainEventDispatcher`,
`ExternalEventPublisher`, entity graph helpers, and (when an invoker exists)
`DocController` at `/docs`.

**No** annotation-processor path for domain-util is required (the old
`@TargetSchema` processor is gone).

Also ensure the app has (usually already present):

- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- a JDBC driver + datasource config

## Glue beans (required)

Without these, the library has nothing to audit/persist against.

```
src/main/java/{{basePackage}}/
  common/domainutils/{{context}}/
    {{Context}}CommandInvoker.java     ← templates/CommandInvoker.java
    {{Context}}CommandAuditor.java     ← templates/CommandAuditor.java
    {{Context}}DomainEventLogger.java  ← templates/DomainEventLogger.java
  common/jpa/entity/{{context}}/
    {{Context}}Event.java              ← templates/EventEntity.java
  common/jpa/repository/
    {{Context}}EventRepository.java    ← templates/EventRepository.java
```

Substitute placeholders and write the five files from `templates/`.

### Constructor signatures (post-removal)

```java
// Invoker — NO schema argument
super(context, domainEventDispatcher, transactionManager, auditor, eventRepository);

// DomainEventLogger — NO schema argument
super(eventRepository, {{Context}}Event::new, publisher);

// Auditor
super(eventRepository, {{Context}}Event::new);
```

### Physical storage

On `{{Context}}Event`:

```java
@Table(name = "event")                          // default schema/search_path
// or
@Table(name = "event", catalog = "{{catalogOrSchema}}")   // MySQL catalog style
// or
@Table(name = "event", schema = "{{catalogOrSchema}}")    // Postgres schema style
```

That annotation — not the library — chooses where rows go.

Run `templates/ddl/event-table.sql` when the database is ready. Until then boot
with `spring.jpa.hibernate.ddl-auto: none` (merge
`templates/application-domainutil.snippet.yml`).

## Command → Event → Policy sample

Optional but recommended for a first runnable slice. Copy `templates/sample/*`:

```
context/{{context}}/
  command/Create{{Entity}}Command.java
  commandhandler/Create{{Entity}}CommandHandler.java
  event/{{Entity}}CreatedEvent.java
  policy/{{Context}}Policy.java
controller/{{Entity}}Controller.java
common/jpa/entity/{{context}}/{{Entity}}.java
common/jpa/repository/{{Entity}}Repository.java
```

### Handler rules

```java
@Component
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) {
        // 1. load / create aggregate
        // 2. persist
        // 3. enqueue domain events:
        eventQueue.add(new {{Entity}}CreatedEvent(...));              // IMMEDIATE
        // eventQueue.addTransactional(new ...);                      // AFTER_COMMIT
        return dto;
    }
}
```

- **No** `@TargetSchema`
- One handler type per command type (duplicate command class → startup error)
- Throw to fail the command transaction; command audit row is still marked failed

### Policy rules

```java
@Component
public class {{Context}}Policy implements Policy {

    private final {{Context}}CommandInvoker invoker;

    @EventListener
    public void on{{Entity}}Created({{Entity}}CreatedEvent event) throws Exception {
        // optional follow-on:
        // invoker.invoke(new SomeOtherCommand(...));
    }
}
```

- Implement marker `Policy`
- Listen with `@EventListener` on the **domain event type** (not `EventWrapper`)
- Keep side effects intentional — nested `invoker.invoke` shares request id

### Controller

Keep controllers thin: map HTTP → command → `invoker.invoke(command)`.

## Docs / visualization UI

When a `AbstractCommandInvoker` bean exists, auto-config exposes:

- JSON flows under `/docs/...` (commands, policies, entity graph)
- Static SPA under `META-INF/resources/command-visualization/` (bundled in the JAR)

Frontend sources live in the domain-util repo under `event-storming-frontend/`.
Rebuild and copy into the library when customizing the UI.

## How to apply this skill

1. Confirm the consumer is a Spring Boot app with JPA (or scaffold one first).
2. Add `templates/pom.snippet.xml` dependency; install the library to local m2 if needed.
3. Collect `{{basePackage}}` + `{{Context}}` / `{{context}}` (+ first aggregate if scaffolding a sample).
4. Generate the **five glue files** from `templates/` (mandatory).
5. Optionally generate the **sample** flow from `templates/sample/`.
6. Merge `templates/application-domainutil.snippet.yml`.
7. When ready, run `templates/ddl/event-table.sql`.
8. Compile; invoke a command; confirm rows in the `event` table and `/docs` if web is on.

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Add `@TargetSchema` / `SchemaIdentifier` | Single pipeline; no such types exist |
| Register multiple `DomainEventLogger` beans for "different schemas" | One logger; or separate apps |
| Put business logic in the controller | `invoker.invoke(command)` only |
| Expect the library to `SET search_path` | Use `@Table(schema=…)` / datasource |
| Pass a schema enum into `super(...)` for invoker/logger | Use the 5-arg invoker / 3-arg logger ctors above |

## Quick reference — key types

| Type | Package |
|------|---------|
| `Command` / `CommandHandler` / `Policy` | `…common.interfaces` |
| `EventQueue` | `…common.interfaces` |
| `AbstractCommandInvoker` | `…common.command` |
| `CustomCommandAuditor` | `…common.command` |
| `DomainEventLogger` | `…common.event` |
| `DomainEventDispatcher` | `…common.interfaces` (impl `SpringDomainEventDispatcher`) |
| `AuditEvent` / `AuditEventRepository` | `…common.interfaces` |
| `ExternalEventPublisher` | `…common.event` (events outside a command) |
| `@BoundedContext` / `@Actor` / `@Invariant` | `…annotation` (docs / flow metadata) |

## Checklist

- [ ] `com.machingclee:domain-util` on classpath  
- [ ] `{{Context}}Event` implements `AuditEvent` with `@Table`  
- [ ] `{{Context}}EventRepository extends AuditEventRepository<…>`  
- [ ] `{{Context}}CommandAuditor` bean  
- [ ] `{{Context}}CommandInvoker` bean (5-arg `super`)  
- [ ] `{{Context}}DomainEventLogger` bean (3-arg `super`) — only one  
- [ ] Handlers are `@Component` `CommandHandler` implementations (no schema annotation)  
- [ ] `event` table exists or `ddl-auto` strategy is intentional  
