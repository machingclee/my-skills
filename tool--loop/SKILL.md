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
- What does a _pass_ look like: exit 0, a value, a shape, a picture?

### Q3. What exactly counts as done?

- State the condition as a predicate, not an intention.
- Include the negative side: what must _not_ change or regress.
- Where the input varies (model, network, timing, fonts), state the tolerance.

If the user answers with prose ("the translation should look right"), rewrite it
with the table in **Turning a criterion into a check** and read the rewrite back
for confirmation before looping.

## Step 2 — write the check before the code

A check is executable, single-valued and artifact-backed:

| part     | requirement                                                            |
| -------- | ---------------------------------------------------------------------- |
| command  | one command with a non-zero exit on failure                            |
| expected | a value, a property, or a pass/fail the runner prints                  |
| artifact | a file a human can inspect when it fails                               |
| guards   | the repo's existing suite, run too, so a "fix" cannot break neighbours |
| budget   | rounds before stopping; default 3, stated out loud and adjustable      |

Do not start changing code before the check exists. If the check cannot be written
without code, write the _harness_ first — that is part of the work, not overhead.

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
- **Budget: 3 rounds by default, counting `change → check` cycles.** Three is the
  shape of these fixes: round 1 usually shows whether the _check_ is right (a
  criterion that measures the wrong area, or a check that cannot fail), round 2 is
  the fix, round 3 absorbs the second-order failure (a neighbour case turns red).
  Past three, the failure is usually not a code defect but a requirement understood
  differently — that needs a human, not another round. Say the number out loud when
  the loop starts; the user can raise it for a large feature or lower it for a
  one-line fix, and "another three" is a normal reply to the report.
  On exhaustion: stop and report — do not loop forever, and do not claim success.

## Choosing the budget

The budget is decided when the check is written, said out loud, and only the user
changes it. It counts `change → check` cycles, including the round that calibrates
the check.

| Situation                                                              | Rounds       | Why                                                    |
| ---------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| the check exists and is known good; the fix is local                   | 2            | one change, one confirmation                           |
| the default: a fix plus a neighbouring suite as guard                  | 3            | calibration, fix, collateral                           |
| a new feature across more than one layer, or the check must be written | 5            | the check itself needs a round or two                  |
| each round spends an external call (model, network, paid API)          | 3 or fewer   | freeze the input and calibrate cheaply before spending |
| the criterion is still prose, or nobody can say what a pass looks like | do not start | go back to Q3 and settle it first                      |

Two rules keep the number honest:

- **A calibration round counts.** Making the check fail for the _right_ reason is
  work; if round 1 only fixed the check, round 2 is the first real change.
- **If a round shows the criterion is wrong, stop spending rounds on code.** Re-ask
  Q3, restate the check, and start a new budget. A long loop on a wrong criterion
  produces a wrong result, verified.

## When the budget runs out

Stopping is a result, not a failure of the loop. On the last round:

1. **Stop changing code.** Do not try a fourth approach silently.
2. **Report as not done**, in the Step 5 shape, with `left:` naming the exact unmet
   condition and the last check output quoted verbatim.
3. **Classify the blocker** — the classification decides the next move:

   | Blocker                                | Signal                                                | Next move                                                                  |
   | -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
   | the criterion is wrong or unmeasurable | the failure shows the check measuring the wrong thing | re-ask Q3, restate the check, start a new budget                           |
   | the check itself is broken or flaky    | the same command gives different results              | fix the check; the failure was the metric, not the code                    |
   | a real unknown: spec, dependency, data | the failure points outside the repo                   | bring the evidence back and ask; do not invent a workaround                |
   | the fix is larger than scoped          | every round uncovers another layer                    | stop looping: plan the work, then loop per step                            |
   | environment or flake                   | fails only sometimes, passes on a rerun               | record it as a known flake with the reproduction; never count it as a pass |

4. **Leave the evidence in place.** The failing case stays in the suite — marked
   expected-failure or skipped _with the reason_ if the runner supports it — the
   input stays committed, the diff stays on the branch. Deleting a case to get green
   is the one move the loop never makes.
5. **Ask for the next budget as a multiple choice.** Never continue on your own and
   never leave it at "stopped". Present the options, the recommended one first, each
   with its round count and what it leaves behind — and use the structured question
   tool when the environment has one, a numbered list otherwise.

   ```
   Not done after 3.
   Blocker: the det plane is silent inside that block, so the mask has nothing to seed from.

   Which next?

   1. Continue, 2 rounds — (a) seed the mask from the block's ink when the plane is
      silent, (b) bound it by the balloon box if that over-erases.       [recommended]
   2. Continue, 1 round — only (b), accept the leftover strokes.
   3. Redefine the criterion, 0 rounds — restate "no strokes" as "no strokes inside
      the label frame"; I show you the new check before running it.
   4. Split into 2 loops — reading first, erase second, each with its own budget.
   5. Accept and document — keep the case as expected-failure with the reason.
   ```

   Rules for the options:
   - **Three to five options**, never ten. Always include a "redefine the criterion"
     and an "accept and document" path, so stopping is a choice and not a dead end.
   - **The number of rounds is on the option**, not in a paragraph under it.
   - **One is marked recommended**, with the reason in a clause.
   - **Every option says what it leaves behind** — a failing case, a split plan, a
     documented limit.
   - **X comes from counting named approaches** (table below), adjusted by blocker:
     a flaky check adds one round; a real unknown or a too-large fix is **0 rounds**
     and becomes a "redefine" or "split" option.

   | Named approaches        | X                                |
   | ----------------------- | -------------------------------- |
   | 0 — none you believe in | do not offer a "continue" option |
   | 1                       | 1                                |
   | 2                       | 2                                |
   | 3 or more               | 3 (ceiling for one ask)          |

   Only the user's answer starts another loop. If they pick an option without
   naming a number, run the X on that option; if they pick "redefine", show the new
   check before spending a round.

## Step 5 — report

```
loop 2/3
check   <command>            → pass | fail: <first line>
changed <files>
case    <path of the saved test>              ← the criterion, persisted
proof   fails at <pre-fix state> → passes now
stable  <assertions that always hold>
varies  <assertions that depend on model / network / timing>
record  <path of the loop record>
left    <anything not met>
```

## Step 6 — record the loop

Every loop leaves one file, written before the loop is reported:
`docs/loops/<YYYY-MM-DD>-<NN>-<slug>.md`, or the project's own docs tree if it
has one. `NN` is the order the loops started that day, zero-padded (`01`,
`02`, …), so two records from the same day sort in the order they ran; a day
with one record still gets `01`. Before writing, list `docs/loops/` and take the
next free number for that date — the date alone is not unique. The record is not
a summary of the conversation — it is the part a
stranger would need to re-run the loop a year later:

0. **When** — the date *and* time the loop ran on the operator's clock, as
   `2026-11-18 01:53:20` → the time of the last update, with the zone named once
   in that line (`(Hong Kong time)`) and no numeric offset. Date alone is not
   enough: a round with no time cannot be lined up with a deploy, a log line or
   a regression that started later, which is the first question anyone asks when
   the record is read.
1. **The questions as answered** — the criterion verbatim, the budget, the
   tolerance that was agreed, not the one that was settled for.
2. **The check** — one command, and the baseline it measured, with the time it
   measured it.
3. **One row per round** — when it was made (same format), what changed, what the
   check said, and what the failure implied. Quote the failing line, not the
   intent. A round's time is the time its run finished, which is what a stamp in
   an artifact (`stat`, a log line, an `out/` file) will agree with.
4. **The final numbers**, including the guards run next to the check.
5. **What changed** — every behaviour the loop altered, as before → after, and
   why. The user-facing artifact first (an API payload, a screen, a file, a
   response shape), then the code path behind it. This section is not a file
   list: `grid.ts — cell size` tells a reader nothing they can check. Write what
   the old code did, what the new code does, and what the check sees
   differently; a four column table is usually right — `area | before | after |
   why`. State what deliberately did **not** change too, when a change could
   have leaked into it (the erase area, the request shape, a public signature).
6. **What was left over**, in the same words as the report's `left:`.

When the artifact is an image, keep the before and after beside the record
(`docs/loops/assets/`) and name the script that regenerates them — a record that
describes a picture nobody can reproduce is a rumour.

The record fails its own test if the **What changed** table could have been
written without opening the diff. A loop that changed six behaviours and records
one file list has recorded nothing: the next person cannot tell what to revert,
what to keep, or which neighbour is now at risk.

A loop with no record is a measurement that will be repeated as a guess. If the
project has no `docs/loops/`, create it with the first record.

## Turning a criterion into a check

Two things make a criterion loopable: it names an **observable**, and it has a
**pass condition** a command can evaluate. Sort the request into one of these
shapes, then write the check to match — the examples here are deliberately
generic; the project's own skill supplies its vocabulary.

| The wording                                     | The check                                                  | The artifact |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------ |
| "it should return / produce X for these inputs" | table-driven test: input → expected value                  | test report  |
| "the endpoint must do X"                        | status code + the required body fields + one failure case  | request log  |
| "the screen must show X"                        | render, then assert a property (count, text, position)     | screenshot   |
| "it must not crash on empty / bad input"        | boundary test: empty, null, wrong type → defined behaviour | test report  |
| "it must stay fast"                             | ratio against a recorded baseline, not wall-clock          | timing table |
| "same result after the change"                  | frozen input, compare before and after                     | diff         |
| "don't break anything else"                     | the repo's existing suite as a guard                       | suite output |

If a criterion can only be judged by a human, say so plainly: that loop cannot
close mechanically and needs review. Do not fake a check for it.

## Anti-patterns

- Writing code first and inventing the check afterwards to match it.
- A criterion that a human must judge — replace it with a property, or say
  plainly that this loop cannot be closed mechanically and needs review.
- Green guards, red check: the loop is not a licence to break the suite.
- Turning a flaky test into a tolerance so the loop can finish.
- Reporting "done" from the diff instead of from the check's output.
- A record that lists the files it touched instead of what changed.

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
