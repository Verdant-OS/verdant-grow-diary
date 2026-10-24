# Spec: a VPD correction must not double a Plant Quick Log save in tent history

Status: **specification only.** Matthew approved writing it on 2026-10-23. Writing the migration,
applying any SQL, and applying `20261014210000` stay his decisions. Nothing here is applied.
Tracking issue: #2503 (precondition for applying `20261014210000`).

Audited on the deploy branch `verdant-grow-diary` at `65d9964e49eb4b95910bedc59d288d747461da79`.
Client references to `src/lib/tentManualEnvironmentEventRules.ts` were audited on PR #2504 at
`e713629535e63334332a3820ce111abc6441fefb`. #2504 has since merged as `3ef43ee49`, and its rules
and hook files on the deploy branch are byte-identical to that head (re-checked 2026-10-24).

Claim labels follow `CLAUDE.md`: `established fact` (read in source at the SHA above),
`source claim` (stated by a log, PR or issue, not re-verified), `inference`, `missing evidence`.

## 1. Summary

**Recommendation: Option A1 + Option C.** One small additive migration plus a client rule change.
No schema, RLS, grant or save-path change.

- **A1 (migration).** Replace `quicklog_correction_apply_measured_values` so a VPD correction
  also writes `details.manual_sensor_snapshot.vpd_kpa` on a Plant Quick Log mirror. The grower's
  diary record then holds the VPD they corrected to. Today it falls back to a VPD derived from
  temperature and RH, which can disagree with the measured value (about 4.5 kPa derived vs
  1.2 kPa measured in #2500's case; `source claim`, #2500 body).
- **C (client, no migration).** The tent dedupe identifies the environment sibling with the
  key the server already uses for the same job: the sibling's `grow_events.created_at` equals
  the mirror's `diary_entries.created_at`, because the save writes the parent, sibling and
  mirror in one transaction. That key is deterministic. An independent same-instant save runs
  in a different transaction and has a different `created_at`, so the two can be told apart.
  The value rule stays as a fallback for rows the key does not match.

Rejected: building a `sensor_snapshot` object on plant mirrors (A2), and a
`grow_events.parent_event_id` column (B1). Deferred: a save-time link key in the mirror's
details (B2). Reasons are in §4.

## 2. Requirements and assumptions

- R1. After a VPD correction on a sensor-bearing Plant Quick Log save, the tent history shows
  **one** card for that save.
- R2. That card shows the corrected, measured VPD. It never shows a temperature/RH-derived VPD
  that contradicts the corrected value.
- R3. An independent manual save at the same tent, plant and instant still shows as its own
  card, with or without VPD.
- R4. Uncorrected saves and every pre-existing row render exactly as they do today.
- R5. Additive only. No merged migration is edited. No table, column, policy, grant or RLS
  change. The save delegate (`quicklog_save_manual_pre_logged_at`) is not replaced.
- R6. Tests: a disposable-PG runtime harness, plus a client test whose fixtures are generated
  from the real write path, not hand-built shapes.

Assumptions:

- `20261014210000` is not applied in production, so no VPD-corrected row exists there yet
  (`source claim`: HANDOFF_LOG closed block QUICKLOG-CORRECTION-EDITABLE-VALUES; #2503).
- #2504 has merged (`3ef43ee49`), so the client half builds directly on the deploy branch.

## 3. Audit (current behaviour)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                      | Label                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| F1  | The save delegate inserts the parent `grow_events` row (`20260927160000…lineage.sql:184-189`), then, if any sensor value is present, an `environment` sibling and its `environment_events` child (`:196-209`), then the diary mirror with `linked_grow_event_id = v_parent_event` (`:214-229`). The sibling's id is returned to the caller but stored nowhere.                                                               | established fact                    |
| F2  | `quicklog_correction_apply_measured_values` writes `{sensor_snapshot,metrics,*}` with `jsonb_set(..., true)` (`20261014210000…values.sql:264-281`). On a mirror with no `sensor_snapshot` key that is a no-op, because `jsonb_set` does not create a missing parent. The `manual_sensor_snapshot` update (`:282-297`) writes `temp_f` and `humidity_percent` only, never VPD.                                                | established fact                    |
| F3  | The correction finds the sibling with `quicklog_revision_sibling_env_ids` (`20260811090000…retractions.sql:197-223`). It matches `event_type = 'environment'`, `source = 'manual'`, the same user, and `created_at = parent.created_at`. Its comment calls this "the deterministic sibling key"; it "survives later corrections because created_at never changes". `quicklog_correct_entry` uses it at `20261014210000:520`. | established fact                    |
| F4  | `grow_events.created_at`, `diary_entries.created_at` and `environment_events.created_at` are each `TIMESTAMPTZ NOT NULL DEFAULT now()` (`20260518152526…sql` for the first and third, `20260515173341…sql` for diaries). `now()` is fixed for a transaction.                                                                                                                                                                 | established fact                    |
| F5  | A client cannot insert a diary row carrying `linked_grow_event_id`, and cannot update a linked row except the one-time photo fill (`20260927094000…write_fence.sql`: restrictive insert policy, `guard_linked_quicklog_diary_client_update` trigger). So a linked mirror's `details` and `created_at` come from the server.                                                                                                  | established fact                    |
| F6  | `grow_events` has client INSERT, UPDATE and DELETE own-row policies (`20260518152526:279-281`, re-created in `20260710225553`). A new link column on it would be client-writable unless fenced.                                                                                                                                                                                                                              | established fact                    |
| F7  | `quickLogRevisionRules.ts:383-387` (`sensorFromDetails`) prefers `details.sensor_snapshot` over `details.manual_sensor_snapshot`. About 40 non-test modules read `manual_sensor_snapshot`, including Edge-mirrored AI Doctor packet rules under `supabase/functions/_shared`.                                                                                                                                                | established fact                    |
| F8  | `config/local-supabase-replay-compatibility.json` has no entry for `20260927160000`, `20261013180000` or `20261014210000`. No replay patch interacts with this change.                                                                                                                                                                                                                                                       | established fact                    |
| F9  | #2504's `dropEventsMirroredByDiaryRows` claims a sibling by direct id, or by `(tent, plant, instant)` plus `eventMatchesMirrorValues`. That function returns `false` whenever the event has VPD. #2504's event select (`TENT_MANUAL_ENV_EVENT_SELECT`) does not include `created_at`. The diary hook's select list was not inspected.                                                                                        | established fact / missing evidence |
| F10 | The correction's `sensor_values` previous-state read uses `sensor_snapshot.metrics` only, so it is null for plant mirrors. The previous sensor values are still kept, through `environment_events` (`:244-257`).                                                                                                                                                                                                             | established fact                    |
| F11 | The existing measured-value proof `scripts/prove-quicklog-correction-measured-values.mjs` hand-builds its tables. It runs in `ci.yml:840-842` (not a required check).                                                                                                                                                                                                                                                        | established fact                    |
| F12 | PostgREST encodes `timestamptz` with the same text format for every column (microsecond precision, explicit offset). Two equal values in different tables therefore compare equal as strings.                                                                                                                                                                                                                                | inference (verify; §9 K2)           |

**Why the client alone cannot fix it today:** after a correction, the sibling carries VPD and the
mirror does not (F2). The value rule has no VPD on the mirror to compare against, and nothing in
the fields #2504 selects links the sibling to the mirror. F3 and F4 show the link already exists
in `created_at`; the client just doesn't read it.

## 4. Options

### Option A1: the correction also writes `manual_sensor_snapshot.vpd_kpa` (recommended)

**Migration shape.** New file `supabase/migrations/<fresh-timestamp>_quicklog_correction_manual_snapshot_vpd.sql`.
Its timestamp must be newer than every migration on the base at merge time, and it must not touch
any other file.

1. `BEGIN;` plus an advisory transaction lock, following the repo's preflight pattern
   (`20260927160000:6-32`).
2. **Preflight, fail closed.** `to_regprocedure('public.quicklog_correction_apply_measured_values(uuid, text, uuid, uuid[], uuid[], boolean, numeric, boolean, numeric, boolean, jsonb)')`
   exists; owner `postgres`; `prosecdef`; `proconfig = ARRAY['search_path=public, pg_temp']`;
   `md5(replace(prosrc, E'\r', ''))` equals **either** the `20261014210000` body **or** this
   migration's own body (so a re-run is recognised). No EXECUTE for `anon`, `authenticated` or
   `service_role`. On any mismatch raise
   `P0001 quicklog_correction_manual_vpd_preflight_unrecognized`.
   Compute both md5 values from a disposable database that replayed the files. Never derive
   them by hand.
3. `CREATE OR REPLACE FUNCTION` with the identical signature, return type, `SECURITY DEFINER`
   and `SET search_path`. The body is `20261014210000`'s body with **one** change: the
   `manual_sensor_snapshot` UPDATE (`:282-297`) becomes

   ```sql
   UPDATE public.diary_entries d
      SET details = CASE WHEN p_sensor ? 'vpd_kpa'
        THEN jsonb_set(<existing temp_f / humidity_percent expression>,
                       '{manual_sensor_snapshot,vpd_kpa}',
                       to_jsonb((p_sensor ->> 'vpd_kpa')::numeric), true)
        ELSE <existing temp_f / humidity_percent expression> END
    WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
      AND jsonb_typeof(d.details -> 'manual_sensor_snapshot') = 'object';
   ```

   `create = true` works here because the `WHERE` guarantees the parent object exists. The key
   is written **only** when the correction carries VPD, so a temperature-only correction adds no
   `vpd_kpa: null` key. The `sensor_snapshot` UPDATE stays as it is: it still serves rows that do
   have a `sensor_snapshot`.

4. Repeat `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` (idempotent; grants
   unchanged).
5. **Postflight, fail closed.** `prosrc` contains `'{manual_sensor_snapshot,vpd_kpa}'`; the
   privileges are as in step 2; `quicklog_correct_entry` is unchanged (md5 equals the
   `20261014210000` body).
6. `COMMIT; NOTIFY pgrst, 'reload schema';`

**Key name.** `vpd_kpa` names its unit, as `temp_f` and `humidity_percent` do. It is the name the
correction payload already uses.

**Existing rows.** None need repair. Production has no VPD-corrected rows (assumption above).
Local and CI databases are disposable. A mirror corrected between `20261014210000` and this
migration (only if the two are applied apart) keeps no `vpd_kpa`; Option C still dedupes it, and
§8 asks for both to be applied in one session. No backfill.

**RLS and grants.** None. The function stays SECURITY DEFINER, callable only from
`quicklog_correct_entry`. The new key lands on rows the client cannot write anyway (F5).

**Client change it enables (`manualSnapshotDiaryAdapter.ts`).** `toValidatorInput` passes a
finite `snap.vpd_kpa` to the validator as a **measured** VPD, so the card shows the corrected
value, not one derived from temperature and RH. A missing key keeps today's derived path.
Validation bounds are the existing validator's (the RPC already bounds VPD to 0–10 kPa).

**What A1 alone would leave.** The dedupe would still rest on value equality. A corrected
sibling would have to be matched by "the mirror's `vpd_kpa` equals the sibling's VPD". An
independent same-instant save with identical readings would remain indistinguishable. That case
is rare, but it is the exact hazard #2502 named. That is why C goes with A1.

### Option A2: build the `sensor_snapshot` path with nested `jsonb_build_object` (rejected)

This would create a new `sensor_snapshot` object on Plant Quick Log mirrors that holds only the
corrected metrics. `sensorFromDetails` (F7) and every other reader that prefers `sensor_snapshot`
would switch envelopes for corrected rows only. They would lose `temp_f`, `humidity_percent`,
`ph`, `ec` and the mirror's provenance, and the row would carry two snapshot envelopes that can
disagree. That changes far more public behaviour than the bug needs.

### Option B1: `grow_events.parent_event_id` column (rejected)

- **Migration shape:** `ALTER TABLE grow_events ADD COLUMN parent_event_id uuid NULL REFERENCES
grow_events(id)`, an index, a same-owner trigger, a replacement of the save delegate to write
  it, regenerated `types.ts`, and a backfill using the F3 key.
- **RLS:** `grow_events` is client-writable (F6). Without a new trigger fence, a client could
  point its own rows at any id; with one, this is an RLS-adjacent change in the hot save path.
- **Cost against benefit:** the backfill must use the `created_at` key anyway, so B1 adds a
  second copy of a link that already exists. It also replaces the md5-chained delegate that every
  Quick Log save runs through (frozen by `docs/specs/one-tent-loop-quicklog-single-write-path.md`).

### Option B2: the save writes `linked_environment_event_id` into the mirror's details (deferred)

- **Migration shape:** replace `quicklog_save_manual_pre_logged_at` with one more key in
  `v_safe_details` (`:214-222`): `jsonb_build_object('linked_environment_event_id', v_env_parent)`
  when a sibling exists. Preflight on the delegate's current md5 and the wrapper's
  (`20261013180000:11-21`). The caller-details strip list must also remove this key so a caller
  cannot forge it.
- **RLS:** none. F5 already makes the key server-only.
- **Existing rows:** no key. The client falls back to C or the value rule, so B2 does not remove
  the need for C for historical rows.
- **Client change:** the existing direct-id branch in `dropEventsMirroredByDiaryRows` also
  accepts the new key.
- **Why deferred:** it is the most explicit link, but it replaces the hot save delegate to restate
  a fact the server already records (F3). Two link definitions could also drift apart. Revisit if
  a writer ever puts unrelated environment events in one transaction (§9 K1).

### Option C: the client uses the server's `created_at` sibling key (recommended, with A1)

**Migration shape:** none for the link. The A1 harness pins the invariant (§6, P1).

**Client change (`tentManualEnvironmentEventRules.ts`, added by #2504):**

1. Add `created_at` to `TENT_MANUAL_ENV_EVENT_SELECT`, and carry it as `createdAt: string | null`
   on `TentManualEnvironmentEvent`. Add `created_at` to the diary snapshot read and to
   `TentManualMirrorDiaryRow`.
2. In `dropEventsMirroredByDiaryRows`, between the direct-id branch and the value branch, add a
   **transaction-key branch**. A linked mirror with a manual snapshot claims the unclaimed event
   whose `createdAt` is string-equal to the mirror's `created_at` **and** whose `siblingKey(tent,
plant, instant)` equals the mirror's. That branch ignores VPD and readings. Equal `created_at`
   is the same proof the correction RPC uses to choose which rows it edits.
3. Keep the value branch unchanged, including `ev.vpdKpa !== null → false`, as the fallback for a
   row whose `created_at` is missing, malformed or unequal.
4. Compare `created_at` as exact strings. Never compare parsed `Date`s: JavaScript drops
   microseconds, and two transactions in the same millisecond would then collide.
5. Each mirror still claims at most one event. Break ties by lowest id (current behaviour).
   Input order is preserved.

**What C fixes and what it doesn't:** C fixes R1 and R3 for every row, past and future, with no
backfill. It does not fix R2 by itself: without A1 the kept mirror card still shows the derived
VPD. Hence A1 + C.

**Existing rows:** the current delegate inserts the parent, sibling and mirror within one function
call (F1). Earlier delegates likely did too (`inference`: the always-mirror rewrite
`20260723000000` writes the mirror inside the same function; not checked for every historical
body). Any row whose `created_at` values differ falls back to today's value rule, unchanged.

**RLS and grants:** none. `created_at` is already readable under the owner SELECT policies.

## 5. Decision record

| Decision                                                  | Choice                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Where the corrected VPD lives on a Plant Quick Log mirror | `details.manual_sensor_snapshot.vpd_kpa`, written by the correction RPC only |
| How the client links a mirror to its environment sibling  | Equal `created_at` plus equal (tent, plant, instant); value rule as fallback |
| Explicit link column or key                               | Not now. B1 rejected, B2 deferred                                            |
| Save delegate                                             | Unchanged                                                                    |

## 6. Tests

### 6.1 Runtime PG harness (A1 and the C invariant)

New `scripts/run-quicklog-correction-manual-vpd-pg15-harness.mjs`. Base it on the disposable-PG
scaffold in `scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs` (which replays the real
delegate files through `scripts/lib/quicklogManualDeliveryOrder.mjs`) and
`scripts/run-quicklog-corrections-retractions-pg15-harness.mjs`. Then apply the real
`20261014210000` file and the new file. **Do not hand-build the function bodies or tables the way
F11's proof does.** Every write goes through `quicklog_save_manual` and `quicklog_correct_entry`
as an `authenticated` owner.

| Case             | Setup → expectation                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 (C invariant) | A plant save with temperature and RH and `p_vpd_kpa = null` → the parent, sibling `grow_events` row and mirror `diary_entries` row have byte-equal `created_at` text under `to_jsonb`. `quicklog_revision_sibling_env_ids` returns exactly that sibling. |
| P2               | Correct `sensor_values: { vpd_kpa: 1.2 }` → `environment_events.vpd_kpa = 1.2`; the mirror's `manual_sensor_snapshot.vpd_kpa` is the JSON number `1.2`; `temp_f` and `humidity_percent` unchanged; **no** `sensor_snapshot` key created.                 |
| P3               | Correct temperature only → `temp_f` updated; **no** `vpd_kpa` key added.                                                                                                                                                                                 |
| P4 (regression)  | A row that does carry `sensor_snapshot`, written by its real writer (identify that writer during implementation; this spec did not trace it) → after the same correction, `details` equals what `20261014210000` alone produces, byte for byte.          |
| P5               | Privileges: owner `postgres`, SECURITY DEFINER, pinned search path; `has_function_privilege` is false for `anon`, `authenticated` and `service_role`. `quicklog_correct_entry` md5 is unchanged.                                                         |
| P6               | Preflight fails with `quicklog_correction_manual_vpd_preflight_unrecognized` when `20261014210000` is absent or its body differs. Re-running the migration succeeds and changes nothing.                                                                 |
| P7 (RED)         | With only `20261014210000` applied, P2 fails on the missing `vpd_kpa`. Record the failing count in the PR body.                                                                                                                                          |
| P8               | The revision ledger's `previous_state` still holds the original `environment_events` values (F10).                                                                                                                                                       |

The harness also **generates the client fixture** (6.2) and has a `--check` mode that fails when
the committed fixture differs from a fresh run.

CI: add the harness to the job at `ci.yml:830-842`, next to the existing measured-value proof.
This is a `.github` change, so it is protected scope and needs an eligible outside reviewer.

### 6.2 Client test with real-write-path fixtures (C and the adapter)

**Fixture:** `src/test/fixtures/quicklog-vpd-correction-write-path.json`, written only by the
harness. It contains:

- `grow_events` rows with the `environment_events` embed in the shape #2504's select requests;
- the tent's diary rows, as `to_jsonb` row output;
- for five scenarios: S1 uncorrected plant save; S2 the same save after a VPD correction; S3 S2
  plus an independent same-plant, same-instant save made through `quicklog_save_manual` with
  `p_vpd_kpa` set; S4 a temperature-only correction; S5 a legacy-shape mirror whose `created_at`
  differs (inserted as `postgres` in a separate transaction, labelled synthetic-legacy in the
  fixture).

Normalisation is deterministic: UUIDs map to placeholders in order of first appearance, and each
distinct `created_at` maps to a fixed ISO string that keeps its equality class and microsecond
format. `occurred_at` is set by the harness, so it is real. **The test file must not build row
shapes itself.**

New `src/test/tent-history-vpd-correction-write-path.test.ts`:

| Case    | Expectation                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| T1 (S1) | One card (regression of today's behaviour).                                                                            |
| T2 (S2) | One card; its VPD is 1.2 from `manual_sensor_snapshot.vpd_kpa`, labelled measured, not the derived value.              |
| T3 (S3) | Two cards: the corrected save and the independent save. The independent one keeps its own VPD.                         |
| T4 (S4) | One card; no VPD is invented.                                                                                          |
| T5 (S5) | The value-rule fallback still collapses a legacy mirror with matching readings, and still refuses a VPD-bearing event. |
| T6      | Null or malformed `created_at` on either side → no transaction-key claim; the fallback applies.                        |
| T7      | Determinism: every permutation of the input rows gives the same output.                                                |
| T8      | Two `created_at` values that differ only in microseconds do not match (pins string comparison).                        |

**Negative gates:** set aside the C branch (diffed against the base) → T2 shows two cards. Set
aside the adapter change → T2 shows the derived VPD. Restore both, then re-run.

Existing tests to keep green: #2504's `tent-manual-environment-events.test.tsx` and
`tent-manual-history-diary-snapshots.test.ts`, plus the `quicklog-correction-*` suites.

## 7. File-level plan

| Slice                                    | File                                                                                                                   | Change                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (migration, Matthew's per-PR decision) | `supabase/migrations/<ts>_quicklog_correction_manual_snapshot_vpd.sql`                                                 | New; §4 A1                                                                                                                                                                                                     |
| 1                                        | `scripts/run-quicklog-correction-manual-vpd-pg15-harness.mjs`                                                          | New; §6.1                                                                                                                                                                                                      |
| 1                                        | `.github/workflows/ci.yml`                                                                                             | One step in the existing job (protected scope)                                                                                                                                                                 |
| 1                                        | `scripts/assert-required-core-migrations-applied.mjs`                                                                  | Add a fingerprint for the new `quicklog_correction_apply_measured_values` body, next to the `quicklog_correct_entry` one (`:97-109`), so a production verify catches `20261014210000` applied without this fix |
| 2 (client)                               | `src/lib/tentManualEnvironmentEventRules.ts`                                                                           | §4 C steps 1–5                                                                                                                                                                                                 |
| 2                                        | `src/hooks/useTentManualEnvironmentEvents.ts`, `src/hooks/useTentManualDiarySnapshots.ts`                              | Select `created_at`                                                                                                                                                                                            |
| 2                                        | `src/lib/manualSnapshotDiaryAdapter.ts`                                                                                | Measured `vpd_kpa` (§4 A1)                                                                                                                                                                                     |
| 2                                        | `src/test/fixtures/quicklog-vpd-correction-write-path.json`, `src/test/tent-history-vpd-correction-write-path.test.ts` | New; §6.2                                                                                                                                                                                                      |
| 2                                        | `src/lib/tentManualEnvironmentEventRules.ts` comment in `eventMatchesMirrorValues`                                     | Replace the "known gap" note with a pointer to the transaction-key branch                                                                                                                                      |

Slice 2 depends on slice 1's harness for its fixture. Slice 2's rule change is safe to merge
before the migration is applied. A sibling with matching readings is claimed under either rule
(T1, T4, T5); the only new claim is the VPD-corrected sibling the value rule refuses (T2), and
an independent save is never claimed (T3).

## 8. Release and apply order (Matthew's decisions)

1. Merge slice 1 and slice 2. A merge applies nothing.
2. In one apply session: `20261014210000`, then this migration. Run the read-back: P5's privilege
   checks plus the new fingerprint.
3. Then close #2503.

If step 2 is split, corrections made in between keep no mirror VPD (R2 unmet for those rows; R1
still met by C).

## 9. Known unknowns

- **K1.** A future writer that inserts several unrelated manual `environment` rows and linked
  mirrors for the same tent, plant and instant in **one** transaction would defeat the
  `created_at` key. It would defeat the correction RPC's sibling choice too (F3). No such writer
  exists (`inference` from F1 and the migration index). If one is added, B2 becomes the fix.
- **K2.** F12 (identical PostgREST `timestamptz` text across tables) is an inference. T8 and P1
  pin it in tests. A production read-back of one row pair is NOT_MEASURED.
- **K3.** The PostgREST embed cardinality for `environment_events` (object vs array) in the
  fixture should match what production returns. NOT_MEASURED. #2504's parser should accept both.
- **K4.** About 40 readers of `manual_sensor_snapshot` (F7), including Edge-mirrored AI Doctor
  packet rules. The implementer must check that none rejects or mislabels an extra numeric key.
  Expected effect: AI Doctor packets may start to include the corrected measured VPD, which is
  truthful, but it is a visible change to review.
- **K5.** Two microsecond-equal `now()` values from different transactions of the same user
  would also mislead the correction RPC today. Probability not measured.

## 10. Acceptance

- [ ] P1–P8 pass in the disposable-PG harness; P7 shown RED first, with its count in the PR body.
- [ ] T1–T8 pass; both negative gates shown failing, then restored.
- [ ] `config/local-supabase-replay-compatibility.json` unchanged; the `Published migration
integrity` gate green; no merged migration edited.
- [ ] No table, column, policy, grant or RLS change (diff check).
- [ ] 35/35 required checks plus an eligible independent PASS at the exact head, per
      `AGENTS.md`. The migration PR also needs Matthew's explicit per-PR decision.
- [ ] Production: after step 8.2, a smoke correction on the fixture grow only
      (`[smoke <timestamp>]`, per `docs/production-only-verification-runbook.md`) shows one card
      with the measured VPD. Until then: NOT_MEASURED.

## 11. Safety verdict

No device control, Action Queue write or automation. No sensor value is invented: the mirror
records only the value the grower typed into the correction, and an uncorrected VPD stays
absent. The source label stays `manual`. The migration narrows a truth gap. It widens no access.

## 12. Deferred and rejected

- Rejected: A2 (second snapshot envelope; changes reader precedence), B1 (client-writable link
  column on the hot save path).
- Deferred: B2 (explicit save-time link key), triggered by K1.
- Deferred: copying the mirror's previous `manual_sensor_snapshot` values into the revision
  ledger (F10). The originals are already kept through `environment_events`.
- Noted, not fixed: `docs/contributing-supabase-migrations.md` still names `dev` as the
  integration branch; the deploy branch is `verdant-grow-diary`.

## 13. Handoff

Implementation holder: unassigned. Slice 2 overlaps #2504's files, so the #2504 holder is the
natural owner. Independent reviewer: an available eligible session under `OWNERSHIP.md` §4.3 that
did not write this spec or either slice. This spec's author (Claude, session
`01QxMpAHgnpV65y3Yykv8CvE`) is excluded from accepting it and from accepting both slices.
