# Prometheus Metrics Ownership and Naming Plan

## Purpose

This document defines future ownership, naming conventions, label safety rules, and success criteria for Prometheus metrics instrumentation when Verdant eventually adopts Kubernetes-native observability. It is a planning reference only—no metrics, dashboards, alerts, or Kubernetes resources should be created from this document until the revisit criteria are met.

## Metric Ownership

| Domain | Future owner | Examples |
|---|---|---|
| Sensor ingest | Backend / ingest owner | accepted payloads, rejected payloads, stale readings |
| MQTT bridge | Bridge/runtime owner | connection status, reconnect count, payload delivery |
| Normalization | Sensor truth owner | invalid readings, warning counts, confidence distribution |
| Preview safety | Product/QA owner | preview no-write guard, disabled writes, preview-only panels |
| Alerts | Safety owner | alert candidates, suppressed alerts, approval-required actions |
| AI Doctor | AI safety owner | missing context, confidence tiers, blocked recommendations |

## Naming Conventions

Future metric names must follow this pattern:

```
verdant_<domain>_<thing>_<unit>
verdant_<domain>_<event>_total
verdant_<domain>_<state>
verdant_<domain>_<duration_seconds>
```

### Example names

| Metric | Type | Purpose |
|--------|------|---------|
| `verdant_sensor_ingest_payloads_total` | Counter | Total sensor payloads accepted for ingest |
| `verdant_sensor_ingest_rejected_total` | Counter | Total payloads rejected before normalization |
| `verdant_sensor_reading_stale_total` | Counter | Readings flagged as stale during normalization |
| `verdant_sensor_normalization_warnings_total` | Counter | Warnings raised during normalization preview |
| `verdant_sensor_preview_no_write_guard_state` | Gauge | Current state of preview write guard (1 = enabled, 0 = disabled) |
| `verdant_mqtt_bridge_reconnects_total` | Counter | MQTT bridge reconnect events |
| `verdant_ai_doctor_missing_context_total` | Counter | AI Doctor diagnoses blocked due to missing context |

## Label Safety Rules

### Allowed future labels

| Label | Use case |
|-------|----------|
| `source` | Sensor source label (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`) |
| `source_identity` | Bridge or integration identity (vendor, bridge name) |
| `transport` | Transport protocol (`mqtt`, `http`, `csv`, `manual`, `webhook`) |
| `status` | Processing status (`accepted`, `rejected`, `warning`, `ok`) |
| `reason_code` | Rejection/warning reason code (enumerated, low cardinality) |
| `environment` | Deployment environment (`prod`, `staging`, `dev`) |
| `service` | Service component (`ingest`, `preview`, `bridge`, `api`) |
| `version` | Application version tag |

### Forbidden labels

The following must never appear as Prometheus labels to avoid leaking private data, creating high cardinality, or exposing secrets:

- `user_id`
- `plant_id`
- `tent_id`
- `grow_id`
- `raw_payload`
- `bridge_token`
- `service_role`
- API keys
- Freeform notes
- User-entered strain names
- Exact sensor serials (unless hashed and approved by security review)

## Future Success Criteria

Before any metrics are instrumented in production, the following must be true:

- [ ] Stable live ingest with defined SLOs
- [ ] Passing no-write preview guards in CI and production
- [ ] Clear source labels for all sensor data paths
- [ ] Stale / invalid / demo / manual / live handling documented and enforced
- [ ] No fake live data in any pipeline
- [ ] No blind automation
- [ ] Action Queue remains approval-required
- [ ] Metric owner assigned for each domain
- [ ] Metric names reviewed by observability owner
- [ ] Label cardinality reviewed and bounded
- [ ] No private identifiers in labels
- [ ] Dashboard purpose defined (who uses it, what decision it supports)
- [ ] Alert owner defined for each alert rule
- [ ] Runbook link defined for each alert

## Non-Goals for Now

The following are explicitly out of scope until the success criteria and revisit triggers from related docs are met:

- No Prometheus deployment
- No ServiceMonitor resources
- No PrometheusRule resources
- No Alertmanager routing
- No Grafana dashboards
- No OTLP gateway changes
- No ingest behavior changes
- No sensor write path changes
- No product UI changes
- No Action Queue behavior changes
- No automation or device control additions

## Related Docs

- [Prometheus Operator CRD Backlog](./prometheus-operator-crd-backlog.md)
- [Prometheus Alert Runbook Template](./prometheus-alert-runbook-template.md)

---

*Backlog item — not scheduled. Last updated: 2026-06-16.*
