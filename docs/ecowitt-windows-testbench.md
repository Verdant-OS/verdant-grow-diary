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

Debug endpoint summary:

- `/debug/status` — log existence, entry count, latest normalized status.
- `/debug/last-events` — last N normalized readings only; no raw payload by default.
- `/debug/raw-log-tail` — sanitized raw-log debugging (parsed JSONL entries).
- All three endpoints are loopback-only (`127.0.0.1`, `::1`). LAN callers get HTTP 403.
- All output is passed through the sanitizer: Authorization headers,
  bearer tokens, `vbt_…` tokens, JWT-shaped values, Supabase admin-role
  markers, and common secret field names are redacted.
- All three endpoints are read-only. They never forward to Verdant and
  never write to Supabase.
- Do not expose these endpoints over LAN. Do not paste bridge tokens
  into curl commands. Demo payloads remain `source="demo"`. Forwarding
  remains explicit opt-in (`-ForwardToVerdant`).


## Files

```
tools/ecowitt-testbench/
  ecowitt_listener.py
  requirements.txt
  setup-windows.ps1
  start-listener-windows.ps1
  send-demo-payload-windows.ps1
  .env.example
docs/ecowitt-windows-testbench.md  (this file)
```
