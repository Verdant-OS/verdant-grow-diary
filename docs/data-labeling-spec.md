# Data Labeling Spec

Verdant has exactly five sensor display states: `demo`, `manual`, `live`, `stale`, `invalid`.
No other states exist. Every reading rendered in the UI must resolve to one.

## demo

- **Definition** — Fixture/seed data used for demos, tests, screenshots.
- **Badge text** — "Demo"
- **When applied** — Any reading sourced from a fixture file (`is_fixture: true`, `source_type: "demo_fixture"`).
- **UI rules** — Always visibly tagged "Demo". May appear on demo grows only.
- **UI must never** — Show demo readings as live. Use demo readings to drive real alerts. Mix demo and real data in the same chart without a "Demo" overlay.

## manual

- **Definition** — Reading entered by the grower via Quick Log.
- **Badge text** — "Manual"
- **When applied** — `source_type: "manual_snapshot"`.
- **UI rules** — Always tagged "Manual". Counted in history. May serve as latest known value when fresh (≤24 h).
- **UI must never** — Be labeled "Live". Be treated as authoritative current state when older than 24 h (becomes `stale` for current-state decisions). Be combined with live readings without source attribution.

## live

- **Definition** — Reading ingested from a verified sensor source within the last 15 minutes.
- **Badge text** — "Live"
- **When applied** — `source_type` is a verified ingest path AND `captured_at` is within 15 min of now.
- **UI rules** — Tagged "Live". May drive current-state metrics and alerts.
- **UI must never** — Persist the "Live" badge once the freshness window expires. Be fabricated from absence of data.

## stale

- **Definition** — Reading that was once live or current-manual but has aged past its freshness threshold.
- **Badge text** — "Stale"
- **When applied** — Live readings older than 15 min. Manual readings used as current context older than 24 h.
- **UI rules** — Tagged "Stale" with the captured timestamp. Excluded from "live" KPIs.
- **UI must never** — Be rendered as healthy/current. Drive AI Doctor as if fresh. Be reclassified back to live without a new reading.

## invalid

- **Definition** — Reading that is missing, null, NaN, out-of-range, unit-mismatched, or otherwise unparseable.
- **Badge text** — "Invalid"
- **When applied** — Value fails schema, range, or unit validation. `captured_at` is missing or in the future.
- **UI rules** — Tagged "Invalid". Surfaced for grower review.
- **UI must never** — Display the underlying value as a healthy number. Be used by AI Doctor for diagnosis. Count toward stability/uptime metrics.

## Staleness thresholds

- Live → Stale after **15 minutes** without a newer `captured_at`.
- Manual current-context → Stale after **24 hours**.
- Demo readings remain `demo` indefinitely.
- Invalid readings are never reclassified to healthy.
