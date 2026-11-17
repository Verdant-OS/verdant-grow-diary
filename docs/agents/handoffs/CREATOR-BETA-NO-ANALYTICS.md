# CREATOR-BETA-NO-ANALYTICS

```text
TASK CREATOR-BETA-NO-ANALYTICS  priority: P2  status: OPEN
goal: A visitor to /creator-beta is not measured by any analytics provider, whatever they chose on the consent banner, so the page's "No analytics." line is true.
why: #2714 asks that /creator-beta never load analytics, even with consent. Measured on production on 2026-11-16 at cbb708bce190 (live /version.json): with analytics accepted, /creator-beta loaded Google Analytics and PostHog. Matthew told this session to fix it (2026-11-16, his word: "fix").
branch: claude/creator-beta-no-analytics. LOCAL ONLY. It is not on GitHub; see blockers.
base: verdant-grow-diary at 54b4bc3565ca779031d1e9618ca32d4b289ec1cd
checkout: not possible until the branch is pushed. From the bundle (keeps the commit SHAs): git fetch creator-beta-no-analytics.bundle claude/creator-beta-no-analytics:claude/creator-beta-no-analytics. From the patch (new SHAs): git switch -c claude/creator-beta-no-analytics 54b4bc3565ca779031d1e9618ca32d4b289ec1cd && git am creator-beta-no-analytics.patch
pr: none
head_sha: code at 09fb30b4d0b548e9fc51e91f570edc78b464c36c; this entry is the next commit, so read the head from the branch
state: implemented and committed locally; not pushed; no PR; no CI run; no review
current_step: waiting for a way to push
next_action: (1) push the branch, either by allowing this repository in the writing session's git proxy or by another holder fetching the bundle; (2) open a draft PR against verdant-grow-diary with the red and green counts below; (3) 35/35 required checks at that head; (4) one independent exact-head review by a session that did not write this; (5) Matthew's per-item yes, then the Merge Steward queues it. If another holder pushes it, the claim below transfers to that holder.
post_merge_check: after live /version.json reports the merge SHA, in a fresh browser profile: open https://verdantgrowdiary.com/creator-beta, accept analytics, reload. Expect no request to googletagmanager.com, google-analytics.com or posthog.com and no gtag script tag. Repeat at /Creator-Beta and //creator-beta. Then open /pricing and expect one page_view to the GA4 property.
active_writer: Claude session_017UoYKwswU3ZkQjov4uiTgE
decisions: (1) Reuse the existing excluded-route rule, isExcludedAnalyticsPath, so PostHog startup, the Google opt-out flag, Ahrefs removal and the root route's teardown follow one rule. (2) The match ignores letter case, repeated and trailing slashes, and percent-escapes, because production rendered the page under all of them on 2026-11-16: /Creator-Beta, /CREATOR-BETA/ and //creator-beta kept that spelling in the address bar; /creator-beta/, /creator-beta// and /creator%2Dbeta were rewritten to /creator-beta. (3) The toolkit rule keeps its exact-match behavior. (4) The second guard sits in trackPageView because that hook was the other caller of loadGoogleAnalytics. Rejected: matching on the router's matched route in src/routes/__root.tsx, a larger change to a source-pinned file.
behavior_change: On /creator-beta with consent granted: no Google tag is injected, no page_view is sent, the Google opt-out flag is set, PostHog is not loaded, and a running PostHog client is stopped. Arriving from "/" with the Ahrefs tag already running reloads the document once, as the toolkit route already does. Leaving for a normal page turns measurement back on. A PostHog visitor who passes through /creator-beta gets a new anonymous id afterwards; that is how the existing stop path works.
not_in_scope: /breeder-beta, which shows the same sentence but is not named in #2714 and, per src/pages/BreederBeta.tsx, stays indexable for direct and paid traffic (Matthew's call). The consent banner still shows on the page. Vercel telemetry components (#2982). Letter-case variants of the toolkit path. Page copy. Schema, RLS, auth, Edge.
scorer_lock: no existing assertion was changed. Cases were added to three existing test files and one e2e spec; one test file is new.
tests: 16 new unit tests. RED before the fix: 12 failed, 61 passed (73) across the four files below; the 4 new tests that passed before the fix pin behavior that must not change. After the fix: those four files plus fourteen others that import the touched modules, 18 files, 237 passed. Nineteen more files that reference the touched modules or src/routes/__root: 603 passed, 14 skipped. One new Chromium case in e2e/analytics-consent-gate.spec.ts: passed with the fix; failed with the fix set aside (the Google opt-out flag stayed false).
not_measured: the full 32-shard suite; whole-project lint; bun run build; webkit-mocked; production, because the fix is not deployed. The other four cases in e2e/analytics-consent-gate.spec.ts were not run locally: .env carries a PostHog key and the spec maps the document host to the production hostname, so they would likely have sent to the real project (inference, not observed).
commands: bunx vitest run src/test/posthog-analytics-rules.test.ts src/test/posthog-consent-client.test.ts src/test/google-analytics-route-change.test.tsx src/test/analytics-creator-beta-route-isolation.test.ts --reporter=dot ; bun run typecheck ; bun run typecheck:tsgo ; bunx eslint <touched files> ; bunx vite --host 127.0.0.1 --port 5173 --strictPort, then E2E_BASE_URL=http://127.0.0.1:5173 bunx playwright test e2e/analytics-consent-gate.spec.ts --project=chromium-mocked -g "creator beta"
files_touched: src/lib/posthogAnalyticsRules.ts; src/hooks/useGoogleAnalyticsPageViews.ts; src/test/posthog-analytics-rules.test.ts; src/test/posthog-consent-client.test.ts; src/test/google-analytics-route-change.test.tsx; src/test/analytics-creator-beta-route-isolation.test.ts (new); e2e/analytics-consent-gate.spec.ts; this file
files_remaining: none for this slice
blockers: the writing session's git proxy answers a push with HTTP 403 (the repository is not in that session's authorized set). Nothing was pushed and no PR was opened.
open_questions: (1) Should /breeder-beta get the same rule? It is one more entry in NO_ANALYTICS_PUBLIC_PATHS plus tests. (2) Should the consent banner be hidden on pages that never measure?
gotchas: Vite's default bind fails in the authoring container, so start the dev server on 127.0.0.1:5173 and set E2E_BASE_URL for the GA browser spec. Abort posthog.com in any local run of that spec. tsc was killed for memory on an 8 GB machine while a dev server was running and passed once it was stopped. Tests pin source text in the page-view hook; keep edits local.
links: #2714; #2982
artifacts: creator-beta-no-analytics.patch and creator-beta-no-analytics.bundle, delivered to Matthew in the writing session
reviewer_seat: none requested; nothing is pushed
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: how the branch reaches GitHub; whether /breeder-beta is included.
claimed_by: Claude session_017UoYKwswU3ZkQjov4uiTgE, 2026-11-17 03:15 UTC, on Matthew's instruction. Issue #2714's assignee is verdant-ultra-bot; no branch, PR or handoff entry from that seat was found on 2026-11-17.
owner: Claude session_017UoYKwswU3ZkQjov4uiTgE
last_updated: 2026-11-16 21:15 CT, by Claude session_017UoYKwswU3ZkQjov4uiTgE
```
