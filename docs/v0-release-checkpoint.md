# Verdant V0 Operating Loop Protected Build

**Release name:** Verdant V0 Operating Loop Protected Build
**Test count at checkpoint:** 2087/2087 passing

This document is the baseline for the current protected Verdant build. It
exists so future work has an unambiguous reference for what shipped, what
intentionally did not, and what cannot regress.

---

## 1. What the V0 loop supports

The V0 Operating Loop is the protected product spine:

1. Manual / real sensor reading entered by the grower
2. Dashboard latest environment snapshot
3. Derived environment alert (target comparison only)
4. Persisted alert + alert event (RLS-scoped, user-owned)
5. Alert Detail view with full context
6. **User-initiated** handoff into Action Queue (no automation)
7. Action Queue provenance (`[alert:<id>]` back-pointer, `environment_alert` source)
8. Action Detail backlink to the source alert
9. Stale-warning behavior on both Alert Detail and Action Detail when the
   source alert is closed but the suggested action is still pending

Coach → Action Queue handoff (`ai_coach` source) also remains supported as
an approval-required path.

---

## 2. What is intentionally NOT included yet

- No automation of any kind
- No device / equipment control
- No MQTT, Home Assistant, Pi bridge, relay, actuator, or webhook execution
- No fake "live" sensor data — manual + real ingest only
- No PPFD / soil EC / reservoir schema expansion
- No typed watering writes wired into the V0 loop
- No grow-room mode
- No AI Doctor context upgrade beyond current Coach context surface
- No automatic action creation, cancel, approve, or reject

---

## 3. Safety guarantees

- **No automation.** Nothing in the loop runs without an explicit grower click.
- **No device control.** No code path executes equipment changes.
- **Approval-required Action Queue.** Every action enters `pending_approval`
  with `action_type: "advisory"` and no executable command surface
  (`target_device`, `command`, `payload`, `device_command` are not on the draft).
- **No fake live sensor data.** Only `manual` / real-source snapshots that
  pass `isSnapshotPersistable` become persisted alerts.
- **Stale-warning behavior.** If a source alert becomes `resolved` or
  `dismissed` while a derived action is still `pending_approval`, both
  Alert Detail and Action Detail render a read-only warning before the
  grower can approve stale advice.
- **No `service_role` usage** anywhere in the client.
- **RLS-scoped writes only.** DB defaults (`auth.uid()`) own ownership; the
  client never sets `user_id` on inserts.

---

## 4. Demo script

See [`docs/v0-operating-loop-demo.md`](./v0-operating-loop-demo.md) for the
end-to-end demo flow, partner framing, and the V0 contract test reference.

---

## 5. CI / PR guardrail summary

- **CI workflow:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
  runs on every PR and every push to `main`: lint → typecheck → V0 contract
  test (explicit step) → full `bunx vitest run` → build.
- **PR template:** [`.github/pull_request_template.md`](../.github/pull_request_template.md)
  contains a "V0 Operating Loop impact" section with checkboxes for each
  protected touch-point (sensor readings, Dashboard, env alerts, alert
  persistence, AlertDetail, ActionQueue, ActionDetail, transitions, AI Coach
  handoff).
- **Static guardrails:** [`src/test/v0-operating-loop-ci-guardrails.test.ts`](../src/test/v0-operating-loop-ci-guardrails.test.ts)
  asserts the PR template, CI workflow, and demo doc stay aligned and that
  the workflow does not introduce automation / device-control surface.

---

## 6. Partner demo positioning

> Your hardware collects the data. Verdant turns it into plant memory, alert context, and approval-required decisions.

---

## 7. Recommended next build phase

In priority order:

1. **Grow-room mode** — multi-tent operator view built on the existing
   approval-required spine.
2. **Sensor ingestion adapter** — real ingest path (CSV import / API /
   Pi-bridge adapter) feeding the same `isSnapshotPersistable` gate.
3. **AI Doctor context upgrade** — richer grounded context for the Coach,
   still surfaced as approval-required advisory actions.
4. **Schema expansion for PPFD / soil EC / reservoir data** — extend the
   snapshot + alert pipeline once ingestion is real.

None of these may bypass the V0 contract.

---

## 8. Stop-ship rule

> Any change that breaks
> [`src/test/v0-operating-loop-contract.test.ts`](../src/test/v0-operating-loop-contract.test.ts)
> cannot ship.

The contract test is wired as an explicit step in CI ahead of the full
suite. A failing contract test is a stop-ship event regardless of how green
the rest of the build looks.
