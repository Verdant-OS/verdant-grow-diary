# AI Doctor Imported History Safety Slice

**Date:** 2026-06-15

## What shipped

This slice delivers test-only safety coverage and copy polish for AI Doctor imported CSV/XLSX sensor history. No runtime feature was added; no import write path was enabled.

### Deliverables

1. **Diary fixture safety regression tests** (`src/test/diary-baseline-fixture-safety.test.ts`)
   - Verifies the multi-tent baseline diary fixture preserves sensor-truth labels, invalid telemetry handling, and approval-required action safety.

2. **AI Doctor fixture context golden-case helper/tests** (`src/lib/aiDoctorFixtureContextRules.ts`, `src/test/ai-doctor-fixture-context-rules.test.ts`)
   - Deterministic, pure compilation of diary fixtures into safe AI Doctor context payloads.
   - Enforces provenance (`is_live: false`, `source: csv`), safety gating (drops suggestions lacking `approval_required: true` or containing `device_control: true`), and null-safe deterministic output under 4 KB.

3. **Imported-history readiness/render safety tests** (`src/test/ai-doctor-fixture-context-readiness.test.tsx`)
   - Verifies the AI Doctor context readiness layer treats imported CSV history safely: visible provenance, not-live warning, no raw payload leaks, no device commands, no approval bypass.
   - Includes static guard confirming the fixture is not referenced outside `src/test/`.

4. **Known Vitest parallelism flake note** (`docs/testing/known-vitest-flakes.md`)
   - Documents the observed timeout in `daily-check-method-context.test.tsx` under heavy parallel jsdom load.
   - Status: pre-existing, unrelated to fixture changes; isolated re-run passes.

5. **Imported-history disclosure copy polish** (`src/lib/aiDoctorImportedHistoryDisclosureViewModel.ts`, `src/components/AiDoctorImportedHistoryDisclosurePanel.tsx`)
   - Grower-facing heading changed to **"Imported history"**.
   - Body now states: *"CSV/imported readings can give AI Doctor useful background, but they are not live telemetry. Add a current manual or live sensor snapshot before relying on this for current-room decisions."*
   - Missing-live warning updated to: *"Missing current live/manual readings — diagnosis confidence should stay conservative."*
   - Added invalid-note: *"Invalid or unknown readings are shown for review only and are not treated as healthy."*

## Safety guarantees

- CSV/imported history is **always labeled non-live** (`source = csv`, `is_live = false`).
- The diary fixture **remains test-scoped**; a static guard confirms no runtime imports.
- **Invalid/unknown soil-probe values are never described as healthy** in compiled context or rendered UI.
- **Raw payload, vendor secrets, private filenames, internal IDs, and bridge tokens do not render** in the disclosure panel.
- **Approval-required suggestions remain context-only**; no executable device commands are generated.
- **No Supabase/schema/RLS/Edge Function/AI/Action Queue/device-control changes** were introduced in this slice.

## Validation summary

| Check | Result |
|-------|--------|
| Type check (`bun run typecheck`) | Passed |
| Imported-history + readiness component band | **38/38 passed** |
| Fixture chain (diary safety + context rules + readiness) | **30/30 passed** |
| Broader AI Doctor / context sweep (198 files) | **2674/2675 passed**; 1 timeout flake in `daily-check-method-context.test.tsx` |
| Isolated re-run of flaked file | **20/20 passed** |

## References

- `docs/testing/known-vitest-flakes.md` — Known parallelism flake documentation
- `fixtures/diary/2026-06-13-multi-tent-baseline.json` — Multi-tent baseline fixture
- `docs/diary/2026-06-13-multi-tent-baseline.md` — Human-readable baseline summary

## Notes

- Do **not** claim live data support was added.
- Do **not** claim AI diagnosis behavior changed.
- Do **not** claim import writes are enabled.
