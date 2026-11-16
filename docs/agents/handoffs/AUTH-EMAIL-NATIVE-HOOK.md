# AUTH-EMAIL-NATIVE-HOOK

```text
TASK AUTH-EMAIL-NATIVE-HOOK  priority: P2  status: OPEN
goal: auth-email-hook accepts Supabase Auth's native Send Email hook, verifies the Standard Webhooks signature, and still delivers through sendLovableEmail.
why: Production Send Email is on and pointed at auth-email-hook, but the function only accepted a Lovable webhook. GoTrue calls were rejected before email_send_log, so recovery, signup, magic link and email-change mail were not sent.
branch: cursor/auth-email-hook-native-send-4adb
base: verdant-grow-diary
checkout: git fetch origin cursor/auth-email-hook-native-send-4adb verdant-grow-diary && git switch cursor/auth-email-hook-native-send-4adb
pr: see the draft PR for this branch
head_sha: read from the PR after push
state: implemented locally, targeted tests and typecheck green, not deployed
current_step: open the draft PR
next_action: independent exact-head review by Reviewer A, Reviewer D and Reviewer C. Do not enqueue or merge. Do not set secrets or deploy.
post_merge_check: after a founder-approved deploy of this function to production project knkwiiywfkbqznbxwqfh, with SEND_EMAIL_HOOK_SECRET and LOVABLE_API_KEY set by name only, one disposable-account recovery mail arrives From noreply@verdantgrowdiary.com and writes one email_send_log row with template_name recovery and status sent. Until that deploy, NOT_MEASURED.
active_writer: cursor cloud agent on cursor/auth-email-hook-native-send-4adb
decisions: (1) Keep the Lovable webhook path. It is the existing preview and managed-sender contract, and a request is native only when it carries webhook-id, webhook-timestamp or webhook-signature. (2) Native success is HTTP 200 with {}. Native failure is { error: { http_code, message } }. The Lovable responses stay { success: true } and { error: string }. (3) Confirmation links are site origin plus /auth/v1/verify with token, type and redirect_to. (4) Idempotency key for a native call is the webhook-id, except email change, which uses webhook-id:new and webhook-id:current. (5) email_change sends token_hash only to user.new_email. token_hash_new, when present, is a second send to user.email. (6) No migration, no secret values, no deploy.
tried_and_rejected: editing src/test/helpers/authEmailHookHarness.ts. The scorer lock refused the edit. Native coverage lives in a new test file with its own vm loader. The locked harness and its tests were left unchanged and re-run.
commands: bunx vitest run src/test/auth-email-hook-native-send.test.ts src/test/auth-email-hook-runtime.test.ts src/test/auth-email-hook-direct-send-guard.test.ts src/test/timing-safe-compare-call-sites-static.test.ts --reporter=dot ; bun run typecheck
files_touched: supabase/functions/auth-email-hook/index.ts; src/test/auth-email-hook-native-send.test.ts; docs/agents/handoffs/AUTH-EMAIL-NATIVE-HOOK.md
files_remaining: none in repo. Production still needs the secret names and a function deploy, which this task does not do.
blockers: deploy, SEND_EMAIL_HOOK_SECRET and LOVABLE_API_KEY on the production function, and Reviewer A, D and C acceptance. Founder-only.
open_questions: whether auth-email-hook is already deployed on production, and whether signup confirmations are enabled. Auto-confirm can still skip signup mail after this fix.
gotchas: verify_jwt must stay false. Timestamp window is 5 minutes. Signature is checked before the timestamp so a bad signature is 401 even when the timestamp is also stale. Never log the secret, token, token_hash or rendered body.
links: diagnosis uploads FOLLOWUP-2026-11-16 and REPORT; docs/agents/handoffs/AUTH-EMAIL-DIRECT-SEND.md
artifacts: src/test/auth-email-hook-native-send.test.ts
reviewer_seat: Reviewer A, Reviewer D, Reviewer C required. Not requested yet.
reviewer_sha:
session_state: no production calls, no secret writes, no deploy
claimed_by: cursor cloud agent, 2026-11-16
owner: cursor cloud agent for this branch
last_updated: 2026-11-16, by cursor cloud agent
```
