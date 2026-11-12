# POSTHOG-USER-AGENT-AUTOMATION

```text
TASK POSTHOG-USER-AGENT-AUTOMATION  priority: other  status: CLOSED
closed: merged. #2923 merged into verdant-grow-diary on 2026-11-12 at 12:06 UTC as 9c2d542aa6e1a84ae78ed5c980460eb243221609 (final SHA; first-parent commit on origin/verdant-grow-diary whose subject ends (#2923), read 2026-11-12; merge time from GitHub). Closed in bulk by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f on 2026-11-12 at Matthew's request (source claim: his message relayed in that thread's brief). This close does not resolve the post-merge check, open questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261112.md.
goal: Keep the browser user agent on allowlisted PostHog events so that PostHog does not classify real growers as Automation traffic.
why: A PostHog inbox report flagged most production web events as Automation with no user agent. PostHog SQL showed that the same sessions send an $identify with a real Chrome user agent (Regular) and pageviews, pageleaves, web vitals and product events with none (Automation / no_user_agent). The before_send allowlist in src/lib/posthogAnalyticsRules.ts dropped $raw_user_agent. The traffic is real users, not a crawler.
branch: posthog-self-driving/investigateanalytics-production-traffic-6192c2 (name set by the PostHog run; it does not follow the <agent>/<slug> convention)
base: verdant-grow-diary
checkout: git fetch origin posthog-self-driving/investigateanalytics-production-traffic-6192c2 verdant-grow-diary && git switch posthog-self-driving/investigateanalytics-production-traffic-6192c2
pr: read the URL from GitHub (draft PR from this branch)
head_sha: read git rev-parse origin/posthog-self-driving/investigateanalytics-production-traffic-6192c2
state: pushed draft
current_step: draft PR open; required CI and independent exact-head review not yet measured
next_action: an eligible independent reviewer (not this Claude session) reviews the exact head; Matthew gives the per-item yes before ready/enqueue
post_merge_check: after Publish and live /version.json reports the merge SHA, run in PostHog SQL: count web $pageview events in the last 24 hours grouped by $virt_traffic_type. Expect Regular for consented growers and no rise in Automation / no_user_agent. NOT_MEASURED until the SHA is live.
active_writer: Claude PostHog self-driving session, task branch above
decisions: Add $raw_user_agent, $browser, $browser_version, $os, $os_version and $device_type to the before_send copy, with the same string safety checks as the transport keys and a 512 character cap. The generic scrub path already keeps the user agent on $identify and $set, so the user agent is not treated as sensitive. New tests go in a new file so the scorer lock on existing tests stays closed (no pin is loosened).
tried_and_rejected: Filtering the traffic in PostHog (it is real user traffic, so a filter would hide growers). Editing src/test/posthog-analytics-rules.test.ts (scorer-locked; a new file covers the change).
commands: bunx vitest run src/test/posthog-user-agent-traffic-type.test.ts src/test/posthog-analytics-rules.test.ts src/test/posthog-pageleave-web-vitals.test.ts src/test/posthog-consent-client.test.ts src/test/posthog-consent-runtime-wiring.test.ts src/test/posthog-env-consent-startup.test.ts --reporter=dot && bun run typecheck
files_touched: src/lib/posthogAnalyticsRules.ts; src/test/posthog-user-agent-traffic-type.test.ts; docs/agents/handoffs/POSTHOG-USER-AGENT-AUTOMATION.md
files_remaining: none
blockers: independent exact-head review; Matthew's per-item yes; Publish is Matthew's only
open_questions: none
gotchas: posthog-js puts the user agent on every event, but before_send runs per event. $exception events still go through their own scrubber, which keeps no transport keys; that path is out of scope here.
links: PostHog inbox report 1d10c752-fdac-4594-84e1-6026775711cc
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production writes; no GitHub comments; auto-merge off
claimed_by: Claude PostHog self-driving session, 2026-11-10
owner: OG Kush (default inheritor; this session ends after the draft PR)
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f (bulk close; previous 2026-11-10 03:00 CT, by Claude)
```
