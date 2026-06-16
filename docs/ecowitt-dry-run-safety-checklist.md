# EcoWitt Dry-Run Safety Checklist

Use this checklist before claiming any EcoWitt dry-run payload is **future-ingest-ready**. This is preview-only review. **Nothing is sent.**

For the full workflow, see [EcoWitt Dry-Run Operator Runbook](./ecowitt-dry-run-operator-runbook.md).

---

## Payload integrity

- [ ] Payload has `not_sent: true` at the top level.
- [ ] Payload has `read_only: true` at the top level.
- [ ] `dry_run_payload.not_sent` is `true`.
- [ ] `dry_run_payload.read_only` is `true`.
- [ ] `dry_run_payload.metadata.not_sent` is `true`.
- [ ] `dry_run_payload.metadata.read_only_preview` is `true`.

## Sensor truth

- [ ] Source is **not** `invalid`.
- [ ] Snapshot is **not** stale (`stale_snapshot:*` absent from blocked reasons).
- [ ] Required metric `air_temp_f` is present.
- [ ] Required metric `humidity_pct` is present.
- [ ] Invalid or unknown telemetry is **not** classified as healthy in any surface.
- [ ] Manual / csv / demo data is **not** labeled or described as live.
- [ ] Degraded telemetry is shown with warnings, not as fully healthy.

## Identity context

- [ ] `tent_id` is a real UUID-backed context (for any future real ingest claim).
- [ ] `device_identity` is traceable (not the placeholder for any real-ingest claim).
- [ ] `source_identity` is traceable (not the placeholder for any real-ingest claim).
- [ ] Identity overrides are clearly labeled as preview-only in the UI.

## Privacy / secrets

- [ ] No raw secrets appear anywhere in the payload, UI, or export.
- [ ] No authorization headers appear anywhere in the payload, UI, or export.
- [ ] No bridge tokens appear anywhere in the payload, UI, or export.
- [ ] No MAC / IP / station / private hardware identifier leaks into the payload, UI, or export.
- [ ] Redacted raw payload view (if opened) excludes all private fields.

## Side effects (must all be absent)

- [ ] No device command exists or is implied.
- [ ] No Action Queue write exists or is implied.
- [ ] No alert write exists or is implied.
- [ ] No Supabase write exists or is implied.
- [ ] No Edge Function call exists or is implied.
- [ ] No AI / model call exists or is implied.
- [ ] No `fetch` / network call is triggered by exporting.
- [ ] No automation is triggered by previewing or exporting.

## UI copy

- [ ] UI clearly states "Dry run only. Nothing has been sent."
- [ ] UI clearly states preview identity overrides only affect the generated payload.
- [ ] UI clearly states a real ingest later requires a real UUID-backed tent context.
- [ ] UI does **not** imply live ingest is enabled.
- [ ] UI does **not** imply bridge tokens are configured.
- [ ] UI does **not** imply Supabase writes are available.
- [ ] UI does **not** imply device control exists.
- [ ] UI does **not** imply Action Queue items are created.

---

If **any** unchecked item remains, do not present the payload as future-ingest-ready. Return to the [runbook](./ecowitt-dry-run-operator-runbook.md) and resolve before continuing.
