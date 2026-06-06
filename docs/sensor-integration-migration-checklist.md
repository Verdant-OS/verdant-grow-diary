# Sensor Integration Migration Checklist

Use this checklist before merging any change that adds, modifies, or
retires a sensor integration (live bridge, webhook, CSV vendor,
manual device label, etc.). It exists to prevent fake-live data,
stale config/source mismatches, and accidental reintroduction of
retired devices (see `docs/retired-sensor-integrations.md`).

## Source labels

- [ ] A new `source` label is added **only** if the integration is
      active in production code paths.
- [ ] Source labels stay honest: one of `live`, `manual`, `csv`,
      `demo`, `stale`, `invalid` (plus the V1 webhook transport
      labels listed in `manualSensorSourceLabel.ts`).
- [ ] Manual readings can never be relabeled as `live`, `synced`,
      or `connected`, regardless of attached device note.
- [ ] Stale / invalid / unknown telemetry is never classified as
      healthy.

## Device-label mappings

- [ ] No retired devices added back to device-label maps
      (`src/lib/sensorDeviceLabels.ts`, vendor lineage maps in
      `growDiaryTimelineRules.ts`, `SensorSourceLineageLine.tsx`).
- [ ] No duplicated mapping tables introduced inside `.tsx` files —
      labels resolve through the shared pure helpers.

## UI / navigation / routes

- [ ] No retired devices added to UI components, nav entries, route
      labels, or settings cards.
- [ ] Setup cards for new integrations are gated, presenter-only,
      and exit safely when the integration is disabled.

## Supabase config + edge functions

- [ ] Every `[functions.<name>]` block in `supabase/config.toml`
      has a matching local source file at
      `supabase/functions/<name>/index.ts`. Run
      `bun run check:shelly-ht-edge-sources` and (for any future
      scoped guard) the equivalent script.
- [ ] No service-role key, bridge token, webhook secret, or other
      private env value is exposed in client code or logs.
- [ ] Tokens compared in constant time; responses never reflect
      submitted tokens back to clients.

## Action Queue + automation

- [ ] Ingest functions never write to `action_queue` directly.
      Alerts → suggested actions → grower approval remains the only
      path.
- [ ] No automation or device control is introduced (no fan, light,
      pump, heater, humidifier, dehumidifier, irrigation, or dosing
      commands).

## Tests

- [ ] Parser / config / source-guard tests added or updated for the
      integration (positive **and** negative cases).
- [ ] Sensor-truth tests added: source label honesty,
      freshness/stale guard, delta-spike guard, manual-vs-live
      separation.
- [ ] Retired integrations have negative guard tests asserting they
      stay out of active UI, config, and label maps.

## Validation

- [ ] `bun run check:shelly-ht-edge-sources` passes.
- [ ] `bunx vitest run` passes.
- [ ] `bun run build` passes.

## Retirement (if removing an integration)

- [ ] Add or update an entry in
      `docs/retired-sensor-integrations.md`.
- [ ] Remove the matching `[functions.<name>]` config block.
- [ ] Delete client files (components, hooks, rules) and their
      tests.
- [ ] Add a retirement / active-UI scan test that fails if the
      integration is reintroduced without going through this
      checklist.
