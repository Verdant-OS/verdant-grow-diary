# Prometheus Alert Runbook Template

## Purpose

This is a future template for Prometheus/Alertmanager alert runbooks in Verdant. No alerts are enabled by this document. Every future alert should have an owner, trigger, severity, handling steps, rollback/suppression guidance, and approval requirements before production use.

## Runbook Template

### Alert: `<alert_name>`

#### Owner
- Primary owner:
- Backup owner:
- Review cadence:

#### Purpose
What this alert protects.

#### Trigger
Prometheus expression or plain-English trigger:

#### Severity
- `info` / `warning` / `critical`

#### Expected signal
What normal vs abnormal looks like.

#### First checks
- Check whether the signal is `live`, `stale`, `demo`, `manual`, `csv`, or `invalid`.
- Confirm timestamp freshness.
- Confirm source identity and transport.
- Confirm whether this is a preview-only path or a real ingest path.
- Check recent deploys or bridge changes.

#### Handling steps
1.
2.
3.

#### What not to do
- Do not assume bad/unknown telemetry is healthy.
- Do not trigger automation.
- Do not control devices.
- Do not create grower-facing recommendations from one weak signal.
- Do not bypass approval-required Action Queue behavior.

#### Approval requirements
State whether human approval is required before:
- Creating Action Queue items
- Notifying growers
- Changing alert thresholds
- Escalating to incident status
- Changing ingest or bridge configuration

#### Suppression / silencing guidance
When this alert may be silenced and by whom.

#### Escalation
Who to notify and when.

#### Related dashboards
Future dashboard links, if any.

#### Related docs
Links to relevant docs.

#### Validation / recovery
How to confirm the condition recovered.

#### Post-incident notes
What to record after resolution.

---

## Example Alert Skeletons

These are example placeholders only. No alerts are implemented. Use them as starting points when future alert work is approved.

### Example: `VerdantSensorIngestRejectedSpike`

> **Example only — no alert implemented.**

#### Owner
- Primary owner: Backend / ingest owner
- Backup owner: Sensor truth owner
- Review cadence: Monthly

#### Purpose
Detect an unusual spike in sensor payloads rejected during ingest, which may indicate a bridge misconfiguration, schema mismatch, or upstream sensor failure.

#### Trigger
`rate(verdant_sensor_ingest_rejected_total[5m]) > 10`

#### Severity
`warning`

#### Expected signal
Zero to a small number of rejections per minute. A sudden spike is abnormal.

#### First checks
- Check whether rejections are concentrated on a single `source` or `transport`.
- Confirm whether rejected payloads are `csv`, `live`, or `bridge`.
- Check recent bridge or Edge Function deploys.
- Review `reason_code` label distribution.

#### Handling steps
1. Identify the source identity and transport driving the spike.
2. Inspect recent bridge payloads or CSV import logs.
3. If a specific bridge is failing, check its connectivity and payload format.
4. If a schema mismatch is suspected, compare the payload shape against the current contract.

#### What not to do
- Do not assume rejected payloads are harmless without inspecting `reason_code`.
- Do not trigger automation or device changes.
- Do not bypass Action Queue approval.

#### Approval requirements
- Human approval required before notifying growers.
- Human approval required before changing alert thresholds.
- Human approval required before changing ingest or bridge configuration.

#### Suppression / silencing guidance
May be silenced during planned bridge maintenance windows by the ingest owner.

#### Escalation
Escalate to the sensor truth owner if the spike persists beyond 15 minutes.

#### Related dashboards
- Future: Sensor ingest overview dashboard

#### Related docs
- [Prometheus Metrics Ownership and Naming Plan](./prometheus-metrics-ownership.md)
- [Prometheus Operator CRD Backlog](./prometheus-operator-crd-backlog.md)

#### Validation / recovery
Confirm `verdant_sensor_ingest_rejected_total` rate returns to baseline.

#### Post-incident notes
Record the root cause, affected source identity, and any bridge or schema changes made.

---

### Example: `VerdantSensorReadingStale`

> **Example only — no alert implemented.**

#### Owner
- Primary owner: Sensor truth owner
- Backup owner: Backend / ingest owner
- Review cadence: Monthly

#### Purpose
Detect sensor readings that have gone stale, which may indicate a bridge outage, device failure, or misconfigured ingest interval.

#### Trigger
`increase(verdant_sensor_reading_stale_total[10m]) > 0`

#### Severity
`info` or `warning` depending on environment criticality.

#### Expected signal
No stale readings during normal operation.

#### First checks
- Check the `source` label: is this `live`, `demo`, `manual`, or `csv`?
- Confirm the `transport` (MQTT, HTTP, CSV import, webhook).
- Verify whether the sensor device is actually offline or just delayed.
- Check whether the reading belongs to a preview path or a real ingest path.

#### Handling steps
1. Identify the affected source identity and transport.
2. Check the bridge or device health for live sensors.
3. For CSV imports, verify whether the file contains old timestamps.
4. If the sensor is genuinely offline, document the gap without fabricating data.

#### What not to do
- Do not fabricate or interpolate missing readings.
- Do not label stale data as `live`.
- Do not trigger automation or device commands.

#### Approval requirements
- Human approval required before creating Action Queue items.
- Human approval required before notifying growers of device issues.

#### Suppression / silencing guidance
May be silenced during planned device maintenance by the sensor truth owner.

#### Escalation
Escalate to the ingest owner if multiple sources go stale simultaneously.

#### Related dashboards
- Future: Sensor health overview dashboard

#### Related docs
- [Prometheus Metrics Ownership and Naming Plan](./prometheus-metrics-ownership.md)
- [Sensor Truth Rules](../sensor-truth-rules.md)

#### Validation / recovery
Confirm new non-stale readings are arriving for the affected source.

#### Post-incident notes
Record the outage duration, root cause, and whether any readings were mislabeled.

---

### Example: `VerdantPreviewWriteGuardFailed`

> **Example only — no alert implemented.**

#### Owner
- Primary owner: Product / QA owner
- Backup owner: Safety owner
- Review cadence: Per release

#### Purpose
Detect when a sensor normalization preview path fails its no-write guard, which indicates a potential regression in preview safety.

#### Trigger
`verdant_sensor_preview_no_write_guard_state == 0`

#### Severity
`critical`

#### Expected signal
Guard state should always be `1` (enabled) on preview-only paths.

#### First checks
- Confirm whether the panel or flow is marked preview-only.
- Check whether any save button or write CTA is unexpectedly visible.
- Review recent deploys that touched preview components.
- Verify `data-writes-enabled="false"` is present in the preview DOM.

#### Handling steps
1. Immediately classify the affected path as write-suspect.
2. Inspect DevTools Network for unexpected Supabase insert/update/delete calls.
3. Review the relevant component (CSV preview gate, Quick Log preview, or `SensorNormalizationPreviewPanel`).
4. Open a P0 bug and halt any related release until the guard is restored.

#### What not to do
- Do not dismiss the alert as a UI glitch.
- Do not allow the release to proceed without root cause confirmation.
- Do not trigger automation or device commands.

#### Approval requirements
- Human approval required before any release containing preview path changes.
- Human approval required before silencing this alert.

#### Suppression / silencing guidance
Must not be silenced without explicit sign-off from the safety owner and QA owner.

#### Escalation
Escalate to the safety owner immediately. If the root cause suggests a data-integrity risk, escalate to incident response.

#### Related dashboards
- Future: Preview safety dashboard

#### Related docs
- [Prometheus Metrics Ownership and Naming Plan](./prometheus-metrics-ownership.md)
- [Preview No-Write Verification](../qa/preview-no-write-verification.md)
- [Preview Comparison Matrix](../qa/preview-comparison-matrix.md)

#### Validation / recovery
Confirm `verdant_sensor_preview_no_write_guard_state` returns to `1` and CI no-write tests pass.

#### Post-incident notes
Record the component, the commit that introduced the regression, and any test gaps that allowed it through.

---

## Safety Rules

All future Verdant alerts must follow these rules:

- Alerts must not trigger device control.
- Alerts must not bypass approval-required Action Queue behavior.
- Alerts must distinguish `live` / `manual` / `csv` / `demo` / `stale` / `invalid` source labels.
- Alerts must not expose `user_id`, `plant_id`, `tent_id`, `grow_id`, `raw_payload`, tokens, or secrets in labels or annotations.
- Alert labels must stay low-cardinality.
- Alert copy must not claim certainty from weak telemetry.

## Non-Goals

The following are explicitly out of scope:

- No PrometheusRule resources are created.
- No Alertmanager routes are created.
- No ServiceMonitor resources are created.
- No Kubernetes resources are created.
- No Grafana dashboards are created.
- No ingest or write behavior is changed.
- No Action Queue behavior is changed.
- No alert side effects are created.

## Related Docs

- [Prometheus Metrics Ownership and Naming Plan](./prometheus-metrics-ownership.md)
- [Prometheus Operator CRD Backlog](./prometheus-operator-crd-backlog.md)

---

*Backlog item — not scheduled. Last updated: 2026-06-16.*
