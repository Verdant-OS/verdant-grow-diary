# EcoWitt-over-MQTT & Home Assistant Webhook — Field Mapping

> **Scope.** Field-by-field mapping and copy/paste payload examples for
> bridge clients sending EcoWitt-over-MQTT and Home Assistant webhook
> data into Verdant's `sensor-ingest-webhook` endpoint.
>
> Companion documents:
>
> - [`generic-bridge-client-guide.md`](./generic-bridge-client-guide.md) — endpoint, auth, idempotency, retries
> - [`bridge-client-retry-guidance.md`](./bridge-client-retry-guidance.md) — Full-Jitter retry policy
> - [`v1-sensor-ingest.md`](./v1-sensor-ingest.md) — full payload contract
> - [`sensor-truth-rules.md`](./sensor-truth-rules.md) — labeling rules
>
> Ingest is **read-only**. No alerts, no Action Queue writes, no
> automation, no device control are produced by this endpoint.

---

## In-app preview: Ingest Normalizer

Verdant ships an in-app debug screen for inspecting how a payload would
be normalized **without sending it anywhere**:

- **Route:** `/sensors/ingest-normalizer`
- **Page name:** Ingest Normalizer
- **Purpose:** Read-only payload preview / debug tool. Paste a JSON
  payload, click Parse, and see the canonical source, vendor lineage,
  accepted / skipped / rejected fields, and any ignored unsafe fields.
- **No network calls.** The screen runs entirely in the browser.
- **No ingest / write behavior.** Nothing is sent to the backend, no
  edge function is invoked, and no row is written.
- **No endpoints created.** This screen does not add a new ingest
  endpoint; the only ingest endpoint remains `sensor-ingest-webhook`.
- **Vendor is lineage-only.** The previewed `vendor` field is shown for
  traceability and is never used for auth, ownership, or routing.
- **Unknown labels fall back to safe display text.** Unrecognised source
  or vendor strings render as plain text and are not trusted for auth.

The previous internal slug for this screen is no longer used — always
link to `/sensors/ingest-normalizer`.

---

## 1. Endpoint, auth, idempotency

All bridges (EcoWitt-over-MQTT, Home Assistant, generic MQTT) post to the
same Edge Function:

```
POST {SUPABASE_URL}/functions/v1/sensor-ingest-webhook
Authorization: Bearer vbt_xxx…xxx
Content-Type: application/json
Idempotency-Key: <uuid-or-deterministic-hash>
```

- **Auth.** Only the bridge token (`vbt_…`) authorizes the write. The
  server resolves `user_id` and `tent_id` from the token. **Never send
  `service_role`, anon JWT, end-user JWT, or `user_id` from a bridge.**
- **Idempotency.** Reuse the same `Idempotency-Key` across retries of the
  same logical reading so the server deduplicates safely.

### `source` vs `vendor`

| Field | Trust | Used for |
|---|---|---|
| `source` | server-trusted classification | transport label persisted on the row |
| `vendor` | **lineage only** | preserved into `raw_payload.vendor` for traceability |

**Vendor is never used for auth, ownership, routing, or trust decisions.**
Anyone could claim `vendor: "ecowitt"` — only the bridge token proves who
the writer is.

---

## 2. EcoWitt-over-MQTT field mapping

EcoWitt gateways publish to MQTT; your local bridge (Node-RED, Pi, ESP32,
or similar) translates the topic frame into Verdant's webhook contract.

### Required envelope

| Verdant field | Required | Source | Notes |
|---|---|---|---|
| `tent_id` | yes | bridge config | UUID of the destination tent |
| `source` | yes | constant | `"mqtt"` |
| `vendor` | recommended | constant | `"ecowitt"` (lineage only) |
| `captured_at` | yes | EcoWitt frame timestamp | ISO 8601 UTC; never substitute "now" |
| `metadata.device_id` | recommended | EcoWitt gateway ID | e.g. `"ecowitt-gw-1"` |

### Metric mapping (common EcoWitt fields → Verdant)

| EcoWitt key | Verdant alias | Canonical metric | Unit / range |
|---|---|---|---|
| `tempinf` | `temp_f` | `temperature_c` | °F in → °C (range −10..60 °C) |
| `tempinc` | `temp_c` | `temperature_c` | °C (−10..60) |
| `humidityin` | `humidity_pct` | `humidity_pct` | % (0..100) |
| `soilmoisture1` | `soil_moisture_pct` | `soil_moisture_pct` | % (0..100) |
| `tf_co2` / `co2` | `co2_ppm` | `co2_ppm` | ppm (250..5000) |
| `solarradiation` | — | **do not map to PPFD** | lux/W·m⁻² ≠ PPFD; omit |

> **Never lux-convert to PPFD.** Lux→PPFD depends on the light spectrum
> and is unreliable. If the EcoWitt sensor does not measure PPFD
> directly, omit `ppfd`.

### Copy/paste example — temperature, humidity, CO₂

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "mqtt",
  "vendor": "ecowitt",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "device_id": "ecowitt-gw-1" },
  "metrics": {
    "temp_c": 24.7,
    "humidity_pct": 58.0,
    "co2_ppm": 820
  }
}
```

### Copy/paste example — soil moisture

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "mqtt",
  "vendor": "ecowitt",
  "captured_at": "2026-06-04T12:05:00Z",
  "metadata": { "device_id": "ecowitt-gw-1" },
  "metrics": {
    "soil_moisture_pct": 41.2
  }
}
```

### Copy/paste example — VPD (only if measured/derived by bridge)

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "mqtt",
  "vendor": "ecowitt",
  "captured_at": "2026-06-04T12:10:00Z",
  "metrics": {
    "temp_c": 24.7,
    "humidity_pct": 58.0,
    "vpd_kpa": 1.28
  }
}
```

If you do not compute VPD in the bridge, omit it — the server can derive
VPD from temperature and humidity. Do not fabricate VPD from leaf-temp
assumptions in the bridge.

---

## 3. Home Assistant webhook field mapping

Home Assistant integrations typically use a `rest_command` template to
post sensor state changes to Verdant. The HA bridge token belongs in
`secrets.yaml`; never paste it in dashboards or shared automations.

### Required envelope

| Verdant field | Required | Source | Notes |
|---|---|---|---|
| `tent_id` | yes | `rest_command` config | UUID of the destination tent |
| `source` | yes | constant | `"webhook"` |
| `vendor` | recommended | constant | `"home_assistant"` (lineage only) |
| `captured_at` | yes | `{{ states.<entity>.last_changed }}` | ISO 8601 UTC |
| `metadata.entity_id` | recommended | HA entity id | e.g. `"sensor.tent_a_temp"` |

### Metric mapping (common HA `device_class` → Verdant)

| HA `device_class` / state | Verdant alias | Canonical | Unit / range |
|---|---|---|---|
| `temperature` (°C) | `temperature_c` | `temperature_c` | °C (−10..60) |
| `temperature` (°F) | `temp_f` | `temperature_c` | °F → °C (range −10..60 °C) |
| `humidity` | `humidity_pct` | `humidity_pct` | % (0..100) |
| `carbon_dioxide` | `co2_ppm` | `co2_ppm` | ppm (250..5000) |
| `moisture` (soil) | `soil_moisture_pct` | `soil_moisture_pct` | % (0..100) |
| `ph` | `ph` | `ph` | 3..10 |
| `conductivity` (mS/cm) | `ec_ms_cm` | `ec` | 0..10 |
| `illuminance` (lux) | — | **do not map to PPFD** | lux ≠ PPFD; omit |

### Copy/paste example — temperature & humidity (Home Assistant)

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "webhook",
  "vendor": "home_assistant",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "entity_id": "sensor.tent_a_temp" },
  "metrics": {
    "temperature_c": 24.7,
    "humidity_pct": 58.0
  }
}
```

### Copy/paste example — VPD (when HA has a derived VPD sensor)

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "webhook",
  "vendor": "home_assistant",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "entity_id": "sensor.tent_a_vpd" },
  "metrics": {
    "vpd_kpa": 1.28
  }
}
```

### Copy/paste example — soil + EC

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "webhook",
  "vendor": "home_assistant",
  "captured_at": "2026-06-04T12:05:00Z",
  "metadata": { "entity_id": "sensor.tent_a_soil" },
  "metrics": {
    "soil_moisture_pct": 41.2,
    "ec_ms_cm": 1.6
  }
}
```

### Copy/paste example — CO₂

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "webhook",
  "vendor": "home_assistant",
  "captured_at": "2026-06-04T12:10:00Z",
  "metadata": { "entity_id": "sensor.tent_a_co2" },
  "metrics": {
    "co2_ppm": 820
  }
}
```

### Copy/paste example — PPFD (only if a real PAR/PPFD sensor exists)

```json
{
  "tent_id": "00000000-0000-4000-8000-000000000001",
  "source": "webhook",
  "vendor": "home_assistant",
  "captured_at": "2026-06-04T12:15:00Z",
  "metadata": { "entity_id": "sensor.tent_a_ppfd" },
  "metrics": {
    "ppfd": 612
  }
}
```

If HA only exposes lux, **omit PPFD entirely**. The server will not
synthesize PPFD from lux, and the bridge must not either.

---

## 4. Hard rules for bridge clients

- ❌ **Never trust `user_id` from the payload.** Bridges must not send
  `user_id`; the server resolves ownership from the bridge token.
- ✅ **Always preserve `captured_at`.** Use the original sensor
  timestamp in ISO 8601 UTC. Do not substitute "now" when forwarding
  buffered or replayed readings.
- ✅ **Preserve `raw_payload`.** The server persists the sanitized
  inbound payload as lineage. Strip secrets before sending; do not strip
  measurement fields.
- ❌ **No device commands.** This endpoint does not control fans,
  lights, pumps, heaters, humidifiers, dehumidifiers, dosing, or
  irrigation. Bridges must not send device-control intents through it.
- ❌ **No alerts.** Bridges do not write to the alerts table. Alert
  evaluation is server-side.
- ❌ **No Action Queue writes.** The Action Queue is grower-approved
  only; bridges never create suggested or approved actions.
- ❌ **No automation triggers.** Bridges do not invoke AI Doctor, do
  not start automations, and do not change tent targets.
