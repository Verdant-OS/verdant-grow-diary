# Genetics & Propagation Traceability V1 — Implementation Plan

**Branch:** `claude/genetics-propagation-traceability-v1` (worktree branch `claude/genetics-propagation-traceability-v1-787f6c`)
**Base:** `origin/verdant-grow-diary` @ `7091f782bde957c416f4e9274cacbcb58670dcfc` (#373) — the live deploy trunk.
**Author:** Claude (Opus 4.8), 2026-07-20. Draft PR target: `verdant-grow-diary`. **Do not merge / deploy / db push.**

---

## 1. Mission

Turn Verdant's completed Pheno Hunt / keeper features into trustworthy production provenance:

> genetic source/accession → mother/parent → propagation batch → production plants → screening evidence → quarantine history → backward & forward traceability.

This is an **additive operational layer** over the existing `plants`, pheno, keeper, clone, cross, and breeding systems. It does **not** create a second genetics product; it reuses the canonical identities and *adapts* legacy rows read-only into the trace.

---

## 2. Audit findings (what exists, what we reuse, what is net-new)

### 2.1 Canonical systems we reuse (never recreate)

| Concern | Existing artifact | Reuse strategy |
|---|---|---|
| Production-plant identity | `plants` (`user_id`, `grow_id`, `tent_id`, `pheno_hunt_id`, `candidate_number`) | New assignment rows FK to `plants.id`; never duplicate plant identity |
| Pheno hunts | `pheno_hunts` (owner via `set_user_id_from_auth`) | Read-only in trace |
| Keepers | `pheno_keepers` (`source_plant_id`, `keeper_name`, `UNIQUE(hunt_id, source_plant_id)`) | Adapt into trace as `keeper` nodes |
| Clones | `pheno_keeper_clones` (self-ref `parent_clone_id`, `clone_plant_id`) | Adapt into trace as `clone` nodes/edges |
| Crosses | `pheno_crosses` (`female_keeper_id`, `male_keeper_id` nullable=self) | Adapt into trace as `cross` nodes |
| Reversals | `pheno_reversals` (append-only, owner via `keeper_id`) | Not in V1 trace surface (out of lineage scope) |
| Cannabinoid/terpene COA | `pheno_lab_results` (COA/chemistry semantics, `UNIQUE(hunt_id, plant_id, source)`) | **Do NOT overload for pathogen screening** — separate ledger |
| Breeding programs | `breeding_programs`/`_steps`/`_evidence`/`breeding_events` | Not modified |
| Typed boundary | `src/integrations/supabase/phenoTables.ts` | Mirror idiom in new `geneticsTraceabilityTables.ts` |
| Pure view-models | `phenoPedigreeViewModel.ts` (`ProvenanceCode` + `Record<Code,string>` + `flags[]`) | Direct template for evidence-honesty flags |
| RLS harness | `scripts/run-*-rls-harness.ts` (`@supabase/supabase-js`, real signed-in clients) | Model new harness on `run-ai-doctor-sessions-rls-harness.ts` (gated) |

### 2.2 Postgres conventions we replicate

- **PK** `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; idempotency ledger uses composite PK `(user_id, idempotency_key)`.
- **Owner** `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- **RLS** `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;` with `FOR SELECT TO authenticated USING (auth.uid() = user_id)`.
- **Grants (our stronger variant):** `GRANT SELECT ON public.<t> TO authenticated; GRANT ALL ON public.<t> TO service_role;` — **no** client INSERT/UPDATE/DELETE grant or policy. **All writes via `SECURITY DEFINER` RPC.** This is the AGENTS.md gold-standard for sensitive paths and cleanly avoids the `PERMISSIVE_POLICY` static-scan flag (only SELECT policies, which the scanner exempts).
- **RPC** `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`; identity from `uid uuid := auth.uid()`; `IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated')`; every referenced id re-checked `EXISTS (... AND user_id = uid)`; returns typed jsonb envelope; ends with `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated, service_role;` and file ends `NOTIFY pgrst, 'reload schema';`.
- **Append-only** = grant only `SELECT` to authenticated + no UPDATE/DELETE policy (writes via definer RPC); typed `Update = never` in the boundary as a compile-time second gate.
- **updated_at** trigger `public.set_updated_at()`.
- **Indexes** on `user_id` + every FK; history indexes composite `(... , <ts> DESC)`; partial unique where nullable.
- **Idempotency** ledger + pre-check + `BEGIN…EXCEPTION WHEN unique_violation` re-read-and-return-original, domain writes and idempotency INSERT in the **same** subtransaction block.

### 2.3 Net-new patterns (no precedent — introduced here)

1. **Acyclicity enforcement** — no cycle guard exists in the repo. Introduced via `BEFORE` trigger (recursive ancestry walk) + per-owner `pg_advisory_xact_lock` in the write RPC.
2. **Idempotency-keyed multi-row atomic assignment** — extends the single-row quicklog idempotency pattern to a set of plants.
3. **Bidirectional trace resolver** over a heterogeneous new+legacy edge set with deterministic ordering, read-time cycle guard, pagination, and truthful `truncated`.

### 2.4 Environment / validation reality (honest reporting)

- Toolchain present: `bun 1.3.14`, `node v24.16.0`. **No `supabase` CLI, no Docker.**
- Consequence: the **runtime RLS harness cannot be executed on this machine** (it needs a live disposable Supabase stack). It will be authored correctly, gated to refuse the production ref `knkwiiywfkbqznbxwqfh`, static-validated (typecheck + safety scans + review), and reported as **skipped-runtime with reason**. Likewise `supabase db reset` cannot verify migrations apply; we rely on the static migration-safety scanner + per-migration safety tests + careful SQL.
- Windows local vitest has ~known pre-existing failures (path-separator/TZ) unrelated to this diff; CI (Linux+UTC) is authoritative.

### 2.5 Scoping decisions

- **No entitlement gating** on new tables (mission out-of-scope: billing/Founder/credits/entitlement). Owner-scoped RLS only.
- **No route/nav integration** until one final isolated commit after rebasing latest trunk (collision freeze with Codex on `App.tsx`, `appRouteManifest.ts`, `AppShell/AppSidebar/MobileNav/PageHeader`, `PlantDetail`, etc.). `src/lib/routes.ts` is **not** frozen → route-builder helper may land early.
- **No Plant Detail integration** — leave a typed handoff seam for Codex.

---

## 3. Domain model (new tables)

All tables: `user_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, RLS enabled, `SELECT`-own policy, `authenticated` gets SELECT only, `service_role` ALL, writes via `SECURITY DEFINER` RPC. Timestamps `timestamptz NOT NULL DEFAULT now()`.

### 3.1 `genetics_accessions` — stable source identity
- `id`, `user_id`, `source_kind text NOT NULL` CHECK in (`seed`,`clone`,`tissue_culture`,`unknown`).
- `source_party text` (breeder/source; NULL = unknown, never inferred).
- `cultivar_name text`, `line_name text`, `selection_id text` (phenotype/selection id).
- `generation text` (e.g. F1/S1; NULL = unrecorded).
- `acquisition_date date` (**nullable — never default now()**).
- `known_state text NOT NULL DEFAULT 'known'` CHECK in (`known`,`unknown`,`unassigned`,`not_applicable`) — the explicit provenance state of the accession's identity.
- Optional linkage (all nullable, ownership re-checked in RPC): `linked_keeper_id`→`pheno_keepers`, `linked_clone_id`→`pheno_keeper_clones`, `linked_cross_id`→`pheno_crosses`, `linked_plant_id`→`plants` (all `ON DELETE SET NULL`).
- `notes text`, `archived_at timestamptz` (archive without destructive delete), `created_at`, `updated_at`.
- Indexes: `user_id`, each linked FK, `(user_id, archived_at)`.

### 3.2 `propagation_batches` — operational batches
- `id`, `user_id`, `batch_code text NOT NULL`, `name text`.
- `propagation_method text NOT NULL` CHECK in (`seed`,`cutting`,`tissue_culture`,`division`,`unknown`).
- `source_accession_id uuid REFERENCES genetics_accessions ON DELETE SET NULL` (nullable; explicit unknown source).
- `mother_plant_id uuid REFERENCES plants ON DELETE SET NULL` (nullable), `origin_unknown boolean NOT NULL DEFAULT false` (explicit unknown origin when no mother).
- `cut_date/received_date/started_date/rooted_date date` (**all nullable — never default now()**).
- `initial_quantity int` CHECK (`>= 0`), `viable_quantity int` CHECK (`>= 0` and `<= initial_quantity` when both present), `counts_unknown boolean NOT NULL DEFAULT false` (**missing counts are NULL, never defaulted to 0**).
- `status text NOT NULL DEFAULT 'planned'` CHECK in (`planned`,`active`,`rooting`,`rooted`,`completed`,`failed`,`archived`).
- `grow_id/tent_id` nullable FK (ownership re-checked).
- `notes text`, `created_at`, `updated_at`.
- `UNIQUE(user_id, batch_code)`.
- Companion append-only `propagation_batch_status_events(id, user_id, batch_id, from_status, to_status, reason, changed_at, created_at)`.

### 3.3 `plant_origin_assignments` — authoritative production-plant origin
- `id`, `user_id`, `plant_id uuid NOT NULL REFERENCES plants ON DELETE CASCADE`, `batch_id uuid NOT NULL REFERENCES propagation_batches ON DELETE CASCADE`.
- `assigned_at timestamptz NOT NULL DEFAULT now()`, `assigned_reason text`, `created_at`, `updated_at`.
- **One authoritative assignment per plant:** `UNIQUE(plant_id)`.
- Reassignment = UPDATE of the `batch_id` (requires explicit `p_reason`), only via RPC.
- Companion append-only `plant_origin_assignment_events(id, user_id, plant_id, from_batch_id, to_batch_id, reason, action text CHECK in ('assign','reassign'), changed_at, created_at)`.

### 3.4 `genetics_screening_results` — append-only screening ledger
- `id`, `user_id`.
- `subject_type text NOT NULL` CHECK in (`accession`,`batch`,`plant`); `subject_id uuid NOT NULL` (ownership of the referenced subject re-checked in RPC per type).
- `target text NOT NULL` (pathogen/target, e.g. HLVd), `result text NOT NULL` CHECK in (`positive`,`negative`,`inconclusive`,`not_tested`).
- `sample_reference text`, `laboratory text`, `collected_date date`, `result_date date`, `evidence_reference text`.
- `recorded_by uuid NOT NULL` (= `auth.uid()`), `recorded_at timestamptz NOT NULL DEFAULT now()`, `created_at`.
- `supersedes_id uuid REFERENCES genetics_screening_results ON DELETE SET NULL` (correction linkage — never edits history).
- **Append-only** (SELECT-only grant; typed `Update = never`).
- Indexes: `user_id`, `(subject_type, subject_id)`, `(subject_type, subject_id, target, collected_date DESC)`, `supersedes_id`.

### 3.5 `quarantine_episodes` + `quarantine_transition_events`
- `quarantine_episodes(id, user_id, subject_type, subject_id, target text, status text NOT NULL DEFAULT 'open' CHECK in ('open','released','disposed'), opened_at timestamptz NOT NULL DEFAULT now(), opened_reason text, closed_at timestamptz, closure_kind text CHECK in ('cleared','disposed','override'), closure_screening_result_id uuid REFERENCES genetics_screening_results ON DELETE SET NULL, created_at, updated_at)`.
- `quarantine_transition_events(id, user_id, episode_id, action text CHECK in ('open','release','dispose','reopen','override'), reason text, screening_result_id uuid, is_override boolean NOT NULL DEFAULT false, changed_at, created_at)` — **append-only**, full immutable history including reopen.
- Clearance rules (RPC-enforced): `release` requires a `negative` screening result for the episode's `target`, owned by uid, with `collected_date > opened_at`; `inconclusive`/`not_tested`/`positive` cannot clear. `dispose` requires disposition evidence (reason). `override` is separately flagged (`is_override=true`), reasoned, attributed, timestamped, visible forever. `reopen` from `released`/`disposed` → `open`, prior events preserved.

### 3.6 `genetics_mutation_idempotency` — shared idempotency ledger
- `(user_id uuid NOT NULL, idempotency_key text NOT NULL, operation text NOT NULL, result jsonb NOT NULL, created_at, PRIMARY KEY (user_id, idempotency_key))`.
- SELECT-own RLS; SELECT grant to authenticated; writes only inside definer RPCs.
- All mutation RPCs require `length(p_idempotency_key) BETWEEN 8 AND 200`.

---

## 4. RPC surface (all `SECURITY DEFINER`, jsonb envelopes, idempotency-keyed)

1. `genetics_accession_upsert(p_idempotency_key, p_payload jsonb)` → `{ok, accession_id}`.
2. `genetics_accession_archive(p_idempotency_key, p_accession_id, p_archived boolean)` → `{ok}`.
3. `genetics_batch_upsert(p_idempotency_key, p_payload jsonb)` → `{ok, batch_id}` (writes status event on status change).
4. `genetics_assign_plants(p_idempotency_key, p_batch_id, p_plant_ids uuid[], p_reason text)` → `{ok, assigned:[], skipped:[]}` — **atomic** multi-plant assign; takes per-owner advisory lock; cycle-checked; reassignment requires reason; append-only events.
5. `genetics_screening_record(p_idempotency_key, p_payload jsonb)` → `{ok, screening_id}` — append-only insert; supersession linkage validated same-subject/same-owner.
6. `genetics_quarantine_open(p_idempotency_key, p_payload jsonb)` → `{ok, episode_id}`.
7. `genetics_quarantine_transition(p_idempotency_key, p_episode_id, p_action, p_reason, p_screening_result_id, p_override boolean)` → `{ok, status}` — clearance-rule enforced.
8. `genetics_trace_resolve(p_subject_type, p_subject_id, p_direction, p_max_depth default 10, p_max_nodes default 500)` → `{ok, nodes, edges, truncated}` (read-only; STABLE; still SECURITY DEFINER for uniform owner check + to read across tables without per-table policy juggling, with explicit `WHERE user_id = uid` on every source).

### 4.1 Cycle rejection (net-new)
- Lineage directed graph edges: `mother_plant → batch` (via `propagation_batches.mother_plant_id`) and `batch → plant` (via `plant_origin_assignments`). A cycle is a plant reachable from itself through mother/assignment chains.
- **Trigger (defense-in-depth):** `BEFORE INSERT OR UPDATE` on `plant_origin_assignments` and `propagation_batches` runs a recursive ancestry walk from the child side; if the child is found in its own ancestry, `RAISE ... USING ERRCODE = 'check_violation'`. Handles self-cycle, two-node, multi-hop. `SECURITY INVOKER SET search_path = public, pg_temp`, service_role bypass via `current_setting('role', true) = 'service_role'` for admin/test setup.
- **Concurrency:** every lineage-mutating RPC first does `PERFORM pg_advisory_xact_lock(hashtext('genetics_lineage:' || uid::text))`, serializing an owner's lineage writes so the recursive check sees a consistent graph — closes the concurrent-cycle window without SERIALIZABLE isolation.

### 4.2 Idempotency + atomic rollback
- Pre-check ledger; if found return stored `result || {reused:true}`.
- Domain writes + `INSERT INTO genetics_mutation_idempotency` inside one `BEGIN…EXCEPTION WHEN unique_violation THEN <re-read + return original> END` block → the losing racer's domain writes roll back with the block → **zero partial rows**.
- Any validation failure `RETURN`s an `{ok:false, reason}` envelope before writes → nothing persisted.

### 4.3 Trace resolver determinism
- Build a normalized owner-scoped edge CTE (union of: accession→batch, mother_plant→batch, batch→plant, plant→keeper[`pheno_keepers.source_plant_id`], keeper→clone[`pheno_keeper_clones`], clone→clone[`parent_clone_id`], keeper→cross[`pheno_crosses`]).
- `WITH RECURSIVE` traversal from subject in the requested direction; carry `path uuid[]` and guard `NOT (next_id = ANY(path))` (read-time cycle guard); stop at `p_max_depth`; collect DISTINCT nodes; if node count would exceed `p_max_nodes`, cap and set `truncated=true`.
- Deterministic ordering `ORDER BY depth ASC, node_type ASC, node_id ASC`; every node emitted once (DISTINCT ON node_id, lowest depth wins).
- Each node carries `evidence_state` (aggregated screening/quarantine posture — never "clean"; see §5) and `gaps[]` (unknown mother, unassigned origin, keeper without accession, etc.).

---

## 5. Evidence honesty rules (pure TS + SQL, non-negotiable)

- Missing/stale/`inconclusive`/`not_tested` evidence **never** renders as negative/healthy/clean/cleared/pathogen-free.
- Negative copy stays scoped: `"Negative for HLVd on 2026-07-20"` — never `"Pathogen free"`.
- Evidence state is a computed union: `untested | pending | negative_scoped | positive | inconclusive | superseded`. The view-model exposes `flags: EvidenceFlag[]` (the honest "what we can't back up" list), mirroring `phenoPedigreeViewModel`.

---

## 6. Architecture / file plan

**Migrations** (`supabase/migrations/`, timestamps > `20260720130000`, unique 14-digit prefixes):
- `20260720141000_genetics_traceability_accessions.sql` (accessions + idempotency ledger + RPCs 1,2)
- `20260720142000_genetics_traceability_batches.sql` (batches + status events + RPC 3)
- `20260720143000_genetics_traceability_assignments.sql` (assignments + events + cycle trigger + RPC 4)
- `20260720144000_genetics_traceability_screening.sql` (screening ledger + RPC 5)
- `20260720145000_genetics_traceability_quarantine.sql` (episodes + transitions + RPCs 6,7)
- `20260720146000_genetics_traceability_trace_resolver.sql` (RPC 8)

**Typed boundary:** `src/integrations/supabase/geneticsTraceabilityTables.ts` (mirror `phenoTables.ts`; append-only tables `Update = never`; `Functions` typed for `.rpc()`).

**Pure logic** (`src/lib/genetics/`, camelCase):
- `traceabilityTypes.ts` (enums + `readonly X[]` arrays + `isX` guards + safe labels)
- `screeningEvidenceRules.ts` (evidence-state computation + honesty invariants)
- `quarantineRules.ts` (clearance eligibility, pure)
- `propagationBatchRules.ts` (count/date validation, status transitions)
- `traceabilityViewModel.ts` (trace graph → presenter view, `flags[]`, deterministic)
- `screeningHistoryViewModel.ts`, `quarantineHistoryViewModel.ts`
- `traceabilityApi.ts` (RPC wrappers, idempotency-key gen, Result unions)

**Hooks** (`src/hooks/`): `useGeneticsAccessions.ts`, `useGeneticsBatches.ts`, `useGeneticsTrace.ts`, `useGeneticsScreening.ts`, `useGeneticsQuarantine.ts` (react-query; owner-scoped keys; saved/pending/failed/retry).

**Components** (`src/components/genetics/`, PascalCase named exports): `AccessionCard`, `AccessionForm`, `BatchCard`, `BatchForm`, `PlantAssignmentPanel`, `ScreeningHistoryList`, `ScreeningResultBadge`, `QuarantinePanel`, `TraceabilityTree` (semantic list/tree, not canvas-only), `EvidenceStatePill`, `UnknownStateChip`.

**Pages** (`src/pages/`, PascalCase default export): `GeneticsLibrary`, `AccessionDetail`, `PropagationBatchDetail`, `ScreeningQuarantineHistory`, `TraceabilityView`.

**Route builders:** add to `src/lib/routes.ts` (not frozen).

**Harness:** `scripts/run-genetics-propagation-rls-harness.ts` + `test:genetics-propagation-rls` alias (+ gated `:local-lane`; **not** auto-added to `test:security-db-local` without approval).

**Tests:** `src/test/genetics-propagation-*-migration-safety.test.ts` (per migration), `genetics-propagation-*-rules.test.ts`, `*-view-model.test.ts`, `genetics-propagation-evidence-honesty.test.ts` (source scan + logic), component/a11y `*.test.tsx`, `e2e/genetics-propagation-traceability.spec.ts` (chromium-mocked, 4 widths, overflow proof).

---

## 7. Slice sequence (TDD; failing test → smallest change → focused+expanded tests → commit → reconcile)

1. Accessions migration + idempotency ledger + typed boundary + RPCs 1-2 + migration-safety test.
2. Batches migration + status events + RPC 3 + tests.
3. Assignments migration + cycle trigger + RPC 4 + tests.
4. Screening ledger migration + RPC 5 + tests.
5. Quarantine migration + RPCs 6-7 + clearance-rule tests.
6. Trace resolver RPC 8 + tests.
7. RLS harness + package alias.
8. Pure rules + view-models + unit tests.
9. Api layer + hooks.
10. Pages + components + presenter/a11y tests.
11. Playwright traceability workflow (4 widths).
12. Rebase latest trunk → final isolated route/nav integration commit (parity tests) + Codex handoff seam.
13. Full validation + push + draft PR + report.

---

## 8. Acceptance gates (must all hold)

1. mother/accession → batch → plant traces both directions without inference.
2. Unknown/unassigned stays explicit. 3. Existing keeper/clone/cross/plant identities reused.
4. Cycles + cross-tenant rejected server-side. 5. Screening always shows target/result/source/date.
6. No incomplete evidence renders healthy/clean/negative/cleared. 7. Evidence/transition history immutable.
8. Failed/retried saves cannot duplicate. 9. 1,000 assignments + 10 generations bounded & deterministic.
10. Zero horizontal overflow at 320/375/768/1440. 11. No AI/automation/device/entitlement/sensor/Action-Queue boundary changed.
12. Old/partial rows remain readable.

## 8a. Design revisions from adversarial review (2026-07-20)

A 5-dimension adversarial design review ran before implementation. Confirmed defects and the fixes now baked into the design:

**Idempotency (Slice 1 + all RPCs)**
- R1. Ledger PK is `(user_id, operation, idempotency_key)` (operation namespaced) + a `request_hash text NOT NULL` column. Pre-check returns the stored envelope only when `request_hash` matches; a same-key/same-op/**different-payload** reuse returns `{ok:false, reason:'idempotency_key_conflict'}` instead of a foreign envelope. Cross-operation key reuse is harmless (separate rows).
- R2. The `EXCEPTION WHEN unique_violation` handler uses `GET STACKED DIAGNOSTICS … = PG_EXCEPTION_CONSTRAINT` and only runs the replay path for the **named** idempotency PK (`genetics_mutation_idempotency_pkey`); a domain unique violation (batch_code / plant assignment) is handled on its own merits, never misreported as a replay.
- R3. Key guard is the explicit `IF p_idempotency_key IS NULL OR length < 8 OR length > 200` form (NULL-safe; three-valued `NOT BETWEEN` alone would let NULL through).

**Cycle rejection (Slice 3)**
- R4. Trigger walk carries `path uuid[]` seeded with the child, guards `NOT (parent_key = ANY(path))` **and** a hard `depth < 64` cap → self-terminating even over pre-existing cyclic data; cycle-found and depth-cap both RAISE.
- R5. **No `service_role` bypass** on the cycle guard — acyclicity is a structural invariant for *all* writers. An intentional admin override is gated only on an explicit auditable GUC `current_setting('genetics.allow_cycle_override', true) = 'on'`, never ambient role.
- R6. The walk seeds from the **NEW** tuple's own values (NEW.mother_plant_id / NEW.batch_id+NEW.plant_id), never a table lookup of NEW.id (BEFORE-UPDATE OLD/NEW self-read bug).
- R7. One shared `genetics_lock_lineage(uid)` helper taking `pg_advisory_xact_lock(hashtext('genetics_lineage:'||uid::text))` is the mandatory first statement of **both** `genetics_assign_plants` and `genetics_batch_upsert`; a source-scan test pins it. The lock (not the trigger) closes the concurrent window.
- R8. One canonical ancestry CTE that **alternates both edge types** (plant→assignment→batch and batch→mother→plant); tested with a 6-node both-edge cycle, not just the 2-node case.

**Trace resolver (Slice 6)**
- R9. Node identity is the composite `node_key = node_type || ':' || node_id` (a plant may be both a mother and a production plant). DISTINCT ON / node-cap / path-guard all key on `node_key`.
- R10. Inner `SELECT DISTINCT ON (node_key) … ORDER BY node_key, depth ASC, node_type ASC, path ASC` (satisfies the DISTINCT-ON prefix rule and picks a deterministic min-depth/lowest-path representative); outer `ORDER BY depth, node_type, node_id` for presentation.
- R11. `truncated` is set when **either** the node-cap **or** the depth-cap elides reachable nodes (a frontier node at `max_depth` with further edges ⇒ truncated). Never report a depth-clipped trace as complete.
- R12. Recursion is depth-capped (`p_max_depth`), path-guarded, and wrapped in `SET LOCAL statement_timeout` as a backstop; the `plant_origin_assignments.UNIQUE(plant_id)` invariant keeps the production side a tree (no diamond blow-up), and the cross/keeper sub-graph is bounded by depth+timeout with truthful `truncated`.
- R13. `evidence_state` is a **per-target vector**, worst-wins: any target `positive` ⇒ positive; else any `inconclusive`/`untested`/`pending` ⇒ that; a target is `negative_scoped` only for its own target+date; rows referenced by another row's `supersedes_id` are excluded from "current" but kept in history. **No path maps `not_tested`/`inconclusive`/superseded to negative or clean.**

**Quarantine clearance (Slice 5)**
- R14. Release rejects a **superseded** chosen negative (`EXISTS supersedes_id = chosen`) and any **newer/equal contradicting** result (`positive`/`inconclusive`/`not_tested`, same subject+target, `collected_date >= chosen`). Clearance is proven against the latest evidence.
- R15. Release binds the screening to the episode's **subject** (`subject_type` + `subject_id`) *and* target — not target+owner alone (another plant's certificate must not clear).
- R16. Screening carries `collected_date` with `CHECK (collected_date <= current_date)` and (when both present) `collected_date <= result_date`; clearance compares against the effective-open **date** in UTC and **allows same-day** (`>=`), blocking future-dated fabrication.
- R17. `reopen` sets a fresh effective-open (`reopened_at`); post-reopen clearance requires evidence collected after the last open/reopen (no dispose→reopen→release laundering on a stale negative).
- R18. Transition RPC does `SELECT … FOR UPDATE` on the episode + an explicit legal-transition table (release/dispose require `open`; reopen requires `released`/`disposed`) → no double-release / disposed→released flip / concurrent race.
- R19. Override forces `closure_kind='override'`, `closure_screening_result_id=NULL` (never `cleared`); table `CHECK ((closure_kind='cleared') = (closure_screening_result_id IS NOT NULL))`. Dispose/override require `length(btrim(reason)) >= 8`.
- R20. `target` normalized (`lower(btrim(target))`, `CHECK (target = btrim(target) AND target <> '')`), compared normalized.

**RLS / tenant isolation (all slices)**
- R21. `genetics_trace_resolve`'s first statement is a seed-ownership gate (`EXISTS … AND user_id = uid` → generic `not_found`); every node hydrated only from rows carrying `user_id = uid`; every edge union filters `user_id = uid` on **both** endpoints.
- R22. Every referenced-id check is a single `EXISTS(… AND user_id = uid)` returning **one generic reason** regardless of absent-vs-foreign (no existence oracle). Harness asserts a foreign id and a random uuid yield byte-identical envelopes.
- R23. Ownership columns (`user_id`, `recorded_by`) are always set literally `= uid`, never read from `p_payload`; source-scan test forbids `p_payload->>'user_id'` / `'recorded_by'` and unqualified `jsonb_populate_record`.
- R24. `quarantine_transition_events.screening_result_id` gets a real FK and ownership validation for **any** action carrying it (not just release).

## 9. Known risks / rollback

- Runtime RLS harness unexecuted here (no local stack) → **must** run on a stacked machine or CI before production trust. Rollback: migrations are additive; drop-new-objects migration reverses cleanly (no existing table altered).
- Trace resolver perf at 10 generations × 1,000 plants: bounded by `p_max_depth`/`p_max_nodes` + indexes; verify with a seeded benchmark in the harness.
- Lovable `types.ts` regeneration may drop new tables → typed boundary insulates us (same pattern as pheno).
