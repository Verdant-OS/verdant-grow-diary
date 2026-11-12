# SENSOR-TYPES-LOVABLE-SYNC-DRIFT

```text
TASK SENSOR-TYPES-LOVABLE-SYNC-DRIFT  priority: other  status: OPEN
goal: Land the Supabase types regeneration and the 7-file sensor fixture fix on the deploy branch, so Lovable stops re-applying the same fix in every session.
why: Migration 20261010120000_sensor_readings_notes_and_unit_unconfirmed.sql reached the deploy branch in #2802 (2026-11-03), but src/integrations/supabase/types.ts was never regenerated there (git log -S unit_unconfirmed on the deploy branch is empty). Each Lovable session starts from the deploy head, regenerates types from the live database (which has the columns), sees the sensor fixtures fail, fixes them, and pushes to a new lovable-sync-<ts> branch. None of the 66 lovable-sync branches is merged, so the fix was re-done about 12 times between 2026-10-17 and 2026-11-12 (inference from git history; nothing deleted the fix).
branch: claude/project-thread-k9mdpl
base: verdant-grow-diary @ b7e05214ddb0c552d1c6d04a3101045a9f771ab8
checkout: git fetch origin claude/project-thread-k9mdpl verdant-grow-diary && git switch claude/project-thread-k9mdpl && git ls-remote origin claude/project-thread-k9mdpl
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2974 (draft; opened 2026-11-12 on Matthew's "Open the draft PR")
head_sha: the commit carrying this file; verify with git ls-remote once pushed
state: pushed; draft PR open; CI is the first test run; no reviewer yet
current_step: waiting on Matthew's yes to push and open the draft PR
next_action: on his yes, push and open a draft PR against verdant-grow-diary, let CI run, report head SHA and check results. Then the Coordinator routes an eligible independent reviewer. This writer does not mark ready, request review, enqueue or merge.
post_merge_check: on the merged deploy tip, git grep -n unit_unconfirmed src/integrations/supabase/types.ts finds the sensor_readings Row/Insert/Update fields, and the next Lovable session's regenerated types.ts shows no sensor_readings diff.
active_writer: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGs1fDtPAm8KhjKuoCRCKkKvQ
decisions:
  - Two cherry-picks only. e424b380d (types regen, src/integrations/supabase/types.ts only, +586/-17), reworded to a conventional subject, and 297c9eecd (7 sensor files, +19/-1). Authorship kept as gpt-engineer-app[bot].
  - Excluded from the same lovable-sync-1794498118 branch: 8535a931a (.env files: Stripe publishable key swap and VITE_POSTHOG_KEY renamed to VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY, which would break src/lib/posthogClient.ts reading VITE_POSTHOG_KEY); f26511fa0 and 93821aa5a (drizzle/ files, drizzle.config.ts); da59bec1e, 790491851, f4ad2e21d, 1da637264 (.lovable plan docs).
  - Base is the deploy branch, not main. The coordinator's note said current main; main has diverged from deploy and the fix belongs where the site ships. Flagged in the thread.
  - No migration, .env, auth hook, billing or email file is touched.
tried_and_rejected: none
commands: git diff --stat origin/verdant-grow-diary..HEAD (8 files, +605/-18). bun install --frozen-lockfile fails here with 403 on tarballs pinned to the Lovable registry, so typecheck and vitest were not run locally; CI decides.
files_touched: src/integrations/supabase/types.ts; src/lib/growAdapters.test.ts; src/lib/timelineManualSensorMeasurementRules.ts; src/lib/manualSensorSnapshotRecovery.ts; src/test/legacy-sensor-provenance-fence.test.ts; src/test/manual-sensor-snapshot-retry-recovery.test.tsx; src/test/qa-2155-2156-2160-temperature-units-and-csv-export.test.tsx; src/test/sensor-future-timestamp-contract.test.ts; this file (new)
files_remaining: none for this slice
blockers: none for the code. Local typecheck and tests are BLOCKED (install 403); NOT_MEASURED until CI runs.
open_questions:
  - Proposal, not in this PR: a CI check that fails when a column added in supabase/migrations is missing from src/integrations/supabase/types.ts. The required typecheck cannot see this drift, because stale types are internally consistent. Overlaps the TYPECHECK-GATE-HEAP and WORKFLOWS-TYPECHECK-GATE work; needs an owner.
  - The 66 unmerged lovable-sync-* branches need an owner decision (prune or triage). Matthew.
  - Regenerated types include payments_email_dispatches, which no migration on the deploy branch creates (live database object with no repo migration). Needs an owner.
gotchas: types.ts is generated; do not hand-edit it. Draft PR 2969 (Stripe) shares no files with this change, but it hand-types subscriptions columns that the regenerated types may also add; possible interaction, NOT_MEASURED.
links: none
exclusions_for_review: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGs1fDtPAm8KhjKuoCRCKkKvQ (this writer); gpt-engineer-app[bot] / Lovable (authored both cherry-picked commits)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGs1fDtPAm8KhjKuoCRCKkKvQ, 2026-11-12
owner: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGs1fDtPAm8KhjKuoCRCKkKvQ
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGs1fDtPAm8KhjKuoCRCKkKvQ
```
