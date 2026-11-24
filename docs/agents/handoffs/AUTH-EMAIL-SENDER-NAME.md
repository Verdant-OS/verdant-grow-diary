# AUTH-EMAIL-SENDER-NAME

```text
TASK AUTH-EMAIL-SENDER-NAME  priority: P3  status: CLOSED
closed: 2026-11-23, merged. Landed on verdant-grow-diary as c64a1cc58050e985cf33cb68305d2f286afb1973 (#3043, 2026-11-23 13:13 UTC) through the merge queue, after Reviewer E (VReviewer) approved head 557d268751c7857cd7f9b4c8a1f1f9d8e1b2f1a9 and Matthew gave his merge yes at that head. Production /version.json served fa3f084cc963 (which contains c64a1cc5) at 2026-11-23 14:37 UTC. Post-merge check: one reset to the test login at 15:01:53 UTC, email_send_log recovery status sent with no error, and Matthew reported the inbox sender name reads "Verdant Grow Diary" (his report, 15:03 UTC). Whether that email went through the app route or the auth-email-hook edge function is not recorded; the hook's deployed code was NOT_MEASURED (read permission denied). Closed by the Claude thread session that authored the change.
goal: Sign-in emails (signup, invite, magic link, recovery, email change, reauthentication) show the sender name "Verdant Grow Diary" instead of "verdantgrowdiary-com", in the From line and in the email text that names the site.
why: The sender name growers see in their inbox was the Lovable project slug. Cheek pressed "Open the PR" on 2026-11-19 23:39 UTC for this rename after the 2026-11-18 test reset proved sign-in emails now arrive from noreply@verdantgrowdiary.com (AUTH-EMAIL-MANAGED-ROUTE, #2981).
branch: claude/project-thread-do02zz (restarted from verdant-grow-diary at c47a44d7d after #2981 merged)
base: verdant-grow-diary at c47a44d7d
checkout: git fetch origin claude/project-thread-do02zz verdant-grow-diary && git switch claude/project-thread-do02zz
pr: draft, number in the PR list for this branch
head_sha: read from the PR
state: implemented; bun test 35/36 for the four email test files (the route test file cannot load react locally: incomplete node_modules); full suite owed to CI
current_step: draft PR open; required checks run once it is marked ready, which waits on Cheek's yes
next_action: Marking ready, routing an eligible independent reviewer, merge, Lovable publish and redeploying auth-email-hook each wait on Cheek's own yes.
post_merge_check: after a publish Cheek approves, one reset to the disposable test login shows sender name "Verdant Grow Diary" with address noreply@verdantgrowdiary.com, and one new email_send_log row with status sent. Until then NOT_MEASURED.
active_writer: Claude thread session for project thread cmsg_01P7pGxx3V5wxVuLXvJUxaGsDb2mPjWBxVLtwJZkM4i1Cw
decisions: (1) Both sign-in paths change together, the app route (src/lib/authEmailWebhookRules.ts AUTH_EMAIL_SITE_NAME) and the auth-email-hook edge function (SITE_NAME), because the email_send_log row cannot tell which path sent the 2026-11-18 reset and AUTH-EMAIL-MANAGED-ROUTE says to keep their From lines identical. (2) send-transactional-email (owner alerts, receipts) keeps "verdantgrowdiary-com": not a sign-in email, not in this request. (3) The address stays noreply@verdantgrowdiary.com and the sender domain stays notify.verdantgrowdiary.com.
tried_and_rejected: none
commands: bun test src/test/auth-email-webhook-rules.test.ts src/test/auth-email-webhook-route.test.ts src/test/auth-email-hook-runtime.test.ts src/test/auth-email-hook-native-send.test.ts ; node scripts/scorer-lock.mjs --report --strict --base origin/verdant-grow-diary ; node scripts/sync-edge-shared.mjs --check ; node scripts/assert-client-secret-boundary.mjs
files_touched: src/lib/authEmailWebhookRules.ts; supabase/functions/auth-email-hook/index.ts; src/test/auth-email-webhook-rules.test.ts; src/test/auth-email-webhook-route.test.ts; src/test/auth-email-hook-runtime.test.ts; src/test/auth-email-hook-native-send.test.ts; this file
files_remaining: none
blockers: none known. The edge function change reaches production only through a Lovable redeploy of auth-email-hook, which needs Cheek's yes.
open_questions: none
gotchas: RED proof: with only the test pins changed, 6 tests failed (rules 3, runtime 1, native-send 2); after the constant change, all 35 that load pass. auth-email-webhook-rules.test.ts was already not Prettier-clean on the base branch (lines over 100 columns); not reformatted here.
links: #2981 (managed route), AUTH-EMAIL-MANAGED-ROUTE
artifacts: none
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: mark ready, reviewer routing, merge, publish, edge redeploy
claimed_by: Claude thread session, 2026-11-19 23:40 UTC
owner: Claude thread session for this task
last_updated: 2026-11-23, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsDb2mPjWBxVLtwJZkM4i1Cw
```
