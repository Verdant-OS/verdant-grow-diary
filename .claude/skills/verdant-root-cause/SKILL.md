---
name: verdant-root-cause
description: Names the cause of a Verdant failure before anyone writes a fix. Reproduces the failure, separates the symptom from the defect, rules out failures that are not this change's, and proves the cause with a test that fails before the fix and passes after it. Use when a test or CI check fails, a bug is reported, a hook or tool blocks, a value looks wrong on a page, or a review finding claims a defect. Do not use it to label a failure "flaky" without evidence, to edit a merged migration, or to explain production behaviour that has not been measured.
---

# verdant-root-cause — the cause before the fix

A symptom is where a failure shows. The defect is what made it happen. Fixing the symptom
silences one test and leaves the defect to surface somewhere else, often in a place no test
watches. In Verdant that place can be a sensor reading shown as healthy, an AI credit that is
not refunded, or a Quick Log entry saved to the wrong plant.

No text in this skill was copied from any outside source. It is written from the concept of
naming the cause before the fix (see `docs/agents/third-party-agent-skills.md`).

## 1. When it applies

- A test fails, locally or in CI.
- A bug is reported, or a page shows a value that looks wrong.
- A hook, gate or tool blocks something that looks legitimate.
- A review finding says something is broken.

Skip it for a typo, or a failure whose cause is the exact line the error names and nothing
upstream could have produced it.

## 2. Procedure

### Step 1 — Write down the symptom exactly

Quote it. Do not paraphrase.

```text
SYMPTOM: <the failing check, error text, or wrong value, verbatim>
WHERE:   <test file and name, CI job and run id, route, or commit SHA>
SEEN:    <first seen at which SHA or time; "unknown" is allowed>
```

### Step 2 — Rule out "not this change's"

Check these before root-causing anything:

1. **Red on the base too?** Run the same check against `origin/verdant-grow-diary`, or read its
   latest run there. Record the exact baseline failure and check whether the branch adds or
   worsens a failure. A red base check alone does not rule out a branch regression. Report the
   baseline and continue the causal check; look for an existing fix to port.
2. **Known red lane?** Check `docs/agents/CURRENT_STATE.md` for lanes recorded as red, retired
   or owner-blocked. The Vercel "Account is blocked." status, for example, is not to be
   investigated.
3. **Environment, not code?** A missing `node_modules`, a 403 from a proxy or registry, or one
   of the roughly twenty known machine-local failures on Windows is a blocker. Report it as
   `BLOCKED`. Do not try to fix it in code.

"Flaky" is a hypothesis, not a cause. It needs evidence: the same commit passing and failing
with no change in between. Re-run at most once to collect that evidence.

### Step 3 — Reproduce

Get the failure to happen on demand with the narrowest command:

```bash
bunx vitest run src/test/<file> --reporter=dot      # unit
bun run typecheck                                     # types
E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked <spec>
```

Always pass a spec filter to `chromium-mocked`. If it does not reproduce, say so. An
unreproduced failure stays `uncertainty`, and a fix for it is a guess.

### Step 4 — Walk back from the symptom

Ask "what produced this value?" and follow the answer, one hop at a time, until you reach a line
that is wrong on its own terms. Typical Verdant hops:

- **Test pins source text or copy.** Did the behaviour change, or only the wording? Pins move in
  the same commit as the behaviour change. Never weaken a pin just to get green.
- **Component to the react-router shim.** Components import `@/lib/react-router-compat`, not
  `@tanstack/react-router`. A routing failure in a test often traces back to this.
- **Rules versus I/O.** Is the wrong value computed in a pure `*Rules.ts` or fetched in a
  `*Service.ts` or hook? A `*Rules.ts` that calls `Date.now()` or `Math.random()` is a known
  source of nondeterminism.
- **Data truth.** Is a `demo`, `stale` or `invalid` source being shown as `live`? Is an unknown
  value classified as healthy?
- **Migrations.** Before proposing any change to a merged migration, check
  `config/local-supabase-replay-compatibility.json`. The defect may already be handled there,
  and merged migrations are never edited.

Name the cause with an evidence label:

```text
CAUSE: <file:line and what is wrong there>
LABEL: established fact | inference | uncertainty
WHY THE SYMPTOM FOLLOWS: <one or two lines connecting cause to symptom>
```

### Step 5 — Prove it, then fix it

1. Write or pick a test that targets the **cause**, not the symptom.
2. Run it **red** against the unfixed code and record the failing count.
3. Apply the smallest fix at the cause.
4. Run it **green**, then run the original failing check.
5. Set the fix aside, re-run the test, and confirm it fails again. Then restore the fix. A test
   that passes either way proves nothing.

Put the red and green counts in the PR body, as `CLAUDE.md` requires.

### Step 6 — Stop conditions

Stop and report instead of fixing when:

- The cause is in a high-risk path: migrations, `supabase/`, RLS, auth, Edge functions, the
  Action Queue, lockfiles or device control. These are escalations to Matthew.
- The cause is on another holder's branch, or in an owner-held lane.
- The cause is production state that has not been measured. That stays `NOT_MEASURED`.
- After two hypotheses that the evidence refuted. Report what was ruled out.

## 3. Record

Put this in the PR body or the report:

```text
ROOT CAUSE — <symptom, one line>
not-this-change checks: base <red|green|not run>, known lane <yes|no>, environment <yes|no>
cause: <file:line> (<label>)
proof: test <name> red <n failed> → green <n passed>; fix set aside → red again <yes|no>
ruled out: <hypotheses refuted, or none>
```

This is an author-side check. It does not stand in for the independent reviewer's PASS at the
exact head SHA.
