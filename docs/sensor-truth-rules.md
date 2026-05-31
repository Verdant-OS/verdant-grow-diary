# Sensor Truth Rules

These rules govern how Verdant treats every sensor reading. Violating any rule is a stop-ship condition.

## 1. No fabricated live data

- The UI must never invent, interpolate, smooth, or back-fill readings to appear "live".
- Absence of a recent reading is itself information. Show "No live data" instead of synthesizing one.

## 2. Required provenance

Every reading carries: `id`, `metric`, `value`, `unit`, `captured_at`, `state`, `source_type`, `is_fixture`, `fixture_scope`, `confidence`, `raw_payload`.
A reading missing any of these is treated as `invalid`.

## 3. `source_type` vs `state`

- `source_type` describes **where the reading came from** (e.g., `manual_snapshot`, `pi_bridge`, `home_assistant`, `demo_fixture`).
- `state` describes **how the UI must label it** (`demo`, `manual`, `live`, `stale`, `invalid`).
- The two are independent inputs. The mapping is computed per `data-labeling-spec.md` — never hand-set to mislead.

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
- Demo readings never seed real alerts or real Action Queue items.

## 7. Manual snapshot rules

- Manual snapshots are grower-entered via Quick Log.
- They are never labeled "Live".
- They may serve as the latest known value for ≤24 h, after which they are treated as stale for current-state decisions.
- They remain valid as historical snapshots forever.

## 8. No healthy classification for bad/unknown telemetry

- If telemetry is missing, stale, invalid, or unknown-source, the surface must show that explicitly.
- The system must not classify a tent/plant as "healthy" based on absent or untrusted data.
- "Healthy" is a positive claim and requires fresh, valid, in-range readings.
