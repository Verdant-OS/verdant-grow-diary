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

The script imports the `mqtt` package at run time; it is deliberately not a
repository dependency. Install it once per checkout without touching
`package.json` or the lockfile:

```powershell
cd "<repo>"
bun add --no-save mqtt
```

```powershell
cd "<repo>"
$env:ECOWITT_MQTT_URL="mqtt://127.0.0.1:1883"
$env:ECOWITT_MQTT_TOPIC="ecowitt/grow"

# Dry run (default): parse and summarise channels. It connects to the MQTT
# broker above and subscribes, but never POSTs to ecowitt-ingest.
bun run dev:ecowitt-forwarder -- --once --write-report

# Live (owner-gated): forward to ecowitt-ingest with a bridge token.
$env:ECOWITT_INGEST_URL="https://<project-ref>.supabase.co/functions/v1/ecowitt-ingest"
$env:VERDANT_BRIDGE_TOKEN="vbt_..."   # paste only into this window, never into chat
bun run dev:ecowitt-forwarder:live -- --once --write-report
```

`--once` exits `0` for a dry run or an `accepted: true` forward, `1` otherwise.
`--write-report` writes a redacted report to `tmp/ecowitt-forwarder-last-report.json`.

## Fail-closed rules

- `--live` refuses to start unless `ECOWITT_INGEST_URL` is exactly the Verdant
  project's function URL (`APPROVED_INGEST_URLS`: `https://<project>.supabase.co/functions/v1/ecowitt-ingest`
  or `https://<project>.functions.supabase.co/ecowitt-ingest`, no userinfo,
  query or fragment) and `VERDANT_BRIDGE_TOKEN` has the `vbt_` shape. A raw
  gateway payload carries the PASSKEY, so it is never posted anywhere else.
- The live POST times out after 15 s and retries only the transient cases in
  `docs/bridge-client-retry-guidance.md` (timeout, network failure, HTTP 408,
  429, 5xx) with Full Jitter, at most 4 retries. 4xx auth and payload errors
  are final.
- `--once` exits `0` only for a dry run or a `2xx` response with
  `accepted: true`; a broker connect timeout (20 s), broker error or rejected
  subscription exits `2` instead of hanging.
- A message over 64 KiB is rejected before it is parsed; summary strings are
  capped at 64 characters, and a `stationtype` that contains the PASSKEY is
  dropped.
- A message without `PASSKEY` or `dateutc` (for example the runbook's
  hand-made sanity POST) is rejected locally and never forwarded. A `dateutc`
  that carries the PASSKEY is rejected too (`invalid_dateutc`), so the
  credential value never reaches a summary string, and any 32-hex run inside a
  logged string is redacted whether or not it stands alone.
- The dry-run channel summary counts only the keys `ecowitt-ingest` routes:
  `temp{n}f` and `humidity{n}` for air, `soilmoisture{n}` for soil.
- The live POST is sent with `redirect: "manual"`: a redirect from the
  validated URL is reported as `network_error` (`redirect_refused_<status>`)
  after the first attempt, never followed and never retried with the PASSKEY
  and token.
- A message whose `PASSKEY` or `dateutc` is not a string is rejected locally
  (`invalid_passkey` / `invalid_dateutc`); nothing is coerced.
- `--once` claims the first message before any await, so a second upload
  arriving while the first is in flight is ignored, never forwarded. Once that
  message is claimed, a broker error is logged and does not abort its POST;
  the message's own result sets the exit code.
- `--once` also exits `2` when the broker connection closes or goes offline
  before a message is claimed; there is nothing to reconnect for.
- The `--once` deadline (20 s) covers both the connection and the subscription
  acknowledgement; a broker that connects but never answers the subscribe
  ends the run with exit `2` instead of hanging.
- The 64 KiB bound is applied to the raw frame before it is decoded or queued,
  so the backlog never holds more than 32 bounded messages.
- Continuous mode handles at most 4 messages at once and queues at most 32
  more; anything beyond that is dropped with a `dropped_backlog_full` log line,
  so a burst or a slow ingest never fans out into unbounded POSTs and retries.
  A broker close/offline is logged and left to the client's own reconnect.
- Logs and reports pass through a redactor at every depth: `PASSKEY`, `MAC`,
  tokens (also when embedded in another string or a URL), MAC addresses in any
  common form and MQTT credentials never appear, in the report's topic field
  as much as in the outcome. The Mosquitto watcher window still shows the raw topic, so
  crop it from anything you share.

- The redactor also scrubs the credential values a run actually holds: the
  PASSKEY extracted from each message, and the MQTT username and password from
  the environment or the broker URL, literally, in any case and URI-encoded.
  A `dateutc` or `stationtype` that echoes one of them is rejected or dropped.
- `--topic` and `--mqtt-url` must be followed by a value; `--mqtt-url --once`
  is refused before any connection (`missing_option_value`).
- A refused subscription (error, no grant, or QoS 128) exits `2` in continuous
  mode as well, instead of staying connected while consuming nothing.
- The `--write-report` file is written to a `.partial` neighbour and renamed
  into place, so an interrupted write never leaves an empty or truncated report.

## What it never does

No Supabase SDK, no `service_role`, no direct database access, no Action
Queue, no alerts, no automation, no device control. Enforced by
`src/test/ecowitt-ingest-forwarder-safety.test.ts`.

What `--live` does do: an accepted POST asks `ecowitt-ingest` to persist
`sensor_readings` rows and update bridge-token usage in production. That is the
owner-gated effect live mode exists for; dry-run has none of it.
