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
- `last_forward_error` — short sanitized error summary.

Notes:

- Counters are **in-memory** and reset when the listener restarts.
- `forwarding_enabled=false` is expected for local-only testing.
- Do **not** paste bridge tokens into curl commands.

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


