# EcoWitt Windows Local Testbench

A Windows-friendly local testbench for validating the EcoWitt → Verdant
sensor-ingest path **without** touching production. Lives entirely under
`tools/ecowitt-testbench/`.

## Why this exists

The previous manual flow was brittle on Windows:

- PowerShell `Activate.ps1` can fail with `UnauthorizedAccess`.
- `python ecowitt_listener.py` can fail if `requests`/`flask` are not installed.
- `$headers` becomes `$null` after switching terminal sessions.
- Pasted placeholder Authorization headers often contain the unicode
  ellipsis `…` (U+2026), which silently breaks the request.
- Bridge tokens have leaked into pasted docs and chats.

This kit removes all of those pitfalls.

## Safety rules (do not violate)

- **No direct Supabase table writes.** Forwarding goes only to the existing
  validated `sensor-ingest-webhook` Edge Function.
- **No fake live data.** Built-in/test payloads are labeled `source="demo"`.
  `source="live"` is only used when an EcoWitt gateway forwards a real
  reading and the operator has explicitly opted in via
  `X-Verdant-Forward-Mode: live` or `VERDANT_FORWARD_MODE=live`.
- **Never commit `.env`.** Tokens stay local. `.env` is gitignored.
- **Never paste full bridge tokens** into docs, chat, or issues. The
  scripts only log a masked preview like `vbt_abc...xyz`.
- **Forwarding requires explicit opt-in** via the `-ForwardToVerdant`
  flag on `send-demo-payload-windows.ps1`.

## A. One-time setup

```powershell
cd tools/ecowitt-testbench
.\setup-windows.ps1
```

This creates `.venv\` and installs `flask`, `requests`, and
`python-dotenv`. It does **not** require `Activate.ps1`, so PowerShell
execution policy will not block it.

## B. Start the local listener

```powershell
.\start-listener-windows.ps1
```

## C. Test health

Open in a browser:

```
http://localhost:8787/health
```

## D. Test a fake (demo) payload in the browser

```
http://localhost:8787/ecowitt?temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721
```

The listener will:

- normalize fields (`temp1f → temp_f`, `humidity1 → humidity_percent`,
  `soilmoisture1/2 → soil_moisture_pct`, `co2/co2in → co2_ppm`),
- label the reading `source="demo"`,
- log the raw payload to `ecowitt_raw_log.jsonl`,
- and skip forwarding (no `VERDANT_BRIDGE_TOKEN` set).

## E. Point the EcoWitt gateway at this PC (optional, later)

In the WSView Plus / EcoWitt console, configure **Customized Upload**:

```
Protocol:        Ecowitt
Server IP:       <LOCAL_PC_IP>
Port:            8787
Path:            /ecowitt
Upload interval: 60 seconds (if available)
```

## F. Forwarding to Verdant (optional, opt-in)

1. Copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and fill in real values:

   - `VERDANT_INGEST_URL` — the deployed `sensor-ingest-webhook` URL.
   - `VERDANT_BRIDGE_TOKEN` — a real `vbt_…` bridge token.
   - `VERDANT_TENT_ID` — the target tent UUID.

3. **Do not commit `.env`.** It is already gitignored.

4. Send a demo payload through to Verdant explicitly:

   ```powershell
   .\send-demo-payload-windows.ps1 -ForwardToVerdant
   ```

   Without `-ForwardToVerdant`, the script posts only to the local
   listener.

The script and listener both validate that the `Authorization` header is
ASCII-only before sending. Pasted placeholder text containing `…`, `<`,
`>`, whitespace, or the phrase `mint a token` is rejected before any
network call.

## What this kit will not do

- It will not write to Supabase tables directly.
- It will not bypass the validated ingest webhook.
- It will not classify missing / stale / malformed sensor values as
  healthy — those normalize to `null` and the raw payload is kept in
  `metadata.raw_payload` for audit.
- It will not print full tokens. Only masked previews appear in logs.
- It will not trigger alerts, Action Queue writes, AI calls, or device
  control.

## Curl checks without PowerShell scripts

These are local-only checks. They never need a bridge token, and they
never forward to Verdant. Do **not** paste real `vbt_…` tokens into curl
commands. Keep test payloads on `source="demo"`. Use forwarding only
after local payloads look correct.

Health check:

```
curl http://localhost:8787/health
```

Demo GET payload:

```
curl "http://localhost:8787/ecowitt?temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"
```

Debug raw log tail (newest entries last; sanitized; local-only):

```
curl "http://localhost:8787/debug/raw-log-tail"
```

Debug raw log tail with custom line count (clamped to 1..50):

```
curl "http://localhost:8787/debug/raw-log-tail?lines=5"
```

Optional POST JSON payload:

```
curl -X POST "http://localhost:8787/ecowitt" \
  -H "Content-Type: application/json" \
  -d "{\"temp1f\":\"77.4\",\"humidity1\":\"58\",\"soilmoisture1\":\"33\",\"co2\":\"721\"}"
```

Windows-friendly note: use `curl.exe` explicitly in PowerShell so the
built-in `curl` alias for `Invoke-WebRequest` doesn't reinterpret args:

```
curl.exe "http://localhost:8787/health"
curl.exe "http://localhost:8787/debug/raw-log-tail?lines=5"
```

Debug listener/log status (existence, entry count, latest normalized reading):

```
curl "http://localhost:8787/debug/status"
```

Debug last normalized events (parsed entries only, no raw payload):

```
curl "http://localhost:8787/debug/last-events"
curl "http://localhost:8787/debug/last-events?lines=5"
```

Line-count clamp behavior (non-numeric defaults to 10; values are
clamped to the `[1, 50]` range — bad input never crashes the server):

```
curl "http://localhost:8787/debug/raw-log-tail?lines=abc"
curl "http://localhost:8787/debug/raw-log-tail?lines=-10"
curl "http://localhost:8787/debug/raw-log-tail?lines=999999"
```

Windows (`curl.exe`) variants:

```
curl.exe "http://localhost:8787/debug/status"
curl.exe "http://localhost:8787/debug/last-events?lines=5"
curl.exe "http://localhost:8787/debug/raw-log-tail?lines=abc"
```

Debug forwarding status (configuration + in-memory counters; sanitized):

```
curl "http://localhost:8787/debug/forwarding-status"
curl.exe "http://localhost:8787/debug/forwarding-status"
```

Debug endpoint summary:

- `/debug/status` — log existence, entry count, latest normalized status,
  `parsed_line_count`, `skipped_line_count`, `malformed_line_count`,
  `last_parse_error`.
- `/debug/last-events` — last N normalized readings only; no raw payload by default.
- `/debug/raw-log-tail` — sanitized raw-log debugging (parsed JSONL entries).
- `/debug/forwarding-status` — read-only forwarding configuration and
  in-memory attempt/success/failure counters. Token preview is masked,
  ingest URL is masked, the bridge token and Authorization header are
  never returned.
- All endpoints are loopback-only (`127.0.0.1`, `::1`). LAN callers get HTTP 403.
- All output is passed through the sanitizer: Authorization headers,
  bearer tokens, `vbt_…` tokens, JWT-shaped values, Supabase admin-role
  markers, and common secret field names are redacted.
- All endpoints are read-only. They never forward to Verdant and
  never write to Supabase.
- Do not expose these endpoints over LAN. Do not paste bridge tokens
  into curl commands. Demo payloads remain `source="demo"`. Forwarding
  remains explicit opt-in (`-ForwardToVerdant`).

## Troubleshooting malformed JSONL and debug status

`ecowitt_raw_log.jsonl` is append-only JSONL. Each line should be a
single normalized JSON object written by the listener. A handful of
common situations can leave malformed lines behind:

- A **partial write** if the listener was stopped mid-write (Ctrl+C during a request).
- A **manually edited** `ecowitt_raw_log.jsonl` line (typos, missing quotes, trailing commas).
- A **copied/pasted** line with trailing whitespace, smart quotes, or log decorations.
- An **old test line** from a previous script version with a different shape.
- A **non-JSON raw body** captured during early testing.
- Encoding or quote issues from manual edits in a Windows editor.

How to interpret `/debug/status` fields:

- `entry_count` / `parsed_line_count` — JSONL lines that parsed cleanly into JSON objects.
- `skipped_line_count` / `malformed_line_count` — lines that did not parse or were not JSON objects.
- `last_parse_error` — short sanitized summary of the most recent parse failure. Never includes the raw offending line, tokens, or payloads.
- `latest_metrics` — normalized canonical metric names from the last parsed entry. `null` values mean the EcoWitt field was missing or unusable and was intentionally not classified as healthy.
- `latest_captured_at` / `latest_received_at` — timestamps from the last parsed entry's envelope.

Operator guidance:

- One malformed line does **not** mean the listener is broken. The endpoint skips bad lines and keeps reporting on the good ones.
- If `malformed_line_count` keeps increasing alongside real EcoWitt uploads, inspect `/debug/raw-log-tail`.
- If `latest_metrics` is `null` or missing fields, the EcoWitt field names may not match the current normalizer (`FIELD_MAP`).
- If `/debug/last-events` is empty but `/debug/raw-log-tail` has entries, the raw lines are likely malformed or not in normalized JSONL shape.
- Do **not** paste bridge tokens into curl commands.
- Do **not** forward to Verdant until local `/debug/status` and `/debug/last-events` look correct.



### Interpreting /debug/forwarding-status

Safe curl examples (no Authorization header, no token):

```
curl "http://localhost:8787/debug/forwarding-status"
curl.exe "http://localhost:8787/debug/forwarding-status"
```

Fields:

- `forwarding_enabled` — true only when both `VERDANT_INGEST_URL` and `VERDANT_BRIDGE_TOKEN` are configured. It only proves config is present; it does **not** prove ingest succeeded.
- `ingest_url_configured` — true when `VERDANT_INGEST_URL` is set.
- `bridge_token_configured` — true when `VERDANT_BRIDGE_TOKEN` is set.
- `masked_ingest_url` — host/path summary with project identifiers masked.
- `masked_token_preview` — short `vbt_abc...xyz` preview. The full bridge token is **never** returned. Do not paste it into curl commands or docs.
- `forward_attempt_count` — forward attempts since listener start. `0` means none yet.
- `forward_success_count` — webhook calls that returned 2xx. `>0` confirms at least one successful ingest.
- `forward_failure_count` — non-2xx responses or request exceptions. `>0` means inspect `last_forward_error` and `last_forward_status`.
- `last_forward_status` — last HTTP status (or `null` on exception).
- `last_forward_at` — ISO timestamp of the most recent attempt.
- `last_forward_error` — short sanitized error summary (e.g. `http_400`).
- `last_forward_response_error` — sanitized `error` field parsed from the webhook response body (e.g. `invalid_payload`, `forbidden_tent`, `tent_lookup_failed`, `insert_failed`, `unauthorized`, `non_json_response`). `null` on success or when no response was received.
- `last_forward_response_classification` — operator-friendly classification of the response error:
  - `payload_shape_mismatch` — the forwarded payload did not match the `sensor-ingest-webhook` contract (likely the `source`, `tent_id`, `captured_at`, or `metrics` shape).
  - `tent_authorization_mismatch` — bridge token / tent pairing rejected (`forbidden_tent`).
  - `tent_lookup_failed` — webhook could not verify tent context server-side.
  - `storage_insert_failed` — webhook accepted the payload but the database insert failed (`insert_failed`).
  - `auth_failed` — bridge token rejected (`unauthorized`).
  - `non_json_response` — webhook returned a non-JSON body (often an edge or gateway error page).
  - `unknown_webhook_error` — an unrecognized error string.
- `last_forward_response_message` — sanitized short summary from the response body. Token-like substrings (`vbt_…`, JWT-shaped strings, `Bearer …`) are redacted inline. Never the full raw body.
- `last_forward_response_reason` — sanitized `reason` sub-code parsed from `insert_failed` responses. Whitelisted to one of:
  - `insert_required_field_missing` — a required DB field was missing from the insert payload.
  - `insert_source_constraint_failed` — stored `source` failed the canonical source check (EcoWitt transport `source` must be remapped to stored `source = "live"`).
  - `insert_check_failed` — a database check constraint rejected the row.
  - `insert_column_mismatch` — the insert payload references a column that does not exist or no longer matches schema.
  - `insert_duplicate` — duplicate/idempotent reading; usually safe.
  - `insert_unknown` — fallback when the webhook returned a `reason` we do not recognize, or any value containing token-like text. Raw PG messages, SQL, and constraint names are **never** echoed.

Notes:

- Counters are **in-memory** and reset when the listener restarts.
- `forwarding_enabled=false` is expected for local-only testing.
- Do **not** paste bridge tokens, Authorization headers, or raw EcoWitt payloads into curl commands, support chats, or issue reports. **Never paste bridge token values or raw payloads** anywhere — the sanitized `last_forward_response_*` fields are the safe way to share failure context.
- The listener now retries transient webhook failures (HTTP 408, 425, 429, 500, 502, 503, 504, plus connection/DNS/timeout errors) with bounded exponential backoff. `retry_count`, `last_retry_error`, `last_retry_at`, `last_retryable_status`, and `max_retry_attempts` are exposed in `/debug/forwarding-status`. Non-retryable errors (400, 401, 403, 404, 405, validation errors, missing tent/token/url) are **never** retried.

### Copyable sanitized forwarding error report

When forwarding fails, run:

```
curl "http://localhost:8787/debug/forwarding-error-report"
curl.exe "http://localhost:8787/debug/forwarding-error-report"
```

This loopback-only, read-only endpoint returns a **sanitized JSON
report** safe to share with a developer. It includes:

- `generated_at`
- `forwarding_enabled`, `forwarding_ready`
- `ingest_url_configured`, `bridge_token_configured`
- `tent_id_configured`, `tent_id_valid` (booleans only — never the raw UUID)
- `last_forward_status`, `last_forward_error`
- `last_forward_response_error`, `last_forward_response_classification`, `last_forward_response_message`, `last_forward_response_reason`
- `retry_count`, `last_retry_error`, `max_retry_attempts`
- `latest_metrics` (source, vendor, metrics, captured_at — no raw payload)
- `malformed_line_count`
- `recommended_next_step` — a one-line operator-facing instruction

The endpoint **never** returns: the bridge token, the `Authorization`
header, raw `PASSKEY`, raw EcoWitt payload, JWT-like strings,
service-role values, or `.env` contents.

### Troubleshooting checklist by classification

For each `last_forward_response_classification` (or local block reason),
follow the matching step. Never paste the bridge token, raw EcoWitt
payload, or `Authorization` header into any chat/issue/email.

| Classification / reason | Meaning | Most likely cause | Command | Retry? | Edit .env? | Escalate? |
| --- | --- | --- | --- | --- | --- | --- |
| `invalid_payload` (HTTP 400) | Payload shape rejected | `tent_id`, `source`, `captured_at`, or `metrics` mismatch | `curl http://localhost:8787/debug/forwarding-error-report` | No | If `tent_id_configured: false`, set `VERDANT_TENT_ID` | No |
| `unauthorized` (HTTP 401) | Bridge token rejected | Wrong/expired `VERDANT_BRIDGE_TOKEN` | `curl http://localhost:8787/debug/forwarding-status` | No | Update `VERDANT_BRIDGE_TOKEN`, restart listener | Only if token is known good |
| `forbidden_tent` (HTTP 403) | Token cannot write this tent | `VERDANT_TENT_ID` not authorized for this token | `curl http://localhost:8787/debug/forwarding-error-report` | No | Fix `VERDANT_TENT_ID` to a tent the token can write to | Developer if pairing should work |
| `tent_lookup_failed` | Webhook could not verify tent | Tent UUID does not exist | check the tent in Verdant UI | No | Set `VERDANT_TENT_ID` to a real tent UUID | No |
| `insert_failed` | Storage insert failed | Transient DB issue | `curl http://localhost:8787/debug/forwarding-error-report` | Listener already retried | No | Developer with sanitized report |
| `server_misconfigured` | Webhook reported server misconfig | Edge function env missing | — | No | No | Developer with sanitized report |
| `method_not_allowed` (HTTP 405) | Wrong URL/method | `VERDANT_INGEST_URL` typo | `curl http://localhost:8787/debug/forwarding-status` | No | Fix `VERDANT_INGEST_URL` to the `sensor-ingest-webhook` path | No |
| `internal_error` | Webhook 500 | Edge function bug or transient | — | Listener already retried | No | Developer with sanitized report |
| `non_json_response` | Edge/gateway error page | Gateway/proxy returned HTML | check connectivity | No | Verify `VERDANT_INGEST_URL` | If persistent |
| `blocked_missing_tent_id` | Listener refused to send | `VERDANT_TENT_ID` not set | `curl http://localhost:8787/debug/forwarding-status` | n/a | Set `VERDANT_TENT_ID=<uuid>`, restart | No |
| `blocked_invalid_tent_id` | Display name / placeholder rejected | Used a name (e.g. `Flower Tent`) or `tent-1` | `curl http://localhost:8787/debug/forwarding-status` | n/a | Use a real tent UUID | No |
| `http_400` (no classification) | Generic 400 | Payload mismatch not enumerated | `curl http://localhost:8787/debug/forwarding-error-report` | No | Inspect `last_forward_response_message` | If unclear |
| transient 5xx / 429 / 408 / 425 / 504 | Temporary upstream issue | Network/edge backpressure | — | Listener retries up to `max_retry_attempts` | No | Only if it persists |

#### `insert_failed` sub-reasons

When `last_forward_response_classification = storage_insert_failed`, the
listener also captures a sanitized `last_forward_response_reason` from
the webhook body and tailors `recommended_next_step` accordingly:

| `last_forward_response_reason` | Meaning | What to do |
| --- | --- | --- |
| `insert_required_field_missing` | A required DB field is missing | Share the sanitized report with a developer |
| `insert_source_constraint_failed` | Stored `source` failed the canonical source constraint | Confirm EcoWitt transport `source` is remapped to stored `source = "live"` |
| `insert_check_failed` | A database check constraint rejected the row | Share the sanitized report with a developer |
| `insert_column_mismatch` | Insert references a column that does not exist / no longer matches schema | Developer must align payload mapping with schema |
| `insert_duplicate` | Duplicate / idempotent reading | Usually safe; verify dedupe behavior |
| `insert_unknown` | Sub-reason not recognized (or sanitizer collapsed an unsafe value) | Share the sanitized report only |

> Never edit `sensor_readings` rows or constraints directly to "fix"
> an `insert_failed`. Always share the sanitized
> `/debug/forwarding-error-report` body with a developer.

#### Deploy verification

If live reports still show `insert_failed` with `last_forward_response_reason: null`,
then either:

1. The `sensor-ingest-webhook` Edge Function has not been redeployed with
   the `reason` field support, **or**
2. The local bridge listener is not capturing the `reason` (verify with
   `python3 -m unittest test_forwarding_config`).

To redeploy the webhook:

```
npx supabase functions deploy sensor-ingest-webhook --project-ref knkwiiywfkbqznbxwqfh
```

After redeploy, retry one forward and re-read
`/debug/forwarding-error-report`. `last_forward_response_reason` should
now be populated on `insert_failed` responses.

What **not** to paste anywhere:

- the bridge token (`vbt_...`)
- the full `Authorization: Bearer ...` header
- raw `PASSKEY` values
- raw EcoWitt payloads
- JWT-shaped values
- the full tent UUID (the sanitized report exposes booleans only)

Always prefer sharing the sanitized output of
`/debug/forwarding-error-report`.




### Parse diagnostics — categorize malformed JSONL safely

When `malformed_line_count` is greater than zero, use `/debug/parse-diagnostics`
to see categorized counts without reading raw lines:

```
curl "http://localhost:8787/debug/parse-diagnostics"
curl.exe "http://localhost:8787/debug/parse-diagnostics"
```

It returns categories like `empty_line`, `json_decode_error`,
`non_object_json`, `missing_metrics`, `missing_captured_at`,
`unknown_normalized_shape`, and `secret_redacted`. It is safe for local
debugging: loopback-only, read-only, sanitized, and never returns raw
JSONL lines or raw payloads.

## One-command verification (Windows)

```powershell
cd tools/ecowitt-testbench
.\verify-testbench-windows.ps1
```

The script runs `bun run typecheck`, the EcoWitt static safety vitest,
and probes the safe local debug endpoints (`/health`, `/debug/status`,
`/debug/forwarding-status`, `/debug/parse-diagnostics`). It does **not**
start the listener, read `.env`, print bridge tokens, post payloads, or
forward to Verdant. If the listener is not running it tells you to run
`.\start-listener-windows.ps1` first.

## One-command wrapper (Windows)

```powershell
cd "C:\Users\G7\OneDrive\Documents\GitHub\verdant-grow-diary"
.\tools\ecowitt-testbench\run-testbench-windows.ps1
```

`run-testbench-windows.ps1` runs preflight, then setup, starts the
listener in a new PowerShell window, waits briefly for
`http://localhost:8787/health`, then runs verify. It does **not** read
`.env`, print bridge tokens, post payloads, or forward to Verdant.

## Troubleshooting: wrong folder or out-of-date checkout

If PowerShell says `setup-windows.ps1` or `start-listener-windows.ps1`
is "not recognized", you are likely not inside `tools\ecowitt-testbench`.

If `dir tools\ecowitt-testbench` fails from the repo root, your local
checkout is stale or the files have not been pulled.

`C:\Users\G7\verdant-testbench` is likely the **old standalone
testbench**, not the repo-integrated kit. The correct repo-integrated
path should end with:

```
verdant-grow-diary\tools\ecowitt-testbench
```

Recovery commands:

```powershell
cd "C:\Users\G7\OneDrive\Documents\GitHub\verdant-grow-diary"
git status
git pull origin verdant-grow-diary
dir tools\ecowitt-testbench
cd tools\ecowitt-testbench
.\preflight-windows.ps1
.\setup-windows.ps1
.\start-listener-windows.ps1
```

For deeper path debugging, run preflight in diagnostics mode:

```powershell
.\tools\ecowitt-testbench\preflight-windows.ps1 -Diagnostics
```

`-Diagnostics` prints safe path detection only (PSScriptRoot, candidate
start paths, detected repo root, detected testbench path, missing
files). It does **not** read `.env`, does **not** start the listener,
and does **not** forward any data.

## Files

```
tools/ecowitt-testbench/
  ecowitt_listener.py
  requirements.txt
  preflight-windows.ps1
  setup-windows.ps1
  start-listener-windows.ps1
  send-demo-payload-windows.ps1
  verify-testbench-windows.ps1
  run-testbench-windows.ps1
  .env.example
docs/ecowitt-windows-testbench.md  (this file)
```



## Troubleshooting: HTTP 400 from `sensor-ingest-webhook` with `tent_id: null`

Symptom: the local listener receives real EcoWitt gateway payloads and
normalizes them correctly (`"source": "live"`), but forwarding fails
with `HTTP 400` and `/debug/status` (or `/debug/forwarding-status`)
shows `tent_id: null` / `tent_id_configured: false`.

Cause: the bridge is missing required Verdant tent context. The
`sensor-ingest-webhook` Edge Function requires a top-level `tent_id`
UUID and rejects payloads without it. The listener now refuses to
forward such payloads at all — they are recorded as a local block
(`last_forward_error: blocked_missing_tent_id`) instead of being sent
to the webhook.

Fix:

1. Open the tent in the Verdant UI and copy its real UUID.
2. Add it to `tools/ecowitt-testbench/.env`:

   ```
   VERDANT_TENT_ID=<your-tent-uuid>
   ```

   Do **not** use display names (e.g. `Flower Tent`), demo IDs
   (`tent-1`, `demo-tent`, `t1`), or the all-zero placeholder UUID —
   they are rejected as `blocked_invalid_tent_id`.

3. Restart the listener so the new env value is loaded.

4. Verify with:

   ```
   curl http://localhost:8787/debug/forwarding-status
   ```

   You should see:

   ```
   "tent_id_configured": true,
   "tent_id_valid": true,
   "forwarding_ready": true
   ```

The actual tent UUID is never echoed in `/debug/forwarding-status`;
only the boolean readiness flags are exposed.
