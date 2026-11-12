# Email update: what happened and how to restore it (plan only)

## 1. What was undone, and by what
- The undone update was the switch to Lovable-managed email delivery. It rewrote the sign-in email hook to send directly, without the queue. It also added a signed email-events receiver, converted app emails and owner alerts to the managed helper, and deleted the old queue, suppression, unsubscribe and send scaffolds plus `*_email_infra.sql`.
- What undid it: a later code sync from GitHub. The repo today is back to the old setup: `auth-email-hook` calls `enqueue_email`, and `process-email-queue`, `send-transactional-email`, `handle-email-suppression`, `handle-email-unsubscribe` and `20260707153206_email_infra.sql` are all present again. There is no `src/routes/lovable/email/*`. Same pattern as the earlier sync that removed /welcome, /features and Stripe checkout. Exact commit: unknown (not yet traced).
- "No preview available" means the platform cannot find a deployed managed auth-email function for this code.

## 2. Files to restore managed sign-in emails
Re-run the update through `email_domain--start_email_migration`. The update is marked undone, so it needs a fresh request. The rewrite step would then:
- Re-render: `supabase/functions/auth-email-hook/index.ts` (direct managed send, no queue) and `supabase/functions/_shared/email-templates/{signup,magic-link,recovery,invite,email-change,reauthentication}.tsx`. Verdant branding is re-applied to the templates.
- Add: the email-events receiver, `supabase/functions/handle-email-events/index.ts`. It writes only to the existing `email_send_log` and `suppressed_emails` tables with the current allowed values.
- Convert: each caller of `send-transactional-email` / `enqueue_email` (lead and contact owner alerts, payment receipt) to the managed send helper the scaffold creates.
- Remove from the repo: `supabase/functions/process-email-queue/`, `send-transactional-email/`, `handle-email-suppression/`, `handle-email-unsubscribe/`, their blocks in `supabase/config.toml`, and `supabase/migrations/20260707153206_email_infra.sql`.
- Conflict with the constitution: §5 treats merged migrations as read-only. Deleting `*_email_infra.sql` is required by the update but breaks that rule and the published-migration integrity check. This needs Matthew's explicit decision before the rewrite.
- Keep: the email tables and their data, `preview-transactional-email`, and the later email migrations (rate_limited, pgmq grants).

## 3. Effect on auth-email-hook, process-email-queue and the send-email hook
- `auth-email-hook` is replaced in place: same function name, new body.
- `process-email-queue` is removed from the repo. Its deployed copy keeps running until the platform cutover and is not undeployed by hand. The pgmq `auth_emails` queue stops getting new messages, and messages already in it drain or expire after 15 minutes.
- Supabase send-email hook setting: not changed by me. Sign-in emails keep going through the platform, and the platform owns hook activation at cutover.

## 4. What gets deployed, and the live-site impact
- Deployed: `auth-email-hook` and `handle-email-events` (plus any converted sender functions). Edge deploys are a production action under the current gates and need Matthew's per-item approval.
- These are edge functions, so they go live as soon as they deploy. Sign-in and app emails switch to the new path right away, before any frontend publish. The frontend site itself does not change. Publishing completes the update and cannot be undone.
- Expected after deploy: previews and Send test work in More -> Emails.

## 5. Could a later GitHub sync undo it again?
Yes. Any merge from GitHub that brings back the old `auth-email-hook`, the four legacy functions or `*_email_infra.sql` reverts it again. To prevent that:
- Land the rewrite on `verdant-grow-diary` through a reviewed PR first, so GitHub holds the new version. Do not let a stale `lovable-sync-*` branch or `main` merge over it.
- Add a small repo check, for example a test that fails if `auth-email-hook` calls `enqueue_email` or if `process-email-queue/` exists.
- After each sync, confirm in More -> Emails that the banner stays clear before publishing.

## Open decisions for Matthew
- Approve the edge deploys.
- Approve deleting the merged `*_email_infra.sql` (§5 conflict), or tell me to keep it, which would block the update from completing.
