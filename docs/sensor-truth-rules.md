# Sensor Truth Rules

These rules govern how Verdant treats every sensor reading. Violating any rule is a stop-ship condition.

## 1. No fabricated live data

- The UI must never invent, interpolate, smooth, or back-fill readings to appear "live".
- Absence of a recent reading is itself information. Show "No live data" instead of synthesizing one.

## 2. Required provenance

Every reading carries: `id`, `metric`, `value`, `unit`, `captured_at`, `state`, `source_type`, `is_fixture`, `fixture_scope`, `confidence`, `raw_payload`.
A reading missing any of these is treated as `invalid`.

Readings are additionally scoped and attributed:

- `tent_id` — every reading belongs to a tent.
- `plant_id` — carried when the reading is plant-scoped.
- `provider` — the vendor identity (e.g. `ecowitt`) when available.
- transport / import method (e.g. `mqtt`, webhook, CSV import) when available.

## 3. `source_type` vs `state`

- `source_type` describes **where the reading came from** (e.g., `manual_snapshot`, `pi_bridge`, `home_assistant`, `demo_fixture`).
- `state` describes **how the UI must label it** (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`).
- The two are independent inputs. The mapping is computed per `data-labeling-spec.md` — never hand-set to mislead.
- These six are the only allowed source labels. A reading that fits none of
  them is `invalid`, never silently promoted to `live`.

## 4. Stale handling

- A live reading becomes `stale` 15 minutes after its `captured_at`.
- A manual reading used as current context becomes `stale` 24 hours after its `captured_at`.
- Stale readings are excluded from current-state KPIs, gauges, and "is the plant OK?" computations.
- Stale readings remain visible in history with their original badge plus a "Stale" tag.

## 5. Invalid handling

- A reading is `invalid` if value is `null`, `NaN`, out of physical range, unit-mismatched, has no `captured_at`, or has a future `captured_at`.
- Invalid readings are never rendered as a healthy numeric value.
- Invalid readings do not feed AI Doctor diagnosis. They may be cited in `missing_info`.

## 6. Demo boundaries

- Demo readings live only on demo grows / fixture-backed views.
- Demo readings are always badged "Demo".
- Demo readings are never shown as live.
- Demo readings never seed real alerts or real Action Queue items.

## 6b. CSV / imported history

- CSV/XLSX-imported readings are always labeled `csv`.
- Imported history is **never promoted to live** — not by age, not by
  freshness of `captured_at`, not by re-import.
- Imported history may show trends; it is not proof of current conditions
  and never feeds current-state KPIs or "is the plant OK?" computations.

## 7. Manual snapshot rules

- Manual snapshots are grower-entered via Quick Log.
- They are never labeled "Live".
- They may serve as the latest known value for ≤24 h, after which they are treated as stale for current-state decisions.
- They remain valid as historical snapshots forever.

## 8. No healthy classification for bad/unknown telemetry

- If telemetry is missing, stale, invalid, or unknown-source, the surface must show that explicitly.
- The system must not classify a tent/plant as "healthy" based on absent or untrusted data.
- "Healthy" is a positive claim and requires fresh, valid, in-range readings.
- Old readings must never be shown as current.

## 9. Derived metrics (VPD)

- VPD is computed only when a valid temperature + RH pair is available.
- When the pair is unavailable, VPD is null/missing — never a fake 0, never
  a value derived from a stale or invalid partner reading.

## 10. Soil moisture channels

- Multi-channel soil moisture probes keep each channel distinct.
- Channels are never silently merged. An intentional average is allowed only
  when it is clearly labeled as an average.

## 11. Suspicious unit flags

A reading with any of the following is flagged for review (and treated as
`invalid` where the value is physically impossible):

- Celsius values that look like Fahrenheit (or vice versa).
- µS/cm presented as mS/cm (or vice versa).
- Humidity stuck at exactly 0 or 100.
- Soil moisture stuck at exactly 0 or 100.
- pH outside a realistic range.
