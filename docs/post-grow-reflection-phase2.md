# Post-Grow Reflection Phase 2A

## Summary

Phase 2A adds the contract for Verdant's future Post-Grow Reflection layer.

This is not a runtime integration. It defines the typed input shape, stable prompt builder, deterministic fixtures, and tests needed before any model-backed reflection is wired into the product.

## Scope

Included:

- `GrowContext` and `ReflectionOutput` TypeScript contracts
- Versioned prompt builder
- Stable context JSON serialization
- Rich, thin, conflicting, and post-harvest-heavy fixtures
- Prompt, fixture, and static-safety tests

Not included:

- Runtime model requests
- Server runtime changes
- New persistence tables
- Report saving
- Report UI changes
- Pheno or clone workflows
- Automatic grower actions
- Equipment control

## Product intent

The future reflection layer should help the grower understand:

- What went well
- What should be repeated
- What should be adjusted cautiously
- What happened during drying and curing
- Whether pheno or strain signals are strong enough to track
- What data gaps limit confidence

The reflection must remain evidence-based and deterministic for the same supplied context.

## Safety rules

The prompt requires cautious language:

- Use exact evidence from supplied context.
- Do not claim causation from one run.
- Prefer "coincided with", "correlated with", and "in this run".
- Lower confidence when data is thin, stale, invalid, missing, or conflicting.
- Be extra careful with autoflowers and stress recommendations.
- Avoid aggressive nutrient, irrigation, training, or equipment changes from weak evidence.
- Do not invent dry/cure checkpoints, quality scores, pheno differences, sensor coverage, or timestamps.

## Validation plan

Run:

```bash
npx vitest run src/test/post-grow-reflection-prompt.test.ts src/test/post-grow-reflection-fixtures.test.ts src/test/post-grow-reflection-static-safety.test.ts --reporter=verbose
npm run typecheck
npm run build
```

## Rollback

Rollback is simple: remove the Phase 2A contract files and tests. There are no persisted data changes in this slice.
