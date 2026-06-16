# EcoWitt Dry-Run → Real Ingest Promotion Checklist

> **This checklist does not approve real ingest by itself.**
> All gates in [`docs/ecowitt-future-real-ingest-gates.md`](./ecowitt-future-real-ingest-gates.md) must be satisfied.
> EcoWitt ingest remains dry-run only until explicitly approved.

Copy this checklist into PRs, runbooks, issue comments, or release notes.

---

## 1. Dry-run payload status

- [ ] Dry-run payload has `not_sent: true`
- [ ] Dry-run payload has `read_only: true`
- [ ] `can_send_later === true`
- [ ] No blocked reasons exist
- [ ] Warnings reviewed and accepted or resolved
- [ ] Selected JSON export reviewed
- [ ] CSV metrics export reviewed
- [ ] All-tent preview table reviewed if multiple tents are involved

## 2. Required metrics

- [ ] `air_temp_f` present
- [ ] `humidity_pct` present
- [ ] Required metrics are numeric
- [ ] Required metrics are within plausible range
- [ ] Missing optional metrics are documented

## 3. Sensor truth labels

- [ ] Source label is correct
- [ ] Manual / csv / demo data is not labeled live
- [ ] Stale data is not labeled current
- [ ] Invalid data is not labeled healthy
- [ ] Source tags match the actual data source
- [ ] No source blending occurred

## 4. Identity and traceability

- [ ] Real UUID-backed `tent_id`
- [ ] `plant_id` is null or a valid UUID-backed plant context
- [ ] `device_identity` is traceable
- [ ] `source_identity` is traceable
- [ ] No placeholder IDs remain
- [ ] No private MAC / IP / station identifiers are exposed to UI or logs

## 5. Auth and endpoint readiness

- [ ] Bridge token design approved
- [ ] Token never exposed in frontend
- [ ] Token revocation path documented
- [ ] Token rotation path documented
- [ ] Ingest endpoint design approved
- [ ] Server-side validation defined
- [ ] Idempotency / dedupe behavior defined
- [ ] Rate limiting / backoff behavior defined

## 6. Persistence and RLS

- [ ] Schema reviewed
- [ ] RLS reviewed
- [ ] Insert path tested with allowed auth context
- [ ] No service-role exposure
- [ ] Raw payload handling reviewed
- [ ] Audit trail defined

## 7. Test readiness

- [ ] Valid payload accepted
- [ ] Missing air temp rejected
- [ ] Missing humidity rejected
- [ ] Invalid source rejected
- [ ] Stale snapshot rejected or stored only as stale if explicitly approved
- [ ] Manual / csv / demo never converted to live
- [ ] Unit / range anomalies flagged
- [ ] Duplicate payload skipped safely
- [ ] No Action Queue write
- [ ] No alert write unless separately approved
- [ ] No AI invocation
- [ ] No device-control path

## 8. Approval and rollback

- [ ] Product approval
- [ ] Safety approval
- [ ] Schema / RLS approval
- [ ] Auth / token approval
- [ ] Test plan approval
- [ ] Rollback plan approved
- [ ] Operator runbook updated
- [ ] Dry-run fixtures updated
- [ ] Labels verified in UI and docs

### Rollback checklist

- [ ] Endpoint can be disabled
- [ ] Bridge token can be revoked
- [ ] Bridge client can be stopped
- [ ] Audit logs preserved
- [ ] Bad readings can be marked or removed if needed
- [ ] Dashboards confirmed not showing bad data as live

---

**No real EcoWitt ingest may proceed while any required checklist item remains unchecked.**

## Related docs

- [Dry-run operator runbook](./ecowitt-dry-run-operator-runbook.md)
- [Dry-run safety checklist](./ecowitt-dry-run-safety-checklist.md)
- [Future real ingest gates](./ecowitt-future-real-ingest-gates.md)
- [Sensor truth taxonomy](./ecowitt-sensor-truth-taxonomy.md)
