### CLOUDFLARE-VERCEL-ROUTING-PORT

```text
TASK CLOUDFLARE-VERCEL-ROUTING-PORT  priority: P1  status: CLOSED
goal: Make the Cloudflare Worker reproduce every vercel.json redirect, the SPA-rewrite exclusion, and every header rule. /~oauth/* must hop to the Lovable project host, /strains and /refund-policy (and the other legacy aliases) must redirect, and /unsubscribe must send no-store / no-referrer / noindex.
branch: cursor/cloudflare-worker-routing-54eb
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin cursor/cloudflare-worker-routing-54eb verdant-grow-diary && git switch cursor/cloudflare-worker-routing-54eb && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1943 (merged)
head_sha: 3412513bf3f9a9094e1966275bfb32ffc6a6f9b7
state: CLOSED. Merged to verdant-grow-diary as 3412513bf on 2026-10-08 12:55 PM CT (GitHub merged_at 2026-10-08T17:55:16Z). #1937 (report-only CSP) then merged as eaf0b092257af57acb724dfe9f817d6c8881943b on 2026-10-08T19:23:18Z. The deploy-tip copy of this block still said OPEN; that line was stale.
next_action: None; closed.
files: src/lib/cloudflareHostRoutingRules.ts; src/server.ts; public/_headers; src/test/cloudflare-host-routing-rules.test.ts; scripts/capture-ssr-head-snapshots-with-server.mjs; docs/agents/HANDOFF_LOG.md
blockers: none. Do not deploy from this closed record, and do not write the production Supabase project.
artifacts: src/test/cloudflare-host-routing-rules.test.ts
reviewer_seat: Critical Mass (no product .tsx; lib, Worker entry, tests)
claimed_by: Grok, 2026-10-08 11:49 CT
last_updated: 2026-10-08 23:02 CT, by Canopy (log maintenance on #1939; not a new claim on #1943)
closure: Merged via #1943 as 3412513bf3f9a9094e1966275bfb32ffc6a6f9b7 at 2026-10-08 12:55 PM CT. #1937 merged afterward as eaf0b092257af57acb724dfe9f817d6c8881943b, so the header application this block was waiting on has landed. Historical last_updated before this closure note: 2026-10-08 12:21 CT, by Grok.
```
