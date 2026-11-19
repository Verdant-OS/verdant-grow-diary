# Stale branches in verdant-grow-diary

Audit date: 2026-11-11. Read-only. Nothing was deleted, pushed, labelled or commented on.

## Summary

- Remote branches in total: **724** (measured, `git branch -r` after a fresh fetch).
- Stale, meaning the last commit is older than 30 days (before 2026-10-12): **320** (measured). The oldest is from 2026-05-13 and the newest stale one from 2026-10-11.
- Stale branches whose content is already in `main`: **43** (measured). "Merged" here means the branch is an ancestor of `main`, or merging it into `main` changes no files (`git merge-tree`).
- Stale branches not proven merged: **277** (measured).
- Stale branches whose content is in the deploy branch `verdant-grow-diary`: **0** by the same test (measured).
- Stale branches with an open pull request: **0** (measured). The only three open PRs are #2922, #2923 and #2928, and all three heads are recent.

## Read this before acting on the list

- Merges here are squash merges through the merge queue. A squashed branch is never an ancestor of its base, and if anything changed the same lines later, the content test also says "not merged". So "not proven merged" does **not** mean the work was lost. Whether each one landed through a PR is NOT_MEASURED.
- The 0 for the deploy branch comes from the same limit, not from proof that none of this work shipped.
- No branch should be deleted from this list without the owner's yes, branch by branch or by prefix.

## Count by prefix

| Prefix | Stale | Content in main |
|---|---|---|
| copilot/ | 101 | 32 |
| codex/ | 57 | 0 |
| cursor/ | 46 | 0 |
| claude/ | 26 | 0 |
| fix/ | 21 | 5 |
| grok/ | 15 | 0 |
| (no prefix, incl. 5 lovable-sync*) | 14 | 1 |
| canopy/ | 6 | 0 |
| preserve/ | 5 | 0 |
| perf/ | 4 | 0 |
| feature/ | 4 | 2 |
| feat/ | 3 | 1 |
| agent/ | 3 | 0 |
| tmp/, release/, qa/, governance/, code-health/, chore/ | 2 each | 0 |
| revert-1737-codex/ | 1 | 0 |
| docs/ | 1 | 1 |
| copy/ | 1 | 1 |

## Full list

Status column: "merged into main (ancestor)" or "merged into main (content)" or "not proven merged".

### copilot/ (101 branches, 32 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-05-13 | `copilot/explain-repository-structure` | merged into main (ancestor) |
| 2026-05-25 | `copilot/add-cache-action` | merged into main (ancestor) |
| 2026-05-25 | `copilot/add-sensor-snapshot-panel-tests` | not proven merged |
| 2026-05-25 | `copilot/analyze-test-coverage` | merged into main (ancestor) |
| 2026-05-25 | `copilot/fix-query-timeout-in-withfallback` | merged into main (ancestor) |
| 2026-05-25 | `copilot/nex-5-define-sensor-reading-schema` | merged into main (ancestor) |
| 2026-05-26 | `copilot/add-onboarding-guidance-daily-checks` | merged into main (ancestor) |
| 2026-05-26 | `copilot/approve-workflow-run` | merged into main (ancestor) |
| 2026-05-26 | `copilot/build-follow-up-outcome-capture` | merged into main (ancestor) |
| 2026-05-26 | `copilot/copilotfix-ci-failures` | not proven merged |
| 2026-05-26 | `copilot/fix-ci-failures` | not proven merged |
| 2026-05-26 | `copilot/fix-ci-failures-pr-29` | merged into main (content) |
| 2026-05-26 | `copilot/fix-ci-lint-issue-16` | merged into main (ancestor) |
| 2026-05-26 | `copilot/fix-datadog-secrets-guard` | merged into main (ancestor) |
| 2026-05-26 | `copilot/fix-live-db-check-constraint-blocker` | not proven merged |
| 2026-05-26 | `copilot/fix-migration-idempotency` | not proven merged |
| 2026-05-26 | `copilot/fix-static-safety-test-comment` | merged into main (ancestor) |
| 2026-05-26 | `copilot/hotfix-outcome-capture-cleanup` | not proven merged |
| 2026-05-26 | `copilot/improve-alert-detail-clarity` | merged into main (ancestor) |
| 2026-05-26 | `copilot/issue-14-ui-copy-changes` | merged into main (ancestor) |
| 2026-05-26 | `copilot/issue-16-unblock-ci-lint` | merged into main (ancestor) |
| 2026-05-26 | `copilot/nex-5-sensor-reading-normalization` | not proven merged |
| 2026-05-26 | `copilot/nex-5-sensor-reading-normalization-again` | merged into main (ancestor) |
| 2026-05-26 | `copilot/nex-5-validate-sensor-reading-schema` | merged into main (ancestor) |
| 2026-05-26 | `copilot/nex-7-build-approval-required-handoff` | merged into main (ancestor) |
| 2026-05-26 | `copilot/nex-8-setup-verdc-command-center-preview` | merged into main (ancestor) |
| 2026-05-26 | `copilot/post-merge-smoke-check` | merged into main (ancestor) |
| 2026-05-26 | `copilot/restore-no-explicit-any-lint` | merged into main (ancestor) |
| 2026-05-26 | `copilot/update-datadog-synthetics-workflow` | merged into main (ancestor) |
| 2026-05-26 | `copilot/verify-return-path-plant-detail` | merged into main (ancestor) |
| 2026-05-27 | `copilot/add-focused-npm-bun-script` | merged into main (ancestor) |
| 2026-05-27 | `copilot/add-recent-ai-doctor-sessions-panel` | merged into main (ancestor) |
| 2026-05-27 | `copilot/add-sensor-source-health-card` | not proven merged |
| 2026-05-27 | `copilot/add-sensor-source-health-card-again` | not proven merged |
| 2026-05-27 | `copilot/auditfull-website-error-scan` | not proven merged |
| 2026-05-27 | `copilot/auditfull-website-error-scan-again` | not proven merged |
| 2026-05-27 | `copilot/build-pricing-founder-lifetime-pages` | not proven merged |
| 2026-05-27 | `copilot/create-verdant-bridge-token-docs` | not proven merged |
| 2026-05-27 | `copilot/deployment-drift-audit` | merged into main (ancestor) |
| 2026-05-27 | `copilot/expand-gate-2a-safety-test-cases` | not proven merged |
| 2026-05-27 | `copilot/extend-validate-sensor-reading` | not proven merged |
| 2026-05-27 | `copilot/extract-comment-stripping-and-banned-token-safety` | not proven merged |
| 2026-05-27 | `copilot/harden-full-jitter-implementation` | not proven merged |
| 2026-05-27 | `copilot/refactor-gate-safety-tests` | not proven merged |
| 2026-05-27 | `copilot/replace-hardcoded-vpd-thresholds` | not proven merged |
| 2026-05-27 | `copilot/wire-bridge-token-authentication` | not proven merged |
| 2026-06-03 | `copilot/add-compact-sensor-snapshot-strip` | merged into main (ancestor) |
| 2026-06-03 | `copilot/add-sensor-snapshot-strip` | not proven merged |
| 2026-06-03 | `copilot/fix-lint-issues-pr-43` | not proven merged |
| 2026-06-03 | `copilot/fix-quick-log-sensor-snapshot` | not proven merged |
| 2026-06-03 | `copilot/lint-fix-41` | not proven merged |
| 2026-06-06 | `copilot/run-ecowatt-canary-dry-run` | not proven merged |
| 2026-06-09 | `copilot/copilotfix-quick-log-playwright-smoke` | not proven merged |
| 2026-06-09 | `copilot/fix-quick-log-playwright-smoke` | not proven merged |
| 2026-06-09 | `copilot/verdant-grow-diary` | merged into main (ancestor) |
| 2026-06-09 | `copilot/verdant-grow-diary-again` | merged into main (ancestor) |
| 2026-06-09 | `copilot/verdant-grow-diary-another-one` | merged into main (ancestor) |
| 2026-06-20 | `copilot/docsecowitt-pc-checklist-script` | merged into main (ancestor) |
| 2026-06-20 | `copilot/fixggs-real-payload-safety-test-syntax` | merged into main (ancestor) |
| 2026-06-26 | `copilot/verdant-grow-diary-copy-files` | not proven merged |
| 2026-07-14 | `copilot/review-session-history` | not proven merged |
| 2026-07-14 | `copilot/stop-all-agent-work` | not proven merged |
| 2026-08-15 | `copilot/fix-282366214-1238245861-82f5a1d9-fe2d-49a3-8012-c574c6fcf66e` | not proven merged |
| 2026-09-02 | `copilot/fix-bug-in-grow-diary` | not proven merged |
| 2026-09-10 | `copilot/feature1151-background-color` | not proven merged |
| 2026-09-15 | `copilot/fix-github-actions-job-failure` | not proven merged |
| 2026-09-16 | `copilot/fix-failing-github-actions-job` | not proven merged |
| 2026-09-16 | `copilot/fix-github-actions-job` | not proven merged |
| 2026-09-16 | `copilot/fix-github-actions-job-again` | not proven merged |
| 2026-09-17 | `copilot/fix-github-actions-job-another-one` | not proven merged |
| 2026-09-17 | `copilot/fix-github-actions-job-yet-again` | not proven merged |
| 2026-09-23 | `copilot/fix-github-actions-job-one-more-time` | not proven merged |
| 2026-09-23 | `copilot/fix-github-actions-job-please-work` | not proven merged |
| 2026-09-24 | `copilot/fix-failing-github-actions-job-again` | not proven merged |
| 2026-09-24 | `copilot/fix-failing-github-actions-job-another-one` | not proven merged |
| 2026-09-24 | `copilot/fix-failing-github-actions-job-one-more-time` | not proven merged |
| 2026-09-24 | `copilot/fix-failing-github-actions-job-yet-again` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-0ba55aba-2fcf-4533-9a92-5cb7cb240441` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-1c9a2fac-9480-48fa-ab8a-1a1473c0ab77` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-56fc15e8-47fa-4805-899f-ca4581fb9dec` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-7fe89879-ef42-42fa-980d-16cb4696bc05` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-96356bb8-ebf8-4147-a35e-d9c0bade6bee` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-995d423c-a21b-47f8-a1aa-327430fdd0a6` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-a5b58367-a707-4e16-a628-c60410e712e4` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-be973dc9-865c-4442-91e6-351e7f3066b6` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-cb9fca9f-7140-4e94-af8b-e792c0320b02` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-cd3c1066-8507-4c70-9e8c-0dc8858cfc1b` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-failure-again` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-fc536b34-e94f-494c-9d82-a0c34a11797e` | not proven merged |
| 2026-09-24 | `copilot/fix-github-actions-job-ff8d7ced-f28e-44bf-ac8a-494490aec0a8` | not proven merged |
| 2026-09-25 | `copilot/fix-github-actions-job-87ce8d1e-8048-4455-a2ed-4bb085bddbda` | not proven merged |
| 2026-09-25 | `copilot/fix-github-actions-job-a823d9e9-bf99-4621-bb07-bcbffcdda8b9` | not proven merged |
| 2026-09-25 | `copilot/fix-github-actions-job-e2c43a83-be32-489b-b670-b302e0bdbac2` | not proven merged |
| 2026-09-25 | `copilot/fix-github-actions-job-failure-another-one` | not proven merged |
| 2026-09-27 | `copilot/gdp-sensor-restore-tests-001` | not proven merged |
| 2026-09-28 | `copilot/gdp-sensor-restore-tests-001-again` | not proven merged |
| 2026-09-29 | `copilot/1688-move-snapshot-freshness` | not proven merged |
| 2026-09-29 | `copilot/fix-quick-log-saving-issue` | not proven merged |
| 2026-09-29 | `copilot/merge-1752-review-p2` | not proven merged |
| 2026-09-29 | `copilot/relax-quick-log-tent-gating` | not proven merged |
| 2026-09-29 | `copilot/seo-noindex-signed-in-app-screens` | not proven merged |

### codex/ (57 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-16 | `codex/cultivar-seo-20260716` | not proven merged |
| 2026-07-18 | `codex/verdant-trust-core-deploy` | not proven merged |
| 2026-07-18 | `codex/verdant-trust-core-sensor-truth` | not proven merged |
| 2026-07-28 | `codex/premium-e2e-cleanup-deploy` | not proven merged |
| 2026-07-30 | `codex/edge-shared-mirror-sync` | not proven merged |
| 2026-07-30 | `codex/seo-foundation-audit-and-p0-fixes` | not proven merged |
| 2026-08-07 | `codex/verdant-grow-walk-design-20260807` | not proven merged |
| 2026-08-12 | `codex/cultivar-seo-crawl-paths` | not proven merged |
| 2026-08-12 | `codex/fix-protected-analytics-paths` | not proven merged |
| 2026-08-12 | `codex/quick-log-timeline-675` | not proven merged |
| 2026-08-13 | `codex/convex-component-physical-sandbox-spike` | not proven merged |
| 2026-08-19 | `codex/one-tent-loop-plant-refresh` | not proven merged |
| 2026-08-20 | `codex/one-tent-authenticated-proof-current` | not proven merged |
| 2026-08-21 | `codex/quicklog-stale-target-fail-closed-20260821` | not proven merged |
| 2026-08-22 | `codex/guide-social-card-navigation-20260822` | not proven merged |
| 2026-08-23 | `codex/one-tent-carry-integrity-prereq-20260823` | not proven merged |
| 2026-08-23 | `codex/restore-sandbox-migration-history-20260823` | not proven merged |
| 2026-08-25 | `codex/agent-integrations-reconsent-fixture` | not proven merged |
| 2026-08-25 | `codex/mcp-sensor-source-confidence` | not proven merged |
| 2026-08-25 | `codex/pr1113-production-ledger-baseline-20260825` | not proven merged |
| 2026-08-26 | `codex/knowledge-corpus-promotion-gate-20260826` | not proven merged |
| 2026-08-26 | `codex/knowledge-corpus-validator-20260826` | not proven merged |
| 2026-08-26 | `codex/knowledge-rendered-discovery-graph-20260826` | not proven merged |
| 2026-08-26 | `codex/knowledge-symptom-evidence-cohort-20260826` | not proven merged |
| 2026-08-29 | `codex/ecowitt-basic-auth-redaction-20260829` | not proven merged |
| 2026-09-12 | `codex/clarify-free-history-copy-20260912` | not proven merged |
| 2026-09-12 | `codex/note-rpc-response-loss-proof-20260912` | not proven merged |
| 2026-09-12 | `codex/plant-alert-read-state-20260912` | not proven merged |
| 2026-09-12 | `codex/resync-doctor-edge-mirror-20260912` | not proven merged |
| 2026-09-15 | `codex/plant-readpath-agreement-wait-20260915` | not proven merged |
| 2026-09-16 | `codex/activity-retry-confirmation-20260916` | not proven merged |
| 2026-09-16 | `codex/native-activity-lost-reply-20260916` | not proven merged |
| 2026-09-16 | `codex/native-activity-retry-confirmation-proof-20260916` | not proven merged |
| 2026-09-16 | `codex/native-auth-single-fill-probe-20260916` | not proven merged |
| 2026-09-16 | `codex/native-csv-account-departure-20260917` | not proven merged |
| 2026-09-16 | `codex/native-manual-lost-reply-probe-20260916` | not proven merged |
| 2026-09-16 | `codex/native-manual-retry-confirmation-proof-20260916` | not proven merged |
| 2026-09-16 | `codex/native-plant-photo-confirmed-20260916` | not proven merged |
| 2026-09-16 | `codex/native-plant-photo-lost-reply-20260916` | not proven merged |
| 2026-09-16 | `codex/native-revision-lost-reply-20260916` | not proven merged |
| 2026-09-16 | `codex/native-save-retrieve-proof-hidden-conflict-20260916` | not proven merged |
| 2026-09-16 | `codex/retire-hollow-production-env-20260915` | not proven merged |
| 2026-09-16 | `codex/vercel-telemetry-consent-20260916` | not proven merged |
| 2026-09-20 | `codex/manual-snapshot-reload-recovery-20260917` | not proven merged |
| 2026-09-26 | `codex/fingerprint-copy-diagnostics-20260924` | not proven merged |
| 2026-09-29 | `codex/chem-actions-readonly-proof-001` | not proven merged |
| 2026-09-29 | `codex/chem-settings-account-consent-proof-001` | not proven merged |
| 2026-09-29 | `codex/save-retrieve-integration-proof-20260927` | not proven merged |
| 2026-09-30 | `codex/chem-signedin-performance-001` | not proven merged |
| 2026-09-30 | `codex/timeline-manual-observation-date-20260926` | not proven merged |
| 2026-10-01 | `codex/chem-production-quicklog-fixture-001` | not proven merged |
| 2026-10-01 | `codex/quicklog-active-replay-fence-20260926` | not proven merged |
| 2026-10-01 | `codex/quicklog-event-retracted-replay-fence-20260926` | not proven merged |
| 2026-10-02 | `codex/starter-water-receipt-validation-20260923` | not proven merged |
| 2026-10-08 | `codex/claude-code-action-slices-20260928` | not proven merged |
| 2026-10-10 | `codex/hosting-migration-phase1-plan` | not proven merged |
| 2026-10-11 | `codex/release-receipt-summary-honesty-001` | not proven merged |

### cursor/ (46 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-08-01 | `cursor/bind-tent-plant-grow-setup-5c02` | not proven merged |
| 2026-08-01 | `cursor/harden-cloud-install-d2f8` | not proven merged |
| 2026-08-13 | `cursor/founder-staff-credit-copy-de45` | not proven merged |
| 2026-08-15 | `cursor/g0-loop-g3-evidence-5dbe` | not proven merged |
| 2026-08-22 | `cursor/ecowitt-v0-temp-unit-safety-5ba1` | not proven merged |
| 2026-08-24 | `cursor/e2e-census-smoke-fail-closed-faaf` | not proven merged |
| 2026-08-25 | `cursor/ecowitt-ingest-readiness-9bcd` | not proven merged |
| 2026-08-28 | `cursor/profiles-gamification-triggers-ledger-a244` | not proven merged |
| 2026-08-28 | `cursor/quicklog-strip-non-live-coherence-23bb` | not proven merged |
| 2026-08-28 | `cursor/quicklog-unify-strip-non-live-e8ed` | not proven merged |
| 2026-09-04 | `cursor/agreements-gate-stay-on-grows-dc95` | not proven merged |
| 2026-09-05 | `cursor/visit-checkpoint-resurface-v0-643a` | not proven merged |
| 2026-09-08 | `cursor/oauth-hash-wipe-before-session-2a39` | not proven merged |
| 2026-09-09 | `cursor/doctor-manual-window-validation-31da` | not proven merged |
| 2026-09-10 | `cursor/timeline-manual-snapshot-measurements-f673` | not proven merged |
| 2026-09-12 | `cursor/missing-test-coverage-7eb2` | not proven merged |
| 2026-09-13 | `cursor/missing-test-coverage-6261` | not proven merged |
| 2026-09-13 | `cursor/missing-test-coverage-656e` | not proven merged |
| 2026-09-13 | `cursor/missing-test-coverage-dfa6` | not proven merged |
| 2026-09-13 | `cursor/sync-edge-shared-preflight-6206` | not proven merged |
| 2026-09-15 | `cursor/csv-import-unconfirmed-honesty-d904` | not proven merged |
| 2026-09-15 | `cursor/refund-001-test-coverage` | not proven merged |
| 2026-09-16 | `cursor/env-retire-001-4f47` | not proven merged |
| 2026-09-16 | `cursor/missing-test-coverage-9e19` | not proven merged |
| 2026-09-16 | `cursor/missing-test-coverage-a13d` | not proven merged |
| 2026-09-16 | `cursor/missing-test-coverage-b1f9` | not proven merged |
| 2026-09-16 | `cursor/plant-tent-read-state-57f8` | not proven merged |
| 2026-09-17 | `cursor/missing-test-coverage-3025` | not proven merged |
| 2026-09-17 | `cursor/missing-test-coverage-b8c6` | not proven merged |
| 2026-09-20 | `cursor/missing-test-coverage-3113` | not proven merged |
| 2026-09-20 | `cursor/missing-test-coverage-b19f` | not proven merged |
| 2026-09-20 | `cursor/missing-test-coverage-pr1542` | not proven merged |
| 2026-09-21 | `cursor/missing-test-coverage-2b69` | not proven merged |
| 2026-09-21 | `cursor/missing-test-coverage-sensor-cohort-guards` | not proven merged |
| 2026-09-21 | `cursor/missing-test-coverage-tent-revision-guards` | not proven merged |
| 2026-09-22 | `cursor/breeding-nav-growid-001-d4f3` | not proven merged |
| 2026-09-22 | `cursor/labs-pheno-growid-3aef` | not proven merged |
| 2026-09-22 | `cursor/missing-test-coverage-1761` | not proven merged |
| 2026-09-22 | `cursor/missing-test-coverage-grow-detail-secondary-nav` | not proven merged |
| 2026-09-22 | `cursor/missing-test-coverage-pr1601` | not proven merged |
| 2026-09-25 | `cursor/missing-test-coverage-9021` | not proven merged |
| 2026-09-29 | `cursor/an-verdant-feeding-demo-7026` | not proven merged |
| 2026-10-03 | `cursor/missing-test-coverage-bcbd` | not proven merged |
| 2026-10-05 | `cursor/missing-test-coverage-cc1b` | not proven merged |
| 2026-10-09 | `cursor/cloud-agent-environment-8de1` | not proven merged |
| 2026-10-10 | `cursor/manual-snapshot-ppfd-ec88` | not proven merged |

### claude/ (26 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-08-19 | `claude/one-tent-loop-efficiency-be0dot` | not proven merged |
| 2026-08-20 | `claude/one-tent-b3a-recovery-parity` | not proven merged |
| 2026-08-21 | `claude/one-tent-d5-suggestion-coverage` | not proven merged |
| 2026-08-22 | `claude/one-tent-b6-sensors-plant-intent` | not proven merged |
| 2026-08-22 | `claude/one-tent-b6-wire-timeline-carry` | not proven merged |
| 2026-08-22 | `claude/verdant-roadmap-9ut09q` | not proven merged |
| 2026-08-29 | `claude/post-grow-report-redaction-ordering` | not proven merged |
| 2026-08-29 | `claude/proof-report-header-assignment-leak` | not proven merged |
| 2026-08-29 | `claude/report-header-prefixed-assignment-leak` | not proven merged |
| 2026-08-29 | `claude/trustbadge-attachable-strip-copilot-followup` | not proven merged |
| 2026-08-30 | `claude/gdp-parameterized-remainder` | not proven merged |
| 2026-09-01 | `claude/agent-state-paste-update-hk7enh` | not proven merged |
| 2026-09-01 | `claude/current-state-restamp-1231` | not proven merged |
| 2026-09-02 | `claude/test-coverage-analysis-j0bz93` | not proven merged |
| 2026-09-22 | `claude/current-state-restamp-8b73c140` | not proven merged |
| 2026-09-24 | `claude/current-state-restamp-98fdd446` | not proven merged |
| 2026-09-24 | `claude/loving-einstein-0fpfi9` | not proven merged |
| 2026-09-25 | `claude/apply-quicklog-revision-idempotent-replay` | not proven merged |
| 2026-09-25 | `claude/upbeat-davinci-1rf5ix` | not proven merged |
| 2026-09-26 | `claude/native-save-retrieve-review-cypvx6` | not proven merged |
| 2026-09-27 | `claude/clever-davinci-hk7o03` | not proven merged |
| 2026-09-29 | `claude/current-state-restamp-08994aa8` | not proven merged |
| 2026-10-01 | `claude/probe-1774-startup-new` | not proven merged |
| 2026-10-01 | `claude/probe-1774-startup-old` | not proven merged |
| 2026-10-03 | `claude/architecture-contract-ac81-restamp` | not proven merged |
| 2026-10-10 | `claude/current-state-1827-status` | not proven merged |

### fix/ (21 branches, 5 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-05-18 | `fix/aikido-security-update-packages-36211467-ifwy` | merged into main (ancestor) |
| 2026-05-18 | `fix/aikido-security-update-packages-36212555-ewrs` | merged into main (ancestor) |
| 2026-05-18 | `fix/aikido-security-update-packages-36213136-evzr` | merged into main (ancestor) |
| 2026-05-26 | `fix/verify-seed-strict-lint` | merged into main (ancestor) |
| 2026-06-09 | `fix/e2e-fixture-mobile-safety` | not proven merged |
| 2026-06-19 | `fix/recent-quick-log-dedupe` | not proven merged |
| 2026-06-27 | `fix/main-stabilization-genetics-scanners` | merged into main (ancestor) |
| 2026-07-22 | `fix/full-suite-bun-pinning` | not proven merged |
| 2026-07-22 | `fix/pin-bun-version-workflows` | not proven merged |
| 2026-07-23 | `fix/full-suite-batches-1-5-10` | not proven merged |
| 2026-07-23 | `fix/repo-ci-green` | not proven merged |
| 2026-07-23 | `fix/workflow-policy-release-gates-20260722` | not proven merged |
| 2026-07-25 | `fix/strain-reference-library-union-types` | not proven merged |
| 2026-07-29 | `fix/p3-noopener-and-quicklog-picker-intent` | not proven merged |
| 2026-08-02 | `fix/pheno-evidence-handoff-tentless` | not proven merged |
| 2026-08-02 | `fix/pheno-hunt-candidate-grow-binding` | not proven merged |
| 2026-08-03 | `fix/ga4-production-measurement-id` | not proven merged |
| 2026-08-03 | `fix/ssr-supabase-init-hardening` | not proven merged |
| 2026-08-03 | `fix/vitest-use-declared-plugin-react` | not proven merged |
| 2026-08-07 | `fix/v0-loop-stale-fixture-manual-24h-window` | not proven merged |
| 2026-08-12 | `fix/alert-persistence-live-window-all-sources` | not proven merged |

### grok/ (15 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-19 | `grok/cultivar-filter-crawl-gate-20260719` | not proven merged |
| 2026-08-02 | `grok/p0-pure-safety-unit-tests` | not proven merged |
| 2026-08-02 | `grok/strict-null-checks` | not proven merged |
| 2026-08-02 | `grok/strict-null-checks-v2` | not proven merged |
| 2026-08-03 | `grok/sensor-truth-canon-freshness-592` | not proven merged |
| 2026-08-03 | `grok/sensor-truth-canon-residual-592` | not proven merged |
| 2026-08-04 | `grok/bridge-token-mint-sequence` | not proven merged |
| 2026-08-04 | `grok/fix-bridge-plantuml-truth` | not proven merged |
| 2026-08-05 | `grok/docs-merge-queue` | not proven merged |
| 2026-08-07 | `grok/constant-time-equal` | not proven merged |
| 2026-08-07 | `grok/tent-alert-history-pro` | not proven merged |
| 2026-08-12 | `grok/seo-public-surface-docs-20260812` | not proven merged |
| 2026-08-13 | `grok/aq-snapshot-quality-chip` | not proven merged |
| 2026-08-13 | `grok/pheno-sensor-fail-closed-comments` | not proven merged |
| 2026-08-25 | `grok/docs-plantuml-text-alternatives` | not proven merged |

### (no prefix) (14 branches, 1 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-06-10 | `quicklog-rpc-runtime-hardening` | not proven merged |
| 2026-06-17 | `__tree_probe_0618` | merged into main (ancestor) |
| 2026-06-17 | `cleanup-tree-probe-0617` | not proven merged |
| 2026-07-15 | `lovable-sync-1784145046` | not proven merged |
| 2026-07-22 | `lovable-sync-1784682653` | not proven merged |
| 2026-10-01 | `lovable-sync` | not proven merged |
| 2026-10-04 | `explore-repo-3961299958665401887` | not proven merged |
| 2026-10-04 | `lovable-sync-1791137802` | not proven merged |
| 2026-10-04 | `perf-optimize-daily-grow-check-17183534313972026706` | not proven merged |
| 2026-10-05 | `perf-environment-trends-loop-1579417957812185399` | not proven merged |
| 2026-10-05 | `perf-fix-n-plus-one-email-queue-2715054334652062529` | not proven merged |
| 2026-10-05 | `performance-use-ingest-inspector-readings-11099729169302100342` | not proven merged |
| 2026-10-07 | `lovable-sync-1791392520` | not proven merged |
| 2026-10-09 | `jules-7546930804461220862-bb7c6bbe` | not proven merged |

### canopy/ (6 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-10-10 | `canopy/lockfile-reviewby-boundary-test` | not proven merged |
| 2026-10-11 | `canopy/bun-lock-public-registry` | not proven merged |
| 2026-10-11 | `canopy/ecowitt-cloud-direct-contract` | not proven merged |
| 2026-10-11 | `canopy/tent-stage-badge-and-feeding-cadence` | not proven merged |
| 2026-10-11 | `canopy/timeline-count-consistency` | not proven merged |
| 2026-10-11 | `canopy/tokens-b-mobile-size-floor` | not proven merged |

### preserve/ (5 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-06-27 | `preserve/end-of-run-grow-report-preview-v1` | not proven merged |
| 2026-08-03 | `preserve/analytics-fix-697` | not proven merged |
| 2026-08-03 | `preserve/query-client-provider-20260803` | not proven merged |
| 2026-08-03 | `preserve/query-client-provider-validation-20260803` | not proven merged |
| 2026-08-03 | `preserve/query-provider-analytics-contract-20260803` | not proven merged |

### feature/ (4 branches, 2 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-06-20 | `feature/phase-2f-preview-gate` | merged into main (ancestor) |
| 2026-06-22 | `feature/l2-h4e4-webhook-updater-handoff` | not proven merged |
| 2026-06-27 | `feature/edge-create-breeding-suggestions` | merged into main (ancestor) |
| 2026-08-03 | `feature/timeline-care-filters-ssr-import` | not proven merged |

### perf/ (4 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-10-04 | `perf/lazy-useState-set-7450279530477726498` | not proven merged |
| 2026-10-04 | `perf/memoize-tent-set-11613532787135631674` | not proven merged |
| 2026-10-04 | `perf/tent-roster-activity-map-1883962281210945495` | not proven merged |
| 2026-10-10 | `perf/latest-sensor-snapshot-query-optimization-7821151140606621592` | not proven merged |

### agent/ (3 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-22 | `agent/ha-mqtt-runner-adapters` | not proven merged |
| 2026-07-22 | `agent/ha-mqtt-runner-adapters-v2` | not proven merged |
| 2026-08-01 | `agent/issue-675-grow-scoped-timeline` | not proven merged |

### feat/ (3 branches, 1 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-06-10 | `feat/quick-log-harvest-check-fields` | merged into main (ancestor) |
| 2026-07-06 | `feat/pheno-hunt-postcure` | not proven merged |
| 2026-08-15 | `feat/pheno-male-evaluations-service` | not proven merged |

### chore/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-08-03 | `chore/adopt-biome-lint` | not proven merged |
| 2026-10-05 | `chore/update-google-site-verification-10140031735534502543` | not proven merged |

### code-health/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-10-05 | `code-health/optimize-type-check-10746045686682627456` | not proven merged |
| 2026-10-05 | `code-health/verdant-skill-schemas-early-returns-16384354674452684428` | not proven merged |

### governance/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-08-07 | `governance/carry-ci-hygiene-to-deploy` | not proven merged |
| 2026-08-13 | `governance/reconcile-main-constitution` | not proven merged |

### qa/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-23 | `qa/browser-fake-account-20260723` | not proven merged |
| 2026-07-23 | `qa/browser-fake-account-pr-run-20260723` | not proven merged |

### release/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-23 | `release/strain-v1-db-cutover` | not proven merged |
| 2026-07-23 | `release/strain-v1-full-suite-triage` | not proven merged |

### tmp/ (2 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-07-23 | `tmp/pr425-ci-diagnostics` | not proven merged |
| 2026-07-23 | `tmp/pr433-localstorage-diagnostics` | not proven merged |

### copy/ (1 branches, 1 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-06-20 | `copy/text-cleanup` | merged into main (ancestor) |

### docs/ (1 branches, 1 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-08-01 | `docs/ci-contract-hygiene-skill` | merged into main (content) |

### revert-1737-codex/ (1 branches, 0 merged into main)

| Last commit | Branch | Status |
|---|---|---|
| 2026-09-30 | `revert-1737-codex/timeline-manual-observation-date-20260926` | not proven merged |
