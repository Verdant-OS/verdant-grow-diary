# CLAUDE-MD-CULTIVAR-RULE-FIX

```text
TASK CLAUDE-MD-CULTIVAR-RULE-FIX  priority: P3  status: CLOSED
goal: correct CLAUDE.md's Layering drift bullet, which still says cultivarSlugRouteRules.ts imports the Supabase client
why: #2882 (6365c37f) added that sentence when it was true; #2883 (e4c2fc02) then moved the read into cultivarSlugRouteService.ts, so no root-level *Rules.ts imports the client and agents were reading a false fact every session
branch: claude/claude-md-cultivar-fix
base: verdant-grow-diary at e4c2fc02d
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2886
head_sha: 0837b5d09790fa64fbdf8d69dc1f4e42cf03f3a8
state: CLOSED 2026-11-05 - merged through the queue at 10:07:56 UTC as 585346e4c2f6832721bbe350794f57f8c8bd561a (enqueued by cheekhimself). Required CI green at 0837b5d0; Codex code review no findings. No independent exact-head review recorded on GitHub
next_action: none
post_merge_check: none live; repository-only. After merge, CLAUDE.md says no root-level *Rules.ts imports the Supabase client and all 18 governance files read 2026-11-05.2
active_writer: Claude session session_017UoYKvaD66HKYPL8bnvTH3
decisions: Matthew asked to fix the stale sentence (2026-11-05). Re-verified at e4c2fc02: grep finds no root src/lib/*Rules.ts importing @/integrations/supabase/client; the two TablesInsert type-only imports still hold. AGENTS.md section 17 records 2026-11-05.2
tried_and_rejected: none
commands: node scripts/sync-sentinel-mirror.mjs --set-version=2026-11-05.2; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary; node_modules/.bin/vitest run $(grep -rl -E "AGENTS\.md|CLAUDE\.md|GEMINI\.md|Sentinel-Version|roles/claude" src/test) --reporter=dot; node --test scripts/check-sentinel-version-parity.test.mjs
evidence: parity OK, 2026-11-05.2 across 18 files, BUMP checked against e4c2fc02d; 23 test files / 738 passed / 20 skipped (existing) / 0 failed; parity script tests 31 pass / 0 fail; prettier clean
files_touched: CLAUDE.md, AGENTS.md (section 17), GEMINI.md (mirror), the other 15 governance files (Sentinel-Version line only), docs/agents/handoffs/CLAUDE-MD-CULTIVAR-RULE-FIX.md
files_remaining: none
blockers: none
open_questions: none
gotchas: PR #2885 (handoff closures) is open on claude/timeline-measurement-count-fix-ozil20 and touches only docs/agents/handoffs files; no overlap
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2882 https://github.com/Verdant-OS/verdant-grow-diary/pull/2883 https://github.com/Verdant-OS/verdant-grow-diary/pull/2885
reviewer_seat: eligible non-contributing outside reviewer per OWNERSHIP.md 4.3 (excludes this session)
reviewer_sha: none recorded
session_state: this session also watches #2885
claimed_by: Claude session_017UoYKvaD66HKYPL8bnvTH3, 2026-11-05 (assigned by Matthew)
owner: Claude
last_updated: 2026-11-05, by Claude (closure)
```
