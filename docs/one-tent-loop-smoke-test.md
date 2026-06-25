# One-Tent Loop Smoke Test

## Purpose

This is a read-only, manual smoke checklist that proves Verdant's V0 One-Tent
Loop is functioning end-to-end without invoking AI, mutating production data,
writing to the Action Queue, creating alerts, or controlling any device.

Loop under test:

```
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot
  → AI Doctor Context Readiness → Approval-Required Action Queue
```

## Preconditions

- Authenticated operator account.
- At least one Grow, one Tent, and one Plant exist for this operator.
- Optional: local EcoWitt bridge running for the live ingest portion.
- No production data should be mutated by this checklist.

## Smoke test steps

| # | Step                                  | Expected result                                                                                                |
|---|---------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 1 | Grow exists                           | At least one Grow renders on `/grows`.                                                                          |
| 2 | Tent exists                           | A Tent under the Grow renders on `/tents` and on the Grow detail.                                              |
| 3 | Plant exists                          | A Plant under the Tent renders on `/plants` and on the Tent detail.                                            |
| 4 | Quick Log can be opened               | Quick Log opens within ~1s; no crash; form is ready in <30s flow.                                              |
| 5 | Timeline shows recent diary/log       | `/timeline?growId=...` shows recent diary entries, photos, and log evidence in chronological order.            |
| 6 | Sensor Snapshot state correctness     | Sensor Snapshot card shows current / fresh / stale / missing state correctly. Stale/invalid never reads healthy.|
| 7 | EcoWitt live reading appears          | If bridge is running, a `source="live"` EcoWitt reading appears with vendor lineage in `raw_payload`.          |
| 8 | AI Doctor readiness                   | Readiness panel shows evidence / missing context. **AI is NOT invoked automatically.**                          |
| 9 | Action Queue is approval-required     | Any suggested action requires explicit grower approval. No auto-write occurs.                                  |
| 10| No automation / no device control     | No device commands are sent. No background automation triggers.                                                |

## Failure triage

- Step 1–3 fail: confirm operator account has at least one Grow/Tent/Plant.
- Step 4 fails: check `/operator/ecowitt-bridge-status` and recent console errors; do not bypass safety.
- Step 5 fails: confirm `growId` query param; do not invent plant/tent params.
- Step 6 reports healthy on missing/stale data: stop-ship. Treat as a sensor truth regression.
- Step 7 fails: see `/operator/ecowitt-bridge-debug` and the EcoWitt V0 contract at
  `docs/ecowitt-v0-live-ingest-contract.md`. Do not trigger forwarding from the UI.
- Step 8 invokes AI without operator action: stop-ship. AI Doctor readiness must remain inert.
- Step 9 writes Action Queue rows without approval: stop-ship.
- Step 10 fails: stop-ship. Verdant must never control devices in V0.

## Safety rules

- No fake live data.
- Do not classify stale / invalid / unknown telemetry as healthy.
- AI Doctor readiness must not invoke AI by itself. The grower triggers AI.
- Action Queue must remain approval-required.
- No device control. No blind automation.
- No alert creation from the smoke checklist.
- No production data mutation from running this checklist.
- Operator approves every action.

## Regression commands

```
bunx vitest run
bun run typecheck
bun run test:edge:sensor-ingest-webhook
python3 -m unittest test_forwarding_config test_source_labeling test_forwarding_contract
node scripts/run-ecowitt-v0-validation.mjs
```

## Rollback notes

- This is a docs + read-only operator checklist only.
- No schema, RLS, edge function, auth, AI, alert, Action Queue, automation, or
  device-control changes are introduced.
- To roll back: delete this file and the operator smoke test route — no data
  rollback is required.
