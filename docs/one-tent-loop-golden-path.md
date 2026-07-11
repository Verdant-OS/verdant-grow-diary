# One-Tent Loop Golden Path — regression receipt

**Purpose.** Prove the entire Verdant operating loop —
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor
→ Alert → Action Queue → Approval → Follow-up — walks cleanly against
one deterministic fixture, with every handoff explicitly asserted.

This document is the human-readable receipt for the automated regression
in:

- `src/test/fixtures/oneTentGoldenPathFixture.ts`
- `src/test/one-tent-loop-golden-path.test.ts`
- `src/test/one-tent-loop-safety-regression.test.ts`

## The loop

```text
Grow (One-Tent Golden Run)
 └── Tent (Flower Tent A)
      └── Plant (Golden Plant 1, stage=flower)
           ├── Quick Log (observation, deterministic note)
           │    └── Timeline event (visible once, plant-linked)
           ├── Sensor Snapshot (source=manual, 82°F / 48% RH / 1.65 kPa)
           │    └── AI Doctor context (plant + note + snapshot + targets)
           │         └── AI Doctor output (cautious, 12-field contract)
           │              └── Alert (VPD > target max)
           │                   └── Action Queue suggestion
           │                       └── Grower approval → completion
           │                            └── Follow-up marker linked
           │                                to originating action
```

## Fixture provenance

| Field | Value | Source label |
|---|---|---|
| `ONE_TENT_GOLDEN_NOW` | `2026-07-11T14:00:00Z` (fixed) | test-owned |
| Grow / Tent / Plant IDs | `golden-*` prefixed literals | test-owned |
| Owner user id | `ONE_TENT_GOLDEN_USER_ID` (fake) | test-owned |
| Quick Log note | "Observed mild leaf-edge curl after a warm afternoon." | test-owned |
| Sensor snapshot | 82°F / 48% RH / VPD 1.65 kPa | `source=manual`, `confidence=medium` |
| Alert-triggering target | `vpd_kpa_max=1.6` | test-owned copy (see below) |
| AI Doctor output | Deterministic in-file stub | no external model |

**No real users, no service-role values, no signed URLs, no tokens.**

## Which stages are proven at which layer

| # | Stage | Layer | Notes |
|---|---|---|---|
| 1 | Grow → Tent → Plant ownership | pure filter helper | cross-user snapshot dropped |
| 2 | Quick Log persist + idempotency | in-file store helper | duplicate submit returns existing row |
| 3 | Timeline dedupe + ordering | in-file view-model | doubled source list still yields one row |
| 4 | Sensor snapshot provenance | fixture + label helper | Manual never mapped to Live |
| 5 | AI Doctor context compilation | pure helper | includes note, snapshot, targets, source tags |
| 6 | AI Doctor cautious output | deterministic stub | all 12 required fields, no aggressive prescriptions |
| 7 | Alert derivation | pure rule | fires only when a real threshold is breached |
| 8 | Alert → AQ handoff | pure rule | user-initiated only, dedupe on double-click |
| 9 | Approval transitions | pure rule | grower-only, cross-user attempt rejected |
| 10 | Follow-up linkage | pure rule | idempotent marker; rejected items get none |

The stitched integration lives entirely in pure helpers so it is
deterministic and cheap to run. Deeper per-stage coverage (React
Testing Library, Playwright, RLS harnesses) is already provided by the
existing test files inventoried in the plan (see `.lovable/plan.md`).

## Honestly unsupported handoffs

- **Auto-created diary event on action completion.** The current
  application contract does not automatically write a diary event when
  an Action Queue item transitions to `completed`. The golden path
  therefore asserts only that a **follow-up marker** links back to the
  originating action, and documents the absence of an auto-diary
  handoff here rather than fabricating one in the fixture. If a real
  auto-diary contract is added later, extend
  `linkFollowUp` in the stitched test to assert the diary row and
  update this section.
- **Live network AI call.** The regression never calls a paid model.
  A deterministic in-file stub matches the 12-field cautious contract.
  A future integration test may exercise a real edge function under a
  dedicated CI job — that is out of scope for this suite.

## Safety boundaries

Every safety rule from the task's regression list has an explicit
assertion in `one-tent-loop-safety-regression.test.ts`:

- Manual data never labeled as live.
- Demo, stale, and invalid sources retained (never healthy).
- AI Doctor cannot auto-approve an action (approval helper rejects
  non-grower actors, including cross-user growers).
- Alerts cannot auto-create AQ items (`auto_created_action_queue_item`
  contract).
- AQ item shape has no `device_command`, `execute_payload`,
  `run_command`, or `device_exec` field.
- Duplicate submissions produce one row (idempotency + AQ dedupe).
- Cross-user IDs distinct and detectably filterable.
- Loop test files import no service-role key, no OpenAI/Anthropic
  endpoint, no device-control module, no direct Supabase client.

## Validation commands

```bash
bunx vitest run \
  src/test/one-tent-loop-golden-path.test.ts \
  src/test/one-tent-loop-safety-regression.test.ts

bunx tsgo --noEmit
```

Adjacent suites (Quick Log, timeline, sensor snapshot, AI Doctor,
alerts, Action Queue, follow-up, one-tent-live-proof) continue to
guard each stage in depth. The golden-path suite adds a fast, always-on
check that the *seams* between them remain consistent.

## Definition of green

The loop is green only when **all** of the following hold in one run:

- One grow, one tent, one plant resolved with strict ownership.
- One Quick Log persisted, one timeline event visible, no duplicates
  on remount or retry.
- One manual sensor snapshot with `source`, `captured_at`, `tent_id`,
  `plant_id`, `confidence`, and `raw_payload` preserved.
- One cautious AI Doctor result with all 12 required fields, evidence
  citing the actual snapshot, and no aggressive prescription.
- One alert derived from a real threshold breach.
- One grower-created suggested Action Queue item, approval-required,
  no executable payload.
- One explicit grower decision (approve → complete) with an owner-only
  transition helper.
- One traceable follow-up marker linked to the originating action.

No duplicate writes. No fake-live data. No blind automation. No
device control.
