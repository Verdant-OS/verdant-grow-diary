# QUICKLOG-EVENT-REQUEST-HASH-UTC

```text
TASK QUICKLOG-EVENT-REQUEST-HASH-UTC  priority: P2  status: CLOSED
closed: dropped. #1846 closed without merging (GitHub API, read 2026-11-06); no successor PR was found by branch search. Whether the forward-repair migration it points to is still wanted is Matthew's decision, carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md. Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Hash Quick Log event replays independently of the session TimeZone. One additive,
  wrapper-only migration runs the frozen delegate under UTC, keeps same-offset acceptance of
  pre-repair non-UTC hashes and restores the caller's zone. Event-path companion to #1841
  (manual path). Spec: docs/specs/quicklog-event-request-hash-timezone.md
branch: claude/quicklog-event-occurred-at-utc-hash
base: verdant-grow-diary; the owner squashed the branch onto 8e1ffe395 (2026-10-12 18:56 UTC
  force-push); Claude then merged the deploy branch normally. Pre-squash heads (18d610f1b,
  edb41c88f, b7481653d) are superseded.
checkout: git fetch origin claude/quicklog-event-occurred-at-utc-hash verdant-grow-diary && git switch claude/quicklog-event-occurred-at-utc-hash && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1846 (ready for review; the owner
  marked it ready 2026-10-12 18:56 UTC)
head_sha: 45cdac32c764a6ed0401749623247ca37b52a2bb, remote observed 2026-10-16 18:58 UTC (unchanged
  since 2026-10-13 18:17 UTC)
state: Migration renumbered to 20261013190000 at the owner's instruction (2026-10-13). This fixes
  the failure at a4c30977: required shard 11's version-order test, flagged as P1 by Codex, failed
  because 20261010120000 (#1961) had merged after 20261001190000. The bytes are unchanged
  (sha256 d8cccdcc…, wrapper md5 834408e5…). The version avoids 20261013180000, which #1841
  is taking. Local, before pushing: 4 event-replay test files 35/35 pass; the PGlite harness
  passes 13/0 GREEN and fails at utc_stored_hash_retries when the repair is replaced by a
  no-op (RED); migration integrity, migration safety, lockfile policy, Prettier, docs-safety
  and diff-check all pass. Hosted CI at 45cdac32: 35/35 required SUCCESS (re-read 2026-10-16;
  supersedes the earlier running/NOT_MEASURED reading).
  "native save/retrieve (local backend)" failed once at b7481653d on a retraction-reason chip
  click (manual path, outside this change) and passed on re-run.
next_action: Substantive exact-head review at 45cdac32 by the DB seat (Codex, Blue Dream or
  Durban Poison). The scorer-workflow prerequisite behind Codex's 2026-10-14 22:15 UTC BLOCKED is
  satisfied: Matthew approved it 2026-10-16 19:23 UTC (PR #1846 issuecomment-6223030165). Do not
  merge: the migration merge/ship decision stays held for Matthew.
files: supabase/migrations/20261013190000_quicklog_event_request_hash_utc.sql;
  scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs;
  src/test/quicklog-event-request-hash-utc-pg15-harness.test.ts;
  .github/workflows/quicklog-event-replay-lock-pg15.yml;
  docs/specs/quicklog-event-request-hash-timezone.md
blockers: Independent exact-head review; Matthew's separate migration merge/ship decision. CI at 45cdac32:
  35/35 required SUCCESS (re-read 2026-10-16). Deep migration review not performed. #1841 merged
  2026-10-13 as feb94d9ad.
artifacts: PR #1846 body (RED/GREEN, local and hosted evidence); earlier hosted PG15 run
  36894367680; shard-11 failure before the fix: run 38294348060
reviewer_seat: Blue Dream or Durban Poison (DB), or Codex (Codex did not author or repair)
claimed_by: Claude (close-out session "Terminal [b6d701]"), 2026-10-16 18:57 UTC (PR #1846
  issuecomment-6222597481; Matthew's 2026-10-16 transfer)
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-10-16 14:33 CT, by Claude (close-out session))
```
