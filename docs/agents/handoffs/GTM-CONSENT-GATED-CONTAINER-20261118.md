# GTM-CONSENT-GATED-CONTAINER-20261118

```text
TASK GTM-CONSENT-GATED-CONTAINER-20261118  priority: other  status: OPEN
goal: Take Google Tag Manager container GTM-5SRRPGZT back out of the Verdant app (revert of #3019).
why: #3019 merged 2026-11-19 05:05 UTC as merge commit 25f8bf6d (head df4d898) and auto-deployed (live /version.json 25f8bf6d, built 05:06 UTC). Matthew, 2026-11-19 05:07 UTC: "No GTM tags are in at the moment. If it double-counts page views, remove. Let's just drop the Tag Manager."
branch: claude/project-thread-w1f30j
base: verdant-grow-diary
checkout: git fetch origin claude/project-thread-w1f30j verdant-grow-diary && git switch claude/project-thread-w1f30j && git merge origin/verdant-grow-diary
pr: original #3019 (merged); revert = draft PR from branch claude/project-thread-w1f30j (URL in its "resume here" comment)
head_sha: recorded in the PR body and the "resume here" comment (this file is written before the first push)
state: revert pushed as draft / CI
current_step: draft revert PR open, waiting on 35 required checks
next_action: read the required checks at the revert PR head; independent review; merge only on Matthew's yes naming the PR and exact head SHA; then close this entry
post_merge_check: after the revert is live (/version.json reports its merge SHA), on https://verdantgrowdiary.com accept analytics and confirm no script[src*="googletagmanager.com/gtm.js"]. NOT_MEASURED until then.
active_writer: Claude thread session (project "Claude", thread cmsg_01P7pGxx3V5wxVuLXvJUxaGs2HtCPiMuMYY8opAxmF4xr6)
decisions: (0) 2026-11-19: dropped on Matthew's word; reverted in full, consent flow for GA4/Ahrefs/PostHog back to its pre-#3019 state. (1) Install shape is Google's current web-container snippet (Tag Manager Help answer 14847097, read 2026-11-18): async gtm.js?id= script plus dataLayer bootstrap and gtag('js', new Date()). Matthew's pasted snippet matches that current shape. (2) Never add the noscript iframe: it loads without JavaScript and therefore without consent; Google's current snippet has none. (3) Load through applyAnalyticsConsentDecision on grant, behind the same production-host guard as GA4 and the same excluded-route list. (4) GTM cannot be unloaded and has no kill switch, so revocation or an excluded route with a container that ran returns reload=true, like an Ahrefs tag that ran. (5) Do not queue a second gtag('js') when GA4 already queued one on the shared dataLayer, so container page-view triggers fire once. (6) Codex review P1 (comment 4618291705): a revoke whose localStorage write fails left GTM running, since persistedGrantWouldSurviveReload suppressed the reload. Fix: a container that ran gets gtag('consent','update', all four denied) at once; the runtime still reloads when the new revocationSurvivesReload() is true (the session-scoped denial makes a fresh document read denied). Only when both stores refuse the write does the container stay, under consent denial (Google tags honour it; custom HTML tags may not). (7) Consent banner, settings page and privacy policy copy are unchanged: wording is Matthew's decision.
tried_and_rejected: An earlier thread session wrote this slice but ran out of context before committing; nothing reached origin, so it was rewritten. Putting the snippet in the __root head was rejected: it would load before consent.
commands: bunx vitest run src/test/google-tag-manager-consent-gate.test.ts src/test/google-tag-manager-host-guard.test.ts src/test/analytics-creator-beta-route-isolation.test.ts src/test/google-analytics-tag-presence.test.ts src/test/analytics-consent-runtime.test.ts src/test/posthog-consent-runtime-wiring.test.ts src/test/analytics-toolkit-route-provider-isolation.test.ts --reporter=dot
files_touched: src/lib/analyticsConsent.ts, src/test/google-tag-manager-revocation-storage-failure.test.ts, src/constants/analytics.ts, src/lib/googleTagManagerRules.ts, src/lib/googleTagManagerLoader.ts, src/lib/analyticsConsentRuntime.ts, src/test/google-tag-manager-consent-gate.test.ts, src/test/google-tag-manager-host-guard.test.ts, src/test/analytics-creator-beta-route-isolation.test.ts, src/test/google-analytics-tag-presence.test.ts, docs/agents/handoffs/GTM-CONSENT-GATED-CONTAINER-20261118.md
files_remaining: none. The revert is `git revert -m 1 25f8bf6d` of every code and test file; this handoff file is kept and updated instead of deleted.
blockers: Local tests BLOCKED in the authoring container: bun install --frozen-lockfile got ProxyConnectFailed (403) on locked tarballs. CI is the test evidence.
open_questions: none for the revert. Until it is live, production loads GTM-5SRRPGZT after an analytics grant; the container has no tags (Matthew, 2026-11-19).
gotchas: Residual: if localStorage and sessionStorage both refuse writes while the old grant stays readable, a non-Google tag in the container can keep running until the tab closes. Tag Manager forwards whatever its container is configured to send; what reaches Google depends on the container's tags, not on this code. The only CSP in code is report-only (src/lib/securityHeadersRules.ts) and already lists https://www.googletagmanager.com in script-src and connect-src; tags fired by the container may need more origins.
links: https://support.google.com/tagmanager/answer/14847097 ; https://developers.google.com/tag-platform/security/guides/csp
artifacts: PR checks on branch claude/project-thread-w1f30j
reviewer_seat: an eligible non-contributing reviewer under OWNERSHIP.md section 4.3 (not this Claude thread session)
reviewer_sha: none yet
session_state: pending human decisions: privacy policy and banner wording; merge yes at an exact head SHA
claimed_by: Claude thread session, 2026-11-18 11:45 CT
owner: Claude thread session
last_updated: 2026-11-18 23:15 CT, by Claude thread session (revert of #3019 on Matthew's word)
```
