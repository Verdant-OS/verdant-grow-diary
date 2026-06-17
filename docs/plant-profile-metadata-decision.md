# Plant Profile Metadata Persistence Decision

**Status:** Implemented (Option A — read path + schema landed; edit UI pending)
**Scope:** Schema, read-path wiring, and UI pass-through completed. Edit surface not yet exposed.
**Last updated:** 2026-06-17

---

## 1. Context

AI Doctor context now accepts `medium` and `pot_size` and Plant Detail readiness consumes them when supplied. As of this update:

- `public.plants` now exposes nullable `medium` and `pot_size` columns (migration landed).
- Supabase generated types include both fields.
- The mock `Plant` interface, `mapPlantRow` adapter, and `PlantDetail` page forward these values through the read path.
- `PlantProfileContextCard` and `PlantDetailAiDoctorContextReadinessMount` receive and display the values when present.
- A presenter-only edit surface is **not** yet exposed — the "coming soon" buttons remain until the edit UI slice is approved.

---

## 2. Non-goals

This decision explicitly does **not** authorize:

- AI prompt rewrites or any change to AI Doctor model-call behavior.
- Inferred metadata from strain, notes, photos, or freeform fields.
- Freeform parsing or NLP extraction of medium / pot size.
- Device control of any kind.
- Automation, alerts, or Action Queue writes triggered by profile metadata.
- Backfilling existing plants with guessed values.
- Any change to existing public copy outside the eventual edit surface.

---

## 3. Options compared

### Option A — Add nullable `medium` and `pot_size` columns to `plants`

Add two nullable text columns directly to `public.plants`.

| Dimension | Assessment |
|---|---|
| Product value | High. Smallest path to letting growers record real values that already flow through AI Doctor context. |
| AI Doctor context quality | Direct improvement: readiness flips from "unknown" to evidence-backed when grower fills the values. |
| Schema / RLS complexity | Minimal. Two nullable columns. Existing `plants` RLS already scopes by owner — no new policies required. |
| Migration risk | Low. Additive, nullable, no defaults required, no backfill. Existing rows remain valid. |
| UI / edit-flow impact | Requires a small edit surface on Plant Detail (or settings) to write the values. Replaces the "coming soon" buttons on the existing Plant Profile Context card. |
| Test burden | Moderate. Migration safety, read-path mapping, edit-form validation, readiness flip tests, RLS write tests. |
| Rollback complexity | Low. Columns can be dropped or simply left unused; readiness/compiler already tolerate `null`. |
| Future extensibility | Medium. Works while the metadata surface stays small (≤ ~5 columns). Gets awkward if many optional context fields land. |

### Option B — Separate `plant_profile_context` table keyed by `plant_id`

New table `public.plant_profile_context` with `plant_id` FK (1:1), and columns per context field.

| Dimension | Assessment |
|---|---|
| Product value | Same end-user value as Option A, but more plumbing to deliver it. |
| AI Doctor context quality | Same as Option A once wired. |
| Schema / RLS complexity | Higher. New table, new GRANTs, new RLS policies via `plants` ownership join or denormalized `user_id`. More surface to audit. |
| Migration risk | Higher than A. New table, new indices, new policy mistakes possible. |
| UI / edit-flow impact | Requires upsert semantics (row may or may not exist); slightly more complex read joins. |
| Test burden | Higher: RLS join correctness, upsert behavior, orphan cleanup on plant delete (cascade), readiness wiring. |
| Rollback complexity | Higher. Table drop + dependent code removal. |
| Future extensibility | High. Best fit if Verdant expects many optional, sparsely-populated context fields (training style, lineage notes, container shape, substrate amendments, etc.). |

### Option C — Defer persistence

Keep the presenter-only Plant Profile Context card. Continue showing "unavailable / coming soon." No schema, no writes.

| Dimension | Assessment |
|---|---|
| Product value | None new. Readiness remains honest but stagnant. |
| AI Doctor context quality | No improvement. Medium / pot size stay "unknown" with provenance copy. |
| Schema / RLS complexity | Zero. |
| Migration risk | Zero. |
| UI / edit-flow impact | Zero. |
| Test burden | Zero new. |
| Rollback complexity | N/A. |
| Future extensibility | Preserves all future options. |

---

## 4. Recommendation

**Recommend Option A, conditional on a near-term plant profile edit slice being in scope.**

Rationale:

- Medium and pot size are small, stable, user-provided strings — the canonical case for adding columns to the owning entity.
- `plants` RLS already enforces owner scoping; no new policy surface.
- AI Doctor readiness, the context compiler, and the Plant Profile Context card are already shaped to consume these fields the moment the read path exposes them.
- Option B's flexibility is not justified unless we expect ≥ ~5 additional optional context fields in the next iterations. We do not, currently.
- Option C remains the correct choice if no edit surface will ship soon — persisting columns nobody can fill is dead weight and risks the readiness panel implying data should exist.

**Decision rule:**

- If profile-edit UI lands this iteration → **Option A**.
- If many optional context fields are imminent → **Option B**.
- Otherwise → **Option C (defer)**.

---

## 5. Preferred field contract (if persistence is approved)

- `medium`: `text NULL`. User-provided only. Trimmed. Blank ⇒ `null`. No inference. No enum yet (free text keeps grower vocabulary intact; enum can be layered later as a soft suggestion list).
- `pot_size`: `text NULL` for the first slice. User-provided only. Trimmed. Blank ⇒ `null`.
  - **Structured variant (deferred):** later introduce `pot_size_value numeric NULL` + `pot_size_unit text NULL` (`L` | `gal`) alongside the freeform `pot_size` for analytics. Do not introduce structured columns in the first slice — write path complexity is not justified yet.
- Both fields are **context evidence**, never diagnosis proof. AI Doctor must continue to mark confidence based on totality of evidence, not the presence of these two values.

---

## 6. RLS considerations

- Metadata is owned by the plant owner. Reuse existing `plants` ownership scoping; no new ownership concept.
- No `anon` access. No public read.
- No `service_role` dependency in client code. Writes happen through the authenticated user's session against `plants`.
- If Option B is ever chosen, `plant_profile_context` must:
  - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;`
  - `GRANT ALL ... TO service_role;`
  - Policies must scope through `plants.user_id = auth.uid()` via a security-definer helper or a denormalized `user_id` column kept in sync by trigger.
  - Cascade delete on `plant_id`.

---

## 7. Validation rules

- Blank / whitespace-only strings normalize to `null` at the boundary (already enforced by `cleanPlantString` in the context compiler).
- No inference from `strain`, `notes`, photos, or any freeform field.
- No fallback defaults (e.g., never assume "soil" or "5 gal").
- Values are context evidence; readiness must continue to surface them as such, not as guarantees.
- Type-check rejects non-string inputs; reads tolerate legacy `undefined` for forward compatibility.

---

## 8. Testing plan (for the eventual implementation slice)

1. **Migration safety**
   - Additive, nullable; existing rows untouched.
   - `bun run type-check` clean after regenerated Supabase types.
2. **Read path**
   - `useGrowPlant` (or equivalent) exposes `medium` / `pot_size`.
   - Plant Detail mount forwards values into the AI Doctor context compiler.
3. **Compiler / view-model**
   - Existing `aiDoctorContextCompiler` and `aiDoctorReadinessViewModel` tests extended with persisted-value scenarios.
   - `hasUnknownMedium` / `hasUnknownPotSize` flip to `false` only when non-blank strings are present.
4. **Edit UI**
   - Empty submit ⇒ persists `null`, not `""`.
   - Whitespace-only ⇒ `null`.
   - Round-trip: save → refetch → readiness updates.
5. **RLS / write safety (runtime harness)**
   - Owner can update own plant's `medium` / `pot_size`.
   - Non-owner cannot read or write another user's values.
   - Anonymous session cannot read.
6. **Safety / fence tests**
   - No new Supabase writes outside the new edit surface.
   - No AI/model call triggered by saving metadata.
   - No Action Queue / alerts side effects.
   - Plant Profile Context card no longer renders "coming soon" once values are editable; provenance copy on readiness panel still appears when fields are `null`.
7. **Regression**
   - All existing AI Doctor readiness, compiler, panel, and Plant Detail mount tests stay green.

---

## 9. Rollout plan (Option A)

1. ✅ **Migration**: add nullable `medium` and `pot_size` columns to `public.plants`. No backfill.
2. ✅ **Generated types**: regenerated Supabase types; `PlantRow` now exposes both fields.
3. ✅ **Read-path wiring**: extended `mapPlantRow` and `PlantDetail` to forward values through `PlantProfileContextCard` and `PlantDetailAiDoctorContextReadinessMount`.
4. ⏸ **Edit UI**: replace "coming soon" buttons on the existing Plant Profile Context card with a small inline edit form (text inputs, save → `plants` update scoped by owner). **Not yet exposed.**
5. ✅ **AI Doctor readiness update**: no code change needed — flags flip automatically once the read path delivers non-null values. Provenance copy continues to appear when values are `null`.
6. ✅ **Regression tests**: compiler, adapter, card, and mount tests extended.
7. ⏸ **RLS write harness**: pending edit UI slice.
8. ✅ **Docs**: this doc updated to "Implemented (read path)".

Read path landed before edit UI to avoid grower-visible half-states.

---

## 10. Rollback plan

- **Edit UI**: feature-flag or revert the edit form back to the "coming soon" buttons. Readiness panel automatically falls back to provenance copy when values become `null`.
- **Read path**: revert selector changes; compiler tolerates missing fields.
- **Schema**: columns may be dropped, or left in place as `NULL` — they are safe to keep even if the UI is removed because the compiler and readiness view-model already null-coerce. Dropping requires a forward-only migration; leaving in place is the lower-risk rollback.
- **No data loss path** for other features: these columns are not referenced by alerts, Action Queue, automation, or device control.

---

## 11. Decision status

**Needs owner approval.**

- ✅ Recommended now: **Option A**, *if* a plant profile edit slice is in this iteration's scope.
- ⏸ Defer (**Option C**) if no edit surface is imminent — persisting empty columns adds risk without product value.
- 🚫 **Option B** not recommended at this time; revisit only when ≥ ~5 optional context fields are queued.

---

## 12. Follow-up implementation slice (only if Option A is approved)

Smallest safe first slice:

1. Migration: `ALTER TABLE public.plants ADD COLUMN medium text NULL, ADD COLUMN pot_size text NULL;` (no GRANT/RLS changes — existing `plants` policies cover both columns).
2. Regenerate Supabase types.
3. Extend plant read selector to include both columns.
4. Wire values through `PlantDetailAiDoctorContextReadinessMount` (props already exist).
5. Add minimal inline edit form on `PlantProfileContextCard` (owner-scoped update via authenticated session).
6. Tests per Section 8 (compiler, view-model, mount, edit form, RLS harness, regression).
7. Update this doc's status to "Implemented" and update workspace knowledge.

Each item is a separate PR-sized change; do not bundle.
