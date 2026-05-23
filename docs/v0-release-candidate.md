# Verdant V0 Release Candidate

**Status:** Release Candidate — protected build
**Historical V0 RC baseline:** 1886/1886 tests passing across 123 files (snapshot at RC cut). Current green baseline is tracked in [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md).
**Reference:** [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md)

This document is the partner-ready snapshot of the V0 build. It says exactly
what V0 is, what it is not, what is safe to claim on a partner call, and
what would block a ship.

---

## 1. V0 release candidate summary

V0 is a protected operating loop, not a feature pile. The whole product
spine is locked behind a stop-ship contract test
([`src/test/v0-operating-loop-contract.test.ts`](../src/test/v0-operating-loop-contract.test.ts)).

The V0 loop:

```
Grow → Tent → Plant → Diary / Logs → Photo
  → Sensor snapshot (manual / real ingest only)
  → Dashboard latest environment snapshot
  → Derived environment alert (target comparison)
  → Persisted alert + alert_event (RLS-scoped, user-owned)
  → Alert Detail
  → User-initiated "Add to Action Queue"
  → Suggested action queue item (advisory / pending_approval)
  → Grower approves / rejects
```

Everything outside this loop is explicitly out of scope for V0.

---

## 2. Safety guarantees (must hold to ship)

- **No automation.** Nothing in the loop runs without an explicit grower click.
- **No device control.** No code path executes equipment changes.
- **Approval-required Action Queue.** Every action enters `pending_approval`
  with `action_type: "advisory"` and no executable command surface
  (`target_device`, `command`, `payload`, `device_command` are not on the draft).
- **No fake live sensor data.** Only `manual` / real-source snapshots that
  pass `isSnapshotPersistable` become persisted alerts.
- **Stale-warning behavior** on Alert Detail and Action Detail when the
  source alert is closed but a derived action is still pending.
- **No `service_role`** anywhere in the client.
- **RLS-scoped writes only.** DB defaults (`auth.uid()`) own ownership; the
  client never sets `user_id` on inserts.
- **Alert persistence does not auto-create actions.** The persistence hook
  references `alerts` / `alert_events` only — never `action_queue`.

---

## 3. What is live / real / manual / demo data

| Surface | Reality |
|---|---|
| Manual sensor reading card | Real, user-entered |
| Dashboard latest environment snapshot | Sourced from the most recent manual/real reading |
| Derived environment alert | Computed from real snapshot vs. grow targets |
| Persisted alert + alert_event | Real, user-owned, RLS-scoped |
| Action Queue (alert-derived) | Advisory only, user-initiated, no execution |
| Action Queue (Coach-derived) | Advisory only, user-initiated, no execution |
| "Live" sensor stream | **Not implemented.** Anything labeled "live" today is the latest manual/real ingest snapshot |
| Demo/fallback dataset | When present, must be visibly labeled as demo and is excluded from `isSnapshotPersistable` |

---

## 4. Stop-ship conditions

Any of the following blocks a ship:

1. `src/test/v0-operating-loop-contract.test.ts` fails.
2. `usePersistEnvironmentAlerts` references `action_queue` (auto-creation).
3. Client code references `service_role`, MQTT, Home Assistant, Pi bridge,
   relays, actuators, webhooks, or `device_command`.
4. Any Action Queue insert sets `user_id` from the client.
5. Any Action Queue draft includes `target_device`, `command`, `payload`,
   or `device_command` keys.
6. Alert persistence writes from stale / unavailable / demo / non-manual
   snapshots.
7. Stale-warning behavior removed from Alert Detail or Action Detail.
8. Coach → Action Queue stops being approval-required.

---

## 5. Known limitations (do not claim otherwise on a partner call)

- **Sensor ingestion adapters are not complete.** Manual entry is the only
  fully wired ingest path today. CSV import / API / Pi-bridge adapters are
  not in V0.
- **AI Doctor context upgrade is future work.** The Coach surface today
  uses the existing grounded context; deeper plant-history grounding is
  not yet shipped.
- **PPFD / soil EC / reservoir schema expansion is future work.** No
  protected schema for these signals in V0.
- **Guardrailed automation is not enabled.** Approval is required for
  every action.
- **Hardware integrations are not native partner integrations.** Verdant
  is hardware-neutral and consumes readings; do not claim native
  certified integrations with any specific partner until one is actually
  implemented.
- **Demo / manual values must be labeled honestly.** Never present demo
  fallback data as live telemetry.

---

## 6. What must not be claimed yet

- Native certified integrations with specific hardware vendors.
- Real-time autonomous control of equipment.
- "Live" streaming sensor pipeline beyond the latest manual/real snapshot.
- AI-driven nutrient or feed changes.
- Closed-loop automation of any kind.

---

## 7. Next build order (after V0 RC)

In priority order. Each item must remain compatible with the V0 contract
test.

1. **Grow-room mode** — multi-tent operator view built on the existing
   approval-required spine.
2. **Real sensor ingestion adapter** — CSV import / API / Pi-bridge adapter
   feeding the same `isSnapshotPersistable` gate.
3. **AI Doctor context upgrade** — richer grounded context for the Coach,
   still surfaced as approval-required advisory actions.
4. **PPFD / soil EC / reservoir schema expansion** — extend the snapshot +
   alert pipeline once ingestion is real.

---

## 8. Demo + QA references

- Partner demo script: [`docs/v0-partner-demo-script.md`](./v0-partner-demo-script.md)
- Manual QA checklist: [`docs/v0-manual-qa-checklist.md`](./v0-manual-qa-checklist.md)
- Operating loop reference: [`docs/v0-operating-loop-demo.md`](./v0-operating-loop-demo.md)
- Release checkpoint: [`docs/v0-release-checkpoint.md`](./v0-release-checkpoint.md)
