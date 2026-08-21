---
name: spring--ddd-machingclee-domain-util
description: >-
  How to use the open-source com.machingclee:domain-util library
  (https://github.com/machingclee/domain.util) in a Spring Boot project:
  Maven coordinates, single-pipeline glue (Event entity + repository;
  CommandAuditor / CommandInvoker / DomainEventLogger are auto-configured),
  Command/Handler/Event/Policy
  examples with @BoundedContext/@Actor annotations, Query/QueryHandler GET APIs
  via DefaultQueryInvoker, two DTO styles (nested Entity.DTO vs common.dto package)
  with MapStruct DTOMapper (@Mapper componentModel=spring, unmappedTargetPolicy=ERROR),
  audit table DDL, and command-visualization docs UI. No @TargetSchema /
  SchemaIdentifier — physical storage is entity @Table + repository only. Use when
  wiring domain-util into a new or existing Spring Boot app, scaffolding a
  Command → Event → Policy (or Query) pipeline with the personal library, or when
  the user mentions machingclee domain-util / domain.util GitHub.
---

# Use `com.machingclee:domain-util`

Source: https://github.com/machingclee/domain.util  
Local clone (if present): `~/Repos/java/2026-08-01-domain-util`  
Package root: `com.machingclee.domain.util`  
Coordinates: `com.machingclee:domain-util:0.1.0-SNAPSHOT` (bump when released)

This skill describes **how to consume** the library after multi-schema routing was
removed. Provide **one** `AuditEvent` entity + `AuditEventRepository`; auto-config
creates the invoker, auditor, and event logger. Prefer **one** pipeline per app.

## Mandatory trigger

Invoke before writing pipeline wiring when the user asks to:

- "use machingclee domain-util" / "wire domain-util from GitHub"
- "scaffold Command → Event → Policy" with this library
- "add CommandInvoker / DomainEventLogger / AuditEvent" for a Spring Boot app
- "add Query / QueryHandler / GET API" with domain-util
- migrate off multi-schema routing (`@TargetSchema` / `SchemaIdentifier` — not part of this library)

This skill is project-agnostic: wire `com.machingclee:domain-util` into any Spring
Boot app. Prefer **one** audit entity + repository (and therefore one invoker /
logger) per application.

## Mental model

### Write path (Command → Event → Policy)

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

### Read path (Query)

```
Controller ── queryInvoker.invoke(query) ──▶ DefaultQueryInvoker (auto-config)
                                                    │  no audit, no domain events
                                                    ▼
                                              QueryHandler.handle(query)
                                                    │  read-only load / map
                                                    ▼
                                              return R
```

There is **no** logical "schema" router:

| Concern | Who decides |
|---------|-------------|
| Which handlers run | **All** `CommandHandler` / `QueryHandler` beans in the context |
| Where audit rows land | Your `AuditEvent` entity `@Table` + `AuditEventRepository` + datasource |
| Multi-store apps | Separate apps / persistence units — not multiple `@TargetSchema` tags |

Prefer one `DomainEventLogger` bean. Multiple loggers would each receive every
`EventWrapper` and may double-write.

`DefaultQueryInvoker` is created automatically when **any** `QueryHandler` bean
exists (`@ConditionalOnBean(QueryHandler.class)`). Inject `QueryInvoker` (or
`DefaultQueryInvoker`) in controllers — do **not** hand-roll a second invoker.

`CustomCommandInvoker`, `CustomCommandAuditor`, and `DomainEventLogger` are
created automatically when **exactly one** `AuditEventRepository` bean exists.
Inject `CommandInvoker`. Do **not** generate auditor / invoker / logger classes
for the single-store case. Spring Data only creates that repository after the
matching `AuditEvent` entity is a valid JPA type — entities themselves are not
Spring beans, so there is no extra “wait for entity” condition.

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
| `{{BoundedContextName}}` | human-readable context for docs UI | `Order Management` |
| `{{ActorName}}` | who initiates the command (docs UI) | `Admin` |

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
`DefaultQueryInvoker` (when handlers exist), `ExternalEventPublisher`, entity
graph helpers, write-path glue (`CommandAuditorPort` / `CommandInvoker` /
`DomainEventLogger` when a single `AuditEventRepository` exists), and
`DocController` at `/docs`.

**No** annotation-processor path for domain-util is required (the old
`@TargetSchema` processor is gone).

Also ensure the app has (usually already present):

- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- a JDBC driver + datasource config

## Glue beans (required for writes)

Consumers write **two** types. Auto-config creates auditor, invoker, and logger
once **exactly one** `AuditEventRepository` bean exists.

```
src/main/java/{{basePackage}}/
  common/jpa/entity/{{context}}/
    {{Context}}Event.java              ← templates/EventEntity.java
  common/jpa/repository/
    {{Context}}EventRepository.java    ← templates/EventRepository.java
```

The entity must implement `AuditEvent` and have a no-arg constructor
(`@NoArgsConstructor`; protected is OK). Extra repository query methods are
optional.

Inject `CommandInvoker` (not a generated `{{Context}}CommandInvoker`).

`templates/CommandInvoker.java`, `CommandAuditor.java`, and
`DomainEventLogger.java` are **opt-in overrides** for multi-PU apps or custom
audit behavior (`@ConditionalOnMissingBean`). Do not generate them for the
common case.

### Constructor signatures (manual override only)

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

## Annotations (docs / flow metadata)

These are **optional at runtime** but required for a useful `/docs` visualization.
They do **not** change dispatch — handlers are discovered by type only.

| Annotation | Target | Package | Purpose |
|------------|--------|---------|---------|
| `@BoundedContext("…")` | Command, Query, Entity (TYPE or PACKAGE) | `com.machingclee.domain.util.annotation` | Groups the type under a context name in the flow UI |
| `@Actor("Admin")` / `@Actor({"Sales","Admin"})` | Command or Query (TYPE) | same | "Who initiates this" in event-storming docs |
| `@Invariant({"…"})` | Policy listener **method** | `com.machingclee.domain.util.common.interfaces` | Documents business rules the policy enforces |

```java
import com.machingclee.domain.util.annotation.Actor;
import com.machingclee.domain.util.annotation.BoundedContext;
import com.machingclee.domain.util.common.interfaces.Invariant;

@BoundedContext("Order Management")
@Actor("Admin")
public class CreateOrderCommand implements Command<Order.DTO> { … }

@BoundedContext("Order Management")
public class GetOrderByIdQuery implements Query<Order.DTO> { … }

@EventListener
@Invariant({ "Order must exist", "Stock must be reserved after create" })
public void onOrderCreated(OrderCreatedEvent event) { … }
```

**Do not** invent `@TargetSchema` — it does not exist in this library.

## DTOs — two placement styles

Projects using this pipeline typically have **two** places for DTOs. Prefer the style
already used by the surrounding aggregate / module; do not invent a third style.

### Style A — nested on the entity (preferred for domain return types)

Define DTOs as **static nested types** on the JPA entity. Used as:

- `Command<R>` / `Query<R>` return types (`Command<CarModel.DTO>`)
- payloads inside domain events (`CarModelCreatedEvent` holds `CarModel.DTO`)
- simple API responses that mirror one aggregate

```java
// common/jpa/entity/{{context}}/{{Entity}}.java
@Getter @Setter @Entity
public class {{Entity}} {
    // fields …

    // region DTOs
    @Data
    public static class DTO {
        private Integer id;
        private String name;
        // relations as nested DTOs, e.g. Set<Other.DTO> items;
    }

    /** Optional view shaped for a specific screen (list / detail). */
    @Data
    public static class FrontendListDTO {
        private Integer id;
        private String name;
        // only fields the list UI needs
    }

    @Data
    public static class FrontendSingleDTO {
        private Integer id;
        private String name;
        // richer graph for detail page
    }
    // endregion
}
```

**When to use Style A**

| Case | Nested type |
|------|-------------|
| Command/handler result, event payload, internal domain shape | `{{Entity}}.DTO` |
| GET list shaped for a UI | `{{Entity}}.FrontendListDTO` (or similar) |
| GET detail shaped for a UI | `{{Entity}}.FrontendSingleDTO` |

Do **not** hand-map fields in handlers with setters if MapStruct is available — use
`DTOMapper` (below). Nested records (`public record DTO(...)`) are fine for tiny
scaffolds; production apps often use Lombok `@Data` static classes (MapStruct-friendly).

### Style B — free-standing types under a `dto` package

HTTP **request bodies**, multi-aggregate **response envelopes**, and cross-cutting
API shapes live outside the entity:

```
common/dto/
  request/   Create{{Entity}}DTO.java, Update{{Entity}}DTO.java, …
  response/  Full{{Entity}}ResponseDTO.java, {{Entity}}WithTotalsDTO.java, …
  APIResponseDTO.java   (optional envelope)
```

```java
// common/dto/request/Create{{Entity}}DTO.java  — controller @RequestBody only
public class Create{{Entity}}DTO {
    private String name;
}

// common/dto/response/{{Entity}}SummaryResponseDTO.java — composed / multi-entity GET
public class {{Entity}}SummaryResponseDTO {
    private {{Entity}}.DTO entity;
    private long relatedCount;
}
```

**When to use Style B**

| Case | Package type |
|------|----------------|
| Controller `@RequestBody` (write APIs) | `common.dto.request.*` |
| Response that is **not** 1:1 with one entity | `common.dto.response.*` |
| Shared API envelope | e.g. `APIResponseDTO<T>` |

**Flow (typical write):**

```
@RequestBody CreateXDTO  →  controller builds Command  →  handler mutates entity
                         →  DTOMapper.toDTO(entity)    →  Command returns Entity.DTO
```

Commands often **duplicate** fields from the request DTO (or take the request DTO as
a field). Prefer: controller maps request DTO → command fields; handler never depends
on HTTP DTOs.

**Do not** put request DTOs inside the entity class. **Do not** put stable domain
`Entity.DTO` only in `common.dto` if the rest of the module nests DTOs on entities —
stay consistent with the aggregate you touch.

### Mapping with MapStruct `DTOMapper` (required when MapStruct is on the project)

Use a **single** Spring MapStruct mapper interface for entity ↔ nested DTO (and
optionally request DTO → command fields if you map that way):

```java
package {{basePackage}}.common.jpa;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface DTOMapper {

    // entity → nested DTO (Style A)
    {{Entity}}.DTO toDTO({{Entity}} entity);

    {{Entity}}.FrontendListDTO toFrontendListDTO({{Entity}} entity);

    {{Entity}}.FrontendSingleDTO toFrontendSingleDTO({{Entity}} entity);

    // When a field cannot be mapped automatically, either:
    // @Mapping(target = "availableForBooking", ignore = true)  + @AfterMapping
    // or @Mapping(target = "x", source = "relation.y")
}
```

**Rules**

- Annotation **must** be:
  `@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)`
- `componentModel = "spring"` → inject `DTOMapper` into handlers (no `Mappers.getMapper`)
- `unmappedTargetPolicy = ERROR` → compile fails on forgotten target fields; fix with
  explicit `@Mapping` / `@AfterMapping` / `ignore = true` (never silently drop fields)
- Prefer **one** `DTOMapper` (or few context-scoped mappers) over ad-hoc mapping in every handler
- Handlers return `dtoMapper.toDTO(saved)` — **not** a hand-written `entity.toDto()` unless
  the project has no MapStruct yet (minimal scaffold only)

```java
@Component
@RequiredArgsConstructor
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) {
        {{Entity}} saved = repository.save(/* … */);
        {{Entity}}.DTO dto = dtoMapper.toDTO(saved);
        eventQueue.add(new {{Entity}}CreatedEvent(dto.getId(), dto.getName()));
        return dto;
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class Get{{Entity}}ByIdQueryHandler
        implements QueryHandler<Get{{Entity}}ByIdQuery, {{Entity}}.FrontendSingleDTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    @Transactional(readOnly = true)
    public {{Entity}}.FrontendSingleDTO handle(Get{{Entity}}ByIdQuery query) {
        return repository.findById(query.id())
                .map(dtoMapper::toFrontendSingleDTO)
                .orElse(null);
    }
}
```

Maven (if not already present):

```xml
<dependency>
    <groupId>org.mapstruct</groupId>
    <artifactId>mapstruct</artifactId>
    <version>${mapstruct.version}</version>
</dependency>
<!-- annotationProcessorPaths: mapstruct-processor (+ lombok-mapstruct-binding if using Lombok) -->
```

Template: `templates/sample/DTOMapper.java`.

### Quick chooser

| Need | Put it here | Map with |
|------|-------------|----------|
| Command/Query `R`, event body, 1-entity shape | `Entity.DTO` / `Entity.Frontend*DTO` | `DTOMapper.toDTO` / `toFrontend…` |
| HTTP write body | `common.dto.request.*` | Controller → `new Command(...)` (manual or mapper) |
| Multi-entity / custom GET envelope | `common.dto.response.*` | Handler builds response; nest `Entity.DTO` inside if useful |

## Command → Event → Policy (concrete examples)

Optional but recommended for a first runnable slice. Copy `templates/sample/*`:

```
context/{{context}}/
  command/Create{{Entity}}Command.java
  commandhandler/Create{{Entity}}CommandHandler.java
  event/{{Entity}}CreatedEvent.java
  policy/{{Context}}Policy.java
  query/Get{{Entity}}ByIdQuery.java              ← read path
  queryhandler/Get{{Entity}}ByIdQueryHandler.java
controller/{{Entity}}Controller.java             ← POST + GET
common/jpa/entity/{{context}}/{{Entity}}.java    ← Style A nested DTOs
common/jpa/repository/{{Entity}}Repository.java
common/jpa/DTOMapper.java                        ← MapStruct
common/dto/request/Create{{Entity}}DTO.java      ← Style B (optional HTTP body)
```

### 1. Command

Marker: `com.machingclee.domain.util.common.interfaces.Command<R>`  
`R` is the return type inferred at `invoker.invoke(...)` call sites.

```java
package {{basePackage}}.context.{{context}}.command;

import com.machingclee.domain.util.annotation.Actor;
import com.machingclee.domain.util.annotation.BoundedContext;
import com.machingclee.domain.util.common.interfaces.Command;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

/**
 * Create a new {{Entity}}.
 * Annotations feed /docs only — they do not route handlers.
 */
@BoundedContext("{{BoundedContextName}}")
@Actor("{{ActorName}}")
public record Create{{Entity}}Command(
        String name
) implements Command<{{Entity}}.DTO> {
}
```

Lombok `@Data` / `@Builder` classes also work; records are fine.

### 2. Domain event

Plain POJO / record — **no** library base type required. Raised by the handler via
`EventQueue`, then delivered to policies and the event logger.

```java
package {{basePackage}}.context.{{context}}.event;

/**
 * Raised after a {{Entity}} is created.
 */
public record {{Entity}}CreatedEvent(
        Integer id,
        String name
) {
}
```

### 3. CommandHandler

```java
package {{basePackage}}.context.{{context}}.commandhandler;

import com.machingclee.domain.util.common.interfaces.CommandHandler;
import com.machingclee.domain.util.common.interfaces.EventQueue;
import {{basePackage}}.common.jpa.DTOMapper;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.command.Create{{Entity}}Command;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class Create{{Entity}}CommandHandler
        implements CommandHandler<Create{{Entity}}Command, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    public {{Entity}}.DTO handle(EventQueue eventQueue, Create{{Entity}}Command command) {
        // 1. load / create aggregate
        {{Entity}} entity = new {{Entity}}();
        entity.setName(command.name());

        // 2. persist
        {{Entity}} saved = repository.save(entity);

        // 3. map with MapStruct (Style A nested DTO) — not hand-written setters
        {{Entity}}.DTO dto = dtoMapper.toDTO(saved);

        // 4. enqueue domain events
        eventQueue.add(new {{Entity}}CreatedEvent(dto.getId(), dto.getName())); // IMMEDIATE
        // eventQueue.addTransactional(new ...);                            // AFTER_COMMIT

        return dto;
    }
}
```

**Handler rules**

- `@Component` + `implements CommandHandler<Cmd, R>`
- **No** `@TargetSchema`
- One handler type per command type (duplicate command class → startup error)
- Throw to fail the command transaction; command audit row is still marked failed
- Prefer `eventQueue.add` for same-tx listeners; `addTransactional` for after-commit
- Map entity → DTO via injected `DTOMapper` (`@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)`)

### 4. Policy

```java
package {{basePackage}}.context.{{context}}.policy;

import com.machingclee.domain.util.common.interfaces.CommandInvoker;
import com.machingclee.domain.util.common.interfaces.Invariant;
import com.machingclee.domain.util.common.interfaces.Policy;
import {{basePackage}}.context.{{context}}.event.{{Entity}}CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Reacts to domain events for the {{context}} slice.
 * Keep side effects explicit; use CommandInvoker for follow-on commands.
 */
@Component
public class {{Context}}Policy implements Policy {

    private static final Logger log = LoggerFactory.getLogger({{Context}}Policy.class);

    private final CommandInvoker invoker;

    public {{Context}}Policy(CommandInvoker invoker) {
        this.invoker = invoker;
    }

    @EventListener
    @Invariant({ "{{Entity}} was persisted", "Follow-on work is optional" })
    public void on{{Entity}}Created({{Entity}}CreatedEvent event) throws Exception {
        log.info("{{Entity}} created id={} name={}", event.id(), event.name());
        // optional follow-on command (shares request id):
        // invoker.invoke(new SomeOtherCommand(...));
    }
}
```

**Policy rules**

- Implement marker `Policy`
- Listen with `@EventListener` on the **domain event type** (not `EventWrapper`)
- Keep side effects intentional — nested `invoker.invoke` shares request id

### 5. Write controller (POST)

Keep controllers thin: map HTTP → command → `commandInvoker.invoke(command)`.

```java
@PostMapping
public {{Entity}}.DTO create(@RequestBody CreateRequest body) throws Exception {
    return commandInvoker.invoke(new Create{{Entity}}Command(body.name()));
}
```

Full sample: `templates/sample/EntityController.java`.

## Query → QueryHandler (GET APIs)

Queries are **read-only**. They:

- Do **not** produce domain events
- Do **not** write command audit rows
- Are registered by auto-config into `DefaultQueryInvoker` when any `QueryHandler` bean exists
- Should use `@Transactional(readOnly = true)` on the handler method when hitting JPA

### 1. Query

Marker: `com.machingclee.domain.util.common.query.interfaces.Query<R>`

```java
package {{basePackage}}.context.{{context}}.query;

import com.machingclee.domain.util.annotation.BoundedContext;
import com.machingclee.domain.util.common.query.interfaces.Query;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};

/**
 * Load a single {{Entity}} by id (GET).
 */
@BoundedContext("{{BoundedContextName}}")
public record Get{{Entity}}ByIdQuery(
        Integer id
) implements Query<{{Entity}}.DTO> {
}
```

### 2. QueryHandler

```java
package {{basePackage}}.context.{{context}}.queryhandler;

import com.machingclee.domain.util.common.query.interfaces.QueryHandler;
import {{basePackage}}.common.jpa.DTOMapper;
import {{basePackage}}.common.jpa.entity.{{context}}.{{Entity}};
import {{basePackage}}.common.jpa.repository.{{Entity}}Repository;
import {{basePackage}}.context.{{context}}.query.Get{{Entity}}ByIdQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class Get{{Entity}}ByIdQueryHandler
        implements QueryHandler<Get{{Entity}}ByIdQuery, {{Entity}}.DTO> {

    private final {{Entity}}Repository repository;
    private final DTOMapper dtoMapper;

    @Override
    @Transactional(readOnly = true)
    public {{Entity}}.DTO handle(Get{{Entity}}ByIdQuery query) {
        return repository.findById(query.id())
                .map(dtoMapper::toDTO)
                .orElse(null); // or throw a not-found exception
    }
}
```

For a screen-specific shape, return `{{Entity}}.FrontendSingleDTO` and call
`dtoMapper::toFrontendSingleDTO` instead of a free-standing response DTO unless the
payload spans multiple aggregates (Style B `common.dto.response.*`).

**Query rules**

- `@Component` + `implements QueryHandler<Q, R>`
- One handler per query type (duplicate → startup error)
- **No** `EventQueue` parameter
- Prefer read-only transactions; never mutate aggregates here
- Optional `@BoundedContext` / `@Actor` on the query class for `/docs`
- Prefer `DTOMapper` over `entity.toDto()` when MapStruct is present

### 3. Read controller (GET)

Inject the auto-configured invoker (`QueryInvoker` interface is preferred):

```java
import com.machingclee.domain.util.common.interfaces.CommandInvoker;
import com.machingclee.domain.util.common.query.interfaces.QueryInvoker;
import {{basePackage}}.context.{{context}}.query.Get{{Entity}}ByIdQuery;

@RestController
@RequestMapping("/api/{{context}}")
public class {{Entity}}Controller {

    private final CommandInvoker commandInvoker;
    private final QueryInvoker queryInvoker;

    public {{Entity}}Controller(CommandInvoker commandInvoker,
                                QueryInvoker queryInvoker) {
        this.commandInvoker = commandInvoker;
        this.queryInvoker = queryInvoker;
    }

    @GetMapping("/{id}")
    public {{Entity}}.DTO getById(@PathVariable Integer id) throws Exception {
        return queryInvoker.invoke(new Get{{Entity}}ByIdQuery(id));
    }

    @PostMapping
    public {{Entity}}.DTO create(@RequestBody CreateRequest body) throws Exception {
        return commandInvoker.invoke(new Create{{Entity}}Command(body.name()));
    }

    public record CreateRequest(String name) {}
}
```

**Wiring notes**

| Piece | Write (Command) | Read (Query) |
|-------|-----------------|--------------|
| Marker | `Command<R>` | `Query<R>` |
| Handler | `CommandHandler<C,R>` | `QueryHandler<Q,R>` |
| Invoker bean | `CustomCommandInvoker` (auto-config when one `AuditEventRepository` exists) | `DefaultQueryInvoker` (auto-config) |
| Inject as | `CommandInvoker` | `QueryInvoker` |
| Events / audit | Yes | No |
| Typical HTTP | POST / PUT / PATCH / DELETE | GET |

Templates: `templates/sample/GetEntityByIdQuery.java`,  
`templates/sample/GetEntityByIdQueryHandler.java`.

## Docs / visualization UI

When a `AbstractCommandInvoker` bean exists, auto-config exposes:

- JSON flows under `/docs/...` (commands, queries, policies, entity graph)
- Static SPA under `META-INF/resources/command-visualization/` (bundled in the JAR)

`@BoundedContext` and `@Actor` on Command/Query types are what populate context
and actor chips in that UI. `@Invariant` on policy methods documents rules.

Frontend sources live in the domain-util repo under `event-storming-frontend/`.
Rebuild and copy into the library when customizing the UI.

## How to apply this skill

1. Confirm the consumer is a Spring Boot app with JPA (or scaffold one first).
2. Add `templates/pom.snippet.xml` dependency; install the library to local m2 if needed.
3. Collect `{{basePackage}}` + `{{Context}}` / `{{context}}` (+ first aggregate if scaffolding a sample).
4. Generate **entity + repository** from `templates/EventEntity.java` and
   `templates/EventRepository.java`. Do **not** generate auditor / invoker /
   logger unless the app has multiple `AuditEventRepository` beans.
5. Optionally generate the **sample** write + read flow from `templates/sample/`  
   (Command/Handler/Event/Policy **and** Query/QueryHandler + controller GET/POST).
6. Choose DTO placement: nested `Entity.DTO` (Style A) for command/query returns;  
   `common.dto.request` (Style B) for `@RequestBody`; add/extend `DTOMapper` with  
   `@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)`.
7. Put `@BoundedContext` / `@Actor` on commands and queries; `@Invariant` on policy methods.
8. Merge `templates/application-domainutil.snippet.yml`.
9. When ready, run `templates/ddl/event-table.sql`.
10. Compile; invoke a command and a GET query; confirm rows in the `event` table and `/docs` if web is on.

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Add `@TargetSchema` / `SchemaIdentifier` | Single pipeline; no such types exist |
| Register multiple `DomainEventLogger` beans for "different schemas" | One logger; or separate apps |
| Put business logic in the controller | `commandInvoker.invoke(command)` / `queryInvoker.invoke(query)` only |
| Mutate state inside a `QueryHandler` | Use a `Command` + `CommandHandler` |
| Manually `@Bean` a second query invoker | Use auto-configured `DefaultQueryInvoker` |
| Generate auditor / invoker / logger for a single audit store | Inject `CommandInvoker`; auto-config creates the three beans |
| Nest HTTP request DTOs on the entity | Style B: `common.dto.request.*` |
| Put every response only in `dto` when the module uses `Entity.DTO` | Style A for 1-entity shapes; Style B only for composed APIs |
| Hand-map entity fields in handlers when MapStruct exists | Inject `DTOMapper` |
| `@Mapper` without `unmappedTargetPolicy = ERROR` | Always ERROR so missing fields fail compile |
| `Mappers.getMapper(DTOMapper.class)` | `componentModel = "spring"` + constructor inject |
| Expect the library to `SET search_path` | Use `@Table(schema=…)` / datasource |
| Pass a schema enum into `super(...)` for invoker/logger | Use the 5-arg invoker / 3-arg logger ctors above |
| Listen to `EventWrapper` in policies | Listen to the concrete domain event type |

## Quick reference — key types

| Type | Package |
|------|---------|
| `Command` / `CommandHandler` / `Policy` | `…common.interfaces` |
| `EventQueue` | `…common.interfaces` |
| `Query` / `QueryHandler` / `QueryInvoker` | `…common.query.interfaces` |
| `DefaultQueryInvoker` | `…common.query` |
| `CommandInvoker` / `AbstractCommandInvoker` / `CustomCommandInvoker` | `…common.interfaces` / `…common.command` |
| `CustomCommandAuditor` | `…common.command` |
| `DomainEventLogger` | `…common.event` |
| `DomainEventDispatcher` | `…common.interfaces` (impl `SpringDomainEventDispatcher`) |
| `AuditEvent` / `AuditEventRepository` | `…common.interfaces` |
| `ExternalEventPublisher` | `…common.event` (events outside a command) |
| `@BoundedContext` / `@Actor` | `…annotation` (docs / flow metadata) |
| `@Invariant` | `…common.interfaces` (policy method docs) |
| Nested `Entity.DTO` / `Frontend*DTO` | On the JPA entity (Style A) |
| Request/response package DTOs | `common.dto.request` / `common.dto.response` (Style B) |
| `DTOMapper` | `common.jpa` — `@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)` |

## Checklist

- [ ] `com.machingclee:domain-util` on classpath  
- [ ] `{{Context}}Event` implements `AuditEvent` with `@Table` + no-arg ctor  
- [ ] `{{Context}}EventRepository extends AuditEventRepository<…>` (exactly one such bean)  
- [ ] Controllers / policies inject `CommandInvoker` (auto-config; do not generate a subclass)  
- [ ] Command handlers are `@Component` `CommandHandler` implementations (no schema annotation)  
- [ ] Commands/queries carry `@BoundedContext` / `@Actor` when docs UI matters  
- [ ] Query handlers are `@Component` `QueryHandler` implementations (`@Transactional(readOnly = true)`)  
- [ ] Controllers use `commandInvoker.invoke` for writes and `queryInvoker.invoke` for GETs  
- [ ] Domain return types use nested `Entity.DTO` (Style A); HTTP bodies use `common.dto.request` (Style B)  
- [ ] `DTOMapper` exists with `@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)`  
- [ ] Handlers map via `dtoMapper.toDTO(...)` (no silent field drops — ERROR policy)  
- [ ] `event` table exists or `ddl-auto` strategy is intentional  
