# QA Checklist: AI Doctor Imported History Safety

Use this checklist when verifying AI Doctor behavior on imported CSV/XLSX
sensor history. All items should pass before signing off on a release that
touches imported-history surfaces.

## Fixture & provenance

- [ ] Fixture source remains `csv` (no silent promotion to `live`/`manual`).
- [ ] Compiled context exposes `is_live: false`.
- [ ] Not-live / imported warning is visible in the readiness panel.
- [ ] Missing current live/manual readings warning is visible when no
      current live or manual snapshot is present.
- [ ] Invalid/unknown soil note is visible when invalid values are present.

## Render safety

- [ ] No raw payload fields (`raw_payload`, vendor secrets, internal IDs,
      private filenames, bridge tokens) render in any visible UI.
- [ ] No device-command-shaped strings render (`execute_device`,
   `setpoint_write`, `irrigation_control`, `light_control`,
   `fan_control`).
- [ ] Approval-required suggestions are **not** shown as approved,
      executed, or queued — they remain context-only.

## Action Queue suggestion preview

- [ ] Preview status chip is visible in the readiness panel.
- [ ] Screen-reader status (`role="status"`) is present and audible.
- [ ] Missing context chips render when plant, tent, stage, or current
      sensor snapshot is absent.
- [ ] Invalid / "Needs review" chips render when telemetry is flagged
      invalid, unknown, or stale.
- [ ] No `approved`, `queued`, or `executed` wording appears in the
      preview card.
- [ ] No executable `<button>` elements exist inside the preview card.
- [ ] No device-command-shaped text (`turn on`, `turn off`, `pump`,
      `dose`, `setpoint`, `mqtt publish`) appears in preview copy.
- [ ] No Supabase write, Action Queue insert, Edge Function invoke, or
      alert creation is triggered by the preview path.

## Repository hygiene

- [ ] `fixtures/diary/2026-06-13-multi-tent-baseline.json` is not
      referenced outside `src/test/`.
- [ ] No new runtime imports of test fixtures were introduced.

## Validation commands & known counts

```bash
bun run typecheck
bunx vitest run \
  src/test/diary-baseline-fixture-safety.test.ts \
  src/test/ai-doctor-fixture-context-rules.test.ts \
  src/test/ai-doctor-fixture-context-readiness.test.tsx \
  --reporter=dot
node scripts/assert-release-docs-safety.mjs
```

Known good results:

| Check | Expected |
|-------|----------|
| `bun run typecheck` | passes |
| Imported-history + readiness component band | 38/38 passed |
| Fixture chain (diary safety + context rules + readiness) | 30/30 passed |
| Broader AI Doctor / context sweep (198 files) | 2674/2675; 1 known flake |
| Isolated re-run of `daily-check-method-context.test.tsx` | 20/20 passed |
| `scripts/assert-release-docs-safety.mjs` | OK |

See `docs/testing/known-vitest-flakes.md` for the known parallelism flake.
