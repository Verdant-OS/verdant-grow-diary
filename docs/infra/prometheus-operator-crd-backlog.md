# Prometheus Operator CRD Backlog

## Summary

This document captures an external infrastructure investigation into **Prometheus Operator Custom Resource Definitions (CRDs)** for potential future adoption by Verdant. The investigation covers how Verdant might eventually instrument sensor ingest, preview pipelines, and action-queue health with Kubernetes-native observability using ServiceMonitor, PrometheusRule, and Alertmanager CRDs.

This is **not a current implementation plan**. It is a backlog note for a future infrastructure track, gated behind the One-Tent Loop stabilizing and production deployment targets becoming concrete.

## Why This Is Future Infrastructure

Current Verdant priority remains:

- Close the One-Tent Loop (Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Action Queue).
- Harden sensor normalization preview safety (no-write guarantees, CSV and Quick Log preview paths).
- Stabilize live ingest and no-write preview guards.

Prometheus Operator CRDs belong to a **post-stability infrastructure track**, not the current application behavior. No Kubernetes manifests, no metrics ingestion changes, and no alerting behavior changes should be introduced while the core operating loop is still under test.

## Recommended Adoption Path (Phased)

### Phase 1: Core CRDs

| CRD | Purpose | Verdant Relevance (Future) |
|-----|---------|---------------------------|
| `ServiceMonitor` | Declares Prometheus scrape targets for Kubernetes services | Sensor ingest endpoints, preview pipeline health, API latency |
| `PrometheusRule` | Defines recording rules and alert conditions | Preview no-write guard violations, ingest latency spikes, action-queue backlog |
| `Alertmanager` | Routes alerts to receivers (PagerDuty, Slack, email) | On-call routing for live ingest outages, preview safety failures |

### Phase 2: Configuration CRDs

| CRD | Purpose | Verdant Relevance (Future) |
|-----|---------|---------------------------|
| `ScrapeConfig` | Advanced scrape configuration (file SD, relabeling) | Custom sensor bridge endpoints, non-Kubernetes workloads |
| `AlertmanagerConfig` | Namespaced alert routing per tenant/team | Multi-tenant grow-farm separation, partner isolation |

### Phase 3: Long-Term Metrics Storage

| CRD | Purpose | Verdant Relevance (Future) |
|-----|---------|---------------------------|
| `ThanosRuler` | Global rule evaluation and long-term storage query | Only if Verdant adopts multi-cluster or year-over-year grow analytics |

## Explicit Non-Goals for Now

The following are **explicitly out of scope** until the revisit triggers below are met:

- No Kubernetes manifests in the Verdant repository.
- No Prometheus deployment, sidecar, or operator installation.
- No Alertmanager routes, receivers, or on-call integrations.
- No ServiceMonitor implementation for sensor ingest or preview pipelines.
- No changes to sensor write paths, ingest behavior, or Edge Functions.
- No Action Queue or alert behavior changes.
- No metrics cardinality increases in application code.
- No new infrastructure cost surfaces.

## Trigger for Revisiting

Revisit this backlog when **all** of the following are true:

1. Verdant has stable live ingest with defined SLOs.
2. No-write preview guards are passing in CI and production.
3. Production deployment target includes Kubernetes (not static hosting).
4. Observability ownership is defined (who owns on-call, who manages Alertmanager).
5. There is a concrete need for cluster-level health visibility beyond application logs.

Until then, this document should remain a **backlog reference only**.

## Safety Note

If this document is referenced during implementation, all sensor data, API tokens, bridge tokens, and Alertmanager secrets must remain outside of Git. Use sealed secrets, external secret operators, or vault injection. Do not paste real values into examples, runbooks, or CRD templates.

---

*Backlog item — not scheduled. Last updated: 2026-06-15.*
