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
- for this repository, load `comic--regression-suite` and add a case to
  `fixtures/regression.json`, then run `npm run regression -- <id>`.

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
case    <id>  (fixtures/…, regression.json)   ← the criterion, saved
proof   fails at <pre-fix state> → passes now
stable  <assertions that always hold>
varies  <assertions that depend on model / network / timing>
left    <anything not met>
```

## Turning a criterion into a check

| Prose (what people write) | Check (what a loop needs) |
|---|---|
| "shouldn't be translated as 憂鬱" | `forbid: ["憂鬱", "鬱悶"]`, `maxGlyphs: 4` on that group |
| "the inpaint must not cross the bubble" | uncovered-stroke share under each label ≤ 2%, plus no erased pixel outside the block crop |
| "must still display 円 or 圓, one character" | `--expect 円,圓` exits 0, and the crop artifact shows exactly one glyph |
| "off must be as good as high" | same frozen input, answers equal for every region, plus a token ratio bound |
| "no kana in the translation" | regex over every non-empty answer |
| "the feature is done" | the new endpoint returns 201 with the body fields X, Y; existing suite green |

A criterion is ready when you can answer: *which command, what exit code, which
artifact, and what must stay true?*

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
