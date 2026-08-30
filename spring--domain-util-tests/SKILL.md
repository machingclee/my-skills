---
name: spring--domain-util-tests
description: >-
  Create integration tests for Spring Boot bounded contexts that use the
  domain.util CommandInvoker and event-sourcing style audit tables. Covers the
  TEST-ID naming scheme, the five-step command test recipe (seed, invoke,
  assert the event row, assert the DTO, verify the payload against the
  entity), requestId scoping for repeated invocations, policy-invariant tests,
  and the typed payload access via Lombok @Builder @Jacksonized. Includes the
  full BaseTest and CommandEventTest templates so every helper the recipe uses
  (findDomainEvents, requireSingleDomainEvent, safeParse, assertDtoNonNull,
  assertDtoJsonNonNull, Getter) is defined in this skill. Use whenever the
  user asks to add a command-handler test, a policy-invariant test, scan
  commands for missing coverage, or understand how these tests are structured
  and named.
---

# Creating Command and Policy Tests with the CommandInvoker

This skill is the recipe for writing integration tests against Spring Boot
bounded contexts whose commands run through the `CommandInvoker` from the
`domain.util` library. Every invocation writes a command audit row plus one row
per domain event into an `event` table, and every test asserts on those rows.
The concrete reference implementation lives in the `web.sales` module
(`com.echarge.sales.context.<ctx>`), with MySQL 8.4.8 Testcontainers; the
recipe generalizes to any context that exposes the same helpers.

## Mandatory Trigger

Invoke this skill when the user:

- Asks to **add a test** for a specific command, handler, usecase, or policy invariant.
- Asks to **scan the commands** and **create missing tests**.
- Mentions **TEST-ID**, **TEST-REGISTRY**, **coverage**, or **event payload** assertions.
- Wants to know **how tests are named, structured, or identified** before writing new ones.
- Says **"create tests for each command"**, **"test the event after each transaction"**, or similar.

## How the Pipeline Works

- `commandInvoker.invoke(cmd)` runs the handler inside a transaction.
- The command itself becomes an audit row whose `eventType` is the command
  simple name (or `PolicyClass > CommandName` for policy-nested commands).
- Each domain event the handler adds becomes its own row whose `eventType` is
  the event simple name, whose `payload` is the Jackson serialization of the
  event object, and whose `success` is true when the command commits.
- `DomainEventLogger` persists the event rows in a `REQUIRES_NEW` transaction,
  so a failed command leaves event rows marked `success = false` instead of
  discarding them. This is how negative tests can assert the failed attempt.
- Policies are `@EventListener` methods annotated `@Invariant`; they run
  synchronously inside the command transaction. A violating policy throws and
  rolls the whole command back. Policy-nested commands inherit the outer
  `requestId` from MDC.

## Test Infrastructure (the templates)

Every test class extends `CommandEventTest` (the helper base), which extends
`BaseTest` (the Spring + container base). The complete templates live in the
`templates/` folder of this skill:

- `templates/BaseTest.java` — Spring context + Testcontainer wiring +
  per-test wipe. Carries `@SpringBootTest` + `@ActiveProfiles("test")`,
  imports `TestcontainersConfiguration`, points the datasource at the
  container via `@DynamicPropertySource`, and truncates every table in
  `@BeforeEach`.
- `templates/CommandEventTest.java` — the helper base. Defines every helper
  used anywhere in this skill: `findDomainEvents`,
  `requireSingleDomainEvent`, `safeParse`, `assertDtoNonNull`,
  `assertDtoJsonNonNull`, `Getter`, `fieldName`.
- `templates/TEST-REGISTRY.md` — a reference registry showing the exact table
  format for command and policy tests.

Copy the templates into your project, adjust the package names
(`com.example.project` → your base package), and you are ready to write tests.
The reference implementation in `web.sales` lives under
`src/test/java/com/echarge/sales/testcontainerdb/` (`BaseTest.java`,
`CommandEventTest.java`, `TestcontainersConfiguration.java`).

Notes on the templates:

- `CommandEventTest` fields are `protected`, not `private`: the concrete test
  classes live in a different package and must access `commandInvoker`,
  `eventRepository`, and the helpers directly.
- Every helper takes a `Class<?>` overload that derives the string with
  `getSimpleName()`, so renaming an event class cannot silently break a lookup.
- `safeParse(event, XxxEvent.class)` is the typed payload reader (older docs
  called it `eventOf`; the current codebase uses `safeParse`).
- `Getter.of(...)` removes the need for a cast at every call site; the declaring
  DTO type is inferred and widened to `Getter<?, ?>`.

## The TEST-ID Naming Scheme (never duplicate)

Every test method carries a stable identifier in a comment directly above it,
and is registered in its context's `TEST-REGISTRY.md`. Before writing any new
test, scan both to see if the command or policy is already covered.

| Kind | Format | Example | Where |
|------|--------|---------|-------|
| Command test | `<CTX>-<NNN>` (zero-padded, 3 digits) | `BK-001`, `CM-022`, `SL-018` | `XxxCommandHandlerTest.java` |
| Policy invariant test | `<CTX>-P<NN>` (zero-padded, 2 digits) | `BK-P01`, `CM-P12`, `SL-P08` | `XxxPolicyInvariantTest.java` |

In the reference implementation the context prefixes are:

| Context | Prefix | Command test class | Policy test class |
|---------|--------|--------------------|-------------------|
| booking | `BK` | `BookingCommandHandlerTest` | `BookingPolicyInvariantTest` |
| carmodel | `CM` | `CarModelCommandHandlerTest` | `CarModelPolicyInvariantTest` |
| notification | `NT` | `NotificationCommandHandlerTest` | (no policy class) |
| sales | `SL` | `SalesCommandHandlerTest` | `SalesPolicyInvariantTest` |

Numbering rules:

- Command IDs follow the order of the command list in the registry; append the
  next free number for a brand-new command.
- Policy IDs follow the order the `@Invariant` methods appear in the policy class.
- A command or invariant that needs several methods (happy path + negative
  variant) reuses the same TEST-ID; do not invent new IDs for variants.
- Extra methods beyond the canonical range use a suffix such as `NT-001b`.

Every `@Test` method must carry, directly above it:

```java
// TEST-ID: BK-001
// AddScheduledCarCommand → BookingScheduledCarAddedEvent
@Test
void bk001_addScheduledCar_emitsEventAndPersists() { ... }
```

The method name starts with the lower-cased TEST-ID
(e.g. `sl006_createSaleOffer_emitsEventAndComputesFinalPriceFromFees`), so
`grep -rn "TEST-ID:" src/test/java/<pkg>/<ctx>` lists all tests in one pass.

Each context keeps a `TEST-REGISTRY.md` with a table
`TEST-ID | Command | Event(s) | Test method | Verifies`. Keep it in sync with
every added test; it is the authoritative scan target.

A reference registry looks like this; the full example is in
`templates/TEST-REGISTRY.md` of this skill (one table per kind — command tests
and policy invariant tests have different columns):

```markdown
# TEST-REGISTRY — sales

Command tests:

| TEST-ID | Command | Event(s) | Test method | Verifies |
|---------|---------|----------|-------------|----------|
| SL-001 | CalculateFinalPriceCommand | FinalPriceCalculatedEvent | sl001_calculateFinalPrice_recomputesFromHandlingFeesAndEmitsEvent | event emitted with success=true, DTO non-null, finalPrice matches entity |
| SL-002 | CancelOrderCommand | (none — handler defect) | sl002_cancelOrder_failsAndRollsBackWhenCancelledStatusRemarkMissing | handler never sets a NOT NULL column so invoke throws, transaction rolls back |
| SL-003 | CreateCarModelAnnotationCommand | CarModelAnnotationCreatedEvent | sl003_createCarModelAnnotation_emitsEventAndReturnsDto; sl003_createCarModelAnnotation_skipEventEmitsNothing | event emitted + DTO populated; skipEvent=true means no event row |
| SL-004 | CreateCarSalesItemCommand | (NO domain event) | sl004_createCarSalesItem_persistsItemAndEmitsNoDomainEvent | entity persisted; event table contains ONLY the command audit row |

Policy invariant tests:

| TEST-ID | Invariant (method) | Trigger event | Test method | Verifies |
|---------|--------------------|---------------|-------------|----------|
| SL-P01 | salesItemDeletionInvariant | SalesItemDeletedEvent | slP01_deleteSalesItemWithoutOffers_succeeds; slP01_deleteSalesItemWithExistingOffer_rejectedAndRollsBack | delete item with no offer succeeds; with an offer the invariant throws and rolls back |
```

Notes on the registry format:

- The "Event(s)" column lists every event the test asserts, including
  policy-nested cascade events (e.g. `SaleOfferUpdatedEvent (+
  FinalPriceCalculatedEvent via handlingFeeRecalculationInvariant)`), and
  marks commands that intentionally emit no domain event.
- A single TEST-ID with several methods (happy path + variant) lists them all
  in the "Test method" cell separated by `;`.
- Genuinely broken handlers are documented as a defect row: "Event(s)" says
  `(none — handler defect)` and "Verifies" describes the expected failure and
  rollback instead of forcing a happy path.
- The policy table's "Invariant (method)" column names the `@Invariant` method
  in the policy class, and "Trigger event" names the event that activates it.

### The scan checklist (do this first, never duplicate)

Before writing any new test, scan to see if the command or policy is already
covered:

1. `grep -rn "TEST-ID:" src/test/java/<pkg>/<ctx>/` — all existing test IDs
   and their methods.
2. Read `<ctx>/TEST-REGISTRY.md` — the command → TEST-ID mapping.
3. Compare against the command classes in
   `src/main/java/<pkg>/<ctx>/command/` and the `@Invariant` methods in the
   policy class.
4. Only add a test when the command/invariant is **not** present in the
   registry.

## How to Add a Test for a Specific Command

1. **Locate the command** in
   `src/main/java/<pkg>/<ctx>/command/<Command>.java`, read its builder fields,
   then read its handler in `<ctx>/commandhandler/<Command>Handler.java` to learn:
   - what entities it reads/writes and which prerequisites must pre-exist,
   - which domain event(s) it emits via `eventQueue.add(...)`,
   - any policy side effects the emitted event triggers (read the policy class
     too — e.g. a customer assignment also creates a schedule link).
2. **Check the registry** for an existing TEST-ID for this command; reuse it if
   it exists (add a variant method with the same ID), otherwise allocate the
   next free `<CTX>-<NNN>`.
3. **Extend the right test class** (`XxxCommandHandlerTest extends
   CommandEventTest`). Autowire the repositories you need and seed
   prerequisites via repository `saveAndFlush` (prefer the entity factories,
   e.g. `CarModel.create(...)`, `SellingSalesItem.createCarItem(...)`).
4. **Invoke** the command: `commandInvoker.invoke(cmd)` (throws `Exception`).
   When a test invokes the **same command (or same event type) more than once**
   — e.g. seeding a media block then appending to it, assigning twice, or
   checking idempotency — give each invocation its **own requestId** via
   `commandInvoker.invoke(cmd, "descriptive-id")`. All events emitted by that
   invocation AND by any policy-nested commands it triggers share that
   requestId (the nested `invoke` inherits the outer requestId from MDC).
5. **Assert the event**: `requireSingleDomainEvent(XxxEvent.class)`, or
   `requireSingleDomainEvent(XxxEvent.class, "requestId")` when the same event
   type may appear under multiple invocations. Use `findDomainEvents(...)`
   (optionally with a requestId) when more than one row of that type is
   expected on purpose. Assert `event.getSuccess()` is true.
6. **Assert DTO fields non-null**: parse the payload straight into the typed
   event with `safeParse(event, XxxEvent.class)` and assert on real getters
   (`evt.getBookingVehicle().getId()`). Add `assertDtoJsonNonNull(evt,
   Getter.of(SellingOffer.DTO::getStartDate), ...)` for payload subtrees and
   `assertDtoNonNull(returnedDto, Getter.of(...))` for the returned DTO.
   Read the event/DTO classes to know which fields may legitimately be null
   (e.g. optional associations, DB-generated `createdAt` before flush).
7. **Verify the payload matches the entity**: re-fetch the entity by id and
   assert the fields the handler wrote equal the payload values (create →
   fields match; update → `previous` vs `current` differ by the change; delete
   → entity gone and payload carries the pre-delete DTO).
8. **Update the TEST-REGISTRY.md** row for the command (add the method name
   and a short "Verifies" note).
9. **Run**: `mvn test -Dtest=XxxCommandHandlerTest -Dsurefire.failIfNoSpecifiedTests=false`

## The Five Step Recipe

Almost every command test follows five steps. The example is `SL-001`, which
recalculates an offer's final price from its handling fees.

### Step 1: Seed Prerequisites Through Repositories

Commands rarely run against an empty world. Build the entities they need
directly through the JPA repositories, preferring the domain factories where
they exist. `CarModel.create(...)`, `SellingSalesItem.createCarItem(...)`, and
`BookingScheduleLink.createIncomplete(...)` encapsulate the invariant that
several columns must be wired together.

```java
CarModel cm = seedCarModel(3);
SellingSalesItem item = seedCarItem(cm);
SellingOffer offer = createOffer(item, "Basic", new BigDecimal("1000.0000"), false,
        new BigDecimal("200.0000"), new BigDecimal("50.0000"));
```

### Step 2: Invoke the Command

Build the command with its Lombok builder and hand it to the invoker. The
return value is whatever the handler returned, usually a DTO.

```java
commandInvoker.invoke(CalculateFinalPriceCommand.builder().saleOfferId(offer.getId()).build());
```

### Step 3: Assert the Domain Event

Look the event row up by its class. `requireSingleDomainEvent` asserts there is
exactly one success row and returns it; `findDomainEvents` returns all of them
for cases where more than one row is expected on purpose.

```java
SalesEvent event = requireSingleDomainEvent(FinalPriceCalculatedEvent.class);
assertThat(event.getSuccess()).isTrue();
FinalPriceCalculatedEvent evt = safeParse(event, FinalPriceCalculatedEvent.class);
assertThat(evt.getSaleOfferId()).isEqualTo(offer.getId());
```

### Step 4: Assert the DTO Fields

Read the payload through the typed event and assert the DTO fields with real
getters. `assertDtoJsonNonNull(evt, Getter.of(SellingOffer.DTO::getStartDate),
...)` accepts getter method references (derived via `SerializedLambda`) and
checks recursively that no field is null, except the ones we explicitly allow;
optional associations and DB-generated timestamps are the usual exceptions.

```java
assertThat(evt.getSellingOffer().getFinalPrice()).isEqualByComparingTo(new BigDecimal("1250.0000"));
assertDtoJsonNonNull(evt, Getter.of(SellingOffer.DTO::getStartDate), Getter.of(SellingOffer.DTO::getEndDate));
```

### Step 5: Verify the Payload Matches the Entity

The payload records what the handler claims it did. Re-fetch the entity by id
and compare, so the event and the database cannot drift apart. Create commands
match fields; update commands assert `previous` vs `current` differ by exactly
the change; delete commands assert the entity is gone and the payload carries
the pre-delete DTO.

```java
SellingOffer reloaded = sellingOfferRepository.findByIdWithFees(offer.getId()).orElseThrow();
assertThat(reloaded.getFinalPrice()).isEqualByComparingTo(new BigDecimal("1250.0000"));
assertThat(reloaded.getHandlingFees()).hasSize(2);
```

## Typed Payload Access with @Builder @Jacksonized

Event classes are Lombok value objects with `final` fields and no default
constructor, so Jackson cannot deserialize them out of the box. Every event
class is annotated `@Builder @Jacksonized`:

```java
@Data
@RequiredArgsConstructor   // keep for handlers that write new XxxEvent(...)
@Builder
@Jacksonized
public class AssigneeDeletedEvent { ... }
```

`@Jacksonized` (`lombok.extern.jackson.Jacksonized`, Lombok 1.18.20+) writes
`@JsonDeserialize(builder = ...Builder.class)` on the class and
`@JsonPOJOBuilder(withPrefix = "", buildMethodName = "build")` on the builder,
so Jackson builds the event through the builder's no-arg constructor. The
annotation is compile-time only and purely additive. If a new event class is
added, annotate it `@Builder @Jacksonized`; add `@RequiredArgsConstructor` or
`@AllArgsConstructor` as well when a handler constructs it with `new XxxEvent(...)`.

`safeParse(event, XxxEvent.class)` then deserializes the payload straight into
the typed event, and all assertions read plain getters with compile-time
checked names — no `JsonNode`, no string keys:

- Allowed-null and excluded fields for `assertDtoJsonNonNull` /
  `assertDtoNonNull` are passed as getter method references wrapped in
  `Getter.of(SellingOffer.DTO::getStartDate)` (never hard-coded strings, no
  casts). The field name is derived via `SerializedLambda`, so renaming the DTO
  field breaks compilation. Declaring constants use `Getter<?, ?>[]` (e.g.
  `OPTIONAL_NULL_FIELD_GETTERS`, `MEDIA_CHILD_FIELD_GETTERS`).
- Scalar fields: `evt.getKind()`, `evt.getScheduledCarId()`
- DTOs: `evt.getBookingVehicle().getId()`
- Lists: `evt.getCurrAssignees().get(0).getUserId()`
- Nested DTOs: `evt.getPrevMediaDTO().getCarModelAdMediaVideo().getHeight()`
- Enums: `evt.getNotification().getType().name()`

## Scoping Events with requestId

`CommandInvoker` exposes `invoke(command, requestId)`. Every command row and
every domain event persisted during that invocation, including events emitted
by policy-nested commands, carries that `requestId` in the `event` table.
`CommandEventTest` offers requestId-scoped helpers:

```java
commandInvoker.invoke(cmd, "my-req-1");                   // explicit requestId
requireSingleDomainEvent(XxxEvent.class, "my-req-1");     // exactly one row for that request
findDomainEvents(XxxEvent.class, "my-req-1");             // all rows for that request
```

Use it whenever a single test invokes a command more than once and the
assertions must address a specific invocation: seed-then-act, idempotency
re-runs, two assignments, reorders. Policy cascades share the outer requestId,
so scope cascade assertions to the outer requestId to prove they belong to the
same request. RequestIds only need to be unique within a test; a short
descriptive string is enough (`"cm002-append"`).

Worked examples from the reference suite:

- `cm002` seeds `AddCarModelAdMediaCommand` (`"cm002-seed"`) then runs
  `AddImageIntoAdMediaContainerCommand` (`"cm002-append"`) and scopes the
  `CarModelAdMediaAddedEvent` assertion to `"cm002-append"`.
- `nt005` runs `MarkNotificationAsReadCommand` twice
  (`"nt005-first"`/`"nt005-second"`) to assert `alreadyRead` flips.
- Policy cascades share the outer requestId: `slP03` invokes
  `UpdateCarModelCommand` under `"slP03-zero"` and asserts BOTH
  `CarModelUpdatedEvent` and the policy-nested `SaleOfferStoppedEvent` under
  that same requestId.

RequestId scoping does NOT replace the per-test truncate in `BaseTest`:
entity-level assertions (`count()`, `findAll()`, `hasSize(n)`) query tables
that have no `request_id` column, so without the wipe they would accumulate
rows across tests and fail.

## Policy Invariant Tests

To add a test for a specific policy invariant:

1. **Locate the `@Invariant` method** in the context's policy class (e.g.
   `BookingPolicy.java`, `CarModelPolicy.java`, `SalesPolicy.java`). Read its
   javadoc/description — that text IS the documented rule.
2. **Check the registry** for an existing `-P` TEST-ID for that invariant;
   reuse it, otherwise allocate the next free `<CTX>-P<NN>` following the
   method order in the policy class.
3. **Extend the right policy test class** (`XxxPolicyInvariantTest extends
   CommandEventTest`). The invariant fires synchronously inside the command
   transaction, so:
   - **Positive test**: valid setup → `commandInvoker.invoke(...)` succeeds,
     and where the invariant performs a side effect (creates a link, sends a
     notification, stops an offer, deletes an empty selection) assert the
     side effect actually happened in the DB.
   - **Negative test** (when a violation is constructible): violating setup →
     `assertThatThrownBy(() -> commandInvoker.invoke(cmd))` throws
     `EcapiException`/`RuntimeException`, and the DB is rolled back (assert
     the entity is unchanged / not persisted).
4. **Trigger the invariant via the event that activates it** — invoke the
   command whose emitted event the `@EventListener` listens to (it may live in
   another context, e.g. carmodel invariants listen to sales-context
   annotation events).
5. **Update the TEST-REGISTRY.md** policy table.
6. **Run**: `mvn test -Dtest=XxxPolicyInvariantTest -Dsurefire.failIfNoSpecifiedTests=false`

## Conventions and Pitfalls

- Test classes are package-private and extend `CommandEventTest`; tables are
  truncated before every test, so seed everything the test needs.
- Some handlers return `Void` (e.g. `AssignCustomerToScheduledCarCommand`) —
  skip the returned-DTO assertion.
- When a handler is genuinely broken (e.g. a NOT NULL column never set),
  document the defect: write the test asserting the current failure plus
  rollback and note "defect" in the registry row instead of forcing a happy
  path.
- If the context depends on external services (a user-profile table, a
  Cloudflare transaction lock), replace them with `@MockitoBean` so tests stay
  offline against the container database. Note: a class with `@MockitoBean`
  gets its own Spring context, so group such tests together to avoid
  multiplying context starts. In the reference suite, booking tests replace
  `UserProfileService` and the Cloudflare `TransactionLock` because the
  `echarge.user_info` table does not exist in the Testcontainer.
- `DefaultCarModelCategoryApplicationRunner` writes audit rows at context
  startup; truncation wipes them before each test, so
  `eventRepository.findAll()` only sees the current test's rows.
- The Testcontainer host port is fixed (e.g. 4000), incrementing by 1 when
  busy; read the mapped port via the container configuration, never hard-code
  it in tests. You can connect a GUI tool (DataGrip, DBeaver, TablePlus) to
  `localhost:4000` while tests are running.
- Run a single test class with
  `mvn test -Dtest=XxxCommandHandlerTest -Dsurefire.failIfNoSpecifiedTests=false`.

## Example

```
User: "Add a test for StopSaleOfferCommand"

Agent:
  1. Reads src/main/java/com/echarge/sales/context/sales/command/StopSaleOfferCommand.java
     → builder fields: saleOfferIds (List<Integer>)
  2. Reads commandhandler/StopSaleOfferCommandHandler.java → emits
     SaleOfferStoppedEvent, turns every offer's onSale to false
  3. Checks TEST-REGISTRY.md → SL-016 exists → reuses SL-016, adds a variant
     method sl016_... if the scenario is new
  4. Extends SalesCommandHandlerTest, seeds CarModel → SellingSalesItem →
     SellingCar → SellingOffer via repositories, invokes the command
  5. Asserts requireSingleDomainEvent(SaleOfferStoppedEvent.class), payload DTO
     non-null via safeParse, and all offers onSale=false in the DB
  6. Updates TEST-REGISTRY.md, runs:
     mvn test -Dtest=SalesCommandHandlerTest -Dsurefire.failIfNoSpecifiedTests=false
```
