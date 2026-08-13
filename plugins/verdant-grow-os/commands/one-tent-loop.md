---
name: one-tent-loop
description: Audit the current change against Verdant's One-Tent Loop and safety fences. Report in-scope vs out-of-scope work.
---

# One-Tent Loop audit

Review the current branch or working tree against the Grow OS loop.

## Steps

1. Summarize the change in one sentence.
2. Map it onto: Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Action Queue.
3. Check safety fences: labeled telemetry, no fake live data, no device control, approval-required queue, cautious AI.
4. Confirm business logic lives in `src/lib/`, not JSX.
5. List tests that cover happy path, nulls, and the specific risk.

## Output

```text
Loop stage:
In scope:
Out of scope:
Safety fences:
Missing tests:
Verdict: PROCEED | NARROW | HOLD
```
