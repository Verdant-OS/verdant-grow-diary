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
