# VERCEL-BETA-NO-ANALYTICS

```text
TASK VERCEL-BETA-NO-ANALYTICS  priority: P2  status: CLOSED
goal: /creator-beta and /breeder-beta load no Vercel Web Analytics or Speed Insights, even after the visitor accepts analytics, so their "No analytics." line is true for every provider.
why: #2714. After #2985 (merged as e1b1109) a live read-only check on 2026-11-18 in Matthew's Chrome showed no PostHog and no Google Analytics on either page, but both still requested /_vercel/insights/script.js and /_vercel/speed-insights/script.js (both HTTP 503 at the time). The requests come from src/components/ConsentGatedVercelTelemetry.tsx, which mounts both SDKs whenever consent is granted and never checked the path.
branch: claude/project-thread-xdxzxw
base: verdant-grow-diary at 679e8f51b (#3020)
checkout: git fetch origin claude/project-thread-xdxzxw && git switch claude/project-thread-xdxzxw
pr: see the draft PR for this branch
head_sha: read from the PR
state: merged as #3027 (600a9e792593029afe7c39e46f15c586844e41af); live
current_step: closed 2026-11-19. Merged as #3027 at 600a9e792593029afe7c39e46f15c586844e41af on Matthew's word ("Let it merge"), with no independent A/C/D verdict on record; Reviewer F (Matthew's own account) approved.
next_action: (1) Matthew says to take the PR out of draft; (2) 35/35 required checks at the head; (3) one independent exact-head review from Reviewer A, D or C (exclude session_017UoYKwDBLDgD7Yej3Tc3XV, the author); (4) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: PASS 2026-11-19, live /version.json at 600a9e792593: with analytics accepted, /creator-beta and /breeder-beta made zero /_vercel requests and /pricing still made them. Original check: after live /version.json reports the merge SHA, in a browser with analytics accepted: /creator-beta, /Creator-Beta/ and /breeder-beta request no /_vercel/insights or /_vercel/speed-insights script; /pricing still requests both once.
active_writer: Claude session_017UoYKwDBLDgD7Yej3Tc3XV
decisions: (1) Reuse the existing no-analytics path matcher (now exported as isNoAnalyticsPublicPath) so Vercel matches the same case, slash and escape variants as PostHog and Google. (2) New pure src/lib/vercelTelemetryRules.ts decides mounting; an unknown path fails closed. (3) beforeSend also drops events whose url is a beta page, because an SDK loaded on another page keeps running after a client-side navigation. (4) The component reads window.location.pathname at render; the root re-renders on every route change. Call sites in __root.tsx are unchanged, so the existing source pins still hold.
behavior_change: On /creator-beta and /breeder-beta neither Vercel SDK mounts, and events recorded on them are dropped. Every other page is unchanged.
not_in_scope: the grow-help toolkit path (also excluded from PostHog and Google, still mounts Vercel when consent is granted; unchanged here). The host-side 503/404 on /_vercel scripts (#2982). The consent banner. Copy. Schema, RLS, auth, edge functions.
scorer_lock: no existing assertion changed. One afterEach line resets the URL to "/".
tests: new src/test/vercel-telemetry-rules.test.ts (14 cases); new block in src/test/vercel-telemetry-consent.test.tsx (6 cases). Rules test run under bun test with a vitest shim: 14 pass; with the fix's two lines set aside: 10 fail, 4 pass; restored: 14 pass.
not_measured: the component cases, the full 32-shard suite, lint, bun run typecheck and bun run build, all BLOCKED locally (bun install --frozen-lockfile: ProxyConnectFailed 403 on Lovable-mirror tarballs; no npm fallback used). CI is the evidence once the PR leaves draft.
commands: bunx vitest run src/test/vercel-telemetry-rules.test.ts src/test/vercel-telemetry-consent.test.tsx src/test/google-analytics-static-safety.test.ts; bun run typecheck
files_touched: src/lib/vercelTelemetryRules.ts; src/lib/posthogAnalyticsRules.ts (export only); src/components/ConsentGatedVercelTelemetry.tsx; src/test/vercel-telemetry-rules.test.ts; src/test/vercel-telemetry-consent.test.tsx
files_remaining: none for this slice
blockers: local dependency install (see not_measured)
open_questions: should the toolkit path skip Vercel too? Follow-up: Cloudflare's injected Web Analytics beacon on the beta pages is handled in CLOUDFLARE-BETA-NO-TRANSFORM.
links: #2714; #2985; #2982
reviewer_seat: not yet requested
reviewer_sha: none
session_state: session_017UoYKwDBLDgD7Yej3Tc3XV subscribed to the PR. No routines, no paused workflows. Pending human decisions: take out of draft; merge yes.
claimed_by: Claude session_017UoYKwDBLDgD7Yej3Tc3XV, 2026-11-19
owner: Claude session_017UoYKwDBLDgD7Yej3Tc3XV
last_updated: 2026-11-19 (closed), by Claude session_017UoYKwDBLDgD7Yej3Tc3XV
```
