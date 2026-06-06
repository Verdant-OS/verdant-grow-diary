# Retired Sensor Integrations

This document is the source of truth for sensor integrations that have
been retired from active Verdant code paths.

## Shelly H&T (a.k.a. Shelly HT, Shelly H&T Gen4)

**Status:** Retired.

The Shelly H&T integration — including the `shelly-ht-status` and
`shelly-ht-webhook` Supabase edge functions, the `ShellyHtSetupCard`
component, the `useShellyHtSetupStatus` hook, and the
`shelly-ht-gen4` device-label mapping — has been removed.

### Rules

1. Do not re-add `[functions.shelly-ht-status]` or
   `[functions.shelly-ht-webhook]` blocks to `supabase/config.toml`
   without restoring matching local source files at
   `supabase/functions/<name>/index.ts`. The
   `check:shelly-ht-edge-sources` guard (see
   `scripts/assert-shelly-ht-edge-sources-present.ts`) will fail CI
   if a Shelly H&T function block exists in config without a source
   file. The required fix is either:
   - restore the source file, **or**
   - remove the matching `[functions.<name>]` config block.
2. Retired devices must **not** appear in active UI, navigation,
   route labels, device-label mappings, manual-sensor source labels,
   or ingest-path copy. The only allowed mentions are:
   - this retirement doc,
   - `docs/sensor-integration-migration-checklist.md`,
   - negative guard tests under `src/test/` (e.g.
     `shelly-ht-retirement.test.ts`,
     `shelly-ht-edge-sources-ci-wiring.test.ts`,
     `supabase-function-config-guard.test.ts`,
     `shelly-ht-active-ui-scan.test.ts`),
   - changelog / release notes if present.
3. Future reactivation of Shelly H&T (or any other retired
   integration) requires a new scoped implementation PR that:
   - restores or rewrites the edge function source,
   - adds the matching `supabase/config.toml` block,
   - registers device labels through the shared helpers (no
     duplicated mapping tables in JSX),
   - ships targeted tests (parser/config/source guard, ingest
     contract, source-label honesty), and
   - removes the corresponding retirement entry from this doc.

### Why the retirement happened

The Shelly H&T client integration was not part of the active V0
operating loop (Grow → Tent → Plant → Quick Log → Timeline → Sensor
Snapshot → AI Doctor → Alert → Approval-Required Action Queue) and
the EcoWitt + manual + CSV + Pi-bridge surfaces cover current
sensor-truth needs. Keeping retired code paths active risked label
drift, fake-live data, and stale config/source mismatches.
