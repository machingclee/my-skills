---
name: spring--domain-util-tests
description: >-
  Create integration tests for Spring Boot bounded contexts that use the
  domain.util CommandInvoker and event-sourcing style audit tables. Covers the
  TEST-ID naming scheme, the five-step command test recipe (seed, invoke,
  assert the event row, assert the DTO, verify the payload against the
  entity), requestId scoping for repeated invocations, policy-invariant tests,
  and the typed eventOf payload access via Lombok @Builder @Jacksonized. Use
  whenever the user asks to add a command-handler test, a policy-invariant
  test, scan commands for missing coverage, or understand how these tests are
  structured and named.
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
  simple name.
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

## Test Infrastructure

Every test class extends `CommandTestSupport`, which extends `BaseTest`:

- `BaseTest` carries `@SpringBootTest` + `@ActiveProfiles("test")`, imports the
  Testcontainers configuration, points the datasource at the container via
  `@DynamicPropertySource`, and truncates every table in `@BeforeEach`, so each
  test starts with an empty database.
- `CommandTestSupport` provides the helpers:
  `commandInvoker`, `eventRepository`, `findDomainEvents(eventType[, requestId])`,
  `requireSingleDomainEvent(eventType[, requestId])`, `eventOf(event, EventClass.class)`,
  `assertDtoNonNull(dto, ...)`, `assertDtoJsonNonNull(dtoOrEvent, Getter...)`.
- `eventOf` deserializes the payload column straight into the typed event class
  (see the typed-payload section below). No `JsonNode` appears in tests.

## The TEST-ID Naming Scheme (never duplicate)

Every test method carries a stable identifier in a comment directly above it,
and is registered in its context's `TEST-REGISTRY.md`. Before writing any new
test, scan both to see if the command or policy is already covered.

| Kind | Format | Example | Where |
|------|--------|---------|-------|
| Command test | `<CTX>-<NNN>` (zero-padded, 3 digits) | `BK-001`, `CM-022`, `SL-018` | `XxxCommandHandlerTest.java` |
| Policy invariant test | `<CTX>-P<NN>` (zero-padded, 2 digits) | `BK-P01`, `CM-P12`, `SL-P08` | `XxxPolicyInvariantTest.java` |

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
`grep -rn "TEST-ID:" src/test/java/com/echarge/sales/context` lists all tests
in one pass.

Each context keeps a `TEST-REGISTRY.md` with a table
`TEST-ID | Command | Event(s) | Test method | Verifies`. Keep it in sync with
every added test; it is the authoritative scan target.

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

Look the event row up by its simple name. `requireSingleDomainEvent` asserts
there is exactly one success row and returns it; `findDomainEvents` returns all
of them for cases where more than one row is expected on purpose.

```java
SalesEvent event = requireSingleDomainEvent(FinalPriceCalculatedEvent.class);
assertThat(event.getSuccess()).isTrue();
FinalPriceCalculatedEvent evt = eventOf(event, FinalPriceCalculatedEvent.class);
assertThat(evt.getSaleOfferId()).isEqualTo(offer.getId());
```

### Step 4: Assert the DTO Fields

Read the payload through the typed event and assert the DTO fields with real
getters. `assertDtoJsonNonNull(evt, SellingOffer.DTO::getStartDate, ...)` accepts getter
method references (derived via `SerializedLambda`) and checks recursively that no field is
null, except the names we explicitly allow; optional associations and
DB-generated timestamps are the usual exceptions.

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

`eventOf(event, XxxEvent.class)` then deserializes the payload straight into
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
`CommandTestSupport` offers requestId-scoped helpers:

```java
commandInvoker.invoke(cmd, "my-req-1");            // explicit requestId
requireSingleDomainEvent(XxxEvent.class, "my-req-1");  // exactly one row for that request
findDomainEvents("XxxEvent", "my-req-1");          // all rows for that request
```

Use it whenever a single test invokes a command more than once and the
assertions must address a specific invocation: seed-then-act, idempotency
re-runs, two assignments, reorders. Policy cascades share the outer requestId,
so scope cascade assertions to the outer requestId to prove they belong to the
same request. RequestIds only need to be unique within a test; a short
descriptive string is enough (`"cm002-append"`).

## Policy Invariant Tests

1. Locate the `@Invariant` method in the context's policy class. Its
   javadoc/description is the documented rule.
2. Check the registry for an existing `-P` TEST-ID; reuse it, otherwise
   allocate the next free `<CTX>-P<NN>` following the method order.
3. Positive test: valid setup, invoke the triggering command, and where the
   invariant performs a side effect (creates a link, sends a notification,
   stops an offer, deletes an empty selection) assert the side effect actually
   happened in the DB.
4. Negative test (when a violation is constructible): violating setup,
   `assertThatThrownBy(() -> commandInvoker.invoke(cmd))` throws
   `EcapiException`/`RuntimeException`, and the DB is rolled back (assert the
   entity is unchanged or not persisted).
5. Trigger the invariant via the event that activates it — invoke the command
   whose emitted event the `@EventListener` listens to. The listener may live
   in another context (e.g. carmodel invariants listen to sales-context
   annotation events).

## Conventions and Pitfalls

- Test classes are package-private and extend `CommandTestSupport`; tables are
  truncated before every test, so seed everything the test needs.
- Some handlers return `Void` (e.g. `AssignCustomerToScheduledCarCommand`) —
  skip the returned-DTO assertion.
- When a handler is genuinely broken (e.g. a NOT NULL column never set),
  document the defect: write the test asserting the current failure plus
  rollback and note "defect" in the registry row instead of forcing a happy
  path.
- If the context depends on external services (a user-profile table, a
  Cloudflare transaction lock), replace them with `@MockitoBean` so tests stay
  offline against the container database.
- The Testcontainer host port is fixed (e.g. 4000), incrementing by 1 when
  busy; read the mapped port via the container configuration, never hard-code
  it in tests.
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
     non-null via eventOf, and all offers onSale=false in the DB
  6. Updates TEST-REGISTRY.md, runs:
     mvn test -Dtest=SalesCommandHandlerTest -Dsurefire.failIfNoSpecifiedTests=false
```
