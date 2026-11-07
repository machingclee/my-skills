---
name: tool--plantuml-activity-tree
description: >-
  Digests spaghetti or hard-to-follow code into a top-down PlantUML activity
  tree (start, action boxes, yes/no diamonds, stop), with each step anchored
  as ClassName.methodName. Never draw a sequence diagram unless the user
  explicitly asks for one. Use when the user
  asks to understand, map, visualize, or document control flow; wants a
  flowchart of a class or feature; mentions PlantUML, sequence/activity
  diagrams, or "digest" code; or needs an entry-point-based walkthrough
  before refactoring.
---

# PlantUML activity tree

Turn messy code into **one story at one abstraction level**. The deliverable is understanding, not exhaustive API documentation.

**Always draw a top-down activity tree** (`start` → action boxes → `if` diamonds with `(yes)`/`(no)` → `stop`). This includes HTTP handlers, command buses, events, schedulers, and database calls. **Never draw a sequence diagram unless the user explicitly asks for a sequence diagram.** "Who calls whom", layer crossing, and message order are not that request — put the callee on an action box.

## When to apply

- User wants to **understand** how a path works (handler, scheduler, listener, endpoint).
- User asks for **PlantUML**, flowchart, sequence diagram, or architecture sketch from code.
- User says **spaghetti**, god class, or "where does this go?"
- Before refactor: map **happy path**, **side effects**, and **failure/blocking** points.

Default to this skill over ad-hoc diagrams unless the user asks for Mermaid-only or a different notation.

## Required inputs (infer or ask once)

Collect or assume:

| Input | Rule |
|-------|------|
| **Entry point** | One method, route, job tick, or `commandBus.send(X)` — not "whole class" |
| **Goal** | Control flow, ownership, persistence, async, or event pipeline |
| **Depth budget** | Max steps on main path (default **15**; first pass **12–20** nodes) |
| **Scope** | Packages/classes to include |
| **Exclude** | Tests, generated code, mappers, logging, trivial getters |

If entry point is missing, pick the most likely public entry and state the assumption in one line.

## Workflow

### Pass 1 — Outline (always do this before drawing)

1. Read code from the entry point; follow calls until depth budget or a clear boundary (service, repository, external I/O).
2. Produce a **numbered outline** (max 15 steps). Each step **must** anchor to code:
   - **`ClassName.methodName`** — the method whose body contains this step (or the method being invoked, if the step is a call).
   - One short phrase: what changes (data, state, I/O).
   - If the step is only inside a lambda/anonymous runnable, use the **enclosing named method** (e.g. `ChargePointManager.startLoggerMeterValueScheduler`) and say "scheduler runnable body" in the phrase.
3. Tag each step: `DB`, `external`, `shared-mutable`, `async`, `event`, `transaction` where relevant.
4. Do **not** emit PlantUML yet unless the user explicitly asked for diagram-only in one shot.

### Pass 2 — Diagram

1. Draw an **activity tree** (see Default shape). Switch away from it only for the exceptions in the selection table.
2. Emit **copy-pasteable PlantUML**: `@startuml` … `@enduml` in a single fenced block labeled `plantuml`.
3. **Every diagram node** that represents a code step must show **`ClassName.methodName`** (simple class name, no package). Put the human-readable action on the same node (second line or after `: `).
4. Collapse helper chains into **one node** still named by the **outer or dominant** `ClassName.methodName`; list callees in a `note` attached to that node.
5. Show only branches that **change outcome** (errors, retries, early return). Optional footnote list for other errors.
6. After the diagram: **smells** (3–6 bullets): hidden side effects, unclear ownership, risky concurrency.

### Pass 3 — Optional (only if user wants refactor or compare)

- Second diagram with **dashed** boxes for suggested boundaries/modules.
- A **sequence** diagram only when the user explicitly asked for a sequence diagram in this request. Otherwise do not draw one.

## Default shape — activity tree

This is the object to draw. Layout is top to bottom, like a decision tree:

1. `start` at the top.
2. The continuing path (usually **yes** / the happy path) runs **down** the trunk.
3. Each outcome-changing `if` is a **diamond**. Label the exits **`(yes)`** / **`(no)`** or **`(true)`** / **`(false)`**. One pair per diagram.
4. The side branch is the early exit, the join, or the failure. Give it its own action box. End it with `stop` when it does not rejoin.
5. `stop` at the bottom of each path that returns or throws.
6. Put **`ClassName.methodName`** on line 1 of every action box, and the action on the next lines. A call into another layer is still an action box on this tree, not a new participant.
7. Collapse a helper chain into the outer action plus a `note`. Never replace this tree with a sequence diagram to show callees.

Transaction boundaries, async, and post-commit belong **in the action text or a note** on this tree (`REQUIRES_NEW commit before the business TX`, `post-commit after commit`).

## Diagram type selection

| Code shape | PlantUML | When |
|------------|----------|------|
| Control flow of one entry (conditionals, early returns, HTTP → domain → DB, command bus, events, listeners, schedulers) | **Activity tree** | **Default.** Always, unless a row below applies |
| User's message explicitly asks for a **sequence diagram** | **Sequence** | The only case. One scenario. Do not infer this from the code shape |
| Module dependencies, cycles, "what depends on what" | **Component** or package | Structure only — no `methodName` on nodes. Still not a sequence diagram |

If the user did not say "sequence", draw the activity tree. Layered calls, a command bus, events, and "show the call order" stay on that tree.

Use standard PlantUML syntax only. Do not use C4-PlantUML unless the user asks.

## Node catalog

Pick **one diagram type** per diagram. Use only the node kinds listed for that type.

### Activity (flowchart)

| Node | PlantUML | When to use | Label / content |
|------|----------|-------------|-----------------|
| **Start / stop** | `start`, `stop` | Single entry and exit for this story | No method name |
| **Action** | `:…;` | Default for every code step | Line 1: **`ClassName.methodName`**; line 2: short action. Mark async/DB/scheduler in text if relevant |
| **Decision** | `if (…) then (…) … else (…) … endif` | Any branch that changes outcome | Diamond: predicate (e.g. `forceOcpp?`); optional `ClassName.methodName:` prefix. Branches: **`(true)`/`(false)`** or **`(yes)`/`(no)`** — one pair per diagram |
| **Switch** | `switch` / `case` / `endswitch` | Enum / multi-way switch, few cases | Case name as branch label; each arm → action node(s) |
| **Swimlane** | `\|Lane name\|` | Cross-cutting roles (HTTP, DB, Scheduler) | Lane name = role/layer, not a class |
| **Partition** | `partition Name { … }` | Phases (e.g. command transaction) | Phase label only |
| **Note** | `note right`, `note left`, `note on link` | Callees collapsed into one action; deep nested `if`; batch sizes | Not a flow step — no incoming/outgoing logic by itself |
| **External trigger** | `:…;` (same shape as action) | User, OCPP, webhook — outside project code | No `ClassName.methodName`; say "external" in summary |
| **Collapsed chain** | One **action** + **note** | 3+ trivial helper calls | Action = **`OuterClass.outerMethod`**; note lists `→ Callee.method()` |

After `endif`, branches may merge into a shared action or separate `stop` nodes (early return / throw).

### Sequence (forbidden unless the user explicitly asked)

Do not use this section on a normal digest. Open it only after the user has explicitly requested a sequence diagram.

| Node | PlantUML | When to use | Label / content |
|------|----------|-------------|-----------------|
| **Participant** | `participant`, `actor` | Each class or subsystem in the scenario | Simple **class name** (alias OK if class named in note) |
| **Message** | `->`, `-->`, `->>`, `-->>` | Synchronous call or return that matters | **`ClassName.methodName`** or **`methodName(...)`**; edge = data when helpful (id, DTO, event) |
| **Self-message** | `Participant -> Participant` | Logic stays in one class | Method name required |
| **Conditional fragment** | `alt` / `else` / `end` | `if` in code | Fragment title = predicate; use **true/false** or **yes/no** like activity diamonds |
| **Optional fragment** | `opt` / `end` | Rare path (e.g. retry once) | Condition in `opt` header |
| **Loop fragment** | `loop` / `end` | Only if loop changes understanding | Loop condition + one message inside max |
| **Partition / box** | `partition`, `box` | Layer or transaction phase | Grouping only |

No `:action;` boxes on sequence diagrams — use **participants + messages + fragments**.

### Component (dependencies only)

| Node | PlantUML | When to use | Label / content |
|------|----------|-------------|-----------------|
| **Component / package** | `[Name]`, `package`, `rectangle` | Module-level digest | **Class or package name** — no `methodName` |
| **Dependency** | arrow between components | Import, injection, calls across modules | Optional short verb on arrow |

Use component diagrams only when the user needs **structure**, not one request’s control flow.

### Pass 1 outline (text, not PlantUML)

| Line | Content |
|------|---------|
| Numbered step | `` `ClassName.methodName` — action `` |
| Tags | `DB`, `external`, `shared-mutable`, `async`, `event`, `transaction` when relevant |

### Not drawn (unless user insists)

Logging, getters/setters, mappers, generated code, every method in a large class, every trivial guard, per-element parallel stream steps, C4 notation.

## Diagram rules

### Node labeling (required for activity & sequence)

| Diagram | Rule |
|---------|------|
| **Activity** | Each `:…;` step starts with **`ClassName.methodName`** then `\n` and a short action. Example: `:ChargePointManager.startLoggerMeterValueScheduler\nCollect pending meter values;` |
| **Sequence** | `participant` = class (or layer alias with `\nClassName` in stereotype/note). Each arrow label is **`methodName(...)`** or **`ClassName.methodName`**. Self-calls must show the method. |
| **Collapsed chain** | Node label = **`OuterClass.outerMethod`**; `note right`: `→ Helper.a()`, `→ Helper.b()` |
| **No method** | Only for non-code nodes (e.g. `:User clicks Save;`, `:OCPP MeterValues received;`). State explicitly when the step is not in project code. |

- Use **simple class name**; add package or FQCN only when two classes share the same name.
- **Max N nodes** on the main happy path; merge actions, not method anchors — merged node keeps the **most specific method** that owns the block (usually the caller or the scheduler entry).
- Label important edges with **data** (id, DTO, event name), not generic "calls".
- Mark **async**, **scheduler**, **thread pool**, and **parallelStream** explicitly; collapse parallel collection to one node unless correctness depends on parallelism.
- **Swimlanes** when helpful: e.g. `HTTP | Domain | Persistence | External` or `Scheduler | Listeners | ThreadPool | DB`.
- Spring: note **transaction boundary** and that worker threads may not inherit request context.

### Decision nodes (activity diagrams — required when branching)

Use PlantUML **`if` / `then` / `else` / `endif`** so the diagram shows a **diamond** and **labeled exit paths**. This is preferred over hiding decisions inside a single action box.

**Rules:**

1. **Diamond text** = the decision as readable code: predicate or flag name, often with `?` (e.g. `(forceOcpp?)`, `(reservation valid?)`). Optionally prefix with **`ClassName.methodName:`** in the condition if the `if` lives in that method.
2. **Branch labels** on `then` / `else` — pick one pair and stay consistent in the diagram:
   - Boolean: **`(true)`** / **`(false)`** (best for flags and `boolean` expressions)
   - General: **`(yes)`** / **`(no)`** (best for “can proceed?”, presence checks)
3. **Each branch** gets at least one **`ClassName.methodName`** action node (or a merge to `stop` / return) showing what happens on that path.
4. **Early return / throw** on one branch: label that branch, one node for the exit, rejoin or `stop` — do not skip the diamond.
5. **Nested `if`**: nest `if` blocks; avoid more than **2 levels** in one diagram — collapse deeper logic into a `note` on the inner diamond.
6. **Outcome-changing only** — same as branch budget; trivial guards can merge into one diamond with a short `else (false): return` arm.

**Syntax template:**

```plantuml
if (ClassName.methodName: forceOcpp?) then (true)
  :ClassName.sendOcppCommand
  ...;
else (false)
  :ClassName.useLocalFallback
  ...;
endif
```

For **`switch` / enum** with few cases, use `switch (field?)` / `case (VALUE)` / `endswitch` with case names as branch labels.

**Sequence diagrams:** use **`alt` / `else` / `end`** with the same **true/false** or **yes/no** labels on each fragment header when the source is an `if`.

## Response template

Use this structure in the reply:

```markdown
## Summary
[One paragraph: trigger, outcome, who owns the write, where it can fail or block.]

## Call outline
1. `ClassName.methodName` — …
2. `ClassName.methodName` — …

## Diagram
[plantuml fenced block]

## Smells / follow-ups
- …
```

**Quality bar:** After reading summary + diagram, the user should answer without opening code: what triggers this, what mutates shared state, what is async, where it waits or fails.

If the summary cannot support those answers, rewrite the summary before adding diagram nodes.

## User-facing prompt template

When the user does not know how to ask, offer or use:

```text
Entry: [class#method or route].

Goal: digest this path into a readable flow (not full API docs).

Follow skill tool--plantuml-activity-tree:
- Outline first, then a top-down PlantUML activity tree. Never a sequence diagram unless this prompt says "sequence diagram".
- Every step/node: ClassName.methodName + short action.
- if/else in code → diamond with yes/no (or true/false). Happy path continues down.
- Max 15 steps on happy path; collapse helpers into one node (keep method anchor + note for callees).
- Swimlanes: [layers].
- Include: [scope]. Exclude: [noise].
- Call out DB, async, shared state, and batch sizes if any.
```

## Anti-patterns

| Do not | Do instead |
|--------|------------|
| Diagram every method in a large class | One entry point per diagram; other methods appear only as **labels on nodes/arrows** |
| Anonymous steps ("update DB") with no method | Always tie to **`ClassName.methodName`** or mark as external/non-code |
| Mirror every `if` in code | Outcome-changing branches only — but each shown as **if diamond + labeled true/false (or yes/no)** |
| Hide decision inside one box ("maybe OCPP") | **if (predicate?) then (true) … else (false) … endif** |
| Nested `parallelStream` as many nodes | One labeled node unless race-relevant |
| Any sequence diagram the user did not explicitly request | **Activity tree**; callee is `ClassName.methodName` on an action box |
| Huge sequence with 20 participants | One activity node plus a note, unless they explicitly asked for a sequence |
| Diagram whole scheduler | One tick or one entity through the pipeline |

## Examples

See [examples.md](examples.md) for sample entries (Spring scheduler, command bus).
