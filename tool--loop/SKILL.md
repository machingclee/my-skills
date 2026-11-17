---
name: tool--loop
description: >-
  Run a feature or a fix as a closed loop. Ask three questions one at a time —
  what to build or fix, how to verify it, what exactly counts as done — then turn
  the success criterion into an executable check and a permanent regression case,
  and iterate (change, run the check, read the failure) until it passes or a
  bounded number of rounds is spent. Use when the user says "apply /tool--loop to
  …", "loop on this", states a "Success Criterion", or wants an agent to keep
  reworking a change until it is verified rather than merely attempted.
---

# Loop on a feature or a fix

A loop is only a loop if it can tell when it is done. So the first job is not the
code: it is turning "make sure X" into a check with an exit code, adding that
check to the repo as a regression case, and only then iterating.

Invocation looks like: `apply /tool--loop to fix the erase spilling over the
balloon`, or `apply /tool--loop to create the export endpoint`.

## Mandatory trigger

Invoke when the user says or implies:

- "apply /tool--loop to …", "loop on this", "keep going until it works"
- a "Success Criterion" block, or "it must …" / "make sure …"
- "fix this properly", "don't stop until the tests pass"
- any request where the result can be verified mechanically and the user expects
  rework rather than a single attempt

## Step 1 — the three questions, one at a time

Ask **one question per message**, then wait. Do not bundle them: each answer
changes the next question, and a bundled list is answered in prose that has to be
re-litigated later.

### Q1. What should change?

- What should be different for the user when this is done?
- What is in scope, and what is explicitly out of scope?
- Which area, files or surface is it in?

### Q2. How will we verify it?

- Which command, tool or artifact can observe the change?
  (test runner, build, screenshot, HTTP response, rendered file, a script in the
  repo, a project skill)
- If nothing can observe it yet, what is the smallest harness that could?
- What does a *pass* look like: exit 0, a value, a shape, a picture?

### Q3. What exactly counts as done?

- State the condition as a predicate, not an intention.
- Include the negative side: what must *not* change or regress.
- Where the input varies (model, network, timing, fonts), state the tolerance.

If the user answers with prose ("the translation should look right"), rewrite it
with the table in **Turning a criterion into a check** and read the rewrite back
for confirmation before looping.

## Step 2 — write the check before the code

A check is executable, single-valued and artifact-backed:

| part | requirement |
|---|---|
| command | one command with a non-zero exit on failure |
| expected | a value, a property, or a pass/fail the runner prints |
| artifact | a file a human can inspect when it fails |
| guards | the repo's existing suite, run too, so a "fix" cannot break neighbours |
| budget | how many rounds before stopping |

Do not start changing code before the check exists. If the check cannot be written
without code, write the *harness* first — that is part of the work, not overhead.

## Step 3 — the criterion becomes a regression case

A success criterion that is not saved is a one-off measurement. Add it to the
repo's test suite as part of the loop, following the repo's conventions:

- keep the input that reproduced the case (commit it, or say why it cannot be),
- assert the invariant, not the literal output, when a model or a service is in
  the loop,
- prove it fails before the fix and passes after,
- if the project ships a skill for its suite (a project-local skill), load it and
  follow its layout; otherwise follow the repo's test conventions.

If the repo has no suite, propose the smallest one (one runner, one case per
bug, out of the build) and build it as part of the loop.

## Step 4 — iterate

```
round = 0
while round < budget:
    plan the smallest change that could satisfy the check
    make the change
    result = run(check)          # and the guards
    if result passes and guards pass:
        prove it fails without the change
        report; stop
    quote the failure verbatim
    narrow the cause; change the approach, not the tolerance
report what is met, what is not, and what was tried
```

Rules that keep the loop honest:

- **One criterion per loop.** A criterion with several parts becomes numbered
  checks that must all pass — not a paragraph.
- **The failure drives the next change.** After a failed round, quote it and say
  what it implies. A change that is not aimed at the quoted failure is thrash.
- **Same failure twice?** Change the approach, not the numbers.
- **Never widen a tolerance silently.** If a threshold must move, say why and by
  how much, and ask.
- **Never stop at "attempted".** The loop ends passing, or it ends reported as
  not done, with the last failure and what remains.
- **Budget default: 3 rounds.** On exhaustion, stop and report — do not loop
  forever, and do not claim success.

## Step 5 — report

```
loop 2/3
check   <command>            → pass | fail: <first line>
changed <files>
case    <path of the saved test>              ← the criterion, persisted
proof   fails at <pre-fix state> → passes now
stable  <assertions that always hold>
varies  <assertions that depend on model / network / timing>
left    <anything not met>
```

## Turning a criterion into a check

Two things make a criterion loopable: it names an **observable**, and it has a
**pass condition** a command can evaluate. Sort the request into one of these
shapes, then write the check to match — the examples here are deliberately
generic; the project's own skill supplies its vocabulary.

| The wording | The check | The artifact |
|---|---|---|
| "it should return / produce X for these inputs" | table-driven test: input → expected value | test report |
| "the endpoint must do X" | status code + the required body fields + one failure case | request log |
| "the screen must show X" | render, then assert a property (count, text, position) | screenshot |
| "it must not crash on empty / bad input" | boundary test: empty, null, wrong type → defined behaviour | test report |
| "it must stay fast" | ratio against a recorded baseline, not wall-clock | timing table |
| "same result after the change" | frozen input, compare before and after | diff |
| "don't break anything else" | the repo's existing suite as a guard | suite output |

If a criterion can only be judged by a human, say so plainly: that loop cannot
close mechanically and needs review. Do not fake a check for it.

## Anti-patterns

- Writing code first and inventing the check afterwards to match it.
- A criterion that a human must judge — replace it with a property, or say
  plainly that this loop cannot be closed mechanically and needs review.
- Green guards, red check: the loop is not a licence to break the suite.
- Turning a flaky test into a tolerance so the loop can finish.
- Reporting "done" from the diff instead of from the check's output.

## Variants

- **UI change**: render the surface, save the image, assert a property (count,
  position, presence) — not a pixel hash.
- **Performance**: assert a ratio against a recorded baseline, not wall-clock.
- **Data / migration**: assert invariants on the data before and after (counts,
  nulls, idempotency), not the dump.
- **Docs only**: the check is a lint/build or a link/format check; the artifact is
  the rendered page.
- **No test framework**: one runner script, one case per bug, kept out of the
  build.
