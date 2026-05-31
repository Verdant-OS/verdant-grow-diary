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

## Tests

```bash
npx vitest run         # full suite
npx vitest             # watch mode
```

## Safety philosophy

Verdant follows a read-only, no-write, no-control architecture for advisory surfaces:

- No fake live data. Sensor readings are labeled `demo`, `manual`, `live`, `stale`, or `invalid`.
- No blind automation. AI suggests; the grower approves.
- No device control from advisory surfaces. The Action Queue is approval-required.
- Ownership is enforced server-side via Supabase RLS — never trust client-provided `user_id`.
- No `service_role` keys in client code.

See `docs/buildops-kit/README.md` for the full BuildOps Kit covering product context, data-labeling, fixture contracts, AI Doctor output rules, Action Queue safety, prompt scaffolds, and the QA regression checklist.

## Documentation

- [BuildOps Kit](docs/buildops-kit/README.md) — product context, safety rules, fixtures, templates
- [Glossary](docs/glossary.md)
- [One-Tent Loop](docs/one-tent-loop.md)
- [QA regression checklist](docs/qa-regression-checklist.md)
