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

1. **Unknown stays unknown.** If the incoming stage is null, empty, or not in
   either vocabulary, the helper returns `{ known: false }` and callers MUST
   render "stage unknown" UX. Never classify an unknown stage as healthy or
   in-target.
2. **One mapping table, one place.** The legacy → canonical map lives in
   `src/lib/vpdStageNormalizationRules.ts`. Do not duplicate it inside JSX
   or component files. A static test enforces this.
3. **No automatic upgrade.** Legacy rows in `vpd_targets` are kept for
   backwards compatibility. The migration that seeded canonical defaults is
   additive — it did not delete or rewrite legacy rows.
4. **Bands are not changed by normalization.** This helper only renames
   stages. `evaluateVpdAgainstStageTarget` still drives band evaluation
   against `VPD_STAGE_TARGETS`.

## Safety

- Pure helper. No I/O, no React, no Supabase, no fetch, no alert writes,
  no Action Queue writes, no device control.
- Covered by `src/test/vpd-stage-normalization-rules.test.ts` including a
  static guard that no JSX file duplicates the mapping table.

## Rollback

Delete `src/lib/vpdStageNormalizationRules.ts`,
`src/test/vpd-stage-normalization-rules.test.ts`, and this document.
No application behavior depends on this helper yet.
