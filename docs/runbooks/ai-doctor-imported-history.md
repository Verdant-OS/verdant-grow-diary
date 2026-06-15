# Runbook: AI Doctor Imported History

**Audience:** Verdant operators, on-call, support, and reviewers triaging
AI Doctor context behavior involving imported CSV/XLSX sensor history.

## What "imported history" means

Imported history is sensor data brought into Verdant through CSV/XLSX
import flows. In the AI Doctor context, it appears with:

- `source = "csv"`
- `is_live = false`
- Vendor/app lineage stored under `raw_payload.source_app` (never rendered as UI).

It is **useful background** — trend, prior conditions, lineage — but it is
**not live telemetry** and must never be treated as such.

## Operating rules

- CSV/imported history is **background only**. Confident current-room
  diagnosis still requires a **current manual or live sensor snapshot**.
- **Invalid/unknown soil-probe values** must remain separated from healthy
  readings. They are shown for review only and must never be classified as
  healthy by any compiled context, view model, or rendered UI.
- **Suggestions derived from imported history remain context-only.** They
  must not bypass approval. Any actual action must move through the
  existing approval-required Action Queue flows initiated by the grower.
- **No device control.** Imported history must not trigger or imply
  executable device commands.
- **Raw payloads, vendor secrets, private filenames, internal IDs, and
  bridge tokens must not render.** Only safe summary fields belong in UI.
- The diary fixture used to test this path
  (`fixtures/diary/2026-06-13-multi-tent-baseline.json`) is **test-scoped**.
  A static guard confirms it is not referenced outside `src/test/`. Do not
  import it from runtime app code.

## What to check when triaging

1. Is the readiness panel showing the imported-history disclosure copy?
2. Is the not-live warning visible?
3. Is the missing-current-live/manual warning visible when applicable?
4. Are invalid/unknown values shown with the invalid note (not as healthy)?
5. Are there any raw payload, token, or vendor secret strings visible? (Should be none.)
6. Are any suggestions shown as approved/executed/queued automatically? (Should be none.)

## References

- Release note: `docs/releases/ai-doctor-imported-history-safety.md`
- QA checklist: `docs/qa/ai-doctor-imported-history-safety-checklist.md`
- Fixture: `fixtures/diary/2026-06-13-multi-tent-baseline.json` (test-only)
- Fixture summary: `docs/diary/2026-06-13-multi-tent-baseline.md`
- Known flake note: `docs/testing/known-vitest-flakes.md`
