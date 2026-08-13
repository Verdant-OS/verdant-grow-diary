# Full-application zero-defect audit — 2026-08-13

Audit-only. No application, schema, RLS, or edge-function code was changed.
The snapshot table is [zero-known-defects-board.md](./zero-known-defects-board.md).

```text
SENTINEL_ACK
agent: Grok (Cursor Cloud)
assigned_role: Search, Market, and Backlink Intelligence Lead (default);
  this pass is an explicit Cheek task to run the full-application zero-defect board
sentinel_version: 2026-08-09.1
files_read: AGENTS.md, docs/agents/CURRENT_STATE.md, docs/agents/roles/grok.md
current_task: Run full application zero defect board
scope: Re-verify GitHub `zero-defect` issues against deploy HEAD; expand the
  audit beyond One-Tent Loop; refresh the snapshot; record live public-surface
  and CI evidence
out_of_scope: Production code/schema/RLS/edge changes; filing GitHub issues
  (gh is read-only); editing docs/agents/CURRENT_STATE.md (open PR #913 already
  edits that file); GA4/GSC authenticated baselines; Convex implementation
conflicts_found:
  - CURRENT_STATE lists Grok Unassigned; Cheek's user query assigns this board run
  - CURRENT_STATE deploy head `6434ea2a8` vs this checkout `bf9a6111f`
  - CURRENT_STATE `/` SSR `FAIL` (2026-08-07) vs code #949 + live PASS (this pass)
  - Open PR #913 also edits CURRENT_STATE (SEO docs) — collision; that file left alone
  - Grok role default is research-only / no production code — honored (docs only)
data_access_status: Public HTTPS to verdantgrowdiary.com PASS; GitHub issues
  PASS; org project 2 NOT_FOUND; Supabase MCP is sandbox (production schema BLOCKED)
write_permission: Docs snapshot only
```

## Requirements / assumptions

- "Run the board" means audit and snapshot, not a fix-all slice.
- GitHub issue state wins over the 2026-08-08 markdown snapshot.
- Status vocabulary from AGENTS.md is used literally.
- Production claims require a live fetch or a named CI run on this SHA.

## Audit findings

### Repository identity

| Facet | Finding | Label |
| ----- | ------- | ----- |
| Branch / SHA | `verdant-grow-diary` @ `bf9a6111f` (#954) | established fact |
| Production identity | `version.json` commit matches this SHA | established fact |
| Routes | 142 `APP_ROUTES` (41 public / 46 auth / 31 operator / 6 internal / 18 redirect) | established fact |
| TypeScript | `tsconfig.json` `"strict": true`; `tsconfig.app.json` absent | established fact |
| Package manager | bun 1.3.14; `node_modules` present, not reinstalled | established fact |

### P0 surfaces

All seven Hard Safety / stop-ship surfaces in the 2026-07-30 contract were
re-scanned. **No P0 FAIL.** Details in the snapshot P0 section.

Highest residual in the same *family* as a former P1: `useRequireAuth`
lacks `.catch` (`src/hooks/useRequireAuth.ts`). AppShell holds children
behind `authStatus === "loading"` (`src/components/AppShell.tsx`). Tests do
not reject `getUser()`. Classified **P2 proposed**, not P1: not reproduced,
and supabase-js typically resolves `{ error }` rather than throwing.

### Closed P1s re-verified

#580, #581, #582, #583, #584, #585, #562 remain closed in GitHub and still
hold in code + named regression tests (see Validation results).

### One-Tent Loop / Action Queue

| Item | Verdict | Notes |
| ---- | ------- | ----- |
| #583 env-check RPC params | PASS | `legacyQuickLogUnifiedSave.ts` |
| #586 atomic create RPC | PARTIAL | RPC exists; client INSERT still allowed; two non-RPC writers remain |
| #587 local day bounds | PASS | `timelineDateRangeRules.ts` |
| #596 env-check → alerts | PASS | `snapshotFromEnvironmentCheck` |
| #602 tent-scoped diary snapshot | PASS | `diaryEvidenceTentScopeRules.ts` |
| #603 env-check evidence trail | PASS | `diary_evidence_ref` |
| AI Doctor caps / AQ rewrite | PASS | device strip gap on 24h/3-day fields (proposed P2) |
| Alert persist → no auto AQ | PASS | `v0-operating-loop-contract.test.ts` |

### Billing / MCP / pheno

- `profiles.tier` is not billing SoT. `useMyEntitlements` reads
  `public.subscriptions`. Founder AI cap is 100/month in `planCatalog.ts`.
- MCP tools: three read-only, OAuth required (`src/lib/mcp/index.ts`). Live
  publication **BLOCKED**.
- Pheno P2 cluster #564–#569 closed. Open P3s #570–#574, #576 still match
  source. #585 keepers nav still reachable.

### SEO / public surface (live)

| Axis | Status | Provenance |
| ---- | ------ | ---------- |
| `/version.json` | PASS | curl 2026-08-13 |
| `/` SSR landing | PASS | curl 2026-08-13; 52 701 bytes; h1 + canonical; ~1039 words |
| sitemap 56 locs | PASS | curl 2026-08-13 |
| Six STATIC_ONLY indexable routes | FAIL | curl 2026-08-13; `robots: index, follow`; not in sitemap |
| Lighting / GA4 / GSC | NOT_MEASURED | not this pass |

`CURRENT_STATE.md` still records `/` as FAIL (2026-08-07) and four unsitemap'd
routes. Not edited here because open PR #913 already touches that file.

### CI on this SHA

**Push** (`event: push`, SHA `bf9a6111f`): Typecheck, ESLint, CI, Full Vitest
Suite (PR gate), Security regression, Security DB Local, One-Tent Loop smoke,
EcoWitt-only safety, Required core schema present, Required money-critical
migrations present, Prefix Diff, SEO parity, jsonld-rich-results, Dependency &
Security CI — all `success`.

**Not push, red, do not carry as app P0:**

| Run | Event | Conclusion | How to read it |
| --- | ----- | ---------- | -------------- |
| Required money-critical migrations `31684262655` | `workflow_dispatch` LIVE | failure exit 6 | Guard never read `schema_migrations`; applied state **UNKNOWN** |
| Sandbox credit-packs `31689247828` | schedule | failure | Sandbox probe; not app code this SHA |
| Paddle Craft catalog `31687274423` | schedule | failure | Catalog preflight; not re-diagnosed here |
| AI-credit service contract (production) `31684864192` | schedule | failure | Production contract probe; `EVIDENCE_HEALTHY: false`; connection/secret class until proven otherwise |

LIVE money verification is `workflow_dispatch` + `inputs.target_env == 'live'`
only (`.github/workflows/required-money-migrations.yml`). A green **push** job
is not proof production applied every money migration.

## File-level plan

Docs only:

- `docs/cleanup/zero-known-defects-board.md` — replace stale 2026-08-08 snapshot
- `docs/cleanup/full-application-zero-defect-audit-2026-08-13.md` — this file
- `docs/cleanup/verdant-stabilization-audit.md` — pointer that the live board
  snapshot moved

## Implementation notes

None. No production code.

## Tests added

None (audit-only). Existing regression suites were **re-run**, not extended.

## Validation commands

```bash
bun run typecheck
bunx eslint . --quiet
bun run test:static-safety
bun run test:security-static
node scripts/assert-ecowitt-only-sensor-direction.mjs
bunx vitest run src/test/v0-operating-loop-contract.test.ts \
  src/test/auth-provider-initial-session-failure.test.tsx \
  src/test/use-require-auth.test.tsx \
  src/test/route-manifest-sync.test.ts \
  src/test/pheno-keepers-nav-reachability.test.ts \
  src/test/environment-check-entry-type-audit.test.ts \
  src/test/environment-check-alert-evidence.test.ts \
  src/test/root-entry-routing.test.tsx \
  src/test/timeline-date-range-rules.test.ts \
  src/test/sensors-testbench-panel-static-safety.test.ts \
  src/test/workflow-branch-filter-liveness.test.ts \
  src/test/operator-demo-preview-static-safety.test.ts \
  src/test/ai-doctor-preview-safety-scanner.test.ts
curl -sS https://verdantgrowdiary.com/version.json
curl -sS https://verdantgrowdiary.com/
```

## Validation results

```text
Targeted tests: PASS — 10 files / 99 tests, plus 4 files / 102 tests (one file overlap)
Full suite: PASS on CI push run 31684203400 (this SHA). Not re-run locally.
Type-check: PASS — `bun run typecheck` exit 0 (~53s)
Lint errors: PASS — `eslint . --quiet` exit 0
Runtime harness: SKIPPED locally. Security DB Local PASS on CI push 31684203364
Static safety: PASS — 8 files / 183 tests
Security static: PASS — scanner self-tests + repo scan
EcoWitt-only: PASS — 6084 files, no SwitchBot
Live `/` and version.json: PASS (curl 2026-08-13)
Skipped: authenticated One-Tent e2e (no session); billing/AI-credit RLS harnesses;
  production schema apply of AQ RPC (MCP sandbox); GA4/GSC
Introduced failures: none (docs only)
Pre-existing failures: GitHub-open #561 #590 #592 #570–#574 #576 #593;
  scheduled money/catalog probes (see CI table)
```

## Safety verdict

No new P0. One-Tent Loop P1s remain closed and re-verified. Full-application
P1 on GitHub is still only #561 (owner). Proposed P2 residuals are documented,
not filed, not silently "fixed."

## Deferred items

- File (or explicitly decline) the proposed P2s
- Close or retarget #590
- Sitemap-or-noindex decision for six STATIC_ONLY routes
- CURRENT_STATE refresh after PR #913 lands (avoid colliding edit)
- `action_queue` INSERT revoke slice (Cheek-approved schema work)
- Authenticated e2e / production money-migration applied check

## Risk / rollback notes

Docs-only. Revert the three markdown files. No runtime risk.

## Handoff

```text
HANDOFF
from_agent: Grok
to_agent: Claude (optional: turn proposed P2s into issue specs) / Codex (only if
  Cheek approves a named fix slice)
sentinel_version: 2026-08-09.1
date: 2026-08-13

completed:
  - Full-application zero-defect board refresh against bf9a6111f
  - Live public `/` and version.json re-measure
  - GitHub 35-issue inventory vs stale 2026-08-08 snapshot

verified_by:
  - Commands and CI run IDs listed above
  - Ref: verdant-grow-diary @ bf9a6111f

not_done:
  - No production code
  - No GitHub issue close/open (read-only gh)
  - CURRENT_STATE.md not edited (collision with PR #913)

unknowns:
  - Whether supabase-js getUser() ever rejects in production
  - Whether production has applied action_queue_create migrations
  - Root cause of scheduled Craft / credit-pack / AI-credit probe failures

blocked:
  - #561 MCP/preview sandbox — owner
  - Production schema observation — MCP is sandbox
  - Authenticated e2e — no seeded session

assumptions:
  - Push-CI green Full Vitest is accepted as full-suite evidence for this SHA
  - Scheduled red jobs are infra/secret class until a dedicated diagnosis

next_slice:
  - Cheek: close #590 or retarget; decide whether to file the proposed P2s;
    after #913 merges, refresh CURRENT_STATE `/` and unsitemap'd-route rows

files_touched:
  - docs/cleanup/zero-known-defects-board.md
  - docs/cleanup/full-application-zero-defect-audit-2026-08-13.md
  - docs/cleanup/verdant-stabilization-audit.md
```
