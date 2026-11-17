---
name: tool--regression-test
description: >-
  Leave a durable regression test after a bug fix in any repository: follow the
  repo's own test conventions, keep the input that reproduced the bug, assert the
  invariant rather than the literal output, prove the test fails before the fix
  and passes after, and name which assertions depend on external variance. Use
  when asked to add a regression test or case, to keep a fix from coming back, or
  after fixing a bug when the user wants a test left behind.
---

# Leave a regression test after a fix

The test must fail on the code before the fix and pass after it. Anything else is
decoration. This skill is repository-agnostic: it states the outcome and lets the
agent choose the structure.

## Mandatory trigger

Invoke when the user says any of:

- "add a regression test / regression case for this"
- "make sure this doesn't come back"
- "leave a test behind" / "lock this in"
- "run the regression suite" (then use the repo's existing suite)
- after a bug fix, when the fix should be protected

## The prompt to hand the user, or to follow yourself

> Add a regression test for this fix — one that would have failed before it.
>
> - Start by looking at how this repo tests things today, and follow that. If
>   there is no test setup, propose the smallest structure that fits this kind of
>   project, then build it.
> - Keep the input that reproduced the bug. If it is not already in the repo, add
>   it (or a reduced version of it) so the case can be replayed later; tell me if
>   it is too large, binary-heavy, or not redistributable.
> - Assert the invariant that was broken, not the literal output — unless the
>   output is fully deterministic, in which case assert it exactly.
> - Prove it is a real regression test: show it failing on the pre-fix code and
>   passing after the fix.
> - Give me one command that runs the whole suite, with a non-zero exit on
>   failure, and save whatever a human needs to eyeball the result.
> - Tell me which assertions are stable and which depend on external variance
>   (network, a model, timing, fonts, the platform), and how the test behaves when
>   those are unavailable.

Short form, for a repo that already has a tidy test layout:

> Add a regression test for this fix in the repo's existing test layout: keep the
> input that reproduced the bug, assert the invariant rather than the exact
> output, show it failing before the fix and passing after, and tell me which
> assertions depend on external variance.

## The four rules behind it

1. **Keep the input.** A case whose input lives only on someone's disk cannot be
   replayed. Commit it, shrink it, or record it — and say which.
2. **Assert the invariant, not the sentence.** If the output passes through a
   model, a network call, a font, or a clock, an exact-string assertion is a
   flake waiting to happen. Assert the property the fix guaranteed.
3. **Show it failing before the fix.** `git stash` the fix, run the case, restore.
   A test that passes on both versions asserts nothing.
4. **Name the nondeterminism.** Say which assertions are stable and which depend
   on the environment, and what the test does when that environment is absent.

## Choosing the structure

| Situation | Structure |
|---|---|
| The repo has a test framework | one test in the existing suite, in the existing style |
| Many similar bugs, each needing an input artifact | data-driven: one case file (manifest) + one runner, inputs committed |
| A whole deliverable must be inspected by eye | golden/rendered artifact plus a property check |
| Pure function, deterministic output | a plain unit test asserting the exact value |
| Bug surfaced at the integration boundary | one integration test per bug, with the real wiring, no mocks of the failing seam |

Prefer the smallest structure that the repo can keep running. A runner with one
case beats a framework nobody invokes.

## Handling nondeterminism

- Split the deterministic part from the call: parsing, layout, masking, ordering.
  Test the deterministic part without the network; for the call, record one real
  response and replay it.
- Where the input varies run to run (timings, model output, OCR boxes), assert a
  property: a set membership, a shape, a bound, a share — not a literal.
- Where an entity may be missing entirely on some runs, make the case skip with a
  visible note rather than fail, and say so in the report.
- Where thresholds are involved, state the machine and the baseline the number
  came from.

## What to report back

- the command that runs the suite,
- the case id and the artifact path a human can look at,
- the assertions that are stable versus environment-dependent,
- the proof: failing on the pre-fix code, passing on the fix,
- anything that could not be committed and why.

## Pitfalls

- **Do not keep a second copy of the production logic** in the test to compute the
  expected value; import it, or the test will agree with itself.
- **Do not assert the absence of an error in place of the presence of the result.**
- **Do not measure over an area that contains legitimate content** (borders, walls,
  other layers) when checking that something was removed.
- **Do not let a test depend on execution order** or on shared mutable state.
- **Do not silently widen a tolerance** to make a case pass; say why and how far.
- **A suite that fails intermittently is worse than none** — fix the flake or skip
  the assertion with a note.

## Variants

- **Large or non-redistributable input**: replay from a local path, and say what
  would make it self-contained.
- **Model or network in the loop**: split deterministic from call; record and
  replay one real response.
- **No test framework**: propose the smallest runner, one case per bug, kept out of
  the build.
- **Timing or performance bug**: assert a ratio against a baseline, not wall-clock
  milliseconds.
- **UI bug**: render the surface, save the artifact, and assert a property of the
  rendered output rather than a screenshot hash.
