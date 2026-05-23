# pi-ingest-readings — Write-Path Transaction Contract (DOCS ONLY)

**Status:** Contract + static guardrail tests only. **No write helpers, no
RPC, no schema migration, and no Edge Function behavior change in this
task.**

This document defines the **future atomic write behavior** for the
`pi-ingest-readings` Edge Function. It applies after all of the
following gates have already succeeded:

- bridge lookup
- secret resolution
- HMAC verification
- tent owner lookup
- bridge authorization
- request envelope validation
- normalization
- per-reading idempotency-key derivation
- existing-key lookup against `pi_ingest_idempotency_keys`
- pure commit-plan preview

**No writes may be enabled until this contract is satisfied.** Until the
atomic write path described here is implemented and tested, the endpoint
MUST keep returning `503 auth_ok_pipeline_not_implemented` on otherwise
successful requests.

---

## 1. Purpose

Define the atomic write behavior for ingestion so the following failure
modes are structurally impossible:

1. Sensor row inserted but idempotency key not recorded.
2. Idempotency key recorded but the sensor row insert failed.
3. Retry creates duplicate sensor readings.
4. Partial batch inserts some readings but not all matching idempotency
   records.
5. Duplicate readings are treated as successful new inserts.
6. Alert / Action Queue writes happen inside the ingest endpoint.

This contract governs the ingest write path only. It does not change the
downstream snapshot / alert persistence gates.

---

## 2. Required atomicity

The future write path MUST be **atomic** at the database level:

- Insert new rows into `sensor_readings`.
- Record matching rows into `pi_ingest_idempotency_keys`.
- **Either both succeed or neither succeeds.**
- No idempotency key may be recorded for a sensor row that failed to
  insert.
- No sensor row may be inserted without its idempotency key also being
  recorded in the same transaction.
- A partial batch (some sensor rows committed, others rolled back) is
  forbidden. The whole new-row set commits together or rolls back
  together.

Already-seen readings (idempotency keys returned by the prior lookup)
are **excluded** from the write set before the transaction begins; they
are reported as duplicates, never re-inserted.

---

## 3. Preferred implementation option

### Preferred — Postgres RPC / SQL function

- A single Postgres function performs **both inserts in one
  transaction**.
- The Edge Function calls the RPC exactly once, after all validation
  succeeds and the commit-plan is built.
- The RPC returns `{ inserted, rejected }` (or equivalent) counts.
- The RPC MUST NOT create alerts.
- The RPC MUST NOT create Action Queue items.
- The RPC MUST NOT trigger automation or device control.
- The RPC MUST use the server-resolved `user_id` provided by the Edge
  Function and MUST NOT accept a client-controlled owner id.

### Alternative — Edge Function-coordinated inserts (NOT recommended)

- Only acceptable if a verified transactional pattern is available from
  the server-side Supabase client.
- If no transaction support is available, **this option must not be
  used**. Two sequential `.insert()` calls without a transaction violate
  section 2 and are forbidden.

The default decision for this project is: **use an RPC / SQL function.**

---

## 4. Idempotency model

- Idempotency is **per-reading**, not per-request.
- There is **no `requestHash`** and **no `request_hash`** column or
  field anywhere in the ingest write path.
- The `sensor_readings` table MUST NOT gain an `idempotency_key`
  column. Idempotency lives only on `pi_ingest_idempotency_keys`.
- Durable idempotency state lives in `pi_ingest_idempotency_keys`.
- The unique constraint remains `(user_id, idempotency_key)`.
- The future writer MUST use the **server-resolved `user_id`** (from
  the bridge → tent-owner lookup). It MUST NOT accept a client-provided
  owner id.
- Duplicate existing keys are **skipped**, not inserted as new
  readings, and not counted as new inserts.

---

## 5. Insert order / linkage

Inside the single transaction:

- Insert the new `sensor_readings` rows.
- Insert the matching `pi_ingest_idempotency_keys` rows.
- Idempotency rows SHOULD include `sensor_reading_id` linking to the
  freshly inserted sensor row when the RPC can obtain the id in the
  same transaction (e.g. via `INSERT ... RETURNING id`).
- If `sensor_reading_id` cannot be safely linked in the same
  transaction, it MAY remain `null` only as an **explicit, documented,
  temporary limitation**, recorded in this contract before shipping.
- Idempotency rows MUST NOT be inserted **before** sensor rows in a
  way that could leave a key recorded for a sensor row that never
  committed. Within a single transaction this is automatically safe;
  outside a transaction it is forbidden.

---

## 6. Failure behavior

- Any DB write failure returns a generic `503 internal_failure`-style
  response.
- Raw DB error messages MUST NOT be exposed to the bridge caller.
- No partial-success response is allowed.
- A failed write creates **no alerts**.
- A failed write creates **no Action Queue rows**.
- A failed write does NOT mark any reading as accepted.
- A retry after a failed write MUST be safe: because nothing was
  committed, the same batch can be retried and will be processed as if
  it were new.

---

## 7. Response behavior

- Once the atomic write path is implemented and tested, success MAY
  return:
  ```json
  { "ok": true, "inserted": <int>, "rejected": <int> }
  ```
- A duplicate-only request (all readings already in
  `pi_ingest_idempotency_keys`) MUST return a clearly-defined
  successful response of the form:
  ```json
  { "ok": true, "inserted": 0, "rejected": <count> }
  ```
  (or an equivalent shape documented in the contract at the time the
  writer ships).
- **Until the atomic write transaction is implemented**, the endpoint
  MUST keep returning `503 auth_ok_pipeline_not_implemented` on
  otherwise valid requests. No `{ ok: true }` success path may be
  emitted before then.

---

## 8. Prohibited behavior

The following are forbidden until the atomic write contract is met:

- Adding an idempotency writer helper before the sensor insert strategy
  is defined and atomic with it.
- Recording idempotency keys before the corresponding sensor rows are
  inserted (outside a single transaction).
- Inserting sensor rows without recording their idempotency keys in the
  same transaction.
- Introducing a request-level idempotency hash (`requestHash` /
  `request_hash`).
- Accepting a client-provided `user_id`.
- Direct alert writes from this endpoint.
- Direct `action_queue` writes from this endpoint.
- Any automation or device-control writes from this endpoint.
- Partial batch success unless explicitly documented in this contract
  and safely returned.
- Logging idempotency keys, raw payload, signature, secret material,
  service-role key, or normalized sensor values.

---

## 9. Stop-ship conditions

Any of the following blocks shipping the write path:

- A `.insert("pi_ingest_idempotency_keys")` helper exists before the
  atomic write strategy is implemented.
- A sensor `.insert("sensor_readings")` helper exists in the Edge
  Function path without idempotency recording inside the same
  transaction.
- An idempotency insert exists without a transactional link to its
  sensor insert.
- The endpoint returns `{ ok: true }` before this transaction contract
  is implemented.
- The endpoint writes to `alerts` or `action_queue`.
- The endpoint introduces a `requestHash` / `request_hash` field.
- The endpoint accepts a client-provided owner id.
- The endpoint logs idempotency keys, raw payload, signature, or
  secret material.
