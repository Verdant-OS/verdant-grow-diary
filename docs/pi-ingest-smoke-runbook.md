# pi-ingest-readings deployed smoke runbook

## 1. Purpose

This runbook covers the **manual deployed smoke test** for the `pi-ingest-readings`
Edge Function. It verifies real deployed ingest behavior end-to-end:

- A valid signed batch from a test-only bridge inserts sensor readings once.
- Replay of the exact same batch is **idempotent** — duplicate rows are rejected,
  never re-inserted.
- Auth failures (tampered signature, unknown bridge) and envelope validation
  failures (invalid metric) are rejected fail-closed.

It is intentionally **manual-only**; it is the last line of defense before
trusting hardware bridge data in a deployed environment.

## 2. When to run it

Run the smoke test:

- After deploying `pi-ingest-readings`.
- After changing **any** of: bridge auth, HMAC verification, secret resolver,
  envelope validation, normalization, idempotency lookup, the
  `pi_ingest_commit_batch` RPC, the `commitPiIngestBatch` helper, the
  `bridgeCredentialLookup`/`tentOwnerLookup` helpers, or the
  `pi-ingest-smoke` workflow itself.
- Before trusting **new hardware bridge data** in any environment.

## 3. Required GitHub Actions secrets

The `pi-ingest-smoke` workflow reads the following from repo Actions secrets.

**Required** (smoke test skips with a clear message if any are missing):

- `PI_INGEST_SMOKE_FUNCTION_URL` — full deployed function URL,
  e.g. `https://<project-ref>.functions.supabase.co/pi-ingest-readings`
- `PI_INGEST_SMOKE_BRIDGE_ID` — test-only bridge id
- `PI_INGEST_SMOKE_BRIDGE_SECRET` — test-only bridge HMAC secret (plaintext, only
  ever held in GitHub Actions secrets — never in the database)
- `PI_INGEST_SMOKE_TENT_ID` — test-only tent UUID owned by the expected test user
  and present in the bridge's `allowed_tent_ids`

**Optional**:

- `PI_INGEST_SMOKE_DEVICE_ID` — device id sent in the envelope (default: `smoke-device`)
- `PI_INGEST_SMOKE_TIMESTAMP_MS` — fixed epoch-ms used for `captured_at` and the
  HMAC timestamp (used for deterministic replay diagnostics)

## 4. Test-only data requirements

- Use **test-only bridge credentials**. The bridge must exist for the sole
  purpose of smoke testing.
- Use a **test-only tent**. The tent must exist for the sole purpose of smoke
  testing.
- **Do not use production grow, tent, or customer data** of any kind.
- **Do not use real customer bridge credentials.**
- The bridge must be **allowed for the test tent** — the test tent's id must
  appear in the bridge's `allowed_tent_ids`.
- The **test tent must belong to the expected test owner** (the user id used to
  resolve the tent owner inside the Edge Function).

## 5. How to seed a test bridge + tent

High-level steps (exact table names and columns are managed by the existing
secret-management contract — do not invent new fields here):

1. Create or identify a **test user** that is not a real customer.
2. Create a **test grow + tent** owned by that user. Capture the tent UUID.
3. Create a **bridge credential** for that user with a new test-only bridge id.
4. Generate a fresh **bridge HMAC secret** and store the encrypted secret
   material in the database according to the existing secret-management
   contract (`secret_ciphertext`, `secret_nonce`, `secret_key_version`,
   `secret_status='active'`).
5. Add the test tent id to the bridge's `allowed_tent_ids`.
6. **Do not** store the plaintext secret in the database.
7. **Do not** expose ciphertext, nonce, or key material to the client / browser.
8. Save the plaintext bridge HMAC secret as the `PI_INGEST_SMOKE_BRIDGE_SECRET`
   GitHub Actions secret. Discard the plaintext from local notes once stored.

## 6. How to add GitHub secrets

1. Open the **GitHub repo**.
2. Go to **Settings**.
3. Open **Secrets and variables → Actions**.
4. Click **New repository secret**.
5. Add each required secret name from §3 with its value.
6. Optional secrets are only required for deterministic / advanced runs.

## 7. How to run the workflow

1. Open the repo's **GitHub Actions** tab.
2. Select the **`pi-ingest-smoke`** workflow.
3. Click **Run workflow** and choose the branch.
4. The workflow is `workflow_dispatch`-only — it **must never** run on push, PR,
   or on a schedule. If it ever does, treat that as a stop-ship condition and
   revert the workflow file.

## 8. Expected results

The smoke test runs five checks against the deployed function, in order:

| Step | Request | Expected HTTP | Expected body |
|------|---------|---------------|---------------|
| 1. Valid signed batch (`temperature_c` + `humidity_pct` + `vpd_kpa`) | POST | `200` | `{ ok: true, inserted: N, rejected: 0 }` |
| 2. Replay of the exact same body + headers | POST | `200` | `{ ok: true, inserted: 0, rejected: N }` |
| 3. Tampered signature (last hex char flipped) | POST | `401` | no internals leaked |
| 4. Unknown bridge id (correctly signed for that random id) | POST | `401` | no internals leaked |
| 5. Invalid metric `soil_ec` | POST | `400` | no internals leaked |

## 9. How to interpret `inserted` / `rejected`

- `inserted` — number of **new** sensor readings accepted into `sensor_readings`
  during this request.
- `rejected` — number of readings **skipped because the
  `(user_id, idempotency_key)` pair already exists** in
  `pi_ingest_idempotency_keys`.
- A replay of a previously accepted batch must increase `rejected`, **never**
  `inserted`.
- This duplicate-protection behavior is what makes bridge retries safe over
  flaky networks.

## 10. Safety checks

The smoke test and the underlying Edge Function path are required to honor all
of the following. Any violation is a stop-ship condition (§13).

- Smoke test **must not** write `alerts` rows.
- Smoke test **must not** write `action_queue` rows.
- Smoke test **must not** trigger automation.
- Smoke test **must not** trigger device control.
- Smoke test **must not** log the bridge secret.
- Smoke test **must not** log HMAC signatures.
- Smoke test **must not** log service-role keys or any decrypted secret material.
- Smoke test **must not** use production customer data.

## 11. Troubleshooting

- **Smoke "skipped — missing env: …"** — one or more required secrets in §3 are
  not set on the repo. Add them in GitHub Actions secrets and re-run.
- **`401 unauthorized`** on the happy path — likely causes: wrong
  `PI_INGEST_SMOKE_BRIDGE_ID`, wrong `PI_INGEST_SMOKE_BRIDGE_SECRET`, test tent
  not in the bridge's `allowed_tent_ids`, bridge inactive, or unknown bridge.
  Inspect server logs **without exposing secrets** to narrow it down.
- **`400 invalid_request`** — bad `source`, unsupported `metric`, invalid
  `unit`, missing `readings`, future-shifted `captured_at`, or duplicate
  readings inside a single batch. Re-check the envelope shape.
- **`503 internal_failure`** — deployment/config/database issue (e.g. missing
  service-role key, RPC missing, tent owner lookup failed, idempotency lookup
  failed). Inspect server logs carefully and never echo secrets while debugging.
- **Replay returns `inserted > 0`** — idempotency is broken. This is a
  stop-ship condition (§13).

## 12. Rollback / cleanup

- If smoke rows land in the **wrong tent**, **stop running smoke tests
  immediately** and follow §13.
- **Disable or rotate** the test bridge: set its status to inactive, then
  rotate its secret. Update `PI_INGEST_SMOKE_BRIDGE_SECRET` afterwards.
- If GitHub secrets may be **compromised**, remove the affected secrets from
  the repo and rotate the underlying material at its source.
- Only delete **clearly scoped test smoke rows** (matched by the test
  `tent_id` + `device_id`). Never bulk-delete production sensor data.
- Re-verify the bridge's `allowed_tent_ids` and the tent owner mapping before
  the next run.

## 13. Stop-ship conditions

Treat **any** of the following as a stop-ship — halt the smoke workflow,
revert the offending change, and investigate before re-enabling:

- Smoke writes to a **non-test tent**.
- Replay **inserts duplicate** sensor rows (idempotency failure).
- Smoke logs **secret**, **signature**, or **service-role** material.
- Smoke triggers any **alert**, **action_queue**, **automation**, or
  **device-control** side effect.
- Unknown bridge does **not** return `401`.
- Tampered signature does **not** return `401`.
- The `pi-ingest-smoke` workflow runs on `push`, `pull_request`, or
  `schedule` instead of `workflow_dispatch`.
