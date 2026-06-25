# EcoWitt Future Real Ingest Gates

**Status: Documentation only. No runtime behavior changes. No UI changes. No schema changes. No migrations. No Supabase reads/writes. No Edge Functions. No network calls. No bridge token wiring. No AI. No alerts. No Action Queue writes. No automation. No device control.**

This document defines the exact gates Verdant must satisfy before any EcoWitt dry-run payload may become real sensor ingest. It exists to prevent premature promotion from preview-only dry-run to live data insertion.

For the current dry-run workflow, see [EcoWitt Dry-Run Operator Runbook](./ecowitt-dry-run-operator-runbook.md).
For the current safety checklist, see [EcoWitt Dry-Run Safety Checklist](./ecowitt-dry-run-safety-checklist.md).

---

## 1. Current status

EcoWitt ingest is currently **dry-run only**.

- Dry-run payloads must include `not_sent: true` and `read_only: true`.
- Dry-run exports are for **QA, operator review, partner demos, and future planning**.
- No EcoWitt payload is currently sent to Supabase by the dry-run path.
- No bridge tokens are currently enabled by this dry-run path.
- No device control exists.

The dry-run preview at `/operator/ecowitt-tent-preview` builds JSON objects client-side and shows them to the operator. It does not write to the database, call Edge Functions, or send network traffic.

---

## 2. Non-negotiable safety boundary

Verdant may **not** accept EcoWitt data as real sensor readings until **all gates below** are satisfied.

Real ingest must remain:

- **Sensor-data only** — no equipment control.
- **Read-only from hardware perspective** — no fan/light/pump/humidifier commands.
- **No Action Queue writes** in the initial ingest phase.
- **No alert writes** in the initial ingest phase unless separately approved.
- **No AI diagnosis triggered automatically by ingest** — AI Doctor is a separate, grower-initiated path.
- **No fake-live data** — every reading must carry a truthful source label.

---

## 3. Required gates before real ingest

| Gate | Requirement | Status |
|------|-------------|--------|
| **Identity gate** | | |
| | Real UUID-backed `tent_id` | ⬜ Required |
| | Optional UUID-backed `plant_id` only when plant-level context is valid | ⬜ Required |
| | Traceable `device_identity` | ⬜ Required |
| | Traceable `source_identity` | ⬜ Required |
| | No placeholder tent IDs | ⬜ Required |
| | No private MAC / IP / station identifiers exposed to UI or logs | ⬜ Required |
| **Auth gate** | | |
| | Approved bridge token design | ⬜ Required |
| | Token format documented | ⬜ Required |
| | Token never exposed in frontend | ⬜ Required |
| | Token never stored in client-visible code | ⬜ Required |
| | No service-role usage from client | ⬜ Required |
| | Revocation path documented | ⬜ Required |
| | Rotation path documented | ⬜ Required |
| **Endpoint gate** | | |
| | Ingest endpoint design approved | ⬜ Required |
| | Server-side validation required | ⬜ Required |
| | Payload schema documented | ⬜ Required |
| | Idempotency key required or deterministic dedupe rule documented | ⬜ Required |
| | Rate limiting or backoff strategy documented | ⬜ Required |
| | Malformed payloads rejected safely | ⬜ Required |
| **Sensor truth gate** | | |
| | Source labels preserved | ⬜ Required |
| | Allowed source labels documented: `live`, `manual`, `csv`, `demo`, `stale`, `invalid` | ⬜ Required |
| | `live` source must only mean real connected ingest | ⬜ Required |
| | `manual` / `csv` / `demo` must never be upgraded to `live` | ⬜ Required |
| | `stale` / `invalid` telemetry must never be classified as healthy | ⬜ Required |
| **Required metric gate** | | |
| | `air_temp_f` required | ⬜ Required |
| | `humidity_pct` required | ⬜ Required |
| | Missing required metric blocks ingest | ⬜ Required |
| | Optional metrics remain optional: `vpd_kpa`, `soil_water_content_pct`, `soil_temp_f`, `soil_ec`, `co2_ppm`, `ppfd` | ⬜ Required |
| **Unit and range gate** | | |
| | Must reject or flag suspicious telemetry: | ⬜ Required |
| | — Celsius shown as Fahrenheit | ⬜ Required |
| | — µS/cm shown as mS/cm | ⬜ Required |
| | — Humidity stuck at 0 or 100 | ⬜ Required |
| | — Soil moisture stuck at 0 or 100 | ⬜ Required |
| | — pH outside realistic range if pH is later supported | ⬜ Required |
| | — Impossible or out-of-range temperature | ⬜ Required |
| | — Stale timestamps shown as current | ⬜ Required |
| **Persistence gate** | | |
| | Schema reviewed before insert | ⬜ Required |
| | RLS reviewed before insert | ⬜ Required |
| | Insert path tested with `anon` / `authenticated` JWT rules | ⬜ Required |
| | No service-role exposure | ⬜ Required |
| | Raw payload handling reviewed | ⬜ Required |
| | Private identifiers redacted or stored only where safe | ⬜ Required |
| | Audit trail exists | ⬜ Required |
| **Idempotency gate** | | |
| | Real ingest must not duplicate repeated EcoWitt uploads | ⬜ Required |
| | Acceptable approach documented: deterministic hash of source identity + `captured_at` + metric keys | ⬜ Required |
| | Or unique database constraint if schema supports it | ⬜ Required |
| | Safe duplicate skip behavior | ⬜ Required |
| | No partial duplicate pollution | ⬜ Required |
| **Observability gate** | | |
| | Real ingest must expose: accepted count | ⬜ Required |
| | — rejected count | ⬜ Required |
| | — skipped duplicate count | ⬜ Required |
| | — degraded count | ⬜ Required |
| | — invalid count | ⬜ Required |
| | — last ingest time | ⬜ Required |
| | — last error | ⬜ Required |
| | — no secret leakage in logs | ⬜ Required |
| **Backoff / rate gate** | | |
| | Bridge clients must not hammer Verdant | ⬜ Required |
| | Timeout requirement documented | ⬜ Required |
| | Retry cap documented | ⬜ Required |
| | Exponential backoff documented | ⬜ Required |
| | Full Jitter preferred | ⬜ Required |
| | No tight retry loops | ⬜ Required |
| | Safe failure mode: stop / retry later, never fake success | ⬜ Required |
| **Test gate** | | |
| | Valid EcoWitt payload inserted as sensor reading | ⬜ Required |
| | Missing air temp rejected | ⬜ Required |
| | Missing humidity rejected | ⬜ Required |
| | Invalid source rejected | ⬜ Required |
| | Stale snapshot rejected or stored as `stale` only if explicitly allowed | ⬜ Required |
| | `manual` / `csv` / `demo` never converted to `live` | ⬜ Required |
| | Bad unit / range flagged | ⬜ Required |
| | Duplicate payload skipped safely | ⬜ Required |
| | No service-role usage | ⬜ Required |
| | No token leakage | ⬜ Required |
| | No raw private identifier leakage | ⬜ Required |
| | No Action Queue writes | ⬜ Required |
| | No alert writes unless separately approved | ⬜ Required |
| | No AI invocation from ingest | ⬜ Required |
| | No device-control command path | ⬜ Required |

---

## 4. Explicit non-goals for first real ingest

First real ingest **must not** include:

- Device control
- Fan / light / pump / humidifier commands
- Automatic Action Queue creation
- Automatic alert creation unless separately scoped
- AI Doctor execution
- Grow advice generation
- Live dashboard claims without freshness checks
- Schema expansion beyond approved payload needs

Real ingest is **sensor-data insertion only**. All advisory, automation, and control features remain separate, explicitly approved phases.

---

## 5. Required real-ingest payload contract

This section documents a **future payload shape conceptually**. It is **not** implemented in code today.

```json
{
  "tent_id": "real-uuid-required",
  "plant_id": null,
  "source": "live",
  "captured_at": "ISO-8601 timestamp",
  "device_identity": "redacted-or-safe-id",
  "source_identity": "ecowitt-gateway-or-bridge-name",
  "readings": {
    "air_temp_f": 75.2,
    "humidity_pct": 58,
    "vpd_kpa": 1.1,
    "soil_water_content_pct": null,
    "soil_temp_f": null,
    "soil_ec": null,
    "co2_ppm": null,
    "ppfd": null
  },
  "confidence": "high",
  "raw_payload": "server-reviewed-or-redacted"
}
```

Binding rules:

- `tent_id` must be a real Verdant tent UUID.
- `source` must be one of the allowed source labels.
- `captured_at` must be the sensor's actual capture time, not `created_at` or server receive time.
- `device_identity` and `source_identity` must be traceable and must not expose private hardware identifiers.
- `raw_payload` must be reviewed server-side for secrets before storage.
- Every metric value must pass unit and range validation.
- Missing required metrics must block the insert.

**Important:** This is documentation only. Do not add this schema to code. The real contract must be approved in a later implementation phase.

---

## 6. Dry-run to real-ingest promotion rule

A dry-run payload may **only** become a real-ingest candidate when **all** of the following are true:

1. `can_send_later === true`
2. No blocked reasons exist
3. Required metrics are present (`air_temp_f`, `humidity_pct`)
4. Source is not `invalid`
5. Snapshot is not stale
6. Tent ID is real UUID-backed context
7. Device / source identity is traceable
8. Payload has no secrets / private identifiers
9. Future endpoint / auth / schema gates are approved

Even when all of the above are satisfied, **dry-run export does not itself enable ingest**. A separate, explicitly approved implementation phase is required to turn any dry-run path into a real write path.

---

## 7. Stop conditions

Real ingest work **must stop** if:

- Any payload lacks a real tent context.
- Any token would be exposed to frontend code.
- Any service-role key is required client-side.
- Any private hardware identifier leaks into UI.
- Stale / invalid data is displayed as healthy / live.
- Duplicate handling is unclear.
- Inserts bypass RLS / auth review.
- Implementation tries to add device control.
- Implementation tries to trigger AI / alerts / Action Queue automatically.

If any stop condition is hit, document the blocker and return to dry-run-only operation.

---

## 8. Approval checklist

Before any real ingest path is enabled, the following approvals must be recorded:

- [ ] **Product approval** — product owner confirms the feature is scoped and prioritized.
- [ ] **Safety approval** — safety reviewer confirms all gates in §3 are satisfied.
- [ ] **Schema / RLS approval** — database owner confirms schema and RLS are ready for inserts.
- [ ] **Auth / token approval** — security owner confirms bridge token design, rotation, and revocation.
- [ ] **Ingest endpoint approval** — engineering owner confirms endpoint design, validation, and idempotency.
- [ ] **Test plan approval** — QA owner confirms the test gate in §3 is satisfied.
- [ ] **Rollback plan approval** — operations owner confirms rollback plan in §9 is documented and executable.
- [ ] **Operator runbook updated** — dry-run operator runbook is updated to reflect the new real-ingest phase.
- [ ] **Dry-run fixtures updated** — test fixtures are updated to include real-ingest scenarios.
- [ ] **Demo / live / stale / invalid labels verified** — UI copy and data labels correctly distinguish real ingest from preview data.

**No real ingest may proceed with any unchecked item.**

---

## 9. Rollback requirements

Real ingest must include a documented, tested rollback plan:

1. **Disable endpoint** — stop accepting new EcoWitt payloads immediately.
2. **Revoke bridge token** — invalidate the active bridge token to prevent further submissions.
3. **Stop bridge client** — instruct the bridge client (or gateway) to stop sending.
4. **Preserve audit logs** — do not delete logs during rollback; they are needed for incident review.
5. **Remove / mark bad readings if needed** — if bad data was inserted, mark it `invalid` or delete it according to the audit policy.
6. **Confirm dashboards do not show bad data as live** — verify that any removed or invalidated readings are no longer surfaced as current.

The rollback plan must be tested in a non-production environment before real ingest is enabled.

---

## 10. Related documents

- [EcoWitt Dry-Run Operator Runbook](./ecowitt-dry-run-operator-runbook.md) — current dry-run workflow.
- [EcoWitt Dry-Run Safety Checklist](./ecowitt-dry-run-safety-checklist.md) — current safety verification.
- [Sensor Ingest Payload Contract](./sensor-ingest-payload-contract.md) — canonical payload shape and validation rules for all sensor transports.
- [Bridge Client Retry Guidance](./bridge-client-retry-guidance.md) — Full Jitter retry policy and backoff rules.
- [Sensor Truth Rules](./sensor-truth-rules.md) — source labels, freshness, and telemetry classification.
- [Data Labeling Spec](./data-labeling-spec.md) — demo / manual / live / stale / invalid labeling requirements.
