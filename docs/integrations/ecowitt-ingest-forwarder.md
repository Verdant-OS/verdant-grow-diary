# EcoWitt MQTT → `ecowitt-ingest` forwarder

The PC-side step between the local HTTP bridge and Verdant's channel router.

```text
GW3000B ──HTTP──► ecowitt-http-local-bridge ──MQTT──► ecowitt-ingest-forwarder ──HTTPS──► ecowitt-ingest
         (LAN)    (local only, never Verdant)  (local)  (dry-run by default)      (Bearer vbt_)
```

The bridge is deliberately local-only (test-pinned: no `fetch`, no token). This
forwarder is the separate, explicitly gated tool that reads the same topic and
forwards each raw gateway upload to the `ecowitt-ingest` edge function. That
function routes every channel to the tent whose
`tents.hardware_config.ecowitt` declares it (`air_channels`, `soil_channels`),
fingerprints the PASSKEY (never uses it as auth), and persists only
freshness-approved rows. See `docs/ecowitt-live-canary-runbook.md` for the
tent config shape and the first-time canary.

## Status

EcoWitt ingest is **dry-run only** until the gates in
`docs/ecowitt-future-real-ingest-gates.md` are cleared by the owner. `--live`
is the mechanism for the canary and for ingest once that is approved; running
it is an owner decision, never an agent's.

## Commands

```powershell
cd "<repo>"
$env:ECOWITT_MQTT_URL="mqtt://127.0.0.1:1883"
$env:ECOWITT_MQTT_TOPIC="ecowitt/grow"

# Dry run (default): parse, summarise channels, never call the network.
bun run dev:ecowitt-forwarder -- --once --write-report

# Live (owner-gated): forward to ecowitt-ingest with a bridge token.
$env:ECOWITT_INGEST_URL="https://<project-ref>.supabase.co/functions/v1/ecowitt-ingest"
$env:VERDANT_BRIDGE_TOKEN="vbt_..."   # paste only into this window, never into chat
bun run dev:ecowitt-forwarder:live -- --once --write-report
```

`--once` exits `0` for a dry run or an `accepted: true` forward, `1` otherwise.
`--write-report` writes a redacted report to `tmp/ecowitt-forwarder-last-report.json`.

## Fail-closed rules

- `--live` refuses to start unless `ECOWITT_INGEST_URL` is `https://` and its
  path ends in `/ecowitt-ingest`, and `VERDANT_BRIDGE_TOKEN` has the `vbt_`
  shape. A raw gateway payload carries the PASSKEY, so it is never posted
  anywhere else.
- A message without `PASSKEY` or `dateutc` (for example the runbook's
  hand-made sanity POST) is rejected locally and never forwarded.
- Logs and reports pass through a redactor: `PASSKEY`, `MAC`, tokens and MQTT
  credentials never appear. The Mosquitto watcher window still shows the raw
  topic, so crop it from anything you share.

## What it never does

No Supabase SDK, no `service_role`, no database writes, no Action Queue, no
alerts, no automation, no device control. Enforced by
`src/test/ecowitt-ingest-forwarder-safety.test.ts`.
