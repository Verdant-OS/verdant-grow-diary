# Verdant V0 Demo Loop QA Checklist

A concise operator checklist for validating Verdant's V0 operating loop end
to end without using fake live data or direct GitHub edits. Run this before
any founder-led demo or before publishing a change that touches the loop.

---

## The demo loop

```
Manual or real sensor reading
  → Dashboard / latest snapshot
  → Persisted environment alert
  → Alert Detail
  → Add to Action Queue (approval-required)
  → Approve / reject / complete
  → Follow-up diary entry / timeline evidence
```

Every step must work against **real data** with honest source labels.

---

## Prerequisites

- Use real tent readings or **clearly labeled manual readings**. No demo
  values dressed up as live telemetry.
- Do **not** invent extreme readings just to trigger an alert.
- **Snapshot the current grow targets** for the tent/plant before
  changing anything (screenshot or note them).
- Change **one target only** to create a safe, real breach (e.g. nudge
  humidity max down by a few %).
- **Restore the original target** as the final step of the test.

---

## Step-by-step checklist

1. Confirm a real grow → tent → plant exists and is selectable.
2. Add a manual sensor reading on the tent (real value, manual source).
3. Open the dashboard / tent latest snapshot. Confirm the reading appears
   and the source is labeled correctly (manual / live / stale — never
   mislabeled).
4. Adjust **one** grow target so the latest reading is in breach. Leave
   all other targets alone.
5. Confirm a **persisted open alert** appears for the tent/plant within
   the expected refresh window.
6. Open Alert Detail. Confirm the breach reason, source, and timestamps
   are accurate and grower-readable.
7. From Alert Detail, **Add to Action Queue**.
8. Open the linked Action Queue row. Confirm it is **approval-required /
   suggested only** — no auto-execution, no device-control wording.
9. Approve / reject / complete the action via the currently supported
   flow.
10. If a follow-up was created, verify the **"View follow-up diary
    entry"** link on Action Detail and the corresponding entry on the
    plant/tent timeline.
11. Refresh / revisit Action Queue and the diary. Confirm **no duplicate**
    queue row for the same alert, and **no duplicate** follow-up diary
    row for the same action.
12. **Restore the original target** to its pre-test value. Confirm the
    alert clears or transitions correctly per existing behavior.

---

## Safety stop-ship checks

Halt the demo / do not publish if any of these are true:

- ❌ Any fake-live data is visible (demo values shown as live).
- ❌ Any automation or device-control surface appears (MQTT, Home
  Assistant, relays, actuators, Pi bridge, "auto-adjust", etc.).
- ❌ Raw `[alert:<id>]` or `[session:<id>]` tokens appear anywhere in the
  UI, ARIA labels, or copy.
- ❌ A duplicate Action Queue item exists for the same source alert.
- ❌ A duplicate follow-up diary row exists for the same completed action.

---

## Validation commands

Run before publishing any change that touches this loop:

```bash
bun run test:static-safety
bunx vitest run src/test/v0-operating-loop-contract.test.ts
```

For deeper coverage when the loop itself changed:

```bash
bunx vitest run --reporter=dot
```

All must be fully green.

---

## See also

- [`docs/safety/static-safety-scans.md`](../safety/static-safety-scans.md)
  — what the static safety gate protects and how to keep it green.
