# CREATOR-BETA-NO-VERCEL-ANALYTICS

```text
TASK CREATOR-BETA-NO-VERCEL-ANALYTICS  priority: P2  status: OPEN
goal: A visitor to /creator-beta or /breeder-beta loads neither Vercel Web Analytics nor Vercel Speed Insights, whatever they chose on the consent banner, so the "No analytics." line on both pages is true for every provider.
why: #2985 (merged as e1b1109ce203a1294dd492278456be65eab35318) removed Google Analytics and PostHog from both pages but left Vercel telemetry out of scope (#2982). Read-only live check on 2026-11-18 at live /version.json 9e7e51ee: with analytics accepted, both pages still requested /_vercel/insights/script.js and /_vercel/speed-insights/script.js (both returned HTTP 503 at the time). Matthew asked for the next step on 2026-11-19.
branch: claude/project-thread-66zbbk
base: verdant-grow-diary at 679e8f51b17a2ee52e3eed204bff5401be082b63
checkout: git fetch origin claude/project-thread-66zbbk && git switch claude/project-thread-66zbbk
pr: see the draft PR opened from this branch
head_sha: read the head from the PR; this file is committed with the fix
state: pushed; draft PR open; required checks pending; no independent review yet
current_step: watching the 35 required checks
next_action: (1) CI shows the test-only commit RED and the fix commit GREEN; (2) 35/35 required checks at the PR head; (3) one independent exact-head review by a session that did not write this; (4) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, in a fresh browser profile: open https://verdantgrowdiary.com/creator-beta, accept analytics, reload. Expect no request to /_vercel/insights/ or /_vercel/speed-insights/ and no window.va or window.si. Repeat at /Creator-Beta, //creator-beta and /breeder-beta. Then open /pricing with analytics accepted and expect both Vercel scripts to load once.
active_writer: Claude (thread session for task "Get the creator beta no-analytics fix onto GitHub")
decisions: (1) Gate in src/components/ConsentGatedVercelTelemetry.tsx, not src/routes/__root.tsx, so the root mount pins in src/test/google-analytics-static-safety.test.ts stay as they are. (2) Reuse isNoAnalyticsPublicPath from src/lib/posthogAnalyticsRules.ts (now exported) instead of isExcludedAnalyticsPath, so the grow-help toolkit page keeps its current Vercel behaviour; the matcher already ignores case, repeated and trailing slashes and percent-escapes. (3) Three guards: no mount when the current path is a beta page; beforeSend drops events while the visitor is on a beta page (SDK already loaded from an earlier page in the same SPA session); beforeSend drops an event whose own url is a beta page. (4) The window check runs only after consent reads "granted", which never happens on the server or the first client pass, so hydration output is unchanged.
behavior_change: On /creator-beta and /breeder-beta (any spelling the matcher accepts) with consent granted: neither Vercel SDK is mounted, and an SDK loaded on an earlier page sends nothing while the visitor is on a beta page. Leaving for a normal page sends again. Vercel stops counting page views and web vitals for both pages.
not_in_scope: the consent banner still shows on both pages. GA and PostHog (done in #2985). Page copy. Schema, RLS, auth, Edge. src/routes/__root.tsx.
scorer_lock: no existing assertion was changed. src/test/vercel-telemetry-consent.test.tsx gains a describe block and one afterEach line that resets the URL to "/".
tests: 8 new cases in src/test/vercel-telemetry-consent.test.tsx (5 path spellings, an ordinary public page, navigation onto a beta page after load, an event url on a beta page). Evidence is CI over two commits: the test-only commit is expected RED on those cases, the fix commit GREEN. Local runs BLOCKED (see blockers).
not_measured: every local run (vitest, typecheck, lint, build); production, because the fix is not deployed.
commands: bunx vitest run src/test/vercel-telemetry-consent.test.tsx src/test/google-analytics-static-safety.test.ts src/test/posthog-analytics-rules.test.ts --reporter=dot ; bun run typecheck
files_touched: src/components/ConsentGatedVercelTelemetry.tsx; src/lib/posthogAnalyticsRules.ts (export only); src/test/vercel-telemetry-consent.test.tsx; this file
files_remaining: none for this slice
blockers: local checks BLOCKED in this session: node_modules is partly installed (vitest fails with ERR_MODULE_NOT_FOUND pathe), bun install --frozen-lockfile got proxy 403 on the Lovable-mirror tarballs pinned in bun.lock, and npm registry egress is blocked. No unpinned install was used. CI is the evidence.
open_questions: Should the consent banner be hidden on pages that never measure? (carried from CREATOR-BETA-NO-ANALYTICS)
gotchas: The static-safety test pins the readAnalyticsConsent() === "granted" expression and exactly two beforeSend={beforeSendWithConsent} mounts; keep both. Vitest's jsdom keeps the URL across tests, so the new afterEach resets it.
links: #2714; #2982; #2985
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: the writing session is subscribed to the PR's activity. No routines, no paused workflows. Pending human decision: Matthew's merge yes after review.
claimed_by: Claude thread session, 2026-11-19
owner: Claude thread session for task "Get the creator beta no-analytics fix onto GitHub"
last_updated: 2026-11-19
```
