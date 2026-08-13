# EcoWitt Live Sensor Ingest — Readiness Record

**Status:** Readiness record, prepared on owner instruction ("Prepare for live sensor
ingest", 2026-08-12). No code, schema, policy, or deployment changed. Persistence is
**not** enabled by this document.
**Prepared by:** Claude (Knowledge Library & Product Specification Architect)

One page: what is cleared, what remains, and the bring-up sequence when the remaining
items clear. Authoritative details live in the linked records.

## Launch state at a glance

| Item | State |
| --- | --- |
| Gate 1 — wrapper tests | `PASS` (22/22, [1.7 record](./ecowitt-real-ingest-phase-1-7-verification-record.md)) |
| Gate 2 — token policy | `APPROVED` — [T1–T5](./ecowitt-bridge-token-policy.md) |
| Gate 3 — Phase 1.8 spec | `HOLD — approvable`; blocked on V-items below ([spec](./ecowitt-real-ingest-phase-1-8-specification.md)) |
| Gate 4 — live-label fencing | D3 `APPROVED` (fail-closed); **D4 awaiting owner re-confirmation** |
| V1 trigger parity · V3 function parity · V4 live-row inventory · V6 RLS harness | `BLOCKED` — one live-access grant unblocks all four |
| V2 channel collision | `PASS` (2026-08-12, reproduced — see below) |
| V5a invalid-provenance read fences | In progress — dedicated fix session running |
| V5b stale read fences | Resolves with D4 |

**The critical path is two owner actions:** the D4 one-line re-confirmation
("fail-closed" or "persist"), and the Supabase connector grant
(`project_ref=knkwiiywfkbqznbxwqfh`, read-only — steps in the spec's verification
attempt record). Everything else is agent- or session-executable.

## What V2 proved (2026-08-12)

Running the deploy-branch router and row builder verbatim against a 2-air + 2-soil
channel fixture:

- A tent listing **two channels of one metric class** emits colliding rows: 8 rows, 4
  distinct dedupe keys — `upsert(..., ignoreDuplicates)` silently keeps only the
  first-emitted channel, including the derived per-channel `vpd_kpa`.
- A tent listing **at most one channel per class** produces zero collisions.

**Binding consequence for D2 Option A:** the designation surface must enforce ≤1 channel
per metric class per tent. The `tents.hardware_config` column comment's own example
(`"air_channels": [1,2]`) is a collision-shaped configuration and must be corrected when
implementation opens.

## Bring-up sequence (when gates clear — not before)

The existing operator runbooks remain authoritative and are consistent with the corrected
topology; run them in this order:

1. **Token mint** per [T1–T5](./ecowitt-bridge-token-policy.md): 90-day tent-scoped
   bridge token, plaintext captured once into the listener's `VERDANT_BRIDGE_TOKEN` env —
   never into code, git, or logs.
2. **Bridge hop up** — mandatory on every path; **no deployed endpoint accepts a bare
   gateway** (both Edge functions 401 headerless). The listener/bridge speaks plain HTTP
   to the GW1200 on the LAN and forwards with the bearer token.
3. **Gateway pointed at the bridge** (Customized server → Ecowitt protocol → listener
   host:port). Not at `*.supabase.co` — that is a permanent 401 by design.
4. **Channel designation** in `tents.hardware_config`: exactly one air channel and one
   soil channel per tent (V2 constraint); the selected probe identity visible to the
   grower per the D2 fences.
5. **Dry-run first**: [dry-run operator runbook](./ecowitt-dry-run-operator-runbook.md)
   (read-only preview), then the
   [live-gateway canary runbook](./ecowitt-live-canary-runbook.md) (redacted end-to-end
   against `ecowitt-ingest`), then [final prep](./ecowitt-live-final-prep.md) — the
   grower verifies physical readings against backend evidence before anything is called
   live.
6. **Persistence only after** the Phase 1.8 spec reaches `APPROVED` (V-items + D4) —
   implementation is Codex's per the spec's HANDOFF block, not this record's.

## Standing safety posture (unchanged by preparation)

No fake live data; demo/manual/csv/stale/invalid remain visibly labeled; unknown
transport → `invalid` (D3); stale handling stays fail-closed unless D4 is re-confirmed
otherwise; no alerts, AI escalation, Action Queue writes, or device control from ingest.

## Rollback

Delete this file. It records state; nothing executes from it.
