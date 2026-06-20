# Prometheus Alert Lifecycle Checklist

## Purpose

This checklist governs future Prometheus/Alertmanager alert changes in Verdant. No alert is production-ready until it has an owner, runbook, severity, labels, test evidence, and approval path. Alerts must preserve Verdant safety principles: no blind automation, no device control, approval-required Action Queue, and cautious handling of bad/unknown telemetry.

## Lifecycle Stages

### 1. Proposal

- [ ] Alert name proposed.
- [ ] Problem/risk described.
- [ ] Owner assigned.
- [ ] Metric source identified.
- [ ] Trigger described in plain English.
- [ ] Expected normal vs abnormal signal described.
- [ ] Initial severity proposed.
- [ ] User/customer impact described.
- [ ] False-positive risk described.
- [ ] False-negative risk described.

### 2. Safety Review

- [ ] Alert does not trigger device control.
- [ ] Alert does not bypass approval-required Action Queue.
- [ ] Alert does not classify bad/unknown telemetry as healthy.
- [ ] Alert distinguishes `live` / `manual` / `csv` / `demo` / `stale` / `invalid` source labels where relevant.
- [ ] Alert does not create grower-facing recommendations from one weak signal.
- [ ] Alert does not expose `user_id`, `plant_id`, `tent_id`, `grow_id`, `raw_payload`, tokens, secrets, or freeform notes.
- [ ] Alert labels are low-cardinality.

### 3. Technical Review

- [ ] Prometheus expression reviewed.
- [ ] Metric owner confirmed.
- [ ] Label taxonomy reviewed.
- [ ] Cardinality reviewed.
- [ ] Threshold rationale documented.
- [ ] Data freshness handling documented.
- [ ] Demo/manual/stale/invalid data handling documented.
- [ ] Dashboard link identified if applicable.
- [ ] Runbook drafted.

### 4. Test Evidence

- [ ] Unit/static test exists if alert rules are generated from code.
- [ ] Prometheus expression tested against sample data if available.
- [ ] False-positive case tested.
- [ ] False-negative/healthy case tested.
- [ ] Stale data case tested.
- [ ] Missing data case tested.
- [ ] Source-label edge cases tested.
- [ ] No Action Queue or alert side effects occur without explicit approval path.

### 5. Approval

- [ ] Owner approved.
- [ ] Safety owner approved.
- [ ] Product owner approved if grower-facing.
- [ ] Backend/infra owner approved if infrastructure-related.
- [ ] Runbook reviewed.
- [ ] Rollback/silence plan reviewed.
- [ ] Production enablement date recorded.

### 6. Rollout

- [ ] Start in observe-only mode if possible.
- [ ] Confirm alert volume.
- [ ] Confirm alert labels.
- [ ] Confirm no private data in alert payloads.
- [ ] Confirm Alertmanager routing is correct.
- [ ] Confirm runbook link works.
- [ ] Confirm dashboard link works if present.
- [ ] Confirm no automation/device-control side effects.

### 7. Maintenance

- [ ] Review cadence assigned.
- [ ] Alert noise reviewed.
- [ ] Thresholds reviewed.
- [ ] Owner still valid.
- [ ] Runbook still accurate.
- [ ] Dashboard links still valid.
- [ ] Alert still protects a real risk.
- [ ] Deprecated alerts retired.

### 8. Retirement

- [ ] Reason for retirement documented.
- [ ] Replacement alert documented if applicable.
- [ ] Alert rule removed or disabled.
- [ ] Routing/silence cleanup completed.
- [ ] Runbook archived or marked retired.
- [ ] Dashboards updated if needed.

## Required Metadata Block

Use this template when proposing or reviewing an alert change:

### Alert Change Metadata

- Alert name:
- Owner:
- Backup owner:
- Severity:
- Metric(s):
- Source labels involved:
- Dashboard:
- Runbook:
- Proposed by:
- Reviewed by:
- Approved by:
- Target environment:
- Rollout date:
- Review cadence:

## Non-Goals

The following are explicitly out of scope:

- No PrometheusRule resources are created.
- No Alertmanager routes are created.
- No ServiceMonitor resources are created.
- No Kubernetes resources are created.
- No Grafana dashboards are created.
- No ingest or write behavior is changed.
- No Action Queue behavior is changed.
- No automation or device control is added.

## Related Docs

- [Prometheus Alert Runbook Template](./prometheus-alert-runbook-template.md)
- [Prometheus Metrics Ownership and Naming Plan](./prometheus-metrics-ownership.md)
- [Prometheus Operator CRD Backlog](./prometheus-operator-crd-backlog.md)

---

*Backlog item — not scheduled. Last updated: 2026-06-16.*
