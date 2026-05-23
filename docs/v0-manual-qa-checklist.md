# Verdant V0 — Manual QA Checklist

Run before any partner demo or release-candidate sign-off.
Historical V0 RC baseline: **1886/1886 tests passing** (snapshot at RC cut). Current green baseline is tracked in [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md).

Stop-ship rule: if `src/test/v0-operating-loop-contract.test.ts` fails,
do not ship — regardless of how this checklist scores.

---

## 1. Pre-flight

- [ ] Full suite green locally (`bunx vitest run`) — confirm the current baseline documented in [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md) (3134/3134 at last checkpoint).
- [ ] V0 contract test green in isolation:
      `bunx vitest run src/test/v0-operating-loop-contract.test.ts`.
- [ ] Signed in as a real test user (not a service account).

## 2. Org structure

- [ ] Create or select a Grow.
- [ ] Create or select a Tent under that Grow.
- [ ] Create or select a Plant under that Tent.
- [ ] Confirm sidebar / breadcrumbs reflect the active scope.

## 3. Plant memory entries

- [ ] Add a Diary entry. Confirm it appears on the grow timeline.
- [ ] Add a Watering / Feeding entry **if the current UI surfaces it**.
      (Do not invent UI that does not exist.)
- [ ] Add a Photo entry **if the current UI surfaces it**.

## 4. Sensor input

- [ ] Add a manual sensor reading from the Manual Sensor Reading card
      (or the current equivalent). Use values that will trip a target
      (e.g. temperature above the configured max).
- [ ] Confirm the reading shows on the Dashboard latest environment
      snapshot panel.
- [ ] Confirm the snapshot is labeled honestly (manual / real, never
      fake "live").

## 5. Alert persistence

- [ ] Confirm an environment alert appears for the out-of-range metric.
- [ ] Confirm the alert is persisted (visible on Alerts page after a
      refresh; not just a transient UI banner).
- [ ] Confirm an `alert_event` row is created (event log visible on the
      alert).
- [ ] Confirm **no Action Queue row was created automatically** by alert
      persistence. (Persistence is alert-only.)

## 6. Alert Detail → Action Queue handoff

- [ ] Open the alert in Alert Detail.
- [ ] Confirm the "Related Action Queue Items" section is read-only.
- [ ] Click "Add to Action Queue".
- [ ] Confirm **exactly one** queue item is created.
- [ ] Click it again. Confirm it now shows "Already in Action Queue"
      (idempotent — no duplicate).

## 7. Action Detail

- [ ] Open the new queue item in Action Detail.
- [ ] Confirm `status` is `pending_approval`.
- [ ] Confirm `action_type` is `advisory`.
- [ ] Confirm the source-alert backlink ("Open source alert") works.
- [ ] Confirm **no device command fields** are visible
      (`target_device`, `command`, `payload`, `device_command`).
- [ ] Resolve / dismiss the source alert. Reload Action Detail. Confirm
      the **stale source-alert warning** appears.

## 8. Approval flow

- [ ] Approve / reject the action **if the current UI exposes those
      transitions**. (Do not invent flows that do not exist.)
- [ ] Confirm the transition is logged in `action_queue_events`.
- [ ] Confirm no device command was emitted — Verdant never executes
      equipment changes.

## 9. V0 safety contract

- [ ] `bunx vitest run src/test/v0-operating-loop-contract.test.ts` — green.
- [ ] `bunx vitest run src/test/v0-operating-loop-ci-guardrails.test.ts` — green.
- [ ] No new references to `service_role`, MQTT, Home Assistant,
      Pi bridge, relay, actuator, webhook, or `device_command` in the
      client.
- [ ] No new Leads changes.
- [ ] No new typed watering writes.
- [ ] No new PPFD / soil EC / reservoir schema.

## 10. Demo readiness

- [ ] Partner demo script reviewed:
      [`docs/v0-partner-demo-script.md`](./v0-partner-demo-script.md).
- [ ] Release candidate summary reviewed:
      [`docs/v0-release-candidate.md`](./v0-release-candidate.md).
- [ ] Release checkpoint test count matches reality:
      [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md).
