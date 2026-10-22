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
bun run dev:ecowitt-forwarder -- --once

# Live (owner-gated): forward to ecowitt-ingest with a bridge token.
$env:ECOWITT_INGEST_URL="https://<project-ref>.supabase.co/functions/v1/ecowitt-ingest"
$env:VERDANT_BRIDGE_TOKEN="vbt_..."   # paste only into this window, never into chat
bun run dev:ecowitt-forwarder:live -- --once
```

`--once` exits `0` for a dry run or an `accepted: true` forward, `1` otherwise.
The outcome is printed to the console, redacted. The forwarder writes no files;
an earlier version's `--write-report` option is gone and is now refused as an
unknown argument. A report file an earlier run left in `tmp/` is not touched.

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
- The summary echoes only checked fields. `dateutc` must be the EcoWitt
  `YYYY-MM-DD HH:MM:SS` form `ecowitt-ingest` accepts, or the message is
  rejected (`invalid_dateutc`). Free-form upload strings such as `stationtype`
  are never shown.
- A message without `PASSKEY` or `dateutc` (for example the runbook's
  hand-made sanity POST) is rejected locally and never forwarded. A valid
  `dateutc` that contains the PASSKEY (a short or date-shaped key such as `-`)
  is still forwarded unchanged; only the summary's copy is replaced with
  `[redacted: contains PASSKEY]`, so the credential value never reaches a
  summary string. Any 32-hex run inside a logged string is redacted whether or
  not it stands alone.
- The dry-run channel summary counts only the keys `ecowitt-ingest` routes:
  `temp{n}f` and `humidity{n}` for air, `soilmoisture{n}` for soil.
- The live POST is sent with `redirect: "manual"`: a redirect from the
  validated URL is reported as `network_error` (`redirect_refused_<status>`)
  after the first attempt, never followed and never retried with the PASSKEY
  and token. Its unread body is cancelled before the result is reported.
- A message whose `PASSKEY` or `dateutc` is not a string is rejected locally
  (`invalid_passkey` / `invalid_dateutc`); nothing is coerced.
  The HTTP bridge keeps `PASSKEY` as the exact string it received, so a
  digits-only key such as `000012345678` arrives unchanged.
- `--once` claims the first message before any await, so a second upload
  arriving while the first is in flight is ignored, never forwarded. Once that
  message is claimed, a broker error is logged and does not abort its POST;
  the message's own result sets the exit code.
- `--once` also exits `2` when the broker connection closes or goes offline
  before a message is claimed; there is nothing to reconnect for.
- The `--once` deadline (20 s) covers both the connection and the subscription
  acknowledgement; a broker that connects but never answers the subscribe
  ends the run with exit `2` instead of hanging.
- Every inbound MQTT packet passes a stream guard before MQTT.js parses it. A
  fixed header declaring more than 65 KiB (one 64 KiB message plus 1 KiB for
  its header, topic and packet id), or a remaining length longer than four
  bytes, closes the connection before the body is read, and the run exits `2`
  in either mode. The guard works on every transport MQTT.js builds and on
  every reconnect. It holds no data itself; what can be in memory at once is
  the socket's current read chunk (set by the runtime, not by the guard), the
  guard's readable buffer, and one partial packet of at most 65 KiB. The
  readable buffer pauses the socket at the runtime's default high-water mark
  (64 KiB on Node 22 and Bun), but a chunk is pushed whole first, so it can
  hold up to that mark plus one full socket chunk.
  This does not depend on MQTT 5 `maximumPacketSize`, which a broker may ignore
  and MQTT.js checks only after buffering the whole packet.
- The 64 KiB message bound is then applied to the raw frame before it is
  decoded or queued, so the backlog never holds more than 32 bounded messages.
- Continuous mode handles at most 4 messages at once and queues at most 32
  more; anything beyond that is dropped with a `dropped_backlog_full` log line,
  so a burst or a slow ingest never fans out into unbounded POSTs and retries.
  A broker close/offline is logged and left to the client's own reconnect;
  each reconnect subscribes again and waits for the broker's own acknowledgement.
- Every log line passes through a redactor at every depth: `PASSKEY`, `MAC`,
  tokens (also when embedded in another string or a URL), MAC addresses in any
  common form, and the configured MQTT username and password (literally, in any
  case, URI-encoded, at any length) never appear. Each upload is checked
  against its own PASSKEY, in any case; nothing carries over between messages.
  The Mosquitto watcher window still shows the raw topic, so crop it from
  anything you share.
- Arguments are read in order. An unknown argument, a repeated flag, or
  `--topic` / `--mqtt-url` without a non-empty value is refused before any
  connection. An unknown argument is reported by position only, so a mistyped
  `--password=…` is never printed. A broker URL the MQTT client cannot open
  (for example a malformed one) exits `2` with a fixed `mqtt_connect_failed`
  line that carries neither the URL nor the error text.
- A refused subscription (error, no grant, or QoS 128), a subscription that is
  never acknowledged within 20 s, and a refused connection (bad credentials)
  each exit `2` in continuous mode as well, instead of staying connected while
  consuming nothing. Network errors and drops are left to the client's
  reconnect.
- The ingest response is read up to 16 KiB; a longer body is cancelled and
  reported as `response_too_large`. When nothing is stored, the outcome counts
  the documented `dropped[]` reason codes and names the router channel keys
  involved (`temp2f`, `humidity2`, …), never tenant ids.

## What it never does

No Supabase SDK, no `service_role`, no direct database access, no Action
Queue, no alerts, no automation, no device control. Enforced by
`src/test/ecowitt-ingest-forwarder-safety.test.ts`.

What `--live` does do: an accepted POST asks `ecowitt-ingest` to persist
`sensor_readings` rows and update bridge-token usage in production. That is the
owner-gated effect live mode exists for; dry-run has none of it.
