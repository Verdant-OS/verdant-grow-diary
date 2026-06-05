# EcoWitt live-gateway canary runbook

Use this runbook the first time a real EcoWitt gateway is pointed at Verdant. It exercises the `ecowitt-ingest` edge function end-to-end with redacted secrets and verifies the safety contract before any production traffic is allowed.

## Endpoint

- `POST /functions/v1/ecowitt-ingest`
- Project URL: `https://<project-ref>.functions.supabase.co/ecowitt-ingest`

## Auth

- Required header: `Authorization: Bearer vbt_...` (a Verdant bridge token).
- The EcoWitt `PASSKEY`/`MAC` are **not** auth factors. `PASSKEY` is one-way fingerprinted (`ewfp_<24 hex>`) and matched against `tents.hardware_config.ecowitt.passkey_fingerprint`.

## Warnings

- **Do not** use any EcoWitt cloud API/application key here. This endpoint never talks to the EcoWitt cloud.
- **Do not** paste real `PASSKEY` or `MAC` values into this doc, into git, or into chat. Use the redacted placeholders below.
- This endpoint is read-only with respect to alerts, Action Queue, AI, automation, and device control. If you see any of those side-effects, stop and report a blocker.

---

## Recommended runners

Two harnesses are provided. Both run the same three POSTs (main, duplicate replay, malformed) and print a redacted pass/fail matrix plus the SQL verification block.

### Windows (recommended): PowerShell

PowerShell is the **recommended path on Windows**. It prompts safely for each secret, validates the bridge token shape **before** any network call, and never echoes raw secrets.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ecowitt-canary-harness.ps1
```

You will be prompted for four values, one at a time:

1. `SUPABASE_PROJECT_REF`
2. `ECOWITT_BRIDGE_TOKEN` — paste only the `vbt_...` token
3. `ECOWITT_TEST_PASSKEY` — paste only the PASSKEY value
4. `ECOWITT_TEST_MAC` — paste only the MAC value

> ⚠️ **Do not paste the curl command into the token prompt. Paste only the `vbt_...` token.**
> The script will hard-fail with a clear error if any input contains `curl.exe`, whitespace, or does not start with `vbt_`. No request is sent when validation fails.

All output redacts the bridge token, PASSKEY, and MAC as `vbt_REDACTED`, `PASSKEY_REDACTED`, and `MAC_REDACTED`. After the POSTs, the script prints the SQL verification block — copy it into the Supabase SQL editor, then paste the scrubbed results into ChatGPT for GO/NO-GO grading.

### macOS / Linux / Git Bash / WSL (optional): Bash

```bash
SUPABASE_PROJECT_REF="..." \
ECOWITT_BRIDGE_TOKEN="vbt_..." \
ECOWITT_TEST_PASSKEY="..." \
ECOWITT_TEST_MAC="..." \
./scripts/ecowitt-canary-harness.sh
```

The Bash harness is functionally equivalent. Use it on Unix-like shells where the PowerShell harness is unavailable.

---


## 1. Main canary POST (well-formed, mapped channels + one unmapped channel)

```bash
BRIDGE_TOKEN="vbt_REDACTED"
HOST="https://<project-ref>.functions.supabase.co"

curl -i -X POST "$HOST/functions/v1/ecowitt-ingest" \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "PASSKEY=REDACTED_TEST_PASSKEY" \
  --data-urlencode "MAC=REDACTED_TEST_MAC" \
  --data-urlencode "stationtype=GW1100" \
  --data-urlencode "dateutc=2026-06-04 21:00:00" \
  --data-urlencode "temp1f=77.0" \
  --data-urlencode "humidity1=50" \
  --data-urlencode "soilmoisture1=40" \
  --data-urlencode "temp9f=70.0" \
  --data-urlencode "humidity9=55" \
  --data-urlencode "soilmoisture9=20"
```

### Expected response shape

```json
{
  "ok": true,
  "accepted": true,
  "inserted": 4,
  "skipped_duplicate": 0,
  "per_tent": [{ "tent_id": "<scoped-tent>", "rows": 4 }],
  "dropped": [
    { "channel_key": "temp9f", "reason": "no_eligible_tent_for_channel" },
    { "channel_key": "humidity9", "reason": "no_eligible_tent_for_channel" },
    { "channel_key": "soilmoisture9", "reason": "no_eligible_tent_for_channel" }
  ],
  "auth": "bridge"
}
```

### Expected row counts for the mapped tent

Exactly **4 rows** with `source = 'ecowitt'`:

| metric              | derivation | provenance                                                  |
|---------------------|------------|-------------------------------------------------------------|
| `temperature_c`     | measured   | `raw_payload.raw_key = "temp1f"`                            |
| `humidity_pct`      | measured   | `raw_payload.raw_key = "humidity1"`                         |
| `soil_moisture_pct` | measured   | `raw_payload.raw_key = "soilmoisture1"`                     |
| `vpd_kpa`           | derived    | `raw_payload.calculated = true`, `derived_from = ["temp1f","humidity1"]` |

Unmapped channels (`temp9f` / `humidity9` / `soilmoisture9`) write **0 rows**.

---

## 2. Malformed-temperature canary POST

```bash
curl -i -X POST "$HOST/functions/v1/ecowitt-ingest" \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "PASSKEY=REDACTED_TEST_PASSKEY" \
  --data-urlencode "MAC=REDACTED_TEST_MAC" \
  --data-urlencode "stationtype=GW1100" \
  --data-urlencode "dateutc=2026-06-04 21:05:00" \
  --data-urlencode "temp1f=abc" \
  --data-urlencode "humidity1=51" \
  --data-urlencode "soilmoisture1=41"
```

### Expected row counts

Exactly **2 rows**:

- `humidity_pct`
- `soil_moisture_pct`
- **No** `temperature_c` row (malformed value dropped).
- **No** `vpd_kpa` row (VPD MUST NOT be derived from a dropped temperature).

The `dropped[]` array MUST include a `channel_value_missing_or_invalid` entry for `temp1f`.

---

## 3. Duplicate POST test

Run the **main canary** twice, unchanged. Because the payload supplies a valid in-range `dateutc`, both POSTs derive the same `captured_at` and the second response MUST report:

```json
{ "accepted": false, "inserted": 0, "skipped_duplicate": 4 }
```

This is enforced by the partial unique index `sensor_readings_dedupe_uidx` on `(user_id, tent_id, source, metric, captured_at) WHERE captured_at IS NOT NULL`, combined with `upsert({ ignoreDuplicates: true, onConflict: "user_id,tent_id,source,metric,captured_at" })` in the edge function.

### How `captured_at` is chosen

The edge function calls `parseEcoWittDateUtc(payload.dateutc)`:

- **Valid + in-range** (`[2020-01-01T00:00:00Z, now + 24h]`, strict `YYYY-MM-DD HH:MM:SS` UTC, calendar-valid): parsed ISO string is used as `captured_at`. Every emitted row gets `raw_payload.timestamp_source = "ecowitt_dateutc"`.
- **Missing / malformed / out-of-range** (e.g. `1970-01-01 00:00:00` from an unset RTC, or `2099-01-01 00:00:00`): fall back to `new Date().toISOString()`. Rows get `raw_payload.timestamp_source = "server_received_at"`.

> Duplicate protection is strongest only when the gateway sends a valid in-range `dateutc`. Server-time fallback POSTs received at distinct instants will produce distinct `captured_at` values and will NOT collide on the dedupe index.

If the first real gateway POST shows `timestamp_source = "server_received_at"`, **pause** the canary — the gateway clock is either missing, malformed, or outside the sane window.


---

## 4. Verification SQL

Run via `psql` or the Supabase SQL editor (operator role).

```sql
-- 4a. Inspect the rows the canary just wrote.
SELECT id, tent_id, source, metric, value, captured_at, raw_payload
FROM public.sensor_readings
WHERE source = 'ecowitt'
ORDER BY created_at DESC
LIMIT 20;

-- 4b. Leak scan — forbidden field-name keywords inside raw_payload.
SELECT id, raw_payload
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND created_at > now() - interval '1 hour'
  AND (
       raw_payload ? 'passkey'
    OR raw_payload ? 'PASSKEY'
    OR raw_payload ? 'mac'
    OR raw_payload ? 'MAC'
    OR raw_payload ? 'imei'
    OR raw_payload ? 'api_key'
    OR raw_payload ? 'application_key'
    OR raw_payload ? 'token'
    OR raw_payload ? 'auth'
    OR raw_payload ? 'service_role'
  );
-- EXPECT: 0 rows.

-- 4c. Known test-secret VALUE scan (not just field names).
SELECT id, raw_payload
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND created_at > now() - interval '1 hour'
  AND (
       raw_payload::text LIKE '%REDACTED_TEST_PASSKEY%'
    OR raw_payload::text LIKE '%REDACTED_TEST_MAC%'
  );
-- EXPECT: 0 rows.

-- 4d. Confirm the actual dedupe constraint definition.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'sensor_readings'
  AND indexname  = 'sensor_readings_dedupe_uidx';
-- EXPECT a single row whose indexdef matches:
--   CREATE UNIQUE INDEX sensor_readings_dedupe_uidx
--     ON public.sensor_readings USING btree
--     (user_id, tent_id, source, metric, captured_at)
--     WHERE (captured_at IS NOT NULL);

-- 4e. Duplicate-count query — no (user_id, tent_id, source, metric, captured_at) tuple may appear twice.
SELECT user_id, tent_id, source, metric, captured_at, COUNT(*) AS n
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND created_at > now() - interval '1 hour'
GROUP BY 1,2,3,4,5
HAVING COUNT(*) > 1;
-- EXPECT: 0 rows.

-- 4f. No EcoWitt row may have NULL captured_at (the partial unique index
--     would not apply, so duplicate protection would silently fail).
SELECT COUNT(*) AS null_captured_at
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND captured_at IS NULL;
-- EXPECT: 0.

-- 4g. Provenance of the most recent canary rows.
SELECT captured_at,
       metric,
       raw_payload->>'timestamp_source' AS timestamp_source,
       raw_payload->>'calculated'      AS calculated
FROM public.sensor_readings
WHERE source = 'ecowitt'
ORDER BY captured_at DESC
LIMIT 12;
-- EXPECT: every row from the main canary shows
--   timestamp_source = 'ecowitt_dateutc'.
```

---

## 5. Go / no-go checklist

Before promoting from canary → live:

- [ ] Bridge token POSTs land on the **correct tent IDs** (cross-check `per_tent` against the tent's `hardware_config.ecowitt.air_channels` / `soil_channels`).
- [ ] All rows have `source = 'ecowitt'`. No other source label is emitted.
- [ ] Mapped-tent metrics are exactly: `temperature_c`, `humidity_pct`, `soil_moisture_pct`, `vpd_kpa`.
- [ ] Main canary produced exactly **4 rows**. Malformed canary produced exactly **2 rows**.
- [ ] Unmapped channel (`temp9f`/`humidity9`/`soilmoisture9`) produced **0 rows**.
- [ ] Malformed `temp1f` produced **no `temperature_c`** and **no `vpd_kpa`** row.
- [ ] `vpd_kpa` rows carry `raw_payload.calculated === true`, `raw_payload.derived_from === ["temp1f","humidity1"]`, and `raw_payload.mapping_type === "air"`.
- [ ] Every main-canary row carries `raw_payload.timestamp_source = "ecowitt_dateutc"`. **If you see `server_received_at`, pause** — duplicate protection is weaker.
- [ ] SQL 4f returns `null_captured_at = 0`.
- [ ] Duplicate POST of the main canary returns `inserted: 0` and SQL 4e returns 0 rows.
- [ ] Leak scan (4b) returns **0 rows**.
- [ ] Known test-secret value scan (4c) returns **0 rows**.
- [ ] Function logs (Supabase Dashboard → Edge Functions → `ecowitt-ingest` → Logs) do **not** contain raw `PASSKEY`, `MAC`, `api_key`, `token`, `auth`, `service_role`, or client `user_id`. Expected log lines are terse tags only (`tent_lookup_failed`, `insert_failed`) with `auth_kind` and a row count.
- [ ] No new rows in `alerts` or `action_queue` were caused by the canary.
- [ ] No outbound HTTP to non-Supabase hosts in the function logs.

If any item is unchecked, **do not** point the live gateway. File a blocker against `ecowitt-ingest` and re-run after a fix.

---

## 6. Canary tent setup (prerequisite) — Selected tent config

The canary tent MUST map exactly one channel: channel 1. Channel 9 MUST remain unmapped — it appears in the main POST only as a negative-control probe to prove that unmapped channels create zero rows. **If channel 9 is added to `hardware_config`, the canary is invalid** (it will route and insert rows).

Required `tents.hardware_config` shape (confirmed against the deployed `parseEligibleTents` in `supabase/functions/ecowitt-ingest/index.ts`):

```json
{
  "ecowitt": {
    "passkey_fingerprint": "ewfp_REDACTED_TEST_FINGERPRINT",
    "air_channels": [1],
    "soil_channels": [1]
  }
}
```

Non-negotiable type rules (the deployed router silently drops anything else):

- `passkey_fingerprint` — **string**, exactly the `ewfp_<24 hex>` format produced by `computeEcoWittPasskeyFingerprint(rawPasskey)`. Raw `PASSKEY` is **never** stored on the tent.
- `air_channels` / `soil_channels` — arrays of **JSON numbers** in `[1..8]`. Strings like `"1"` are silently filtered out → the canary would route nothing → false-pass.
- The bridge token used in `Authorization` must be owned by, or scoped to, this tent.

### Apply the canary tent config

```sql
UPDATE public.tents
SET hardware_config = jsonb_set(
  COALESCE(hardware_config, '{}'::jsonb),
  '{ecowitt}',
  '{
    "passkey_fingerprint": "ewfp_REDACTED_TEST_FINGERPRINT",
    "air_channels": [1],
    "soil_channels": [1]
  }'::jsonb,
  true
)
WHERE id = 'REDACTED_CANARY_TENT_ID';
```

### Pre-POST validator (run BEFORE firing the harness)

```sql
SELECT id,
       hardware_config->'ecowitt'->>'passkey_fingerprint' AS fingerprint,
       hardware_config->'ecowitt'->'air_channels'         AS air,
       hardware_config->'ecowitt'->'soil_channels'        AS soil,
       (hardware_config->'ecowitt'->'air_channels')  @> '[9]'::jsonb
         OR (hardware_config->'ecowitt'->'soil_channels') @> '[9]'::jsonb
         AS channel_9_present_FAIL_IF_TRUE
FROM public.tents
WHERE id = 'REDACTED_CANARY_TENT_ID';
```

Pass criteria — abort the canary if any fails:

- `fingerprint` starts with `ewfp_` and is 29 chars total.
- `air = [1]` (JSON array containing the integer 1, not the string `"1"`).
- `soil = [1]`.
- `channel_9_present_FAIL_IF_TRUE = false`.

### How to compute the fingerprint locally (never paste real PASSKEY into git/chat)

```bash
PASSKEY="<your test passkey>" node -e '
const v = process.env.PASSKEY ?? "";
require("node:crypto").webcrypto.subtle
  .digest("SHA-256", new TextEncoder().encode(v.trim()))
  .then(b => {
    const h = [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("");
    console.log("ewfp_" + h.slice(0, 24));
  });
'
```

### Run the harness

```bash
export SUPABASE_PROJECT_REF=<ref>
export ECOWITT_BRIDGE_TOKEN=vbt_...
export ECOWITT_TEST_PASSKEY=<real test passkey>
export ECOWITT_TEST_MAC=<real test mac>
bash scripts/ecowitt-canary-harness.sh
```

The harness prints a pass/fail matrix and redacts every secret it sees before printing response bodies.


---

## Related tests

- `src/test/ecowitt-ingest-canary-contract.test.ts` — VPD provenance, `dateutc` server-time-fallback pin, dedupe-onConflict pin, secret/log scan, static safety scan.
- `src/test/ecowitt-ingest-safety-e2e.test.ts` — handler-level safety pins.
- `src/test/ecowitt-routed-row-builder.test.ts` — pure row-builder contract.
- `src/test/ecowitt-channel-tent-router.test.ts` — channel routing.
- `src/test/ecowitt-passkey-fingerprint.test.ts` — one-way fingerprint helper.
- `src/test/ecowitt-ingest-dedupe.test.ts` — dedupe contract scan.
