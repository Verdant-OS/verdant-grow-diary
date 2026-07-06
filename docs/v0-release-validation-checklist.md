# V0 Release Validation Checklist (per PR)

> Concise checklist to run against **every V0 PR** before merge. Companion
> docs: [`verdant-v0-product-spine.md`](./verdant-v0-product-spine.md),
> [`safety/static-safety-scans.md`](./safety/static-safety-scans.md),
> [`v0-manual-qa-checklist.md`](./v0-manual-qa-checklist.md) (manual QA), and
> [`launch-checklist.md`](./launch-checklist.md) (launch-level gates).
>
> Command names below are the repo's current scripts — inspect
> `package.json` before running, since scripts evolve. Never claim a check
> passed without running it; never hardcode or reuse old pass counts.

## Product scope

- [ ] Change serves the One-Tent Loop (or is explicit infrastructure/docs).
- [ ] No community / competition / public-mode / enterprise expansion.
- [ ] No new dependencies without explicit justification.
- [ ] Anti-feature-creep rules in the product spine still hold.

## Sensor truth

- [ ] Every new/changed reading surface carries a source label
      (live / manual / csv / demo / stale / invalid).
- [ ] No demo, csv, or stale data can appear as live.
- [ ] No fabricated values (VPD null when temp+RH pair missing, never fake 0).
- [ ] Dedupe constraint (`sensor_readings_dedupe_uidx`) untouched or
      strengthened, never weakened.

## AI Doctor safety

- [ ] No model/API calls added outside approved edge paths.
- [ ] Confidence, evidence, missing information, and what-not-to-do intact.
- [ ] New AI Doctor behavior comes with golden cases
      (`src/test/fixtures/aiDoctorGoldenCases.ts`); none weakened.

## Action Queue safety

- [ ] Every suggestion remains approval-required.
- [ ] No device command, relay, or equipment-control surface introduced.
- [ ] No automatic transition to approved/executed.

## Public/demo safety

- [ ] Public/demo surfaces make zero private-table reads and zero Supabase
      writes.
- [ ] Demo data clearly labeled; no autopilot/automatic-control implications
      in user-facing copy.

## Supabase/write boundary

- [ ] No `service_role` in frontend code.
- [ ] No new write paths from public surfaces.
- [ ] RLS untouched, or migration reviewed + tested.

## Typecheck / targeted tests

Run the checks relevant to the touched area (inspect `package.json` for the
current list):

```bash
npm run typecheck
bun run test:static-safety          # Action Queue / operating-loop guardrails
bun run docs:assert-safety          # docs safety scanners
bun run test:sensor-intelligence-safety
bun run test:ai-doctor-golden-cases # when AI Doctor is touched
```

- [ ] Typecheck clean.
- [ ] Targeted tests for the touched area pass.
- [ ] Relevant safety scanners pass.

## Full suite

- [ ] Full suite run when shared code, scanners, or test infrastructure
      changed (`bunx vitest run`); record the actual counts from the run.
- [ ] Docs-only changes: scanners + any doc-pinned tests suffice; full suite
      optional.

## Rollback notes

- [ ] PR description states how to roll back (usually: revert the squash
      commit) and any data/migration implications.
- [ ] Migrations, if any, have a documented down-path or explicit
      "irreversible" callout.
