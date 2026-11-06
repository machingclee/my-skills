---
name: tool--plantuml-flow-digest
description: >-
  Digests spaghetti or hard-to-follow code into readable PlantUML diagrams
  (activity, sequence, or component). Use when the user asks to understand,
  map, visualize, or document control flow; wants a flowchart of a class or
  feature; mentions PlantUML, sequence/activity diagrams, or "digest" code;
  or needs an entry-point-based walkthrough before refactoring.
---

# PlantUML flow digest

Turn messy code into **one story at one abstraction level**. The deliverable is understanding, not exhaustive API documentation.

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
2. Produce a **numbered outline** (max 15 steps). Each step: who acts + what changes (data, state, I/O).
3. Tag each step: `DB`, `external`, `shared-mutable`, `async`, `event`, `transaction` where relevant.
4. Do **not** emit PlantUML yet unless the user explicitly asked for diagram-only in one shot.

### Pass 2 — Diagram

1. Choose diagram type (see table below).
2. Emit **copy-pasteable PlantUML**: `@startuml` … `@enduml` in a single fenced block labeled `plantuml`.
3. Collapse helper chains into one node with a short label; use `note` for detail.
4. Show only branches that **change outcome** (errors, retries, early return). Optional footnote list for other errors.
5. After the diagram: **smells** (3–6 bullets): hidden side effects, unclear ownership, risky concurrency.

### Pass 3 — Optional (only if user wants refactor or compare)

- Second diagram with **dashed** boxes for suggested boundaries/modules.
- Or same path as **sequence** if pass 2 was **activity** (layer crossing).

## Diagram type selection

| Code shape | PlantUML | Prompt-style constraints |
|------------|----------|---------------------------|
| Long conditionals, loops, early returns | **Activity** | Happy path left-to-right; errors on side or separate partition |
| Layered calls (HTTP → domain → DB) | **Sequence** | Group `participant` by layer; one scenario |
| Module dependencies, cycles | **Component** or package diagram | No method-level detail |
| Command bus + events + listeners | **Sequence** or activity with `partition` | Mark pre-commit vs post-commit; `add` vs `addTransactional` if present |

Use standard PlantUML syntax only. Do not use C4-PlantUML unless the user asks.

## Diagram rules

- **Readable aliases** on nodes; FQCN only when disambiguating.
- **Max N nodes** on the main happy path; merge the rest ("batch persist", "notify listeners").
- Label important edges with **data** (id, DTO, event name), not generic "calls".
- Mark **async**, **scheduler**, **thread pool**, and **parallelStream** explicitly; collapse parallel collection to one node unless correctness depends on parallelism.
- **Swimlanes** when helpful: e.g. `HTTP | Domain | Persistence | External` or `Scheduler | Listeners | ThreadPool | DB`.
- Spring: note **transaction boundary** and that worker threads may not inherit request context.

## Response template

Use this structure in the reply:

```markdown
## Summary
[One paragraph: trigger, outcome, who owns the write, where it can fail or block.]

## Call outline
1. …
2. …

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

Follow skill tool--plantuml-flow-digest:
- Outline first, then PlantUML [activity|sequence].
- Max 15 steps on happy path; collapse helpers.
- Swimlanes: [layers].
- Include: [scope]. Exclude: [noise].
- Call out DB, async, shared state, and batch sizes if any.
```

## Anti-patterns

| Do not | Do instead |
|--------|------------|
| Diagram every method in a large class | One entry point per diagram |
| Mirror every `if` in code | Outcome-changing branches only |
| Nested `parallelStream` as many nodes | One labeled node unless race-relevant |
| Huge sequence with 20 participants | Black-box subsystems |
| Diagram whole scheduler | One tick or one entity through the pipeline |

## Examples

See [examples.md](examples.md) for sample entries (Spring scheduler, command bus).
