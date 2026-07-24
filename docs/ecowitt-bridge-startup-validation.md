# EcoWitt bridge — startup validation flow

Authoritative reference for what the bridge checks at startup, in what
order, and how to fix each machine-readable failure code. Applies to
`scripts/ecowitt-live-soil-bridge.ts` (both `config validate` and the
default live/dry-run entry).

All failures exit code **2** and emit two stderr lines:

```
[ecowitt-bridge] config_error code=<code> message="<human message>"
{"event":"config_error","code":"<code>","message":"<human message>"}
```

No line ever contains tent IDs, plant IDs, bridge tokens, ingest URLs,
or raw payloads. The validator never imports `mqtt` and never connects
to the broker.

---

## 1. Order of checks

```text
┌─ mode selection ────────────────────────────────────────────┐
│  argv[0..1] == "config validate"   → runConfigValidate      │
│  otherwise                          → runCli (live/dry-run) │
└─────────────────────────────────────────────────────────────┘

runConfigValidate (pure, no I/O):
  1. VERDANT_TENT_ID present?                → missing_tent_id
  2. VERDANT_TENT_ID is UUID?                → invalid_tent_id
  3. ECOWITT_SOIL_CHANNEL_MAP_JSON schema?   → invalid_channel_map_schema
  4. Single-tent channel map?                → mixed_tent_channel_map
  5. Channel tent == VERDANT_TENT_ID?        → channel_map_tent_mismatch
  → exit 0 + {"event":"config_ok"}

runCli (live/dry-run):
  1. If NOT --dry-run:
       a. VERDANT_INGEST_URL present?        → missing_ingest_url
       b. VERDANT_BRIDGE_TOKEN present?      → missing_bridge_token
  2. assertBridgeStartupSafe(env, raw JSON):
       a. Schema check                       → invalid_channel_map_schema
       b. Single-tent + tent match           → mixed_tent_channel_map
                                             → channel_map_tent_mismatch
  3. dynamic import("mqtt")                  → mqtt_package_missing
  4. mqttMod.connect(...)                    (network begins here)
```

Every failure between step 1 and step 3 is deterministic and happens
**before** any network activity or `mqtt` import.

---

## 2. Error code catalog

| Code                          | Meaning                                                                  | How to fix                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_tent_id`             | `VERDANT_TENT_ID` is empty or unset.                                     | Set `VERDANT_TENT_ID=<tent-uuid>` in `.env`. Copy from Verdant → Settings → Tents.                                                                      |
| `invalid_tent_id`             | `VERDANT_TENT_ID` is not a `8-4-4-4-12` hex UUID.                        | Paste the full UUID exactly as shown in Verdant (no braces, no quotes, no trailing spaces).                                                             |
| `invalid_channel_map_schema`  | `ECOWITT_SOIL_CHANNEL_MAP_JSON` is not JSON or violates the schema.      | Validate against `docs/schemas/ecowitt-soil-channel-map.schema.json`. Keys must match `soilmoisture[1-9][0-9]?`; every entry needs a UUID `tent_id`.    |
| `mixed_tent_channel_map`      | Channels are mapped to more than one distinct `tent_id`.                 | Split into one `.env` per tent. Run one bridge process per tent — one-tent enforcement is intentional.                                                  |
| `channel_map_tent_mismatch`   | A channel's `tent_id` does not equal `VERDANT_TENT_ID`.                  | Either change `VERDANT_TENT_ID` to match the channel, or update the channel's `tent_id` in the map. They must be identical.                             |
| `missing_ingest_url`          | Live mode without `VERDANT_INGEST_URL`.                                  | Set `VERDANT_INGEST_URL=https://<project>.functions.supabase.co/sensor-ingest-webhook`, or add `--dry-run` for offline testing.                         |
| `missing_bridge_token`        | Live mode without `VERDANT_BRIDGE_TOKEN`.                                | Mint a token in Verdant → Settings → Bridge Tokens (scoped to this tent). Set `VERDANT_BRIDGE_TOKEN=vbt_…`. Never commit it.                            |
| `mqtt_package_missing`        | `mqtt` npm package not installed in the environment running the bridge.  | `bun add mqtt` (or `npm i mqtt`) in the directory that runs the bridge.                                                                                 |
| `channel_map_parse_error`     | Unexpected parse failure (fallback; schema check normally fires first).  | Re-check JSON quoting in `.env` (single line, no trailing commas). Re-run `config validate`.                                                            |

---

## 3. End-to-end example

Starting from a clean checkout:

```bash
# 1. Copy the example config
cp examples/ecowitt-bridge/.env.example .env

# 2. First validate — placeholder tent + placeholder map, both point at
#    the same UUID, so schema + single-tent pass, but VERDANT_INGEST_URL /
#    VERDANT_BRIDGE_TOKEN are still placeholders. `config validate` does
#    NOT require them:
bun run scripts/ecowitt-live-soil-bridge.ts config validate
# → exit 0
# → stdout: {"event":"config_ok","check":"ecowitt-bridge"}

# 3. Simulate a mistake: point one channel at a different tent
sed -i.bak 's/"soilmoisture2":{"tent_id":"11111111-1111-4111-8111-111111111111"/"soilmoisture2":{"tent_id":"22222222-2222-4222-8222-222222222222"/' .env
bun run scripts/ecowitt-live-soil-bridge.ts config validate
# → exit 2
# → stderr: [ecowitt-bridge] config_error code=mixed_tent_channel_map message="..."
# → stderr: {"event":"config_error","code":"mixed_tent_channel_map","message":"..."}

# 4. Revert and try live mode without a token
mv .env.bak .env
unset VERDANT_BRIDGE_TOKEN
bun run scripts/ecowitt-live-soil-bridge.ts
# → exit 2
# → stderr: {"event":"config_error","code":"missing_bridge_token", ...}

# 5. Dry-run once (no URL / token required, no forwarding, no writes)
bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once
# → connects to the local MQTT broker only if one is running;
#   otherwise exits cleanly after the guard passes.

# 6. Go live (real URL + real token in .env)
bun run scripts/ecowitt-live-soil-bridge.ts
# → [ecowitt-bridge] starting {...}
# → [ecowitt-bridge] mqtt_connected {...}
```

## 4. Automation contract

CI, supervisors, and log scrapers should key off the JSON envelope:

```jsonc
{ "event": "config_ok",    "check": "ecowitt-bridge" }
{ "event": "config_error", "code":  "<one of the codes above>", "message": "..." }
```

The `code` field is stable API. New codes may be added; existing codes
will not be renamed or repurposed without a version bump.

### `--fix-hints`

Pass `--fix-hints` to `config validate` to include a concise remedy in
the envelope. Codes and messages are unchanged; a `fix` field is added
on failure only. Success output is untouched.

```bash
bun run scripts/ecowitt-live-soil-bridge.ts config validate --fix-hints
# on failure, stderr JSON becomes:
# {"event":"config_error","code":"mixed_tent_channel_map",
#  "message":"...","fix":"One bridge process = one tent. ..."}
```

The full code → fix mapping lives in
`scripts/ecowitt-live-soil-bridge.ts` as `CONFIG_ERROR_FIX_HINTS` and
mirrors the table in section 2.

### `--dry-run`

Pass `--dry-run` to `config validate` to additionally print a
schema-validated, fully redacted view of the effective config. Nothing
starts — no `mqtt` import, no broker connect, no HTTP.

```bash
bun run scripts/ecowitt-live-soil-bridge.ts config validate --dry-run
# stdout on success:
# {"event":"config_ok","check":"ecowitt-bridge"}
# {"event":"config_effective","check":"ecowitt-bridge",
#  "tent_id":"uuid:…1111","plant_id":null,
#  "ingest_url_host":"https://proj.functions.supabase.co",
#  "bridge_token":"vbt_…(redacted, len=N)",
#  "mqtt":{"url_host":"mqtt://127.0.0.1:1883","topic":"ecowitt/grow",
#          "username_present":false,"password_present":false},
#  "channel_map":{"count":2,"channels":[
#    {"channel":"soilmoisture1","tent_id":"uuid:…1111","plant_id":"uuid:…3333","label":"A"},
#    ...]},
#  "dry_run":false,"once":false}
```

Redaction rules (see `buildRedactedEffectiveConfig`):

- Tent / plant UUIDs → `uuid:…XXXX` (last 4 hex only).
- Bridge token → presence + length via `maskBridgeToken`.
- Ingest and MQTT URLs → protocol + host only (no paths, no creds).
- MQTT credentials → `username_present` / `password_present` booleans.
- Channel map → count + per-channel entries with masked UUIDs.

On failure, `--dry-run` is suppressed and only the standard
`config_error` envelope is emitted, exit 2.



## 5. Related files

- Bridge script: `scripts/ecowitt-live-soil-bridge.ts`
- Pure rules: `src/lib/ecowittLiveSoilIngestRules.ts`
- Schema: `docs/schemas/ecowitt-soil-channel-map.schema.json`
- Example config: `examples/ecowitt-bridge/.env.example`
- Preflight env checker: `scripts/ecowitt-bridge-env-check.ts`
- Tests:
  - `src/test/ecowitt-live-soil-bridge-config-validate.test.ts`
  - `src/test/ecowitt-live-soil-bridge-error-codes.test.ts`
  - `src/test/ecowitt-soil-channel-map-schema.test.ts`
