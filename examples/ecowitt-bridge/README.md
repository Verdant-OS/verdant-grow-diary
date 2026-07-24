# EcoWitt bridge — quickstart example

Ready-to-copy config for the Verdant EcoWitt live soil bridge
(`scripts/ecowitt-live-soil-bridge.ts`). One bridge process = one tent.

## 1. Copy the example

```bash
cp examples/ecowitt-bridge/.env.example .env
```

Edit `.env` and replace the placeholder UUIDs, ingest URL, and bridge
token with the real values for **your** tent. Every `tent_id` inside
`ECOWITT_SOIL_CHANNEL_MAP_JSON` must equal `VERDANT_TENT_ID`.

## 2. Validate

```bash
bun run scripts/ecowitt-live-soil-bridge.ts config validate
```

- Success: exit 0, stdout `{"event":"config_ok","check":"ecowitt-bridge"}`.
- Failure: exit 2, stderr JSON with a stable `code`, e.g.:
  - `missing_tent_id`, `invalid_tent_id`
  - `invalid_channel_map_schema`
  - `mixed_tent_channel_map`, `channel_map_tent_mismatch`
  - `missing_ingest_url`, `missing_bridge_token`

The validator never imports `mqtt`, never connects to the broker, and
never echoes tent IDs, bridge tokens, or raw payloads.

## 3. Dry-run, then live

```bash
# no network, no forwarding
bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once

# live (requires VERDANT_INGEST_URL + VERDANT_BRIDGE_TOKEN)
bun run scripts/ecowitt-live-soil-bridge.ts
```

## Related

- Schema: `docs/schemas/ecowitt-soil-channel-map.schema.json`
- Bridge doc: `docs/ecowitt-live-soil-bridge.md`
- Preflight env checker: `bun run scripts/ecowitt-bridge-env-check.ts`
