## Demo Seed Readiness v1 — Plan

### Plan-mode findings

- **No DB seed pattern exists.** `supabase/` has only `config.toml`, `functions/`, `migrations/`, `tests/`. No `seed.sql`, no `scripts/seed-*.ts`. The only "seed" tool is `scripts/verify-seed.ts` (read-only verifier).
- **Fixture convention exists** in `fixtures/*.json` (notably `fixtures/demo-grow-one-tent.json`) with `is_fixture: true`, `is_demo: true`, `source_type: "demo_fixture"`. These are read-only JSON fixtures, not DB rows. They are not currently imported by `src/` code (rg shows zero importers).
- **Operator demo tooling exists**: `src/pages/OperatorPostGrowReflectionDryRun.tsx`, `src/pages/OperatorOneTentLoopSmokeTest.tsx`, all under the `/operator/*` admin-gated routes (Slice A guard). Safe surface for a fixture-driven demo viewer.
- **Evidence ref helpers ready**: `sensorSnapshotEvidenceRefRules.buildSensorSnapshotEvidenceRefs`, `originatingTimelineEventRules.normalizeOriginatingTimelineEvents`, and `originatingTimelineEventAdapter` already enforce safe ref shape. We can build refs from a fixture-id without inferring.
- **Grow UUID rendering** in `AlertDetail.tsx` (line 562) and `ActionDetail.tsx` (line 679 via `IdField`) shows the raw UUID under the "Grow" label. Both pages already compute `growName` from the grows list — only the JSX needs a fallback chain.
- **No automated seeding is safe** for a hosted Supabase project from client code (no service_role on client). RLS-scoped inserts would require an authenticated user session. Therefore the demo path will be **fixture-driven** (read-only) plus a **docs runbook**, not a DB-mutating seed script.

### Approach

**Part A — Raw grow UUID polish (presentational only).**
- Edit `src/pages/AlertDetail.tsx` (~line 561) and `src/pages/ActionDetail.tsx` (~line 679) so the "Grow" field prefers `growName`, falling back to the short label `"Current grow"`. Never render the raw UUID string in the visible text. The `to=` link target keeps the UUID in the URL (acceptable — not user-facing copy).
- Add a tiny pure helper `src/lib/growDisplayLabel.ts` with `formatGrowDisplayLabel(name, id)` returning `name ?? "Current grow"` and explicitly never returning a UUID-shaped string.
- Tests: `src/test/grow-display-label.test.ts` covers UUID rejection, null/empty name fallback, and presence of canonical "Current grow" copy.

**Part B — Demo Seed Readiness via fixture + operator viewer (no DB writes).**

No new DB rows. No new migrations. No new public routes. Reuses `fixtures/demo-grow-one-tent.json` shape and the `/operator/*` admin gate.

1. **New fixture** `fixtures/demo-evidence-chain.json` extending the one-tent fixture with:
   - one `sensor_reading` row (`id: "demo_reading_vpd_001"`, `source: "demo"`, `metric: "vpd"`, `value: 1.62`, `captured_at`, `tent_id`, `plant_id`).
   - one `sensor_snapshot` shape carrying `metric_refs: { vpd: "demo_reading_vpd_001" }`.
   - one `alert` row referencing that snapshot via `originating_timeline_events: [{ id: "demo_reading_vpd_001", type: "sensor_snapshot", source: "demo", occurred_at }]` — built through the existing `buildSensorSnapshotEvidenceRefs` helper at fixture-load time, not hand-typed.
   - one `action_queue` row in `pending_approval` whose `originating_timeline_events` is forwarded via `forwardAlertRefsToActionQueue` from the alert row.
   - one `harvest`/archived `grow` state with reviewed alert/action history so `PostGrowLearningReport` renders populated content.
   - All rows carry `is_demo: true` and an `is_fixture: true` envelope.

2. **New pure loader** `src/lib/demoEvidenceChainFixture.ts`:
   - Loads the JSON, runs ref builders through the real adapters, returns a typed view model.
   - Strips any field outside an allow-list (`FORBIDDEN_REF_FIELDS` already enforces this).
   - Asserts at load time: no reading is `live`, every alert/action has at least one ref id present in the readings set.

3. **New operator-only viewer** `src/pages/OperatorDemoEvidenceChainPreview.tsx` mounted under the existing `/operator/*` group in `src/App.tsx`. Renders:
   - source-labeled reading (Demo badge),
   - alert with `EvidenceLinkageBadges`,
   - action with `EvidenceLinkageBadges`,
   - a clearly-labeled "Preview of populated Post-Grow Report" panel using existing `PostGrowLearningReport` presenter against the fixture grow, with the print/save affordance visible.
   - Prominent "DEMO FIXTURE — not live data" banner.

4. **Docs runbook** `docs/demo-seed-readiness-v1-runbook.md`:
   - Where the fixture lives, how to load the operator viewer, how to run the chain end-to-end for a demo recording.
   - Do-Not-Say list (fake-live, automation, device-control terms).
   - Wired into `docs/README.md` and the existing `bun run test:docs-demo-safety` glob (the script already globs `docs/*demo-script*.md` — extend pattern or rename file to match).

### Files to add/change

**Add**
- `fixtures/demo-evidence-chain.json`
- `src/lib/growDisplayLabel.ts`
- `src/lib/demoEvidenceChainFixture.ts`
- `src/pages/OperatorDemoEvidenceChainPreview.tsx`
- `docs/demo-evidence-chain-demo-script-v1.md` (matches existing safety glob)
- Tests:
  - `src/test/grow-display-label.test.ts`
  - `src/test/alert-detail-grow-label-uuid.test.tsx`
  - `src/test/action-detail-grow-label-uuid.test.tsx`
  - `src/test/demo-evidence-chain-fixture-shape.test.ts`
  - `src/test/demo-evidence-chain-fixture-static-safety.test.ts`
  - `src/test/operator-demo-evidence-chain-preview.test.tsx`

**Edit (minimal)**
- `src/pages/AlertDetail.tsx` — swap raw `{alert.grow_id}` for safe label.
- `src/pages/ActionDetail.tsx` — pass `growName` to `IdField` (extend `IdField` to render label-first, id-as-link-target only).
- `src/App.tsx` — add operator route.
- `docs/README.md` — index the new demo script.

**Do NOT touch**
- Any migration, RLS, Edge function, auth config.
- Any production hook that writes alerts/actions.
- Any public route.
- `src/integrations/supabase/client.ts` / generated types / `.env`.

### Safety envelope

- No DB writes. No service_role. No AI calls. No automation copy. No device control.
- Demo readings labeled `demo`; the source-label tests will fail if any UI line in the new files contains "Live" for fixture data.
- Refs built through existing adapters → no inference from prose/timestamps/metric/nearest reading.
- Static safety scan added for the new files banning: fake live, auto execute, device command, set fan/light/irrigation, dose nutrients, guaranteed, diagnosed with certainty, raw_payload, service_role, bridge_token, api_token, access_token, refresh_token, jwt, prompt, completion, model_output.
- Operator route stays behind `RequireOperatorRole`.

### Validation

- `bunx vitest run` on the new + adjacent files (grow-display-label, alert/action grow-label-uuid, demo fixture shape + static safety, operator preview, plus existing `evidence-linkage-*`, `sensor-snapshot-metric-refs`, `evidence-coverage-*`, `post-grow-report-*`).
- `bun run test:docs-demo-safety`
- `node scripts/sensor-safety-check.mjs`
- `bunx tsgo --noEmit`

### Risk / rollback

- Pure additive except two presentational fallbacks in AlertDetail/ActionDetail. Rollback = revert ~10 LOC + delete new files.
- No data, schema, RLS, edge, or public-route surface changed.

Approve and I'll implement Parts A + B in one slice.