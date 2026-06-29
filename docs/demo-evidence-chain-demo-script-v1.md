# Demo Evidence Chain Demo Script v1

Plant memory. Sensor truth. Better decisions.

This is the operator-only runbook for showing the One-Tent Evidence Chain end-to-end
using the read-only fixture `fixtures/demo-evidence-chain.json` and the
`loadDemoEvidenceChainFixture()` helper in `src/lib/demoEvidenceChainFixture.ts`.

## How to run this demo (2–3 minutes)

| Time | Step |
|------|------|
| 0:00 | Open the operator diagnostics surface. State: "All data here is demo, clearly labeled." |
| 0:20 | Show the sensor reading row. Highlight the **Demo** source badge. |
| 0:40 | Show the environment alert. Highlight the evidence linkage badge that points back to the same sensor snapshot id. |
| 1:10 | Open the Action Queue item. Confirm it is **pending approval** and carries the same evidence ref. |
| 1:40 | Open the Post-Grow Learning Report for the archived demo grow. Show reviewed alerts/actions. |
| 2:10 | Click Print / Save PDF. Show the populated report. |

## What this demo proves

- Source-labeled sensor data → SensorSnapshot.metric_refs → environment alert → AlertDetail badge → approval-required Action Queue → ActionDetail badge → eligible Post-Grow Report → Print / Save PDF.
- The evidence ref is the same id across every surface — never inferred from prose, timestamps, metric names, or nearest readings.
- Demo data is never presented as live.
- The Action Queue remains approval-required.

## Do-Not-Say List

The following terms must not appear in narration or screenshots outside this fenced list:

```
do-not-say: fake live
do-not-say: automatically executes
do-not-say: auto execute
do-not-say: device command
do-not-say: controls your grow
do-not-say: set fan / set light / set irrigation
do-not-say: dose nutrients
do-not-say: guaranteed
do-not-say: diagnosed with certainty
do-not-say: AI grows for you
do-not-say: fully automated
```

## Failure / fallback notes

- If the fixture loader throws, the demo is unsafe to show — the chain is broken.
- If any badge shows "Live" for fixture data, stop and file a regression.
- Missing data stays missing. Never paper over it as healthy.
