# EcoWitt bridge config schema reference

_Generated file — do not edit by hand. Regenerate with:_

```bash
node scripts/generate-ecowitt-config-schema-docs.mjs
```

_Sources of truth:_

- Env-var contract: [`scripts/ecowitt-live-soil-bridge.ts`](../scripts/ecowitt-live-soil-bridge.ts) (`readBridgeEnv`, `runConfigValidate`)
- Channel-map shape: [`docs/schemas/ecowitt-soil-channel-map.schema.json`](./schemas/ecowitt-soil-channel-map.schema.json) (JSON Schema draft 2020-12)
- Startup check order, error codes, and remediation: [`docs/ecowitt-bridge-startup-validation.md`](./ecowitt-bridge-startup-validation.md)

Generated at: `2026-07-24T10:05:58.098Z`

---

## Environment variables

| Name | Type | Required | Default | Validator |
| --- | --- | --- | --- | --- |
| `VERDANT_TENT_ID` | UUID (v4 shape) | yes | — | runConfigValidate → missing_tent_id / invalid_tent_id_format |
| `VERDANT_PLANT_ID` | UUID (v4 shape) or unset | no | unset | readBridgeEnv (passthrough) |
| `VERDANT_INGEST_URL` | https URL | when running (not for `config validate`) | — | runCli startup → missing_ingest_url |
| `VERDANT_BRIDGE_TOKEN` | opaque secret string | when running (not for `config validate`) | — | runCli startup → missing_bridge_token |
| `ECOWITT_SOIL_CHANNEL_MAP_JSON` | JSON object (see schema section) | yes | — | assertEcowittSoilChannelMapJsonEnv (schema) + assertSingleTentSoilChannelMap |
| `ECOWITT_BRIDGE_DRY_RUN` | "1" | unset | no | unset | readBridgeEnv (alias for `--dry-run`) |
| `ECOWITT_MQTT_URL` | mqtt(s):// URL | when running (either this OR HOST+PORT) | unset | runMqttBridge (URL takes precedence over HOST+PORT) |
| `ECOWITT_MQTT_HOST` | hostname | no | 127.0.0.1 | runMqttBridge (used only when `ECOWITT_MQTT_URL` is unset) |
| `ECOWITT_MQTT_PORT` | port number (string) | no | 1883 | runMqttBridge (used only when `ECOWITT_MQTT_URL` is unset) |
| `ECOWITT_MQTT_TOPIC` | MQTT topic | no | ecowitt/grow | runMqttBridge (passthrough) |
| `ECOWITT_MQTT_USERNAME` | string | no | unset | runMqttBridge (passthrough) |
| `ECOWITT_MQTT_PASSWORD` | secret string | no | unset | runMqttBridge (passthrough) |

### Details

#### `VERDANT_TENT_ID`

Tent this bridge process writes for. One bridge process → one tent. Must match every `tent_id` in `ECOWITT_SOIL_CHANNEL_MAP_JSON`.

**Example:**

```bash
VERDANT_TENT_ID='11111111-1111-4111-8111-111111111111'
```

#### `VERDANT_PLANT_ID`

Optional default plant to attribute soil readings to when a channel map entry does not specify `plant_id`.

**Example:**

```bash
VERDANT_PLANT_ID='22222222-2222-4222-8222-222222222222'
```

#### `VERDANT_INGEST_URL`

Fully-qualified HTTPS endpoint the bridge POSTs canonical payloads to. Only host+protocol are shown in redacted `config_effective` output.

**Example:**

```bash
VERDANT_INGEST_URL='https://ingest.verdantgrowdiary.com/ecowitt'
```

#### `VERDANT_BRIDGE_TOKEN`

One-tent-scoped bearer token authenticating this bridge to the ingest endpoint. Never printed — length-masked in redacted output.

**Example:**

```bash
VERDANT_BRIDGE_TOKEN='vbt_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXX'
```

#### `ECOWITT_SOIL_CHANNEL_MAP_JSON`

Maps `soilmoisture<N>` channel keys to the single tent this bridge serves. Full shape, ranges, and per-field docs come from the JSON Schema below.

**Example:**

```bash
ECOWITT_SOIL_CHANNEL_MAP_JSON='{"soilmoisture1":{"tent_id":"11111111-1111-4111-8111-111111111111","label":"Front-left"}}'
```

#### `ECOWITT_BRIDGE_DRY_RUN`

Alternative way to enable dry-run mode without passing `--dry-run`. Any other value is ignored.

**Example:**

```bash
ECOWITT_BRIDGE_DRY_RUN='1'
```

#### `ECOWITT_MQTT_URL`

Full MQTT broker URL. When set, `ECOWITT_MQTT_HOST` and `ECOWITT_MQTT_PORT` are ignored.

**Example:**

```bash
ECOWITT_MQTT_URL='mqtt://broker.local:1883'
```

#### `ECOWITT_MQTT_HOST`

MQTT broker hostname. Combined with `ECOWITT_MQTT_PORT` to form the connection URL.

**Example:**

```bash
ECOWITT_MQTT_HOST='broker.local'
```

#### `ECOWITT_MQTT_PORT`

MQTT broker port. Combined with `ECOWITT_MQTT_HOST`.

**Example:**

```bash
ECOWITT_MQTT_PORT='1883'
```

#### `ECOWITT_MQTT_TOPIC`

MQTT topic the bridge subscribes to for EcoWitt raw payloads. Must match the topic configured on the EcoWitt gateway.

**Example:**

```bash
ECOWITT_MQTT_TOPIC='ecowitt/grow'
```

#### `ECOWITT_MQTT_USERNAME`

Optional MQTT broker username. Only `username_present: true|false` is echoed in logs — the value itself is never printed.

**Example:**

```bash
ECOWITT_MQTT_USERNAME='verdant-bridge'
```

#### `ECOWITT_MQTT_PASSWORD`

Optional MQTT broker password. Only `password_present: true|false` is echoed in logs — the value itself is never printed.

**Example:**

```bash
ECOWITT_MQTT_PASSWORD='••••••••'
```


---

## `ECOWITT_SOIL_CHANNEL_MAP_JSON` schema

**`$id`:** `https://verdantgrowdiary.com/schemas/ecowitt-soil-channel-map.schema.json`

Runtime config payload for the Verdant EcoWitt live soil bridge. Maps EcoWitt soilmoisture channel keys to a single Verdant tent (and optional plant + label). One bridge process → one tent → one bridge token is enforced separately at startup; this schema only validates shape and value ranges.

### Top-level object

- Type: `object`
- `additionalProperties`: `false`
- `minProperties`: `0` (empty map is valid — the bridge will accept it and simply forward nothing until a mapping is added)
- Allowed property names: match `^soilmoisture([1-9]|[1-9][0-9])$` (i.e. `soilmoisture1` through `soilmoisture99`)

### Per-channel entry fields

| Field | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `tent_id` | string | yes | pattern `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` | UUID of the tent this soil channel belongs to. |
| `plant_id` | string \| null | no | pattern `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` | Optional UUID of the plant this soil probe is inserted in. |
| `label` | string \| null | no | maxLength 120 | Optional human-readable label for operator logs. |

### Valid example

```json
{
  "soilmoisture1": {
    "tent_id": "11111111-1111-4111-8111-111111111111",
    "plant_id": "22222222-2222-4222-8222-222222222222",
    "label": "Front-left probe"
  },
  "soilmoisture2": {
    "tent_id": "11111111-1111-4111-8111-111111111111",
    "label": "Back-right probe"
  }
}
```

Every `tent_id` in the map **must** equal `VERDANT_TENT_ID`. Mixed-tent maps are rejected with error code `mixed_tent_channel_map` — see the [startup validation doc](./ecowitt-bridge-startup-validation.md) for the full error-code catalog and fix hints.

### Rejected example (mixed tents)

```json
{
  "soilmoisture1": { "tent_id": "11111111-1111-4111-8111-111111111111" },
  "soilmoisture2": { "tent_id": "99999999-9999-4999-8999-999999999999" }
}
```

Fails `assertSingleTentSoilChannelMap` with `code=mixed_tent_channel_map` and a `fields` diagnostic pointing at `$.soilmoisture2.tent_id`.

---

## Quick operator workflow

```bash
cp examples/ecowitt-bridge/.env.example .env
# edit .env — fill in VERDANT_TENT_ID, VERDANT_BRIDGE_TOKEN, channel map
node scripts/ecowitt-live-soil-bridge.ts config validate --fix-hints
node scripts/ecowitt-live-soil-bridge.ts config validate --dry-run --out=./effective.json
```

For the full error-code catalog and machine-readable envelope shape, see [`docs/ecowitt-bridge-startup-validation.md`](./ecowitt-bridge-startup-validation.md).
