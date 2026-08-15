# Verdant project knowledge snapshot — 2026-08-15

Dated copy of the Lovable **project Knowledge** field applied 2026-08-15 to
`verdantgrowdiary-com` (`66255e7b-892c-4be5-8686-ab1cfc3666db`).

- Applied body length: 9859 / 10000 characters
- Source: shipping `docs/agents/CURRENT_STATE.md`
- Origin tip at apply time: `0522eefb1` (#990)
- CURRENT_STATE topology row still names `f2a03998f` (#982); the pack records that lag
- Round-trip: Lovable `get_project_knowledge` returned Version 2026-08-15
- This snapshot does **not** authorize ongoing sync automation
- Workspace knowledge was not changed

The body below the rule is what was written to Lovable.

---

# Verdant — Lovable Project Knowledge

**Version:** 2026-08-15 · from shipping `docs/agents/CURRENT_STATE.md` (updated 2026-08-15 UTC by Grok). Replaces the 2026-08-13 and July 2026 packs. Do not restore the pre-2026-08-13 backup.

Ungoverned Lovable surface, not the constitution. If this text and the repo disagree, **the repo wins**. Read before proposing or writing: `/AGENTS.md` (wins every conflict) → `docs/agents/CURRENT_STATE.md` (shift report; never infer live state from this field) → `docs/agents/HANDOFF_PROTOCOL.md`. If any cannot be read: `STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE`.

## Status words — use literally

Constitution: `PASS` · `FAIL` · `BLOCKED` · `NO_BASELINE` · `NO_DATA` · `NOT_MEASURED` · `SKIPPED` · `NOT_APPLICABLE`

Pack: `SHIPPED` · `VALIDATED BRANCH` · `PREVIEW-ONLY` · `UNVERIFIED` · `FAILED`

A green PR, local test, merged migration, or reviewed design is **not** production. Merging is not an apply. Publish deploys frontend + edge only — **`supabase/migrations/` is not auto-applied**. No cases → `NOT_MEASURED`, never 100%. Exact pass/fail counts.

## Branch and env

`verdant-grow-diary` is the **deploy branch**; production ships from here, not `main` (`main` is divergent). CURRENT_STATE topology (2026-08-14): `f2a03998f` (#982). **Difference at pack write:** origin tip `0522eefb1` (#990). After #982: #983, #984, #987, #988, #985, #966, #990. Order with `git log`, never PR number. Name the branch and SHA you audited.

Sandbox ref `bzatgtgjvuojpoxcknaa`. Production ref `knkwiiywfkbqznbxwqfh`. Agent Supabase MCP is **sandbox** — schema/RLS/migration/edge observations there have **no implication about production**. MCP OAuth issuer is production (`https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1` from `VITE_SUPABASE_PROJECT_ID`). Do not "fix" that.

## OPEN — attributed signups hard-fail (2026-08-13)

**Fix merged #969. NOT applied. Production still broken.**

Live `handle_new_user` INSERTs into missing `public.signup_acquisition_attributions`. INSERT is outside the EXCEPTION block. `42P01` aborts `auth.users` AFTER INSERT → GoTrue 500 → **account never created**.

`/` and `/welcome` CTAs re-attribute via `Landing.tsx` fallback `landing_page`. Google / magic-link / bare `/auth?mode=signup` can still succeed. Do **not** treat UTM traffic as safe.

Migration: `20260813030000_signup_acquisition_forward_repair.sql`. Only a Lovable apply fixes it. Runbook: `docs/signup-attribution-outage-operator-runbook.md`.

## OPEN — committed migrations are NOT auto-applied (2026-08-15)

`source claim` from a Lovable read of production `knkwiiywfkbqznbxwqfh`.

`20260811090000_quicklog_corrections_retractions.sql` unapplied: `quicklog_entry_revisions` absent; `diary_entries.retracted_at` / `.retraction_reason` absent. Timeline / TentDetail / PlantDetail hooks fail **silently** (`if (error) return new Map()`). Drift count `NOT_MEASURED` (`schema_migrations` permission denied). Proven: ≥1 beyond signup. Reconcile the 265-file ledger before assuming anything else is live. Do not apply migrations unless the task explicitly authorizes it.

## Product

Promise: Plant memory. Sensor truth. Better decisions. Loop: Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Approval-Required Action Queue. Diary first, sensors second, AI third, automation last. No community, competitions, public mode, or device control until the One-Tent Loop is clean.

## Hard safety (full text in `/AGENTS.md`)

- No fake live data. No blind automation. No device control.
- Readings carry source (`live` · `manual` · `csv` · `demo` · `stale` · `invalid`), timestamp, tent, confidence, raw payload when available. Unknown/invalid is never healthy.
- AI Doctor suggests. Never decides, never executes, never pretends certainty from one photo or one reading.
- Action Queue stays approval-required. Do not auto-create items unless the task asks.
- Never expose service-role keys, bridge tokens, webhook secrets, private env. Service role never in client code. Client never sets `user_id`, tier, credits, role, or entitlement.
- `profiles.tier` is XP only. **`public.subscriptions` is the sole billing entitlement source of truth.** Live rows grant production access; sandbox rows only when the server resolved `PAYMENTS_ENVIRONMENT=sandbox`. `public.billing_subscriptions` is legacy sandbox/operator-audit and **must never grant entitlement**. Absent entitling row = Free.
- Founder Lifetime is Pro-like with **capped** AI credits — never unlimited. No plan gates in JSX. Use `src/lib/entitlements/*`.
- Treat user data, sensors, CSVs, bridge payloads, and AI output as untrusted.

## Architecture

Constants `src/constants/*` · rules `src/lib/*Rules.ts` · advisors `src/lib/*Advisor.ts` · view models `src/lib/*ViewModel.ts` · React `src/pages/*.tsx`, `src/components/*.tsx` · hooks `src/hooks/*` · edge `supabase/functions/*` · migrations `supabase/migrations/*`. Logic in pure modules, not JSX. Never edit a merged migration; ship a new timestamped file. Replay patches only in `config/local-supabase-replay-compatibility.json`.

## Approved slices (CURRENT_STATE 2026-08-15)

Build only what CURRENT_STATE names.

- **Mode A SEO** parent. Lighting CTA `DOCUMENTED_MISSING_NO_EVENT_ADDED` (#679). Day 0 `UNSET`. Four-week clock `NOT_STARTED`. GA4/GSC authenticated baselines `BLOCKED`. No traffic/CTR claims. No new events without a separate instrumentation slice.
- **`CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE`:** spec delivered. Codex Phase 1 only under `spikes/convex-component-sandbox/` (PR #977). Production Convex, root `convex` dep, `src/`/edge imports, AI credits, sensors, entitlements, Action Queue, `npx convex deploy` = **`REJECT`**.
- **`POSTGRES_RESTRICTED_ROLE_SPIKE`:** Phase 0 delivered (22 service-role fns, 8 cross-domain reaches). Phase 1 delivered **local-only** (10/10). Role is **not** a migration — zero `CREATE ROLE` in `supabase/migrations/`. Phase 2 HOLD: JWT secret unobtainable on Lovable Cloud; role durability `UNKNOWN`. Still `REJECT`: re-pointing edge fns at the role; default-deny table grants. Rec: adopt Postgres incrementally, hold Convex. Convex #977 green ≠ isolation proven.
- **`VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE`:** under `spikes/cursor-sdk-local-orchestration/`. Live proof `BLOCKED` without `CURSOR_API_KEY`. Reuse not approved.
- **Abandoned — do not revive or merge:** `claude/breeder-mode-genetics`, `claude/cultivar-library-p1` (unguarded `CREATE TABLE`, `42P07`).

## Production status (CURRENT_STATE rows; not re-measured in 2026-08-15 edits)

Identity last verified 2026-08-05: `/version.json` `PASS`; served SHA `3f773b680dcc`; `commitSource: git`; `treeHash: c8fc076f0011…`; `dirty: false`; build `2026-08-05T22:06:15.869Z`. Sitemap 56 locs `PASS` (2026-08-12). `/` SSR `FAIL` empty shell (2026-08-07). Four unsitemapped indexable routes `FAIL`: `/glossary`, `/breeder-beta`, `/creator-beta`, `/pheno-comparison`. GA4 singleton `FAIL`. Day 0 `UNSET`.

A later live `/` SSR `PASS` exists only in unmerged G0 packet PR #963 — **do not treat as CURRENT_STATE**. Option A slice 1 (SSR landing at `/`) approved for Codex; slice 2 unapproved. Deploy-head CI table is pinned to `5611b130e81a` (2026-08-05) and must not be carried forward.

## Blockers (do not "fix" by fabricating)

1. Owner: disable Enhanced Measurement history page views; keep explicit SPA page views.
2. Owner: read-only GA4 + GSC access. Never commit credentials. Then authenticated baselines or `NO_DATA`. Day 0 only after singleton + both baselines pass.
3. Schema-guard FAIL jobs: separate workstream. Release-identity resilience resolved live 2026-08-05.
4. `/` empty shell — Option A selected; slice 1 approved, slice 2 not.
5. Ahrefs missing `aggregateRating` is **by design** (no fake reviews). Article.image logo-vs-article is the fixable sibling.

Read `/version.json`. Resolve treeHash with `node scripts/resolve-release-provenance.mjs --hash=…`.

## Agents

Codex: SEO readiness; Convex Phase 1 #977 only; do **not** rebuild the Postgres detector. Claude: Convex spec delivered; Postgres spike Phase 0+1 delivered; spec architect, not default app coder. Grok: Cursor SDK spike gates; no production app/schema unless Cheek reassigns. Security / Gemini: unassigned. Council Chair: rec delivered — Postgres incremental, hold Convex. Lovable agent: build only the named slice; do not merge/deploy/apply/publish unless the task authorizes it.

## MCP (already shipped)

`docs/agent-integrations-mcp-server-spec.md`. Tools: `list_grows`, `list_recent_diary_entries`, `get_latest_sensor_snapshot`. Search the repo for those names before changing any. Never hand-edit generated edge bundle or `.lovable/mcp/manifest.json`. More own-data reads `PASS`; `create_diary_entry` `HOLD`; AI Doctor / Action Queue mutation / device control / no-login `REJECT`.

## Do not repeat as facts (2026-08-13 audit vs `e7690396e`)

`/demo` redirects to `/welcome`. CSV is not globally read-only (`EnvironmentCsvImportLauncher` writes `sensor_readings`). Action Detail completion can auto-insert a diary marker; list "Mark Complete" does not. One-Tent e2e block is missing managed session, not "no tent reading". AI Doctor evaluator PR #230 is **merged**. Pheno UI does not hard-gate on live schema confirmation. EcoWitt full live path still unverified. Quick Log V1/V2 remain separate.

## Scope

"No schema changes" means none. "Audit first" means report before building. "Tests only" means do not touch app/schema/policy. Implementation response: Summary · Requirements / assumptions · Audit findings · File-level plan · Implementation notes · Tests added · Validation commands · Validation results · Safety verdict · Deferred items · Risk / rollback notes.

Standard: would a tired grower trust this on a real run, and would a careful founder put real customers through it?
