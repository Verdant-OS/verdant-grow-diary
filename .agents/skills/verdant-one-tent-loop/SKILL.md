---
name: verdant-one-tent-loop
description: Scope Verdant work to the One-Tent Loop — Grow, Tent, Plant, Quick Log, Timeline, then sensors and cautious AI. Use before product or diary changes.
---

# Verdant One-Tent Loop

Keep every change inside the activation loop:

```text
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Approval-Required Action Queue
```

## Do this

1. Find the existing pure rules module in `src/lib/` before adding logic in JSX.
2. Preserve old rows with missing fields. Do not require new columns for old documents.
3. Label every sensor reading with source, timestamp, tent, and confidence when available.
4. If context is missing, say what is missing. Do not guess.
5. Add targeted tests for happy path, edges, nulls, and the specific regression.

## Do not do this

- Expand into community, competitions, public social mode, or device control.
- Duplicate rule tables inside React components.
- Treat green CI as proof of production indexing or live sensor health.
- Change schema, RLS, or edge functions outside the requested slice.

## Layering

| Layer | Path |
| --- | --- |
| Constants | `src/constants/*` |
| Pure rules | `src/lib/*Rules.ts` |
| Advisors | `src/lib/*Advisor.ts` |
| View models | `src/lib/*ViewModel.ts` |
| Pages / components | `src/pages/*`, `src/components/*` |
| Hooks | `src/hooks/*` |
