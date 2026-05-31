# Verdant

Verdant is a standalone Grow Room Operating System. It turns grow logs, plant photos, sensor readings, alerts, and AI-assisted analysis into safer grow decisions and better harvest outcomes.

The current product priority is the V0 operating loop:

Grow → Tent → Plant → Diary/Logs → Photo → Sensor Snapshot → AI Doctor → Alert/Recommendation → Approval-Required Action Queue

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Auth, Database, Storage, Edge Functions) via Lovable Cloud
- Vitest for tests

## Local setup

```bash
npm install
npm run dev
```

The dev server runs Vite. Open the URL it prints.

## Environment variables

Lovable Cloud auto-manages the `.env` file. Do not edit it by hand. Variables provided:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Additional secrets (API keys for edge functions, third-party services) are configured via Lovable Cloud secrets — never commit secrets to the repo.

## Production deployment

Production domain: **https://verdantgrowdiary.com** (also served on
`https://www.verdantgrowdiary.com`).

- Only the `/welcome` landing route is public. All other routes require
  authentication and are gated behind Supabase Auth.
- SSL/TLS certificates are managed by the Lovable hosting platform. Both the
  apex and `www` hostnames must serve a valid certificate before announcing a
  release.
- DNS changes (apex `A` record, `www` `A` record) can interrupt SSL issuance —
  re-verify the certificate after any DNS update.
- See [`docs/launch-checklist.md`](docs/launch-checklist.md) for the full
  pre-launch verification steps.

Public crawler surfaces:

- [`public/robots.txt`](public/robots.txt) — allows crawling and points at the
  production sitemap.
- [`public/sitemap.xml`](public/sitemap.xml) — lists only `/` and `/welcome`.
  Private authenticated routes are intentionally excluded.

## Validation

Run all of the following before requesting review:

```bash
bunx vitest run
bunx eslint <changed files>
npm run build
```

All existing tests must pass. New behavior must ship with new tests.

Watch-mode tests:

```bash
npx vitest
```

## Development workflow & safety standards

Every PR that touches data access, auth, AI, the Action Queue, sensors, device
control, or migrations must satisfy the Verdant safety checklist.

- [`docs/security-checklist.md`](docs/security-checklist.md) — required
  per-PR security review.
- [`docs/security-exceptions.md`](docs/security-exceptions.md) — the registry
  of intentionally accepted security warnings. Any deviation from the
  checklist must be recorded here.
- [`.github/pull_request_template.md`](.github/pull_request_template.md) — PR
  template that links the checklist and the validation commands above.

### AI Coach safety

The AI Coach is read-only and suggest-only. It must never trigger writes,
device commands, or unattended Action Queue changes. Safety regressions are
caught by:

- [`src/test/ai-coach-security.test.ts`](src/test/ai-coach-security.test.ts)
- [`src/test/ai-coach-output-safety.test.ts`](src/test/ai-coach-output-safety.test.ts)

### Action Queue safety

Action Queue items remain approval-required. No code path may
auto-approve, auto-complete, or auto-cancel queue items, and no executable
device payload may ship through the queue. Safety and audit guarantees are
covered by:

- [`src/test/action-queue-safety.test.ts`](src/test/action-queue-safety.test.ts)
- [`src/test/action-queue-audit.test.ts`](src/test/action-queue-audit.test.ts)

### Sensor / live-data truthfulness

Sensor readings must never be faked as live. Every reading is labeled as one
of `demo`, `manual`, `live`, `stale`, or `invalid`. Stale, missing, or
suspicious telemetry must be surfaced as such — never silently substituted
and never relabeled as healthy. See
[`docs/sensor-truth-rules.md`](docs/sensor-truth-rules.md) and
[`docs/data-labeling-spec.md`](docs/data-labeling-spec.md).

### RLS / auth.uid() ownership

RLS is the ownership boundary for every user-owned table. Policies are
written against `auth.uid()` and evaluated server-side.
Never trust client-provided `user_id` — the frontend must not send it as a
trusted field, and any client-supplied value must be re-checked server-side.
No `service_role` key may appear in client code.

## Pi-ingest deployed smoke test

After deploying the `pi-ingest-readings` edge function, run the deployed
pi-ingest smoke verification described in
[`docs/pi-ingest-smoke-runbook.md`](docs/pi-ingest-smoke-runbook.md). It
covers signed-bridge happy-path, replay/idempotency, tampered signature, and
unknown-bridge cases. The contract that runbook verifies lives in
[`docs/pi-ingest-write-transaction-contract.md`](docs/pi-ingest-write-transaction-contract.md).

## Safety philosophy

Verdant follows a read-only, no-write, no-control architecture for advisory
surfaces:

- No fake live data. Sensor readings are labeled `demo`, `manual`, `live`,
  `stale`, or `invalid`.
- No blind automation. AI suggests; the grower approves.
- No device control from advisory surfaces. The Action Queue is
  approval-required.
- Ownership is enforced server-side via Supabase RLS — never trust
  client-provided `user_id`.
- No `service_role` keys in client code.

See [`docs/buildops-kit/README.md`](docs/buildops-kit/README.md) for the full
BuildOps Kit covering product context, data-labeling, fixture contracts, AI
Doctor output rules, Action Queue safety, prompt scaffolds, and the QA
regression checklist.

## Documentation

- [BuildOps Kit](docs/buildops-kit/README.md) — product context, safety rules, fixtures, templates
- [Glossary](docs/glossary.md)
- [One-Tent Loop](docs/one-tent-loop.md)
- [QA regression checklist](docs/qa-regression-checklist.md)
- [Launch checklist](docs/launch-checklist.md)
- [Security checklist](docs/security-checklist.md)
- [Pi-ingest smoke runbook](docs/pi-ingest-smoke-runbook.md)
