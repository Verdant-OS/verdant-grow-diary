
# Extend Single-Tent Enforcement to Non-Soil EcoWitt Channel Maps

## Scope audit (what's actually in the bridge surface)

Two bridge processes exist that consume grower-supplied EcoWitt channel maps:

1. `scripts/ecowitt-live-soil-bridge.ts` — reads `ECOWITT_SOIL_CHANNEL_MAP_JSON` (already fail-closed via `assertSingleTentSoilChannelMap`).
2. `scripts/dev/ecowitt-mqtt-runner.ts` — reads `HA_MQTT_MAPPING_PATH` (JSON file with `entities[].tent_id`). **No single-tent guard today.** A mixed-tent mapping is accepted and the runner subscribes/normalizes across tents.

All other "channel maps" in the repo (`FLOWER_TENT_CHANNEL_MAP`, `EcoWittChannelMapping`, `homeAssistantEcowittMqttAdapter` mapping) are either in-code constants, UI form state, or **pure normalization** modules — those must stay multi-tent capable per the requirement.

Enforcement therefore belongs at exactly one new boundary: the HA runner's mode-config resolution / startup.

## Deliverables

### 1. Shared pure guard (`src/lib/ecowittLiveSoilIngestRules.ts`)

- Widen `EcowittBridgeConfigError.code` union with `"mixed_tent_ha_mapping" | "ha_mapping_tent_mismatch"`.
- Add `assertSingleTentHaMappingEntities(entities, defaultTentId?)`:
  - Accepts array of `{ tent_id: string }` (structural — no HA import).
  - Empty entities → accepted (loader handles emptiness separately).
  - >1 distinct `tent_id` → throw `mixed_tent_ha_mapping`.
  - `defaultTentId` provided and non-matching → throw `ha_mapping_tent_mismatch`.
  - Error message is id-safe / token-safe / path-safe (same posture as the soil guard). Never echoes entity_id, tent_id, mapping path, or file contents.
- No mutation. Pure. Deterministic. No I/O.

### 2. Runner startup guard (`scripts/dev/ecowitt-mqtt-runner.ts`)

- New exported `assertRunnerStartupSafe(config, env)`:
  - No-op for `ecowitt_raw` (that path already funnels through `VERDANT_TENT_ID` for soil bridge, and has no mapping file).
  - For `ha_json` / `ha_statestream`: delegates to `assertSingleTentHaMappingEntities(config.mapping.entities, env.VERDANT_TENT_ID ?? undefined)`.
- Wire into `main()` **immediately after `resolveRunnerModeConfig` succeeds and before** the `runHaDryRunLoop` call, `connectMqttClient`, and any `mqtt` dynamic import. Convert `EcowittBridgeConfigError` to `process.exit(2)` with the same fail-closed logging block already used for `RunnerConfigError` (id-safe message only).
- Update the module docstring: HA modes require **all mapping entities to share one `tent_id`**, matching `VERDANT_TENT_ID` when set.

### 3. Test fixtures

- `fixtures/home-assistant-ecowitt-mqtt/mixed-tent-mapping.json` — valid shape, two entities on different tent UUIDs. Test-only; deterministic UUIDs; no secrets.

### 4. Tests

- `src/test/ecowitt-single-tent-ha-mapping.test.ts` — pure guard: accepts uniform, rejects mixed, rejects `VERDANT_TENT_ID` mismatch, id/path-safe error string, does not mutate input.
- `src/test/ecowitt-mqtt-runner-single-tent-startup.test.ts`:
  - `assertRunnerStartupSafe` rejects mixed-tent mapping in both `ha_json` and `ha_statestream`; passes for uniform.
  - Source-order regression: guard call appears in `main()` before `runHaDryRunLoop`, `connectMqttClient`, and the mqtt dynamic import — parallel to the existing soil-bridge order test.
- `src/test/ecowitt-mqtt-runner-exit-code.test.ts` — subprocess contract (parallel to the soil bridge exit-code suite):
  - `UPSTREAM_MODE=ha_statestream` + `HA_MQTT_MAPPING_PATH=fixtures/.../mixed-tent-mapping.json` → exit code **2**, stderr contains `ecowitt-mqtt-runner`, does **not** contain any tent UUID from the fixture, the mapping path, `ECONNREFUSED`, or `mqtt package not installed`.
  - Skips cleanly when `bun` is unavailable, matching the soil-bridge suite pattern.
- `src/test/home-assistant-ecowitt-mqtt-adapter-multi-tent.test.ts` — proves the **pure adapter stays multi-tent capable**: `parseHaJsonMessage` / `parseHaStatestreamMessage` correctly normalize entities pointing at two different tents when called with a mixed mapping (bypassing the runner guard).

### 5. Docs (docstrings only, no marketing copy)

- Add a one-line note to `scripts/dev/ecowitt-mqtt-runner.ts` header and to `docs/integrations/home-assistant-ecowitt-mqtt-bridge.md` Config section: mapping must be single-tent per running bridge process; runner exits 2 otherwise.

## Non-goals / explicitly out of scope

- No changes to `homeAssistantEcowittMqttAdapter.ts`, `ecowittPayloadAdapter.ts`, `ecowitt{Flower,Vegetation,Seedling}TentNormalizer.ts`, or any UI channel-map surface — those remain multi-tent capable.
- No schema, RLS, Edge Function, entitlement, alert, or Action Queue changes.
- No new env vars, no rename of `VERDANT_TENT_ID`, no doctrine change to the soil bridge.
- No CI workflow changes (existing testbench safety scan and unit test runners already cover the touched paths).

## Validation

- `tsgo --noEmit`
- `bunx vitest run` for exactly the four touched/new test files.
- `git diff --check`.
- Report exact pass/fail counts. Sandbox timeout is not a product failure.

## Safety verdict

Pure guard + fail-closed runtime check + adapter-level multi-tent preservation. No secrets logged, no IDs echoed in errors, no writes, no network. Rollback = revert three files (`ecowittLiveSoilIngestRules.ts`, `ecowitt-mqtt-runner.ts`, added tests/fixture).
