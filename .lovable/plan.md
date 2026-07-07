# Verdant Grow OS — Full Project Scope for Codex

## 1. Product

Verdant Grow OS. Standalone grower software.

Promise: **Plant memory. Sensor truth. Better decisions.**

Target user: serious home + mid-tier cultivators who want honest data provenance, cautious AI, and grower approval on every consequential action.

North-star loop (V0, non-negotiable):

```text
Grow -> Tent -> Plant -> Quick Log (Diary + Photo + Sensor Snapshot)
       -> Timeline -> AI Doctor -> Alert -> Approval-Required Action Queue
```

Gate 1: 30-second Quick Log. Everything is judged by whether it strengthens Quick Log speed, completion rate, AI Doctor context richness, or the immediate next loop step.

## 2. Stack

- React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui
- Lovable Cloud backend (Supabase under the hood — never say "Supabase" to users)
- Semantic HSL design tokens in `index.css` + `tailwind.config.ts`
- Vitest for unit + component + static safety tests
- Playwright (sandbox-driven) for runtime checks

## 3. Layering (enforced)

| Layer | Path |
|---|---|
| Constants / config | `src/constants/*` |
| Pure rules | `src/lib/*Rules.ts` |
| Advisors / engines | `src/lib/*Advisor.ts`, `*Engine.ts` |
| View models | `src/lib/*ViewModel.ts` |
| Hooks | `src/hooks/*` |
| UI (presenters only) | `src/pages/*`, `src/components/*` |
| Edge functions | `supabase/functions/*` |
| Migrations | `supabase/migrations/*` |

UI never owns domain rules. No random. Deterministic. Null-safe. Test-backed.

## 4. Current State (shipped, protected)

- Sensor read-path: confidence scoring, calibration preview, source labeling (`live | manual | csv | demo | stale | invalid`).
- Manual Sensor Snapshot: append-only edit history (`manual_sensor_snapshot_edits`), per-metric audit rows, correction wiring via `/sensors#manual-reading`, static + UI safety fences.
- Quick Log v2: idempotent `quicklog_save_event` RPC, typed water/feed payloads, sensor snapshot capture.
- Video import Slice 1: private `diary-videos` bucket, client-side rules (`videoAttachmentRules.ts` — 100 MB, 60 s, MP4/MOV/WebM), `TimelineVideoCard`, storage cleanup on entry removal, `photo_url = NULL` invariant preserved. Server-side bucket size/MIME limits still pending manual console step.
- Billing: `billing_subscriptions` is truth. `profiles.tier` is XP only. AI credits server-enforced by `ai_credit_spend` RPC (Free: 3/grow, Pro/Founder: 100/month capped).
- MCP / Agent Integrations: 3-tool read-only surface with OAuth, verification panel, CI harness. Browser harness intentionally unavailable.
- Email infrastructure on `notify.verdantgrowdiary.com` (pending DNS verify).

## 5. Hard Safety Rules (Codex must obey)

Never:
- Fake live data. Never classify demo/stale/invalid/unknown as healthy.
- Blind automation. No device control. Action Queue stays approval-required.
- Expose `service_role`, bridge tokens, webhook secrets, raw payload internals, or private env values.
- Reuse `profiles.tier` for billing gating.
- Add checkout / webhook / provider SDKs during entitlement work unless requested.
- Mutate `sensor_readings` for corrections — corrections append new rows + audit rows only.
- Update `storage.buckets` via SQL migration (tooling blocks it).
- Touch `src/integrations/supabase/client.ts`, `types.ts`, `.env`, or `supabase/config.toml` project-level settings.
- Auto-create Action Queue items from alerts unless explicitly asked.

Always:
- Preserve on every sensor reading: `source`, `captured_at`, `tent_id`, `plant_id?`, `confidence`, `raw_payload`.
- CSV imports write `source: "csv"`; vendor lineage in `raw_payload.source_app`.
- Every new `public.*` table gets `GRANT` + `ALTER TABLE ENABLE RLS` + policies in the same migration.
- Roles live in `user_roles` + `has_role()` SECURITY DEFINER — never on `profiles`.
- AI Doctor output includes: Summary, Likely issue, Confidence, Evidence, Missing info, Possible causes, Immediate action, What not to do, 24h follow-up, 3-day plan, Risk level, Action Queue suggestion (only if appropriate).

## 6. Do-Not-Touch List

- `src/integrations/supabase/*` (auto-gen)
- `.env`, `supabase/config.toml` project-level settings
- Existing sensor-ingest edge functions (`pi_ingest_commit_batch`, EcoWitt bridge)
- Pheno / Claude / MCP surface unless the slice explicitly names it
- Video/media pipeline outside the Slice 1 boundary
- `diary_entries.photo_url` invariant (photos only; videos = NULL + `details.video`)

## 7. Open Slices (Codex can pick up, in priority order)

1. **Server-side `diary-videos` bucket limits** — manual console step (100 MB, MIME allow-list). Contract test already pins client rules.
2. **Video Slice 2** — poster/thumbnail generation (canvas frame capture), video counts in a separate "Recent Videos" strip (never Recent Photos).
3. **AI Doctor context enrichment** — feed manual snapshot corrections + audit trail into the evidence bundle.
4. **Dashboard mobile regression** — PageHeader Option A/B decision still open from earlier triage.
5. **EcoWitt physical validation** — gates further hardware-touching product features.
6. **Email templates** — auth email scaffolding + first transactional (grow milestone / harvest recap) after DNS verify lands.

## 8. Required Response Format for Codex

Every implementation task must return exactly:

```text
Summary
Requirements / assumptions
Audit findings
File-level plan
Implementation notes
Files changed
Tests added / updated
Validation commands
Exact pass/fail counts
Safety verdict
Deferred items
Risk / rollback notes
```

No "all green" claims without running. Report skipped validation honestly. Stop-ship over silent scope expansion.

## 9. Validation Toolbelt

- `bun run typecheck`
- `bunx vitest run <targeted files> --reporter=dot`
- `bunx vitest run src/test/action-queue-safety.test.ts` (safety fence — must stay green on every slice)
- `node scripts/run-one-tent-loop-smoke-test-audit.mjs` (when present)
- `bun run scripts/run-billing-rls-harness.ts` / `run-ai-credits-rls-harness.ts` for money-path work
- Playwright via shell for UI regressions (see browser-use rules)

## 10. Working Style

- Small additive slices over rewrites.
- Audit first, then propose smallest file-level plan, then implement.
- Prefer new pure helpers in `src/lib/` over expanding JSX.
- Add static safety tests alongside behavior tests for every sensitive slice (writes, RLS, secrets, evidence counts, source labels).
- On BLOCKED conditions (schema tool refuses, missing tool surface, ambiguous scope): stop and report — do not silently expand or fake completion.
