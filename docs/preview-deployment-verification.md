# Hosted verification: production only

Matthew's 2026-09-28 decision supersedes the old preview-deployment checklist.
Verify at **https://verdantgrowdiary.com**. Use the
[production-only runbook](production-only-verification-runbook.md) for fixture
safety, exact receipts, review routing and legacy CI follow-ups.

Prior Vite/Vercel project settings were historical configuration, not today's
verified publisher. Measure the deployed identity before claiming platform or
release status. Build artifacts and preview URLs cannot establish live acceptance.

## Historical npm compatibility record

The existing `config/dependency-lockfile-transition.json` retains these exact
markers until its reviewed consumer inventory changes. They record historical
dashboard settings, not verified production configuration or instructions to
use another smoke host. Bun remains canonical; this documentation slice does
not alter the dependency transition policy.

```text
| Install command      | `npm install`  |
| Build command        | `npm run build`|
| Dev command          | `npm run dev`  |
```

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

## Frontend secret-exposure gate

Identify the current production publisher and selected project from measured
configuration before inspecting its environment. An authorized operator checks
the frontend build's variable names and exposure settings, without copying secret
values: no service-role key, JWT secret, private database URL or other privileged
credential may enter a public/client variable or browser bundle. Check the actual
browser-delivered JavaScript with secret detection whose output is limited to the
finding category and file location; never print matching values or token fragments.
The committed publishable/anon key is the only allowed browser credential and does
not waive inspection for privileged credentials.

Both the publisher configuration and delivered bundle checks require an exact
deployment identity and dated PASS / FAIL / BLOCKED / NOT_MEASURED receipts. If
access is closed, retain NOT_MEASURED and block the release verdict; build success,
secret masking in logs, or an old preview project's settings are not substitutes.
A finding stops the release for the authorized owner to remediate. This checklist
does not authorize secret reads, edits, rotation, environment changes or Publish.

## Limits and rollback

No merge, Publish, APPLY or secret/environment edit is authorized. Frontend
identity does not prove Edge deployment, applied schema or live save/retrieve.
Record unmeasured axes. Revert prose only; production rollback requires its own
reviewed owner operation, not configuration or secret deletion.
