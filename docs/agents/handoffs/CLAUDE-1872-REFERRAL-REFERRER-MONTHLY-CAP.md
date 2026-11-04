### CLAUDE-1872-REFERRAL-REFERRER-MONTHLY-CAP

```text
TASK CLAUDE-1872-REFERRAL-REFERRER-MONTHLY-CAP  priority: P1  status: CLOSED
goal: Cap referrer rewards at 10 rewarded conversions per UTC calendar month per environment in convert_referral (grant-path audit 2026-10-03); the referee's 10 credits are never capped. Enforces the cap that #1891's referral copy already states.
branch: claude/referral-reward-cap
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin claude/referral-reward-cap verdant-grow-diary && git switch claude/referral-reward-cap && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1872 (merged)
head_sha: 323b1e5322c8dafe8fb89a82726485b094780bac, the final head (a base merge resolving the scripts/required-money-migrations.mjs conflict with #1871 by keeping both entries in timestamp order), squash-merged as fe9e3061cdee53b76248713e7123060656fbdda5.
state: CLOSED. Merged 2026-10-13T23:29:28Z through the merge queue, after an owner-account removal at 22:56 UTC and a re-queue on Matthew's instruction at 22:59 UTC. Required checks 35/35 success at the merge commit fe9e3061cd against config/required-status-checks.json, measured 2026-10-13 23:38 UTC. Non-required red at the merge commit: Assert money migrations applied in SANDBOX and Prefix diff against SANDBOX (the push-triggered sandbox probe in required-money-migrations.yml, armed by this PR's REQUIRED_MONEY_MIGRATIONS entry as its body's Risk section anticipated; a CI defect class per AGENTS.md, not a production schema verdict), plus the long-standing Supabase Preview. Merged does not mean live: migration 20261003020000_referral_referrer_monthly_cap.sql applied in production NOT_MEASURED; production delivery NOT_MEASURED.
next_action: None; closed. The migration is Matthew's to apply through his own path; the release packet lists it.
files: supabase/migrations/20261003020000_referral_referrer_monthly_cap.sql (new); src/test/referral-reward-cap-db.test.ts (new); scripts/required-money-migrations.mjs; docs/credit-packs-referral-deploy-runbook.md.
blockers: None for this closed task.
artifacts: PR #1872 body (real-PostgreSQL suite 8/8 on 3 runs; RED with the migration removed: 6 fail, 2 pass).
reviewer_seat: Blue Dream (P1 billing / credits) named; no independent exact-head PASS was given. Merged on Matthew's explicit instruction in session. The author, Claude, was not eligible.
claimed_by: Claude (author)
last_updated: 2026-10-13 18:45 CT, by Claude
closure: Squash-merged via the merge queue as fe9e3061cdee53b76248713e7123060656fbdda5 at 2026-10-13 18:29 CT (23:29:28 UTC) from final head 323b1e5322c8dafe8fb89a82726485b094780bac, merge authorized by Matthew in session. No deploy, SQL or production write. Added directly to Closed: no open block for this task existed on the deploy tip (checked 2026-10-13 23:05 UTC).
```
