# EcoWitt PC dry-run runbook (Windows-safe)

Operators on Windows often hit a known incompatibility between the Python
`ecowitt2mqtt` bridge and Python 3.14's default Proactor event loop: the
underlying `asyncio_mqtt` library calls `loop.add_reader()`, which is
unsupported on Windows, so the bridge crashes with `NotImplementedError`
before any MQTT publish.

To unblock dry-run validation without Python, Verdant ships a small local
HTTP → MQTT bridge written in TypeScript that runs on Bun.

> Safety: this bridge is **developer/operator tooling only**. It does
> NOT call Supabase, does NOT call the Verdant ingest webhook, does NOT
> require `VERDANT_BRIDGE_TOKEN`, and does NOT execute any device
> commands. Live ingest remains gated through the existing
> `dev:ecowitt-mqtt` runner — and only after the dry-run report is
> reviewed.

---

## Pipeline

```text
EcoWitt gateway
  └─► Verdant local HTTP bridge      (scripts/dev/ecowitt-http-local-bridge.ts)
        └─► Mosquitto (127.0.0.1:1883)
              └─► MQTT Explorer (inspection)
              └─► Verdant MQTT dry-run runner (dev:ecowitt-mqtt:dry-run)
                    └─► gated live webhook ONLY after dry-run review
```

---

## Windows workaround: Verdant HTTP bridge

### Terminal 1 — Mosquitto subscriber (sanity check)

```powershell
cd "C:\Program Files\mosquitto"
.\mosquitto_sub.exe -h 127.0.0.1 -p 1883 -t "ecowitt/#" -v
```

### Terminal 2 — start the Verdant HTTP bridge

```powershell
cd "C:\Users\G7\OneDrive\Documents\GitHub\verdant-grow-diary"
bun run dev:ecowitt-http-bridge
```

Default settings (override with `--port`, `--endpoint`, `--mqtt-url`,
`--topic`, or the matching `ECOWITT_*` env vars):

| Setting       | Default                  | Env var                |
| ------------- | ------------------------ | ---------------------- |
| HTTP port     | `8080`                   | `ECOWITT_HTTP_PORT`    |
| HTTP endpoint | `/data/report`           | `ECOWITT_HTTP_ENDPOINT`|
| MQTT broker   | `mqtt://127.0.0.1:1883`  | `ECOWITT_MQTT_URL`     |
| MQTT topic    | `ecowitt/grow`           | `ECOWITT_MQTT_TOPIC`   |

`/data/report` and `/data/report/` are both accepted.

Use `--dry-run` (or `bun run dev:ecowitt-http-bridge:dry-run`) to parse
and log without publishing to MQTT.

### Terminal 3 — local sanity POST

```powershell
curl.exe -X POST "http://127.0.0.1:8080/data/report" `
  -d "temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"
```

Expected: HTTP `200`, and Mosquitto subscriber prints a JSON message on
`ecowitt/grow` containing the metrics plus `received_at`, `transport`
(`ecowitt_http_local_bridge`), and `topic`.

### Terminal 4 — Verdant dry-run consumer

Only after Mosquitto is actually flowing data:

```powershell
$env:ECOWITT_MQTT_URL="mqtt://127.0.0.1:1883"
$env:ECOWITT_MQTT_TOPIC="ecowitt/grow"
bun run dev:ecowitt-mqtt:dry-run -- --once --write-report
```

The runner writes a redacted report to
`./tmp/ecowitt-last-ingest-report.json`. Paste it into
`/operator/ecowitt-bridge-status` for inspection. No live ingest occurs
in dry-run mode.

---

## EcoWitt gateway app settings

```text
Protocol:   Ecowitt / Customized upload
Server IP:  <PC local IPv4>
Port:       8080
Path:       /data/report
Interval:   60 seconds
```

---

## Safety notes

- The HTTP bridge moves **local HTTP → local MQTT only**. It never
  contacts Supabase, never calls the Verdant ingest webhook, and never
  requires a bridge token.
- The bridge logs only metric keys, paths, topics, and publish status.
  MQTT password and any token-like strings are redacted.
- Do not run the live sender until the MQTT dry-run report has been
  reviewed.
- Stale / invalid / unknown telemetry must never be promoted to **Live**
  — provider identity (`ecowitt`) is metadata, not truth.
- If Python `ecowitt2mqtt` crashes on Windows with `NotImplementedError`
  from `loop.add_reader()`, use this Bun bridge instead. Do not attempt
  to patch the Python loop policy in production tooling.

---

## One-command fast path

```powershell
bun run dev:ecowitt-fast-path -- --write-launchers
```

This single command:

- Runs the Windows doctor (LAN IPv4 detection, Mosquitto hints, next-step
  list).
- With `--write-launchers`, writes the safe `.cmd` files under
  `tmp/ecowitt-windows/`.
- Runs the HTTP→MQTT smoke check with a clearly-labeled
  `FAKE LOCAL TEST` payload.
- On **PASS**, prints the exact MQTT dry-run command to run next.
- On bridge down, prints how to start `dev:ecowitt-http-bridge` and
  exits non-zero.
- On MQTT unreachable, prints the Mosquitto check command and exits
  non-zero.

The HTTP bridge must already be running in another terminal
(`bun run dev:ecowitt-http-bridge`). The fast path **never** runs live
ingest, never reads `VERDANT_BRIDGE_TOKEN`, never calls the Verdant
ingest webhook, and never writes to the database. Live webhook send
remains manual and gated after the dry-run report has been reviewed.

### Fast-path troubleshooting

If `bun run dev:ecowitt-fast-path` fails, walk through these checks in
order. Every command below is local-only — no secrets, no webhook, no
live ingest.

1. **Bridge down** — fast-path printed `HTTP bridge is not running`.
   The Verdant HTTP bridge is not listening on `127.0.0.1:8080`.
   Start it in a separate terminal:

   ```powershell
   bun run dev:ecowitt-http-bridge
   ```

2. **Mosquitto unreachable** — fast-path printed `MQTT broker not
   reachable on mqtt://127.0.0.1:1883`. Mosquitto is not running or
   not bound to localhost. Subscribe to confirm:

   ```powershell
   cd "C:\Program Files\mosquitto"
   .\mosquitto_sub.exe -h 127.0.0.1 -p 1883 -t "ecowitt/#" -v
   ```

3. **Check port ownership** — confirm what is using the expected ports:

   ```powershell
   netstat -ano | findstr :1883
   netstat -ano | findstr :8080
   ```

4. **Re-run the doctor** — confirm recommended LAN IPv4 and Mosquitto
   hints:

   ```powershell
   bun run dev:ecowitt-doctor
   ```

5. **Verbose fast path** — print structured doctor + smoke step logs
   (still redacted, still no live ingest):

   ```powershell
   bun run dev:ecowitt-fast-path -- --verbose --write-launchers
   ```

6. **Verbose + saved artifacts** — write redacted local debug files
   under `tmp/ecowitt-fast-path/` (doctor.json, fast-path.json,
   fast-path.log, redaction-audit.json):

   ```powershell
   bun run dev:ecowitt-fast-path -- --verbose --write-launchers --save-artifacts
   ```

7. **Machine-readable JSON** — emit only the redacted `FastPathResult`
   to stdout (no human prose); pair with `--save-artifacts` to keep a
   local log for review:

   ```powershell
   bun run dev:ecowitt-fast-path -- --json --save-artifacts
   ```

   - `--verbose` prints human-readable doctor/smoke step logs and a
     redaction audit summary (lines scanned, lines changed, categories
     redacted, and whether any forbidden literals remain).
   - `--json` prints only structured JSON; it wins over `--verbose` for
     stdout. Verbose-style detail is preserved inside the JSON `logs`
     array and the saved `fast-path.log` artifact.
   - `--save-artifacts` writes redacted local files to
     `tmp/ecowitt-fast-path/`. No raw secrets, no webhook URLs, no
     bridge tokens are ever written. Launcher writes remain confined to
     `tmp/ecowitt-windows/` and now report `created/updated/unchanged`
     counts based on checksum comparison.
   - The redaction audit confirms no forbidden strings remain in any
     captured line, including bridge token names, role literals,
     Supabase env keys, Supabase host names, MQTT userinfo, JWT-shaped
     strings, and `Bearer` headers.
   - Live send remains manual and gated behind the existing
     `dev:ecowitt-mqtt:dry-run` review step.

Notes:

- `bridge_down` means the HTTP bridge is not listening on `8080`.
- `mqtt_unreachable` means the broker is not reachable on `1883`.
- `auth: Bearer (none)` in the dry-run report is **expected** —
  dry-run never sends to the webhook.
- Live send remains manual and is only run after the redacted
  dry-run report has been reviewed.



## Fast Windows path

One command generates safe `.cmd` launchers under `tmp/ecowitt-windows/`:

```powershell
bun run dev:ecowitt-doctor -- --write-launchers
```

Then open `tmp/ecowitt-windows/` and run the `.cmd` files in order:

```text
01-watch-mqtt.cmd       # subscribe to ecowitt/# via mosquitto_sub
02-start-http-bridge.cmd # start the Verdant HTTP bridge
03-test-http-bridge.cmd  # POST a clearly-labeled FAKE LOCAL TEST payload
04-run-mqtt-dry-run.cmd  # consume MQTT, write redacted dry-run report
```

A one-shot smoke check is also available once the bridge is running:

```powershell
bun run dev:ecowitt-bridge-smoke
```

It POSTs a `FAKE LOCAL TEST` payload, subscribes to `ecowitt/grow`, and
exits non-zero if the message does not appear on MQTT.

### Troubleshooting

- `1883` in use → broker likely already running; verify with
  `mosquitto_sub`.
- Bridge `404` → wrong Ecowitt path; must be `/data/report`.
- `/data/report/` → accepted and normalized.
- MQTT Explorer empty → check bridge publish line, confirm Mosquitto is
  running, subscribe to `ecowitt/#`.
- Gateway says upload failed but bridge logs the POST → bridge may not
  be returning `200`; check the ack body (`ok`).
- Wrong IP picked → rerun `bun run dev:ecowitt-doctor` and use the
  `RECOMMENDED` address, not the WSL / Hyper-V adapter.
- Dry-run report says `auth: Bearer (none)` → expected for dry-run.
- Live send is **not** part of the fast path; only after the redacted
  report is reviewed.
