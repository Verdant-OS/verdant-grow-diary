# EcoWitt Real Ingest — Phase 1.7: Verification Record

**Status:** Verification record only. No code, schema, policy, or deployment changed.
**Verified:** 2026-08-07
**Verified by:** Claude (Knowledge Library & Product Specification Architect)
**Branch:** `claude/ecowitt-sensor-verify-98f1bd` (based on `main`)

This file records what was actually observed against the
[Phase 1.7 contract](./ecowitt-real-ingest-phase-1-7-edge-wrapper.md), so whoever opens
Phase 1.8 does not have to re-derive it.

## Result

**Phase 2 gate item 1 — wrapper tests pass: `PASS`.**

```text
Targeted tests:      22 passed / 22 (2 files)
                     src/test/ecowitt-real-ingest-edge-http-wrapper.test.ts
                     src/test/ecowitt-real-ingest-edge-wrapper-static-safety.test.ts
Command:             bunx vitest run <both files> --reporter=dot
Skipped:             full suite, type-check, runtime harness, live Supabase query
                     — intentionally out of scope for gate item 1, not BLOCKED
```

## Phase 2 gate status

| #   | Gate item                                             | Status                                                                                                                                  | Owner                                 |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | Phase 1.7 wrapper tests pass                          | `PASS`                                                                                                                                  | verified above                        |
| 2   | Token storage / rotation / revocation policy approved | `APPROVED` (2026-08-12; was blocked at this record's date)                                                                              | `docs/ecowitt-bridge-token-policy.md` |
| 3   | Schema / RLS / idempotency audit approves write path  | `BLOCKED` — spec drafted 2026-08-12; approval blocked on its verification items and owner decisions (was unbegun at this record's date) | = Phase 1.8 spec                      |
| 4   | Live-label fencing policy approved                    | `BLOCKED`                                                                                                                               | Cheek (owner decision)                |

Two of four gate items are cleared (1 at this record's date, 2 on 2026-08-12).
Persistence remains blocked.

## Finding: `source='live'` is unreachable at Phase 1.7

A verification guide was circulating that asked an agent to confirm the EcoWitt GW1200
is "showing `source='live'` data" **and** that Phase 1.7 passes. Those two conditions are
mutually exclusive by design, and the guide should not be followed as written.

Phase 1.7 ships a validation-only endpoint. It has no database client in its module graph:

- `supabase/functions/ecowitt-real-ingest/index.ts` imports only `serve` and
  `handleEcoWittRealIngestHttpRequest`.
- The contract states the phase does not enable persistence, does not store sensor
  readings, and does not enable a live dashboard label.
- `202 accepted_candidate` means validated only. `accepted: true` does **not** mean
  persisted. `can_persist_later: true` does **not** mean persisted.

Therefore, at this phase:

> An EcoWitt row carrying `source='live'` **that claims to come from the Phase 1.7
> `ecowitt-real-ingest` endpoint** would be a **defect**, not a pass signal.
> (Scoping added 2026-08-12: the separately deployed, bearer-authenticated
> `ecowitt-ingest` path legitimately writes freshness-approved canonical `live` rows —
> those are not defects.)

It could only originate from demo data mislabelled as live, or from a persistence path
that bypassed the gate. Either is a Sensor Truth violation under `AGENTS.md`.

**Consequence for closing this phase:** a Sensor Snapshot screenshot showing a live
EcoWitt reading is not a valid Phase 1.7 exit artifact and must not be requested as one.
The screenshot rule applies to phases that legitimately render live telemetry. Applying it
here creates pressure to enable persistence early or to accept a mislabelled reading,
which is the exact failure the phase sequencing exists to prevent.

## Corrections to the circulating guide

Recorded so the same errors are not re-introduced:

| Claim in guide                                        | Status    | Correct value                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase project `bzatgtgjvuojpoxcknaa`               | **FAIL**  | `knkwiiywfkbqznbxwqfh` — the guide's ref appears in zero repo files. Later identified (2026-08-12, via PR #907 checks) as the repo's Supabase **Preview/sandbox** integration project — not fabricated, but the wrong target: a verification "pass" there proves nothing about production |
| `~/verdant-testbench` is "your local copy of Verdant" | **FAIL**  | Not a git repository. Contains only `ecowitt_listener.py` and `ecowitt_raw_log.jsonl`                                                                                                                                                                                                     |
| Local listener demonstrates current gateway traffic   | **STALE** | `ecowitt_raw_log.jsonl` last written 2026-06-24 (879 lines); nothing received since                                                                                                                                                                                                       |
| Confirm `source='live'` to close Phase 1.7            | **FAIL**  | Unreachable by design — see finding above                                                                                                                                                                                                                                                 |

## Not verified

These remain open and are **not** claimed by this record:

- Whether `ecowitt-real-ingest` is **deployed** to `knkwiiywfkbqznbxwqfh`.
- Whether the Phase 1.7 files exist on the **deploy branch** (`verdant-grow-diary`).
  This work was verified on a worktree based on `main`, which per
  `docs/agents/CURRENT_STATE.md` does not reflect what is live.
- Any live-project row state. No Supabase query was issued.

## Note for Phase 1.8

> **Correction (2026-08-07, later same day):** the schema details below were read from the
> table's CREATE migration only and are stale. The trigger was later redefined six times and
> allows **nine** metrics, and the table gained `device_id`, `raw_payload`, and
> `captured_at` (12 columns). See
> [the Phase 1.8 grounding audit](./ecowitt-real-ingest-phase-1-8-grounding-audit.md) §0–§1
> for the corrected shape. The long-format point and the natural-key warning below stand.

`public.sensor_readings` is **long format — one row per `(tent, metric, ts)`**
(`user_id`, `tent_id`, `ts`, `metric`, `value`, `quality`, `source`), with a
`validate_sensor_reading()` trigger constraining `metric` to five values and `quality` to
`ok | degraded | stale | invalid`.

Idempotency drafts that assume one wide row per sample, keyed by a whole-payload
fingerprint, do not fit this shape: a single EcoWitt POST expands to N metric rows. The
natural key candidate is `(user_id, tent_id, metric, ts)`. Phase 1.8 should start from the
real cardinality rather than from a generic sensor-payload model.

## Rollback

Delete this file. It records observations only; nothing depends on it.
