# Verdant Glossary

Canonical definitions. One meaning per term. No synonyms.

- **Grow** — A single cultivation run owned by one user. The top-level container for tents, plants, logs, and outcomes.
- **Tent** — A physical or logical grow space inside a Grow. Holds plants, has environmental targets, and is the unit sensors attach to.
- **Plant** — An individual plant inside a Tent. Has stage, age, strain, and its own diary and photo history.
- **Quick Log** — A grower-initiated short entry capturing watering, feeding, training, symptoms, photos, or manual sensor snapshots. Always a write performed by the user.
- **Timeline** — The read-only chronological view of all diary entries, photos, manual snapshots, and events for a Grow or Plant.
- **Sensor Snapshot** — A point-in-time reading set (temp, RH, VPD, etc.). May be `live`, `manual`, `demo`, `stale`, or `invalid`.
- **AI Doctor** — A read-only advisor that produces a structured analysis from plant history, photos, diary, and sensor context. Suggests, never executes.
- **Alert** — A system-detected condition (e.g., out-of-range humidity, stale sensor) shown to the grower for review.
- **Action Queue** — The approval-required surface where AI Doctor suggestions and alert-derived recommendations land. Grower decides.
- **Approval-Required Action** — A queued recommendation that has no effect until the grower explicitly approves, simulates, completes, or rejects it.
- **Demo Data** — Fixture data used for demos, screenshots, and tests. Always labeled `demo`. Never displayed as live.
- **Manual Snapshot** — A reading entered by the grower via Quick Log. Source is the grower, not a device. Never labeled live.
- **Live Reading** — A reading ingested from a verified sensor source within the last 15 minutes.
- **Stale Reading** — A reading that was live or manual-current-context but has passed its freshness threshold (15 min live, 24 h manual current context).
- **Invalid Reading** — A reading that is missing, null, NaN, out-of-range, unit-mismatched, or otherwise unparseable. Never rendered as a healthy numeric value.
