# EcoWitt Windows Local Testbench

A Windows-friendly local testbench for validating the EcoWitt → Verdant
sensor-ingest path **without** touching production. The listener and its local
state live under `tools/ecowitt-testbench/`.

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
  The listener requires a non-loopback sender, gateway markers and a valid
  gateway `dateutc` before its source rules can classify a fresh upload as
  `live`. A header or environment value saying `live` alone remains `demo`.
  Stuck humidity/soil percentages and unusable measurements are invalid.
- **Never commit `.env`.** Tokens stay local. `.env` is gitignored.
- **Never paste bridge tokens** into docs, chat, or issues. The listener and
  demo sender show only `<configured>` or `<empty>` in token diagnostics.
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

## G. Map one gateway to multiple tents

Without `ECOWITT_TENT_MAP`, the listener keeps the existing single-tent
`VERDANT_TENT_ID` / `VERDANT_BRIDGE_TOKEN` settings and first-match order:
`temp1f/tempf/tempinf`, `humidity1/humidity/humidityin`,
`soilmoisture1/soilmoisture2`, and `co2/co2in/co2_ppm`. Field lookup is
case-insensitive. Extra fields are recorded locally as unmapped rather than
silently assigned to that tent. Forwarding now writes to the durable spool
before the existing bounded inline attempts.

For mapped mode, create a local `tent-map.json` in the testbench folder.
This example uses synthetic UUIDs; replace them with your actual tent IDs.
The file stores environment-variable names, never bridge-token values:

```json
{
  "tents": [
    {
      "tent_id": "11111111-2222-3333-4444-555555555555",
      "label": "Flower",
      "token_env": "ECOWITT_FLOWER_BRIDGE_TOKEN",
      "air_channels": [1, 3],
      "soil_channels": [1, 3],
      "soil_temp_channels": [1],
      "co2": true
    },
    {
      "tent_id": "22222222-3333-4444-5555-666666666666",
      "label": "Vegetative",
      "token_env": "ECOWITT_VEG_BRIDGE_TOKEN",
      "air_channels": [2, "in"],
      "soil_channels": [2],
      "soil_temp_channels": [2],
      "co2": false
    }
  ],
  "aliases": []
}
```

Set `ECOWITT_TENT_MAP=tent-map.json` in the local `.env`, and set each
named token variable locally. Keep `VERDANT_INGEST_URL` configured.
Both `.env` and `tent-map.json` are gitignored. Restart after changing
the map or `.env`; the running process does not reload either file.

Startup accepts 1–8 tents with distinct, non-placeholder UUIDs, nonempty
labels, valid token-variable names and configured non-placeholder bridge
tokens. Channels are 1–8; air also supports `"in"`. A channel cannot be
listed twice within its sensor family, including across tents. Only one
tent can own the WH45 CO2 channel. An invalid map stops startup with a
sanitized diagnostic and never falls back silently to single-tent mode.

For every gateway packet, the listener queues one POST per mapped tent.
The POST's `tent_id`, `x-verdant-tent-id` and token all belong to that tent.
The first channel listed in each family is primary, even if another
channel has a lower number. An absent primary is never replaced silently
by a secondary. Secondary readings include value, explicit unit, channel,
label, metric, field, quality and channel ID in `metadata.channels`.
Primary lineage is in `metadata.primary_channels`. Owned raw fields are
kept in that tent's `metadata.raw_payload`.

| Gateway field                                       | Forwarded metric or metadata    | Unit and primary rule                                                               |
| --------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `temp1f` … `temp8f`                                 | `temp_f`                        | Fahrenheit; first `air_channels` entry                                              |
| `humidity1` … `humidity8`                           | `humidity_percent`              | Percent; same primary air channel                                                   |
| `tempinf`, `humidityin`                             | `temp_f`, `humidity_percent`    | Fahrenheit / percent; air channel `"in"`                                            |
| `soilmoisture1` … `soilmoisture8`                   | `soil_moisture_pct`             | Percent; first `soil_channels` entry                                                |
| `tf_ch1` … `tf_ch8` (WN34)                          | `soil_temp_f`                   | Fahrenheit; first `soil_temp_channels` entry                                        |
| `co2` (WH45)                                        | `co2_ppm`                       | ppm; the one tent with `co2: true`                                                  |
| `tf_co2`, `humi_co2` (WH45)                         | `metadata.channels` only        | Fahrenheit / percent; auxiliary WH45 values                                         |
| Configured, capture-verified EC alias               | `ec_ms_cm`                      | `mS/cm`; explicit `uS/cm` or `µS/cm` converts by ÷1000; first `soil_channels` entry |
| Configured, capture-verified soil-temperature alias | `soil_temp_f` or `soil_temp_c`  | Explicit `F` or `C`; first `soil_temp_channels` entry                               |
| Primary air temperature + RH                        | `vpd_kpa`                       | Derived kPa from that pair only; no secondary or WH45 substitution                  |
| Unowned or unknown fields                           | Local `unmapped_channels.jsonl` | No tent attribution; bounded per-key counters and aggregate overflow warning        |

The first 256 distinct unowned keys, within the state byte budget, receive
individual counters and one warning per key. Further occurrences increment
`unmapped_overflow_count` and still enter the sanitized local log, subject to
the log's retention and size limits.

**EC/WH52 capture status: NOT_MEASURED.** No verified sanitized capture
was supplied. The default alias table is empty. Tests use clearly named
synthetic configuration fields to check conversion; they do not establish
hardware field names. Celsius-only air fields do not become Fahrenheit.

To configure an alias after verifying a real capture, add an object to
`aliases` with four fields: `field` (the exact captured field name),
`metric`, `channel` (1–8), and `unit`. Supported pairs are
`ec_ms_cm` with `mS/cm`, `uS/cm` or `µS/cm`;
`soil_temp_f` with `F`; and `soil_temp_c` with `C`.
EC aliases use the tent's soil-channel ownership; temperature aliases
use soil-temperature ownership. Credential-like, duplicate, shadowing
or unsupported aliases fail startup. Multiple primary aliases for the
same stored metric fail closed, including simultaneous Fahrenheit and
Celsius soil-temperature fields.

### Gateway identity and the existing row contract

The current webhook copies one `metadata.device_id` onto every metric
row in a POST. Therefore each tent POST uses the agreed gateway ID
`ecowitt:<passkey fingerprint>:gateway`. Exact channel IDs are preserved
in the primary and secondary descriptors:
`ecowitt:<passkey fingerprint>:air_ch1`, `soil_ch1`,
`soil_temp_ch1` or `co2_ch1` (and `air_chin` for indoor air).
The fingerprint is the first 16 hexadecimal characters of SHA-256;
the PASSKEY itself is removed before logs, disk or forwarding.
An absent or conflicting-case PASSKEY is represented honestly as `unknown`.
Every supplied PASSKEY case variant is scrubbed from echoed fields as well.

The webhook stores at most one canonical metric per tent, source and
timestamp. Secondary readings are metadata, not additional metric rows.
Repeated timestamps never get offsets or invented metric names.
A repeated POST can be acknowledged without updating a previously stored
row or its metadata because the existing database conflict behavior is
DO NOTHING. Local queue identity distinguishes changed secondary/raw
fields so they are sent rather than silently coalesced; the HTTP
Idempotency-Key keeps the existing tent/metric/event-time identity.

Every credential-free gateway field is retained in its owner's POST or
the local unmapped log. Common gateway markers are retained with each
tent. Unknown fields never inherit a tent. Invalid gateway timestamps
block forwarding; sanitized local raw-log entries remain available for
diagnosis. Missing, malformed, conflicting-case and out-of-range values
are not converted to healthy measurements. RH/soil values pinned at
0 or 100 are invalid. Any invalid owned channel conservatively marks the whole
tent packet invalid; secondary descriptors also retain their own invalid quality.

## H. Durable local delivery

The default `.spool/` folder contains:

- `queue.jsonl`: write-ahead payloads and terminal transitions.
- `dead-letter.jsonl`: sanitized payloads rejected by non-retryable 4xx,
  with fixed reasons such as `http_401`; no response body or token.
- `spool-stats.json`: persistent drop, dead-letter and torn-tail counters.
- `state.json`: packet/forward times, incidents and unmapped counters.
- `unmapped_channels.jsonl`: sanitized unowned field values.

The queue append is flushed and synced before network I/O. Tokens and
Authorization headers are never persisted; each send resolves the
current process environment through that tent's configured token name.
Mapped tents must use distinct token environment names and distinct resolved
tokens; startup rejects credential reuse without echoing credential details.
After a restart, the background worker replays due entries in enqueue
order with the same Idempotency-Key and original gateway `dateutc`.
A supervisor periodically checks the replay worker and replaces it if it
exits unexpectedly, without waiting for another gateway packet. Its default
check interval is 10 seconds (five times the replay interval, with a
five-second minimum).
Listener shutdown and runtime replacement stop both loops.
Mapped mode acknowledges locally after enqueueing. Single-tent mode
retains its initial bounded inline attempts; failures then remain queued.
The mapped acknowledgement counts only entries that survive the batch's
spool limits; partial eviction reports `spool_capacity_drop` and its drop
count. Tents without deliverable primary metrics remain local diagnostics
with invalid provenance, and are not sent as unsupported empty-metrics
requests. No secondary sensor is promoted to fill the gap.
Owned fields that are all invalid record a tent failure; ordinary channel
absence does not. The existing failure-duration threshold applies, and only
a successful delivery for that tent can clear the failure.
Queued entries for a tent removed from configuration remain durable and
make public health return `orphaned_queue` without exposing tent IDs. Restoring
the same tent permits replay with the original identity and timestamp.
An enqueue error remains visible in health until a durable enqueue succeeds;
an empty replay does not prove that the queue can be written. A newer success
updates its tent's success time while preserving any older outstanding
delivery failure and its incident time.
Routing and raw-log write errors also remain visible until receive-path
writes succeed. An unmapped-log error requires an actual unmapped append
to prove recovery. In single-tent mode, configured forwarding with a missing
or invalid tent ID makes readiness fail; intentionally unconfigured
forwarding remains a receive-only no-op.

All 2xx responses mark an entry done. This is delivery acknowledgement,
not proof of a database insert. In particular, the current webhook may
return `200` with `accepted: false` / `timestamp_stale` for old captures.
Other non-retryable 4xx go to the dead-letter file; 408, 425, 429,
network errors and server failures stay queued. Replay uses one HTTP
attempt per due entry, with 5-second exponential backoff capped at
300 seconds; the default worker interval is 2 seconds.

Replays retain event time and re-evaluate the existing source rules.
The current listener stale window is 30 minutes; it is separate from
the 10-minute quiet threshold. Old data never gets a new capture time
or becomes fresh `live` data merely because delivery resumed.

Retention defaults to 7 days from enqueue time and 50 MB for the
spool directory, including auxiliary logs/state. Oldest pending entries
are dropped at the cap with a persistent counter and warning. Auxiliary
logs are also bounded and expose drop counters. If state alone exceeds
the size cap, delivery stops with a local-state error instead of hiding
loss. A torn final append is counted and discarded; a corrupt complete
record or malformed health state fails closed.

Optional settings are `ECOWITT_SPOOL_DIR`,
`ECOWITT_SPOOL_MAX_DAYS`, `ECOWITT_SPOOL_MAX_MB` and
`ECOWITT_REPLAY_INTERVAL_SECONDS`. Preserve this directory during
restart or rollback so pending packets remain recoverable. Inspect
dead letters before changing credentials or choosing a deliberate replay.

## I. Listener health and incident alerts

`GET /livez` always returns `200` with `alive: true` when the HTTP
listener responds. It does not load local delivery state, send requests,
or claim that forwarding or sensor data is healthy. Windows startup
checks use this endpoint, so delivery failures do not suggest restarting
an already running listener.

`GET /health` remains the separate delivery readiness check. It returns `200`
after a gateway quiet period. Quiet delivery still reports `ok: false`
and `gateway_quiet` in the response; the HTTP status does not classify
sensor readings as healthy. Sustained `forward_failure` or
`local_delivery_state_error` still returns `503`, including when the
gateway is also quiet. `GET /status` retains the same delivery warnings.
`last_packet_received_at` records gateway-shaped, non-loopback traffic.
Each tent has a persistent `last_forward_ok_at` and first failure time.
A 2xx acknowledgement updates the forward time even if no row was inserted.
Repeated invalid gateway timestamps count as local delivery failures, so
continuing malformed traffic cannot keep delivery health green indefinitely.

The default quiet and sustained-failure thresholds are 600 seconds.
Set `ECOWITT_QUIET_SECONDS` or `ECOWITT_FORWARD_FAILURE_SECONDS`
to change them. Startup gets one quiet grace period; restarting retains
previous times and incidents. Each incident logs one alert and one
recovery. With no webhook URL, there is no outbound alert request.

For an optional notification destination, set these values locally:

- `ECOWITT_ALERT_WEBHOOK_URL`: an HTTPS webhook URL; never commit or paste it.
- `ECOWITT_ALERT_FORMAT`: `generic` (default), `slack`, `discord` or `ntfy`.
- `ECOWITT_ALERT_INTERVAL_SECONDS`: global minimum interval, default 60.
- `ECOWITT_ALERT_NTFY_TOPIC`: required only for ntfy.

Generic JSON includes event, reason, incident and a fixed message.
Slack uses a JSON `text` payload; Discord uses `content` with mentions
disabled. For ntfy, use the server **root URL**, with the topic configured
separately. See [ntfy JSON publishing](https://docs.ntfy.sh/publish/#publish-as-json),
[Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
and [Discord webhook execution](https://docs.discord.com/developers/resources/webhook#execute-webhook).
Incident messages contain no sensor values or credentials.

Pending incident messages survive restart and drain at the rate limit.
Each message gets at most one webhook attempt, recorded before I/O,
because a timeout cannot establish whether the receiver accepted it.
Failed attempts increment `alert_webhook_error_count`; the log remains
the local record. Provider delivery is NOT_MEASURED until tested by the
operator with an authorized destination.

Inspect queue counts, drop counters, unmapped counts and per-tent times
at the loopback-only endpoint:

```powershell
curl.exe "http://localhost:8787/status"
```

## J. Local verification and rollback

From the repository root, after the normal testbench setup:

```powershell
& .\tools\ecowitt-testbench\.venv\Scripts\python.exe -m unittest discover -s tools/ecowitt-testbench -p "test*.py"
bunx vitest run src/test/ecowitt-windows-testbench-static-safety.test.ts src/test/ecowitt-custom-http-bridge-*.test.ts
bun run typecheck
```

The TypeScript parity test reads Python assignments through
`ast.literal_eval` with site packages disabled. It never imports Flask.
The dedicated forwarding workflow runs every existing Python group plus
routing, delivery/health, integration and redaction tests. All outbound
requests in those tests are mocked. Synthetic tests and green CI do not
prove real gateway, bridge-token, server-storage or notification delivery.

To return to legacy routing, unset `ECOWITT_TENT_MAP`, retain the
single-tent settings and restart. Preserve the spool: entries for tents
no longer configured remain deferred rather than being sent to another
tent. Reverting the slice's code also requires retaining the queue for a
later compatible replay; the previous listener cannot consume it.

## Safety boundaries

- It will not write to Supabase tables directly.
- It will not bypass the validated ingest webhook.
- It will not classify missing / malformed sensor values as healthy — those
  normalize to `null` and the raw payload is kept in `metadata.raw_payload`
  for audit. A real gateway packet whose `dateutc` has aged past Verdant's
  live window keeps its original timestamp and is forwarded as `stale`, never
  as current `live` telemetry.
- It will not print tokens or token fragments.
- Local delivery incidents can use the optional notification webhook.
  The listener has no database, Action Queue, AI or device operation.

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

Redaction: entries are sanitized by field name before being returned —
device-auth and device-identity fields (`PASSKEY`, `mac`), tokens, and
other secret-shaped values come back as `[REDACTED]`. For output you
intend to paste into chat, issues, or docs, still prefer
`/debug/last-events`: it returns only normalized readings and never
includes the vendor raw payload.

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
  in-memory attempt/success/failure counters. Token status is `<configured>` or `<empty>`;
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
- `masked_token_preview` — `<configured>` or `<empty>` only. No token characters are returned. Do not paste tokens into curl commands or docs.
- `forward_attempt_count` — forward attempts since listener start. `0` means none yet.
- `forward_success_count` — webhook calls that returned 2xx. `>0` confirms at least one successful ingest.
- `forward_failure_count` — non-2xx responses or request exceptions. `>0` means inspect `last_forward_error` and `last_forward_status`.
- `last_forward_status` — last HTTP status (or `null` on exception).
- `last_forward_at` — ISO timestamp of the most recent attempt.
- `last_forward_error` — short sanitized error summary (e.g. `http_400`).
- `last_forward_response_error` — sanitized `error` field parsed from the webhook response body (e.g. `invalid_payload`, `forbidden_tent`, `bridge_required`, `insert_failed`, `unauthorized`, `non_json_response`). `null` on success or when no response was received.
- `last_forward_response_classification` — operator-friendly classification of the response error:
  - `payload_shape_mismatch` — the forwarded payload did not match the `sensor-ingest-webhook` contract (likely the `source`, `tent_id`, `captured_at`, or `metrics` shape).
  - `tent_authorization_mismatch` — bridge token / tent pairing rejected (`forbidden_tent`).
  - `tent_lookup_failed` — webhook could not verify tent context server-side.
  - `storage_insert_failed` — webhook accepted the payload but the database insert failed (`insert_failed`).
  - `auth_failed` — bridge token rejected (`unauthorized`).
  - `bridge_required` — an app-session credential was supplied where a tent-scoped bridge token is required.
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
- The single-tent inline send retries transient webhook failures (HTTP 408, 425, 429, 500, 502, 503, 504, plus connection/DNS/timeout errors) with bounded exponential backoff. `retry_count`, `last_retry_error`, `last_retry_at`, `last_retryable_status`, and `max_retry_attempts` are exposed in `/debug/forwarding-status`. Durable replay is described in section H: terminal HTTP errors are dead-lettered, while locally missing tent/token/url configuration defers queued packets without an HTTP request. Legacy debug counters describe this process only; persistent queue and health state are on `/status`.

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

| Classification / reason               | Meaning                             | Most likely cause                                         | Command                                                    | Retry?                                      | Edit .env?                                                   | Escalate?                        |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `invalid_payload` (HTTP 400)          | Payload shape rejected              | `tent_id`, `source`, `captured_at`, or `metrics` mismatch | `curl http://localhost:8787/debug/forwarding-error-report` | No                                          | If `tent_id_configured: false`, set `VERDANT_TENT_ID`        | No                               |
| `unauthorized` (HTTP 401)             | Bridge token rejected               | Wrong/expired `VERDANT_BRIDGE_TOKEN`                      | `curl http://localhost:8787/debug/forwarding-status`       | No                                          | Update `VERDANT_BRIDGE_TOKEN`, restart listener              | Only if token is known good      |
| `forbidden_tent` (HTTP 403)           | Token cannot write this tent        | `VERDANT_TENT_ID` not authorized for this token           | `curl http://localhost:8787/debug/forwarding-error-report` | No                                          | Fix `VERDANT_TENT_ID` to a tent the token can write to       | Developer if pairing should work |
| `bridge_required` (HTTP 403)          | Wrong credential class              | App-session credential used instead of a bridge token     | `curl http://localhost:8787/debug/forwarding-status`       | No                                          | Set `VERDANT_BRIDGE_TOKEN` to a tent-scoped bridge token     | No                               |
| `tent_lookup_failed`                  | Webhook could not verify tent       | Tent UUID does not exist                                  | check the tent in Verdant UI                               | No                                          | Set `VERDANT_TENT_ID` to a real tent UUID                    | No                               |
| `insert_failed`                       | Storage insert failed               | Transient DB issue                                        | `curl http://localhost:8787/debug/forwarding-error-report` | Listener already retried                    | No                                                           | Developer with sanitized report  |
| `server_misconfigured`                | Webhook reported server misconfig   | Edge function env missing                                 | —                                                          | No                                          | No                                                           | Developer with sanitized report  |
| `method_not_allowed` (HTTP 405)       | Wrong URL/method                    | `VERDANT_INGEST_URL` typo                                 | `curl http://localhost:8787/debug/forwarding-status`       | No                                          | Fix `VERDANT_INGEST_URL` to the `sensor-ingest-webhook` path | No                               |
| `internal_error`                      | Webhook 500                         | Edge function bug or transient                            | —                                                          | Listener already retried                    | No                                                           | Developer with sanitized report  |
| `non_json_response`                   | Edge/gateway error page             | Gateway/proxy returned HTML                               | check connectivity                                         | No                                          | Verify `VERDANT_INGEST_URL`                                  | If persistent                    |
| `blocked_missing_tent_id`             | Listener refused to send            | `VERDANT_TENT_ID` not set                                 | `curl http://localhost:8787/debug/forwarding-status`       | n/a                                         | Set `VERDANT_TENT_ID=<uuid>`, restart                        | No                               |
| `blocked_invalid_tent_id`             | Display name / placeholder rejected | Used a name (e.g. `Flower Tent`) or `tent-1`              | `curl http://localhost:8787/debug/forwarding-status`       | n/a                                         | Use a real tent UUID                                         | No                               |
| `http_400` (no classification)        | Generic 400                         | Payload mismatch not enumerated                           | `curl http://localhost:8787/debug/forwarding-error-report` | No                                          | Inspect `last_forward_response_message`                      | If unclear                       |
| transient 5xx / 429 / 408 / 425 / 504 | Temporary upstream issue            | Network/edge backpressure                                 | —                                                          | Listener retries up to `max_retry_attempts` | No                                                           | Only if it persists              |

#### `insert_failed` sub-reasons

When `last_forward_response_classification = storage_insert_failed`, the
listener also captures a sanitized `last_forward_response_reason` from
the webhook body and tailors `recommended_next_step` accordingly:

| `last_forward_response_reason`    | Meaning                                                                   | What to do                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `insert_required_field_missing`   | A required DB field is missing                                            | Share the sanitized report with a developer                                |
| `insert_source_constraint_failed` | Stored `source` failed the canonical source constraint                    | Confirm EcoWitt transport `source` is remapped to stored `source = "live"` |
| `insert_check_failed`             | A database check constraint rejected the row                              | Share the sanitized report with a developer                                |
| `insert_column_mismatch`          | Insert references a column that does not exist / no longer matches schema | Developer must align payload mapping with schema                           |
| `insert_duplicate`                | Duplicate / idempotent reading                                            | Usually safe; verify dedupe behavior                                       |
| `insert_unknown`                  | Sub-reason not recognized (or sanitizer collapsed an unsafe value)        | Share the sanitized report only                                            |

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
and checks HTTP liveness with `/livez` before probing delivery readiness
and the safe local debug endpoints (`/health`, `/debug/status`,
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
`http://localhost:8787/livez`, then runs verify. It does **not** read
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
  ecowitt_multitent.py
  ecowitt_delivery.py
  test_multitent.py
  test_delivery.py
  test_ingest_readiness.py
  requirements.txt
  preflight-windows.ps1
  setup-windows.ps1
  start-listener-windows.ps1
  send-demo-payload-windows.ps1
  verify-testbench-windows.ps1
  run-testbench-windows.ps1
  .env.example
  .gitignore
src/lib/ecowittCustomHttpBridgeIngestRules.ts
src/test/ecowitt-custom-http-bridge-ingest-readiness.test.ts
.github/workflows/ecowitt-testbench-forwarding-tests.yml
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
