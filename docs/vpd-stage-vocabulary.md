# Verdant VPD Stage Vocabulary

Verdant has two valid stage vocabularies that coexist:

| Legacy app stage | Canonical VPD target stage | Reason |
|------------------|----------------------------|--------|
| `seedling`       | `seedling`                 | Identical. |
| `veg`            | `late_veg`                 | Legacy `veg` band (0.8–1.2 kPa) aligns with canonical `late_veg` (0.9–1.2). Callers that distinguish early vs late veg should pass the canonical name directly. |
| `preflower`      | `early_flower`             | Legacy `preflower` (0.9–1.3) overlaps the canonical `early_flower` band (1.0–1.3). |
| `flower`         | `mid_late_flower`          | Legacy `flower` (1.0–1.5) fully contains canonical `mid_late_flower` (1.1–1.5). |
| `late_flower`    | `mid_late_flower`          | Exact band match (1.1–1.5). `ripening` (1.2–1.6) is a stricter end-stage and is **not** auto-applied from the legacy label. |

Canonical stages: `seedling`, `early_veg`, `late_veg`, `early_flower`,
`mid_late_flower`, `ripening`. Canonical names always pass through unchanged.

## Rules

1. **Strict parsing — stage IDs are machine values, not display labels.**
   `normalizeToCanonicalVpdTargetStage` accepts **only** the exact
   lowercase canonical or legacy identifiers in the table above.
   - `"veg"` → `late_veg`
   - `"Veg"`, `"VEG"`, `" veg "`, `"late-flower"`, `"Late Flower"` → unknown
   - `""`, `"   "`, `null`, `undefined`, any non-string → unknown
   - Post-harvest labels (`harvest`, `dry`, `cure`, `post_harvest`,
     `post-harvest`) → unknown
   Callers that hold user-facing labels must normalize through their own
   presenter (e.g. `src/constants/growStages.ts`) before passing into
   VPD evaluation.
2. **Unknown stays unknown.** When `normalizeToCanonicalVpdTargetStage`
   returns `{ known: false }`, callers MUST render "stage unknown" UX.
   Never classify an unknown stage as healthy or in-target.
3. **One mapping table, one place.** The legacy → canonical map lives in
   `src/lib/vpdStageNormalizationRules.ts`. It must not be duplicated
   inside JSX, components, view-models, or migrations. Two guards
   enforce this:
   - `scripts/assert-vpd-stage-normalization-ownership.mjs` (CI script)
   - `src/test/vpd-stage-normalization-rules.test.ts` (static guard)
   Allow-listed files:
   - `src/lib/vpdStageNormalizationRules.ts`
   - `src/test/vpd-stage-normalization-rules.test.ts`
   - `docs/vpd-stage-vocabulary.md`
   - `scripts/assert-vpd-stage-normalization-ownership.mjs`
4. **No automatic upgrade.** Legacy rows in `vpd_targets` are kept for
   backwards compatibility. The migration that seeded canonical defaults
   is additive — it did not delete or rewrite legacy rows.
5. **Bands are not changed by normalization.** This helper only renames
   stages. `evaluateVpdAgainstStageTarget` still drives band evaluation
   against `VPD_STAGE_TARGETS`.

## Safety

- Pure helper. No I/O, no React, no Supabase, no fetch, no alert writes,
  no Action Queue writes, no device control.
- Covered by `src/test/vpd-stage-normalization-rules.test.ts` and
  `src/test/vpd-stage-normalization-ownership.test.ts`.

## Rollback

Delete `src/lib/vpdStageNormalizationRules.ts`,
`src/test/vpd-stage-normalization-rules.test.ts`,
`scripts/assert-vpd-stage-normalization-ownership.mjs`, and this
document. No application behavior depends on this helper yet.
