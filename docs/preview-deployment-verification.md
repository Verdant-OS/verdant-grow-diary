# Hosted verification: production only

Matthew's 2026-09-28 decision supersedes the old preview-deployment checklist.
Verify at **https://verdantgrowdiary.com**. Use the
[production-only runbook](production-only-verification-runbook.md) for fixture
safety, exact receipts, review routing and legacy CI follow-ups.

Prior Vite/Vercel project settings were historical configuration, not today's
verified publisher. Measure the deployed identity before claiming platform or
release status. Build artifacts and preview URLs cannot establish live acceptance.

## Live checks

- Confirm frontend identity and dirty flag at the measurement time.
- Exercise direct route load/refresh for the approved fixture flow.
- Preserve manual/CSV/live/demo/stale/invalid labels; never fake live data.
- Never show unknown, stale or invalid telemetry as healthy.
- Verify the test account and grow/tent/plant ownership before a write.
- Tag grow records `[smoke <timestamp>]` and read them back in the same grow.
- Exclude customer data and the KEEP account.
- Preserve approval-required Action Queue, no AI execution and no device control.
- Keep credentials and server-only secret values out of output and receipts.

## Limits and rollback

No merge, Publish, APPLY or secret/environment edit is authorized. Frontend
identity does not prove Edge deployment, applied schema or live save/retrieve.
Record unmeasured axes. Revert prose only; production rollback requires its own
reviewed owner operation, not configuration or secret deletion.
