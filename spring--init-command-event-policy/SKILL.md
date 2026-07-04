---
name: spring--init-command-event-policy
description: >-
  Scaffold a domain.util Command/Event/Policy pipeline into a new Spring Boot project:
  a per-schema glue layer (Schema enum, an audit Event entity implementing AuditEvent,
  its repository, a CommandInvoker, CommandAuditor, and DomainEventLogger) plus a
  worked example of the full flow — Controller → Command → CommandHandler → domain
  Event → Policy — for one aggregate. The Event entity is generated even before its
  backing table exists (the app still boots with ddl-auto=none; include the DDL to
  create the table later). Use when bootstrapping a new echarge microservice that
  follows the web.sales convention, initialising a command/event/policy context,
  or wiring domain.util into a fresh module.
---

# Command / Event / Policy Scaffold (domain.util)

This skill bootstraps a **domain.util** command pipeline into a new Spring Boot
project, mirroring the convention proven in `web.sales`. It produces the six
per-schema "glue" beans domain.util needs to run, **plus** one complete worked
example of the flow for a sample aggregate so the project is runnable end-to-end.

domain.util (`com.echarge:domainutil`) provides the framework:
`Command`, `CommandHandler`, `CommandInvoker`, `EventQueue`, `Policy`,
`@TargetSchema`, `@Invariant`, and the `AuditEvent` interface. Each consumer
project supplies the schema-specific wiring — that wiring is what this scaffold
generates.

## Mandatory Trigger

Invoke this skill before writing any command/pipeline code when the user asks to:

- "scaffold a command/event/policy pipeline" / "initialise domain.util" in a new project.
- "set up the web.sales pattern" / "CQRS scaffold" for a new Spring Boot module.
- "create a command context" / "wire domain.util into this project".
- "add the Event entity that implements AuditEvent" (even with no table yet).

## The flow it implements

```
Controller ──invoke(cmd)──▶ CommandInvoker ──▶ @TargetSchema CommandHandler
            (thin)         (tx + audit +         (persists aggregate,
                            dispatch)             pushes domain Event to EventQueue)
                                                        │
                                                        ▼
                                    DomainEventLogger persists AuditEvent row,
                                    re-publishes Event as Spring ApplicationEvent
                                                        │
                                                        ▼
                                    Policy.@EventListener reacts:
                                      enforce @Invariant (throw → abort tx), or
                                      invoke follow-on Command
```

## Placeholders

Substitute these consistently across every template:

| Placeholder | Meaning | Example |
|---|---|---|
| `{{basePackage}}` | project base package | `com.echarge.sales` |
| `{{context}}` | bounded context / DB catalog (lowercase) | `sales` |
| `{{Context}}` | same, PascalCase | `Sales` |
| `{{SCHEMA}}` | schema enum constant (uppercase) | `SALES` |
| `{{Entity}}` | first aggregate, PascalCase | `SaleOffer` |
| `{{entity}}` | same, camelCase | `saleOffer` |
| `{{tableName}}` | aggregate table (snake_case) | `sale_offer` |
| `{{tablePath}}` | REST path segment (kebab-case) | `sale-offers` |

## What it produces

```
src/main/java/{{basePackage}}/
  common/domainutils/{{context}}/
    {{Context}}Schema.java              ← templates/Schema.java
    {{Context}}CommandInvoker.java      ← templates/CommandInvoker.java
    {{Context}}CommandAuditor.java      ← templates/CommandAuditor.java
    {{Context}}DomainEventLogger.java   ← templates/DomainEventLogger.java
  common/jpa/entity/{{context}}/
    {{Context}}Event.java               ← templates/EventEntity.java   ★ AuditEvent entity
    {{Entity}}.java                     ← templates/sample/Entity.java
  common/jpa/repository/
    {{Context}}EventRepository.java     ← templates/EventRepository.java
    {{Entity}}Repository.java           ← templates/sample/EntityRepository.java
  context/{{context}}/
    command/Create{{Entity}}Command.java          ← templates/sample/CreateEntityCommand.java
    commandhandler/Create{{Entity}}CommandHandler.java ← templates/sample/CreateEntityCommandHandler.java
    event/{{Entity}}CreatedEvent.java             ← templates/sample/EntityCreatedEvent.java
    policy/{{Context}}Policy.java                 ← templates/sample/ContextPolicy.java
  controller/
    {{Entity}}Controller.java                     ← templates/sample/EntityController.java

src/main/resources/
  application.yml                       ← merge templates/application-domainutil.snippet.yml

templates/ddl/event-table.sql           ← run against the {{context}} schema when ready
```

The **glue** (top six files + `{{Context}}EventRepository`) is mandatory — without it
domain.util cannot invoke commands or persist audit rows. The **sample** files are a
runnable reference for one aggregate; duplicate and rename them per real aggregate.

## How to use

1. **Collect the two names.** Ask for (or infer) the bounded context — e.g. `sales` —
   and the first aggregate — e.g. `SaleOffer`. Derive every placeholder from these.

2. **Wire the dependency.** Add `templates/pom.snippet.xml` to `<dependencies>`, and
   merge `templates/application-domainutil.snippet.yml` into `application.yml`.
   `ddl-auto: none` is required so the app boots before the `event` table exists.

3. **Drop in the glue.** Copy the six glue templates + `EventRepository.java` into the
   paths above, substituting placeholders. These make domain.util operational.

4. **Drop in the sample flow.** Copy the seven `templates/sample/*` files, renaming each
   to its `{{...}}`-expanded class name. The handler MUST keep
   `@TargetSchema({{Context}}Schema.class)` — that is how the invoker routes it.

5. **Create the table when the schema is ready.** Run `templates/ddl/event-table.sql`
   against the `{{context}}` catalog. Optional at scaffold time — see Notes.

6. **Run & hit it.** Start the app and `POST /{{tablePath}}` with `{"name":"..."}`.

## Notes

- **Event entity without a table.** `{{Context}}Event implements AuditEvent` is generated
  up front even though its `event` table may not exist yet. With `ddl-auto: none` the
  context loads and all beans wire; persistence only fails on the first `invoke()` that
  tries to write an audit row, until `event-table.sql` is applied. Do **not** use
  `ddl-auto: validate` until the table exists — Hibernate's startup schema check would
  reject it.

- **Domain events vs the audit Event entity.** Two distinct "events": `{{Entity}}CreatedEvent`
  (a plain POJO on the `EventQueue`, no interface, no table) carries post-state to
  policies; `{{Context}}Event` (the JPA entity implementing `AuditEvent`) is the audit
  log the framework writes per command/event. Don't conflate them.

- **`@TargetSchema` is the router — and it's compile-enforced.** A handler is picked up
  by `{{Context}}CommandInvoker` only because of `@TargetSchema({{Context}}Schema.class)`.
  domain.util ships an annotation processor that turns a missing `@TargetSchema` into a
  **build error**; it activates automatically once `domainutil` is on the annotation
  processor path — see `templates/compiler-processor-paths.snippet.xml` (mandatory if your
  project already uses `<annotationProcessorPaths>` for Lombok/MapStruct). Multi-schema
  projects define one Schema enum + Invoker/Auditor/EventLogger/Event per schema, and tag
  each handler.

- **Commands return DTOs, never entities.** Follow the sample: handlers map the saved
  aggregate into its nested `Entity.DTO` and return that. The generic on
  `Command<R>` types `invoker.invoke(cmd)` with no cast.

- **Policies dispatch after commit by default.** Events added via `eventQueue.add(...)`
  fire their `@EventListener`s after the command transaction commits. Use
  `eventQueue.addTransactional(...)` only when a listener must run inside the same tx.

- **Adapt the controller to your stack.** The sample returns the DTO directly. Wrap in
  your response envelope (e.g. `APIResponseDTO.success(...)`) and add `@AccessToken` /
  `@RequestUser` / `@LogRequest` per your project's security and logging conventions.

- **Visualize the flow.** domain.util bundles a command/event/policy diagram frontend and
  serves it via `DocController` (`GET /docs/commands/diagram`) — every consumer gets it
  automatically. For a **customized** or per-module copy of that visualizer, run the
  companion skill `spring--add-event-storming-frontend` (it asks which module and which
  frontend source to install from).

## Verify

- App starts with **no** `event` table present (ddl-auto=none) and logs the
  `{{Context}}CommandInvoker` bean + registered `Create{{Entity}}CommandHandler`.
- `POST /{{tablePath}}` with `{"name":"x"}` returns the created DTO with an `id`.
- After running `event-table.sql` and repeating the POST, a row appears in the
  `{{context}}.event` table (`event_type` = the command name, `success` = true) and the
  `{{Entity}}CreatedEvent` reaches `{{Context}}Policy.enforceNameNotBlank`.
- A POST with `{"name":""}` aborts the transaction via the policy's `@Invariant` guard.

## Dependencies

Requires `com.echarge:domainutil` on the classpath (auto-configures itself via
`META-INF/spring/...AutoConfiguration.imports`), plus `spring-boot-starter-web`,
`spring-boot-starter-data-jpa`, a JDBC driver, and Lombok. Spring Boot 3.x+/Jakarta
namespace is assumed (matches domain.util's `jakarta.persistence` imports).
