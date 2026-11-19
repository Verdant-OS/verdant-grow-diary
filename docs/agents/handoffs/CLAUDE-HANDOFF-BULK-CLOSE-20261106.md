# CLAUDE-HANDOFF-BULK-CLOSE-20261106

````text
TASK CLAUDE-HANDOFF-BULK-CLOSE-20261106  priority: other  status: CLOSED
closed: merged. #2916 merged into verdant-grow-diary on 2026-11-06 as 056ad2482347b362fec8e799188f62c211cb352c (final SHA; first-parent commit on origin/verdant-grow-diary, read 2026-11-11; merge date from the GitHub search API). Closed by Claude session_017UoYKuyQKXVV93JSwJJztt on 2026-11-11 at Matthew's request (source claim: his answer in that session). This close does not resolve the carried-forward items below; they still need owners.
goal: Close 56 Claude handoff entries that still read OPEN although their PRs merged (55) or closed unmerged (1), without losing their unfinished items.
why: AGENTS.md §12 requires a merged task to be CLOSED the same day with reason and final SHA. A 2026-11-06 audit found 56 OPEN Claude entries (one, DASHBOARD-SINGLE-LOG-ENTRY, found by review 5797091224 because its HANDOFF_LOG.md block has no ### heading) and no open Claude PR besides this one, so the log misled cold agents about what is in flight. Matthew chose "close them in one docs-only draft PR after #2913/#2914 merge" (source claim: his answer in this session, 2026-11-06).
branch: claude/practical-johnson-6funir (restarted from verdant-grow-diary after #2914 merged)
base: verdant-grow-diary @ 805c3cd8e33ec6dcbb9137019e25442842e94b99
checkout: git fetch origin claude/practical-johnson-6funir verdant-grow-diary && git switch claude/practical-johnson-6funir && git ls-remote origin claude/practical-johnson-6funir  # compare with the PR head before trusting any review
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2916 (draft)
head_sha: round 1 = efe574ec74762bcbd61fa0910e349fdb5d50f673 (REQUEST_CHANGES, review 5797091224: 1 P2, 3 P3). Round 2 = the commit that adds this line; read it from the PR. Verify with git ls-remote.
state: round 2 pushed; awaiting a fresh independent exact-head review
current_step: review routing
next_action: an eligible independent reviewer checks every closed entry against GitHub and that HANDOFF_LOG.md is unchanged; then Matthew's per-item yes and the Merge Steward. Builder seats do not mark ready, enqueue or merge. After merge, the carried-forward items below need owners; most are Matthew's decisions or founder-gated production checks.
post_merge_check: on the merged tip, (a) grep -l "status: OPEN" docs/agents/handoffs/*.md | xargs grep -li claude lists none of the task ids below; (b) every ```text block in docs/agents/HANDOFF_LOG.md whose TASK line reads status: OPEN and whose branch/claimed_by/owner/active_writer names Claude has a docs/agents/handoffs/<TASK-ID>.md that reads status: CLOSED, except Codex-owned blocks; (c) git diff <base>..<tip> -- docs/agents/HANDOFF_LOG.md is empty.
active_writer: Claude session_017UoYKyU27JPpmSh3Cbj7EK
decisions:
  - Final SHAs and merge dates come from GitHub's pulls API (merge_commit_sha, merged_at), read 2026-11-06. Every merged PR's base was verdant-grow-diary.
  - Files: TASK line set to status: CLOSED, one closed: line added, last_updated replaced (old value kept in parentheses). Nothing else in those files changed.
  - HANDOFF_LOG.md blocks: copied verbatim into new docs/agents/handoffs/<TASK-ID>.md files with the same three edits, per docs/agents/handoffs/README.md. HANDOFF_LOG.md is not edited.
  - Closing does not mean the items are done. Every entry's post_merge_check, open_questions and blockers are copied verbatim below unless the whole value is an empty marker (none, N/A, NOT_APPLICABLE, optionally "(docs only)"). None is claimed as measured.
  - QUICKLOG-EVENT-REQUEST-HASH-UTC is closed as dropped (#1846 closed unmerged).
  - ERROR-ANNOUNCEMENTS cites its own PR #2845 as the final SHA; #2852, #2855 and #2856 are listed as related batches (review 5797091224 P3-1).
  - Round 2 (review 5797091224 P2-1, P3-3): round 1's omission filter dropped any value that merely started with none or NOT_APPLICABLE, which lost open items (STRIPE-RECEIPTS-PRIVILEGES production-apply question, RECORD-LIVE-STRIPE-SCHEMA and AI-DOCTOR-OFFLINE-EVAL repository checks, all of CSV-AUDIT-SPEC-P3-CLOSEOUT). The filter now omits only whole-value empty markers. P3-2: DASHBOARD-SINGLE-LOG-ENTRY (#1844) added.
tried_and_rejected: matching squash commits by subject in git history (the checkout is shallow, so 13 PRs were not found); used the GitHub API instead. Round 1 found log blocks by ### heading, which missed a block without one; round 2 scans every ```text block.
commands: generation scripts were scratch-only (not committed). Re-check one entry: gh api repos/Verdant-OS/verdant-grow-diary/pulls/<N> --jq '.merge_commit_sha,.base.ref,.merged_at'
files_touched: 33 existing docs/agents/handoffs/*.md; 23 new docs/agents/handoffs/*.md (22 merged + 1 dropped, from HANDOFF_LOG.md blocks); this file (new)
files_remaining: none
blockers: none for the docs
open_questions: who owns each carried-forward item below (Matthew).
gotchas: non-Claude handoffs (Codex, Grok, Cursor-only) were not audited; two OPEN blocks on claude/* branches with Codex owners (PR-2283-REMOVAL-PAGINATION-REPAIR, PR-2345-BASE-INTEGRATION) are out of scope. Some carried-forward post-merge checks may already be measured elsewhere (CURRENT_STATE or PR comments); that was not checked.
exclusions_for_review: session_017UoYKyU27JPpmSh3Cbj7EK (this writer)
reviewer_seat: round 1: Claude review session (spawned by this writer; disclosed), review 5797091224, filed as COMMENT
reviewer_sha: efe574ec74762bcbd61fa0910e349fdb5d50f673 REQUEST_CHANGES (superseded by round 2)
session_state: no production access used. This session is subscribed to #2916's activity.
claimed_by: Claude session_017UoYKyU27JPpmSh3Cbj7EK, 2026-11-06
owner: Claude
last_updated: 2026-11-11, by Claude session_017UoYKuyQKXVV93JSwJJztt (close-out; previous 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (round 2))
````

## Closed entries (56)

| Task                                          | PR          | Source                                   |
| --------------------------------------------- | ----------- | ---------------------------------------- |
| `AI-DOCTOR-OFFLINE-EVAL`                      | #2903       | existing file                            |
| `AI-DOCTOR-SESSIONS-ERROR-ANNOUNCEMENTS`      | #2855       | existing file                            |
| `ARCH-CONTRACT-COLLISION-AUDIT-20261104`      | #2871       | existing file                            |
| `CLAUDE-MD-NPM-LOCK-RETIRED`                  | #2853       | existing file                            |
| `CLOSE-STALE-GROK-HANDOFF-BLOCKS`             | #2862       | existing file                            |
| `CONTRAST-FOLLOWUPS`                          | #2874       | existing file                            |
| `CONTRAST-TOKENS-SPEC`                        | #2827       | existing file                            |
| `CREATE-TENT-PLANT-FIELD-LABELS`              | #2824       | existing file                            |
| `CULTIVAR-SLUG-RULES-PURE`                    | #2883       | existing file                            |
| `DESTRUCTIVE-TOKEN-SPLIT`                     | #2839       | existing file                            |
| `ECOWITT-CUSTOM-UPLOAD-INGEST-PATH`           | #2849       | existing file                            |
| `ERROR-ANNOUNCEMENTS`                         | #2845       | existing file                            |
| `GROW-ROOM-ERROR-ANNOUNCEMENTS`               | #2852       | existing file                            |
| `GROWER-BUGS-9`                               | #2846       | existing file                            |
| `GROWER-BUGS-10`                              | #2844       | existing file                            |
| `GROWER-BUGS-11`                              | #2851       | existing file                            |
| `GROWER-BUGS-16`                              | #2842       | existing file                            |
| `GROWER-BUGS-20`                              | #2857       | existing file                            |
| `HANDOFF-LOG-PER-FILE`                        | #2860       | existing file                            |
| `MUTED-OPACITY-FLOOR`                         | #2840       | existing file                            |
| `ONE-PRIMARY-CAPTURE-FLOW-SPEC`               | #2831       | existing file                            |
| `PHENO-HUNTS-INDEX-LIST-FIRST`                | #2836       | existing file                            |
| `REA-LIFECYCLE-MARKER-RACE`                   | #2837       | existing file                            |
| `RECORD-LIVE-STRIPE-SCHEMA`                   | #2873       | existing file                            |
| `SENSORS-PAGE-SECTIONS-SPEC`                  | #2833       | existing file                            |
| `SPINE-ERROR-ANNOUNCEMENTS`                   | #2850       | existing file                            |
| `STRIPE-RECEIPTS-PRIVILEGES`                  | #2876       | existing file                            |
| `STRUCTURED-READINGS-REVIEW-FIXES`            | #2863       | existing file                            |
| `TOPOLOGY-RESTAMP-20261104`                   | #2858       | existing file                            |
| `TOUCH-TARGET-MINIMUM`                        | #2841       | existing file                            |
| `UNIFIED-TIMELINE-STREAM-SPEC`                | #2832       | existing file                            |
| `CSV-LIMIT-HANDOFF-CLOSEOUT`                  | #2914       | existing file                            |
| `CSV-AUDIT-SPEC-P3-CLOSEOUT`                  | #2913       | existing file                            |
| `AHREFS-WEB-ANALYTICS-KEY-SWAP`               | #2602       | HANDOFF_LOG.md block, new file           |
| `AI-DOCTOR-REPORT-PREVIEW-FOCUS`              | #2838       | HANDOFF_LOG.md block, new file           |
| `CLAUDE-CODE-ACTION-002`                      | #1825 #1927 | HANDOFF_LOG.md block, new file           |
| `FIRST-VIEWPORT-TASK-FIRST-SPEC`              | #2826       | HANDOFF_LOG.md block, new file           |
| `FIX-2171-PLANT-CREATE-INSERT-ERROR`          | #2192       | HANDOFF_LOG.md block, new file           |
| `FIX-2171-PLANT-HEALTH-NOT-ASSESSED-DISPLAY`  | #2494       | HANDOFF_LOG.md block, new file           |
| `FRESHNESS-LABEL-CONTRAST`                    | #2830       | HANDOFF_LOG.md block, new file           |
| `HANDOFF-CONFIG`                              | #2818       | HANDOFF_LOG.md block, new file           |
| `ONBOARDING-GROWS-READ-ERROR-SUPERSEDES-2540` | #2562       | HANDOFF_LOG.md block, new file           |
| `PHENO-LOCAL-DRAFT-LABELS`                    | #2815       | HANDOFF_LOG.md block, new file           |
| `PR-CLEANUP-2026-10-27-INVENTORY`             | #2556       | HANDOFF_LOG.md block, new file           |
| `PR2072-M7-SERVED-REVISION`                   | #2072       | HANDOFF_LOG.md block, new file           |
| `QUICK-LOG-WATER-VOLUME-UNITS-IMPL`           | #2814       | HANDOFF_LOG.md block, new file           |
| `QUICK-LOG-WATER-VOLUME-UNITS-SPEC`           | #2813       | HANDOFF_LOG.md block, new file           |
| `REPORTS-DIARY-RANGE-REPORT-LINK`             | #2825       | HANDOFF_LOG.md block, new file           |
| `RETIRE-PR2702-STRIPE-EDGE-PATH`              | #2811       | HANDOFF_LOG.md block, new file           |
| `SEO-GSC-AHREFS-RECONCILIATION-20261028`      | #2600       | HANDOFF_LOG.md block, new file           |
| `SEO-NOINDEX-UNKNOWN-GUIDE-SLUGS-20261028`    | #2597       | HANDOFF_LOG.md block, new file           |
| `SETUP-QUICKLOG-DRAFT-P2S-SUPERSEDES-2541`    | #2565       | HANDOFF_LOG.md block, new file           |
| `TIMELINE-GROW-DAY-2005`                      | #2079       | HANDOFF_LOG.md block, new file           |
| `VER-296-START-ROOM-ONE-STEP`                 | #2582       | HANDOFF_LOG.md block, new file           |
| `QUICKLOG-EVENT-REQUEST-HASH-UTC`             | #1846       | HANDOFF_LOG.md block, new file (dropped) |
| `DASHBOARD-SINGLE-LOG-ENTRY`                  | #1844       | HANDOFF_LOG.md block, new file           |

## Carried-forward items

Copied verbatim from each closed entry (`source claim` from that file, not re-verified). A field is omitted only when its whole value is an empty marker (none, N/A, NOT_APPLICABLE, optionally "(docs only)"). A `blockers` line that names only a pre-merge gate (an exact-head review or Matthew's merge yes for that entry's own PR) is historical, because that PR has since merged; it is kept verbatim so nothing is silently dropped. Production checks run on https://verdantgrowdiary.com only, after live `/version.json` reports a SHA that includes the merge, and are founder-gated: this file authorizes no Publish, production APPLY, production write or migration.

### `AI-DOCTOR-OFFLINE-EVAL` (#2903)

- **post_merge_check:** NOT_APPLICABLE to production (tooling only, nothing ships to the app). Repository check: `bunx vitest run src/test/ai-doctor-eval-scoring.test.ts src/test/ai-doctor-eval-cases.test.ts` stays green on verdant-grow-diary after merge.
- **open_questions:** - Eval key: BLOCKED until Matthew creates a dedicated Gemini key. The live baseline has not run; every gate is NOT_MEASURED for the real model.

### `AI-DOCTOR-SESSIONS-ERROR-ANNOUNCEMENTS` (#2855)

- **post_merge_check:** on the live build, with a screen reader, deny clipboard permission and press Copy link on an AI Doctor session; "Copy failed" is read out.
- **open_questions:** once the earlier batches merge, the four guard tests can share one helper with the ancestor check.

### `ARCH-CONTRACT-COLLISION-AUDIT-20261104` (#2871)

- **post_merge_check:** NOT_APPLICABLE (receipt; nothing ships)
- **open_questions:** whether the founder wants this receipt merged or only read; whether a reviewer session spawned by a PR's author session satisfies OWNERSHIP.md section 4.3 (open on #2858, left to the routing seat)
- **blockers:** none for this PR beyond the standard gates: independent exact-head review, 35/35 required checks, the founder's per-item yes

### `CLAUDE-MD-NPM-LOCK-RETIRED` (#2853)

- **post_merge_check:** on the merged tip, `grep -c "synchronized compatibility lock" CLAUDE.md` returns 0, and `node scripts/check-sentinel-version-parity.mjs` reports one version across 18 files
- **blockers:** Reviewer D re-review at the new head; Matthew's merge yes at the new head.

### `CLOSE-STALE-GROK-HANDOFF-BLOCKS` (#2862)

- **post_merge_check:** on the merged deploy tip, each of the twelve files below exists under docs/agents/handoffs/ with status: CLOSED, and HANDOFF_LOG.md is unchanged by this PR
- **open_questions:** owner call on VER-288-SERVED-BUILD-BASELINE and FIX-2004-APP-DOCUMENT-TITLES
- **blockers:** independent re-review; Matthew's yes at the exact head

### `CONTRAST-FOLLOWUPS` (#2874)

- **post_merge_check:** bunx vitest run src/test/muted-text-opacity-floor.test.ts on the deploy tip passes 18/18.

### `CONTRAST-TOKENS-SPEC` (#2827)

- **open_questions:** none (D1 a, D2 a)

### `CREATE-TENT-PLANT-FIELD-LABELS` (#2824)

- **post_merge_check:** after Publish, open Add tent and Add plant on https://verdantgrowdiary.com and confirm a screen reader announces each field. NOT_MEASURED until live /version.json reports the merge SHA.
- **open_questions:** reviewer and merge authority for this PR.

### `CULTIVAR-SLUG-RULES-PURE` (#2883)

- **post_merge_check:** on the live SHA, GET https://verdantgrowdiary.com/cultivars/sour-stomper returns 200 and /cultivars/Sour-Stomper returns 308 to /cultivars/sour-stomper; a failure reopens this task with the same owner. The 503 path is DB-failure-only and is NOT_MEASURED live.

### `DESTRUCTIVE-TOKEN-SPLIT` (#2839)

- **post_merge_check:** on the live build, an error message and a red Delete button read clearly in the default theme; computed colour of .text-destructive is hsl(0 85% 68%).

### `ECOWITT-CUSTOM-UPLOAD-INGEST-PATH` (#2849)

- **post_merge_check:** after a Publish that includes this and a live custom-upload packet, the station card shows that packet's values; a passkey-bridge reading on the same tent does not appear under it. NOT_MEASURED until the custom-upload Edge route exists (#2751) and is deployed.

### `ERROR-ANNOUNCEMENTS` (#2845)

- **post_merge_check:** on the live build, with a screen reader, enter a tent size outside the allowed range in Create Tent; the error is read out and the size field announces it as its description.

### `GROW-ROOM-ERROR-ANNOUNCEMENTS` (#2852)

- **post_merge_check:** on the live build, with a screen reader, enter a non-numeric dry raw point in soil moisture calibration; the error is read out and the field announces it as its description.
- **open_questions:** once #2845 and #2850 merge, the three guard tests can share one helper.

### `GROWER-BUGS-9` (#2846)

- **post_merge_check:** on verdantgrowdiary.com /auth, the Sign in panel shows the crashed-tab reload line; the Create account panel does not
- **open_questions:** Safari/iOS reload-after-crash behaviour NOT_MEASURED

### `GROWER-BUGS-10` (#2844)

- **post_merge_check:** on verdantgrowdiary.com, a plant with more than 20 photo entries shows photos on the newest 20 and "Show photo" on older ones; tapping loads that photo; tab no longer crashes when scrolled to the end
- **open_questions:** Photo history (24) and Recent Quick Logs (10) thumbnails also load originals at 48 px; they overlap the newest photos so they add little, but a thumbnail source would cut more. Tent page "shell for several seconds" not measured in this slice

### `GROWER-BUGS-11` (#2851)

- **post_merge_check:** on verdantgrowdiary.com, sign in as the fixture grower with a grow and no saved start screen; the page goes Loading your grows -> dashboard with no blank page between
- **open_questions:** whether to send growers with grows from /auth straight to `/` (skips the /onboarding hop; behaviour change, not done here)
- **blockers:** ERR_CONNECTION_CLOSED needs the host's request/Worker logs (owner access)

### `GROWER-BUGS-16` (#2842)

- **post_merge_check:** on verdantgrowdiary.com, an account with two grows sees a labelled Grow picker on /timeline; switching changes the grow and drops plant/entry filters
- **open_questions:** item 10 before All grows?

### `GROWER-BUGS-20` (#2857)

- **post_merge_check:** quicklog-smoke workflow_dispatch with the disposable account passes "Verify disposable E2E fixture"; with the owner's account it refuses (personal_account_refused)
- **open_questions:** whether the read-only proofs (signed-in, Actions, Settings) should also move to the disposable account
- **blockers:** disposable account not yet created (owner action)

### `HANDOFF-LOG-PER-FILE` (#2860)

- **post_merge_check:** A new PR adds docs/agents/handoffs/<TASK-ID>.md, leaves HANDOFF_LOG.md untouched, and merges with no log conflict. Failure reopens this work with the same owner.
- **open_questions:** Whether the OWNERSHIP.md low-risk lane should cover docs/agents/handoffs/. #2853 also touches all eighteen governed files, so whichever lands second needs a new Sentinel bump.
- **blockers:** Reviewer APPROVE at the exact head and Matthew's yes.

### `MUTED-OPACITY-FLOOR` (#2840)

- **post_merge_check:** on the live build, the plant quick-status strip's loading and unavailable labels and disabled-link reasons read clearly; Timeline fallback timestamps are no fainter than other muted text.

### `ONE-PRIMARY-CAPTURE-FLOW-SPEC` (#2831)

- **open_questions:** D1 naming of /daily-check; D2 Field Edition placement; D3 number of capture concepts.
- **blockers:** founder decisions D1-D3

### `PHENO-HUNTS-INDEX-LIST-FIRST` (#2836)

- **post_merge_check:** after Publish, open /pheno-hunts on https://verdantgrowdiary.com with the fixture account and confirm the hunt list appears before Keeper stability. NOT_MEASURED until live /version.json reports the merge SHA.
- **open_questions:** reviewer and merge authority for this PR.

### `REA-LIFECYCLE-MARKER-RACE` (#2837)

- **post_merge_check:** required CI stops failing on this test; NOT_MEASURED until several post-merge runs.

### `RECORD-LIVE-STRIPE-SCHEMA` (#2873)

- **post_merge_check:** none on production, because the migration is not applied there by merge and is a no-op by contract. On the merged deploy tip, `node scripts/assert-no-unreviewed-money-migrations.mjs` passes and `bunx vitest run src/test/record-live-stripe-billing-schema-migration.test.ts` passes.
- **open_questions:** whether to tighten stripe_payment_receipts privileges on production (separate change); whether the Cloudflare Worker gets the payment secrets before the code port; where Stripe's webhook endpoint points
- **blockers:** migration and money gates: Matthew's yes at the exact head; independent review

### `SENSORS-PAGE-SECTIONS-SPEC` (#2833)

- **open_questions:** uncertainty: ManualSensorReadingCard.tsx:976 says pH/EC are not stored as sensor metrics, while manualSensorFreshnessRules.ts:10 tracks ph and ec; trace before changing either.
- **blockers:** founder decisions D1-D3

### `SPINE-ERROR-ANNOUNCEMENTS` (#2850)

- **post_merge_check:** on the live build, with a screen reader, make an AI Doctor manual check-in save fail (offline); the failure is read out.
- **open_questions:** once #2845 merges, the two guard tests can share one helper.

### `STRIPE-RECEIPTS-PRIVILEGES` (#2876)

- **post_merge_check:** on the merged tip, node scripts/assert-no-unreviewed-money-migrations.mjs passes. After Matthew's production apply (his decision, not part of this PR): psql against production with -f scripts/sql/verify-stripe-payment-receipts-privileges.sql prints "privilege contract: PASS".
- **open_questions:** none on scope; whether Matthew wants the production apply right after merge
- **blockers:** migration and money gates (Matthew's per-item yes at the exact head); independent review by a non-author seat. verdant-ultra-bot's APPROVE (review 5777677005, at 443e478a, no text) is not that review: roster line 36 says Ultra seats never approve.

### `STRUCTURED-READINGS-REVIEW-FIXES` (#2863)

- **post_merge_check:** on production, type a soil temperature, switch the display unit, save; the saved reading keeps the unit it was typed in.

### `TOPOLOGY-RESTAMP-20261104` (#2858)

- **post_merge_check:** NOT_APPLICABLE (docs-only; no runtime behavior changes)
- **blockers:** M1 BLOCKED (the session's egress hook refused the read); M2/M7/M10 not attempted (NOT_MEASURED); needs Matthew or a session with apex egress

### `TOUCH-TARGET-MINIMUM` (#2841)

- **post_merge_check:** on the live build at phone width, the Info "i" next to a heading, the Daily Grow Check "What is a manual snapshot?" icon and the HyperLog close X each take a 24px tap area.

### `UNIFIED-TIMELINE-STREAM-SPEC` (#2832)

- **open_questions:** D1 stream as default vs tab; D2 note classification (needs write-path change) vs read-only hint; D3 per-type panels.
- **blockers:** founder decisions D1-D3

### `CSV-LIMIT-HANDOFF-CLOSEOUT` (#2914)

- **open_questions:** about 13 other open Claude handoffs dated 2026-11-04/05 were listed but not audited against GitHub; Matthew can ask for that audit.

### `CSV-AUDIT-SPEC-P3-CLOSEOUT` (#2913)

- **post_merge_check:** NOT_APPLICABLE for app behavior (docs only). The audit's own receipt stays NOT_MEASURED until an authorized production-read seat runs it.
- **open_questions:** none new. CSV-TARGET-ROWS-AUDIT-SPEC's open questions carry over unchanged.
- **blockers:** none for the docs. Running the audit needs an authorized production-read seat (Matthew arranging).

### `AHREFS-WEB-ANALYTICS-KEY-SWAP` (#2602)

- **post_merge_check:** on https://verdantgrowdiary.com accept analytics and confirm script[src="https://analytics.ahrefs.com/analytics.js"] carries data-key KZfnjSoVSRYkyDJq+SUsow; NOT_MEASURED until live /version.json reports the merge SHA
- **open_questions:** Ahrefs "Recheck installation" looks for the tag in static HTML, which this site does not serve before consent; whether Ahrefs accepts the consent-gated install is NOT_MEASURED

### `AI-DOCTOR-REPORT-PREVIEW-FOCUS` (#2838)

- **post_merge_check:** on the live build, open AI Doctor Preview report with the keyboard; focus lands on Close; Escape returns focus to Preview report.

### `CLAUDE-CODE-ACTION-002` (#1825 #1927)

- **blockers:** No explicit independent PASS is recorded at the current head 094a74fd. Codex's automated review found no major issues at 71c75f90. Whether that counts as the required PASS, and whether it carries across a base merge only, is Matthew's or Chemdawg's call. CI is not a blocker (35/35 at 094a74fd). Owner decisions still open, each documented as residual risk in docs/agents/claude-slices.md and deferrable as follow-ups: locking the auth namespace passed as a call argument (would newly lock three tree files) and locking non-D1 auth member assignments (would newly lock two tree files). The publish job's receipt posting has not run against a real slice (NOT_MEASURED). No claimed_by PR comment: Matthew said not to post one (2026-10-06).

### `FIRST-VIEWPORT-TASK-FIRST-SPEC` (#2826)

- **open_questions:** D1 next-step card placement; D2 AI Doctor Review alerts; D3 Action Queue landing box; D4 Reports order.
- **blockers:** founder decisions D1-D4

### `FIX-2171-PLANT-CREATE-INSERT-ERROR` (#2192)

- **blockers:** none for the repository change. The unassessed-health label on /plants and the plant page belongs to the #2330 -> #2490 -> #2492 chain (owner decision 2026-10-22); #2140 keeps only its schema work. #2219 (tent-select reopen guard and focus return) is a separate in-flight PR on the same dialog; its lines are left untouched here.

### `FIX-2171-PLANT-HEALTH-NOT-ASSESSED-DISPLAY` (#2494)

- **blockers:** none for the repository change. #2140 was narrowed to its schema work at 373fd162 (plantHealthRules.ts, Plants.tsx and the label tests back to base; plants-page-unassessed-health-label.test.tsx deleted), so plantHealthStatusLabel exists in this PR only.

### `FRESHNESS-LABEL-CONTRAST` (#2830)

- **post_merge_check:** after Publish, open a plant with a stale manual reading on https://verdantgrowdiary.com and confirm the stale and missing lines read clearly. NOT_MEASURED until live /version.json reports the merge SHA.
- **open_questions:** reviewer and merge authority for this PR.

### `HANDOFF-CONFIG` (#2818)

- **post_merge_check:** none (agent tooling config; no runtime effect).
- **open_questions:** reviewer and merge authority

### `ONBOARDING-GROWS-READ-ERROR-SUPERSEDES-2540` (#2562)

- **post_merge_check:** NOT_APPLICABLE for production without a forced malformed read; covered by onboarding-null-grows-render.test.tsx
- **open_questions:** this PR modifies four scorer-locked tests relative to base (grow-data-deadline-late-meta, slow-loading-screen-gates, starter-setup-onboarding, tent-detail-plant-list-read-state); they need Matthew's OK or a revert before merge
- **blockers:** PGRST301 design decision (Matthew)

### `PHENO-LOCAL-DRAFT-LABELS` (#2815)

- **post_merge_check:** after Publish, open a fixture pheno hunt workspace on https://verdantgrowdiary.com and confirm the card shows "Save to account" and an outline "Save draft on this device" under "Candidate documentation (this device only)". NOT_MEASURED until live /version.json reports the merge SHA.

### `PR-CLEANUP-2026-10-27-INVENTORY` (#2556)

- **post_merge_check:** NOT_APPLICABLE (inventory doc; not a feature)
- **open_questions:** Needs Matthew: (1) #2140 is NOT a duplicate (corrected 2026-10-28): it drops the plants.health NOT NULL and the 'unknown' default that 20260924120000 set, so keep it or close it as a product call; (2) Phase 4 go-ahead; (3) where to run the #2032 type generation.
- **blockers:** #2032's regenerated Supabase types for badge_evidence.harvest_id are BLOCKED in this container: there's no Docker daemon and no Supabase CLI for `bun run sb:types:local`, production lacks migration 20261027235500, and types.ts must not be hand-edited.

### `PR2072-M7-SERVED-REVISION` (#2072)

- **blockers:** 35/35 required checks were PASS at 4c2042175, but do not cover the new repair head. Independent exact-head acceptance and new-head CI remain NOT_MEASURED until obtained. Live M7 and availability of authoritative per-response binding evidence remain NOT_MEASURED; missing proof must not become a routing PASS/FAIL.

### `QUICK-LOG-WATER-VOLUME-UNITS-IMPL` (#2814)

- **post_merge_check:** after Publish, on https://verdantgrowdiary.com with the fixture account, choose gal, enter 1, save a tagged [smoke <timestamp>] Water entry, and confirm the Timeline shows 3785 ml. NOT_MEASURED until live /version.json reports the merge SHA.

### `QUICK-LOG-WATER-VOLUME-UNITS-SPEC` (#2813)

- **post_merge_check:** docs only; none until the implementation slice.
- **open_questions:** none (D1-D3 decided)

### `REPORTS-DIARY-RANGE-REPORT-LINK` (#2825)

- **post_merge_check:** after Publish, open Reports on https://verdantgrowdiary.com with the fixture account and follow "Diary range report (PDF)" to the last-30-days report for the selected grow. NOT_MEASURED until live /version.json reports the merge SHA.
- **open_questions:** reviewer and merge authority; founder decision on reordering Reports cards so reports with data lead.

### `RETIRE-PR2702-STRIPE-EDGE-PATH` (#2811)

- **post_merge_check:** on the merged deploy tip, `git ls-tree -r --name-only origin/verdant-grow-diary | grep -cE "create-checkout-session/|stripe-webhook/|stripeWebhook|stripeCheckoutSession|stripeTestModeCatalog"` returns 0, and `node scripts/sync-edge-shared.mjs --check` passes
- **open_questions:** whether to add an operator note that 20261101180000 must never be applied (CURRENT_STATE row, owner's call)
- **blockers:** money gate: Matthew's yes at the exact head SHA before queueing

### `SEO-GSC-AHREFS-RECONCILIATION-20261028` (#2600)

- **post_merge_check:** NOT_APPLICABLE (docs-only measurement receipt; no shipped behavior)
- **open_questions:** Is project 10225273 or 10204962 the Ahrefs project of record?
- **blockers:** GSC property identity and the cause of the missing rows after 2026-10-01, both NOT_MEASURED from the API (owner, Ahrefs project settings)

### `SEO-NOINDEX-UNKNOWN-GUIDE-SLUGS-20261028` (#2597)

- **post_merge_check:** Once live /version.json reports the merge SHA, GET https://verdantgrowdiary.com/guides/does-not-exist and confirm one <meta name="robots" content="noindex, follow"> and no rel=canonical; NOT_MEASURED until then.
- **blockers:** none for repository work. The 2026-10-28 Actions outage cleared; non-required Dependency & Security CI is red on the base's @hono/node-server advisory until #2605 lands; required ci.yml checks skip while draft.

### `SETUP-QUICKLOG-DRAFT-P2S-SUPERSEDES-2541` (#2565)

- **post_merge_check:** after Publish, on the fixture account, open Quick Log for plant A, type a note, close; open for plant B: no note. NOT_MEASURED until live /version.json reports the SHA.
- **open_questions:** put to Matthew 2026-10-28: (1) Codex 4396973931, a deleted tent restores the plant step and every plant insert fails closed; fix here or in a follow-up? (2) Copilot 4397048019, busy flag can carry across an account switch during one in-flight save; no data crosses accounts; not changed. (3) CodeRabbit Major 2, persist Water/Feed inputs. (4) Copilot 4396952153, keep typed tent/plant names when the stored grow is gone (kept by design)
- **blockers:** none for repository work

### `TIMELINE-GROW-DAY-2005` (#2079)

- **blockers:** none for the repository change

### `VER-296-START-ROOM-ONE-STEP` (#2582)

- **post_merge_check:** after Publish, on the disposable fixture account with no grow, open Start Your Room, type a plant name, submit once: Plant Detail opens with Quick Log and the grow/tent/plant exist once each. NOT_MEASURED until live /version.json reports the SHA.
- **open_questions:** retry help text in startYourRoomDraftRules.ts still says "Retry saves this same step once" (copy left to Cheeko); put to Matthew 2026-10-28: Copilot 4397044004/4397135162, after a partial failure the bound line says "your grow" for a grow saved as "My grow" (cosmetic; not changed)
- **blockers:** none for repository work

### `QUICKLOG-EVENT-REQUEST-HASH-UTC` (#1846)

- **blockers:** Independent exact-head review; Matthew's separate migration merge/ship decision. CI at 45cdac32: 35/35 required SUCCESS (re-read 2026-10-16). Deep migration review not performed. #1841 merged 2026-10-13 as feb94d9ad.
