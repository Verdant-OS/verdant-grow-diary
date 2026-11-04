### POSTHOG-PUBLIC-CLIENT-KEY

```text
TASK POSTHOG-PUBLIC-CLIENT-KEY  priority: other  status: OPEN
goal: Lovable production builds initialise PostHog from the committed public client key in VITE_POSTHOG_KEY after analytics consent.
why: The live bundle reads VITE_POSTHOG_KEY and VITE_POSTHOG_HOST, and Lovable builds from the committed .env. Neither variable was set, so PostHog never initialised. Cheeko chose committing the public client key.
branch: cursor/posthog-public-client-key-f411
base: verdant-grow-diary
checkout: git fetch origin cursor/posthog-public-client-key-f411 verdant-grow-diary && git switch cursor/posthog-public-client-key-f411
pr: read the URL from GitHub after push
head_sha: read git rev-parse HEAD after the push
state: implementation in this commit; merge waits on Cheeko's own-words yes at the exact head SHA
current_step: consent test waits on vi.dynamicImportSettled; committed env presence and per-directive CSP assertions added. Secret scan stays red until a separate base allowlist lands.
next_action: confirm required CI is green at the head, then wait for Cheeko's yes at that SHA. Do not merge, enqueue, or publish.
post_merge_check: after Publish, load https://verdantgrowdiary.com while signed out, grant analytics consent, and confirm a request to https://us.i.posthog.com. Before consent, that request must be absent. NOT_MEASURED until live /version.json reports this SHA.
active_writer: Grok cloud agent on this branch
decisions: Commit only VITE_POSTHOG_KEY and https://us.i.posthog.com in .env. CSP adds that host plus https://us-assets.i.posthog.com because posthog-js 1.444.0 RequestRouter loads /static from the region assets host when api_host is the US ingestion host and asset_host is unset. script-src lists the assets host; connect-src lists both. .env.example stays empty and says personal PostHog keys must never be committed.
tried_and_rejected: none
commands: bunx vitest run src/test/posthog-env-consent-startup.test.ts src/test/security-headers-rules.test.ts src/test/posthog-consent-client.test.ts --reporter=dot
files_touched: .env; .env.example; src/lib/securityHeadersRules.ts; src/test/posthog-env-consent-startup.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: env/config gate — Cheeko's own-words yes at the exact head SHA before merge
open_questions: none
gotchas: do not commit a personal PostHog key. Do not edit workflows, wrangler, package.json, lockfiles, migrations, or auth. Existing posthog-consent-client.test.ts stays untouched; it stubs an empty key and injects a fixture reader.
links: none yet
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production writes; auto-merge off
claimed_by: Grok, 2026-11-03
owner: Cheeko
last_updated: 2026-11-02 20:40 CT, by Grok
```
