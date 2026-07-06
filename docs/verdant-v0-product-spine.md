# Verdant V0 Product Spine

> Doctrine document. Companion to
> [`verdant-product-context.md`](./verdant-product-context.md) (identity and
> mission) and [`one-tent-loop.md`](./one-tent-loop.md) (the loop in detail).
> If this document and product behavior ever disagree, that is a defect in one
> of them — flag it; do not silently reinterpret either.

## What Verdant is

- Verdant is a **standalone grow technology company**. Its product, brand, and
  data are its own.
- Verdant is a **Grow OS**, not just a grow journal. A journal remembers; a
  Grow OS remembers, measures, reasons cautiously, and asks the grower before
  anything changes.

The core sentence:

> **Plant memory. Sensor truth. Grower-approved decisions.**

## Current V0 priority

Everything in V0 serves one end-to-end loop:

```text
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Approval-Required Action Queue
```

If a proposed change does not make this loop more truthful, more reliable, or
easier to complete, it is not a V0 priority.

## Build order

1. **Diary first** — plant memory (Quick Log, Timeline, photos) is the
   foundation. It must work with zero sensors and zero AI.
2. **Sensors second** — manual snapshots, then verified ingestion. Every
   reading is labeled with its true source; see
   [`sensor-truth-rules.md`](./sensor-truth-rules.md).
3. **AI third** — a cautious, evidence-aware advisor that cites what it saw,
   names what it is missing, and never pretends certainty; see
   [`ai-doctor-safety-contract.md`](./ai-doctor-safety-contract.md).
4. **Automation last** — and in V0, "automation" means _suggestions that wait
   for approval_. No closed loop; see
   [`action-queue-safety-rules.md`](./action-queue-safety-rules.md).

## Anti-feature-creep rules

Until the core One-Tent Loop is stable, validated, and boring:

- **No community features** (feeds, follows, sharing hubs).
- **No competitions** (leaderboards, contests, rankings).
- **No public mode expansion** (beyond the existing labeled demo/preview
  surfaces).
- **No enterprise expansion** (multi-site, team roles, fleet dashboards).
- **No closed-loop automation or device control in V0.** Verdant does not
  switch, dim, dose, irrigate, or actuate anything. Suggestions end at the
  Approval-Required Action Queue; the grower performs actions themselves.

## Safety rules (non-negotiable)

- No fake live data.
- No blind automation.
- No device control.
- No Supabase writes from public/demo surfaces.
- Demo / manual / live / csv / stale / invalid data must be clearly labeled.
- AI suggestions remain approval-required.
- Public copy must not imply autopilot, automatic equipment control, or
  AI-controlled hardware.
