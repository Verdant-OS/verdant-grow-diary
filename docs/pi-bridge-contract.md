# Verdant ↔ Raspberry Pi Bridge Contract

**Version:** 1.0.0 · **Status:** Draft · **Owner:** Verdant Platform

The Pi is the edge agent that owns the grow room. It reads sensors, captures
camera frames, and actuates equipment (lights, fans, pumps, valves). Verdant
(the web app) is the command center — it never talks to equipment directly.
Supabase is the single source of truth between them.

```text
┌──────────────┐   HTTPS/WSS   ┌──────────────┐   HTTPS+MQTT   ┌──────────────┐   GPIO/USB/Zigbee
│   Verdant    │ ─────────────▶│   Supabase   │◀──────────────▶│ Raspberry Pi │ ───────────────────▶ Equipment
│  (browser)   │◀───realtime───│ (db + auth + │   (bridge)     │   (agent)    │◀─────────────────── Sensors / Cameras
└──────────────┘    storage)   └──────────────┘                └──────────────┘
```

The Pi is a **trusted device identity**, not a user. It authenticates with a
long-lived service token, writes telemetry, and consumes a command queue.

---

## 1. Identity & auth

| Concept | Value |
|---|---|
| Device identity | row in `devices` keyed by `device_id` (UUID) |
| Credential | `device_token` (opaque, 256-bit, hashed at rest) |
| Transport auth | `Authorization: Bearer <device_jwt>` |
| JWT issuance | Edge function `pi-auth` exchanges `device_token` → short-lived JWT (15 min) with claim `role=device`, `device_id=…`, `tent_ids=[…]` |
| Rotation | `device_token` rotatable by tent owner; old token revoked immediately |
| Pairing | User generates a one-time pairing code in Settings → Devices; Pi calls `POST /pi-pair` with code + hardware fingerprint to receive its `device_token` |

RLS policies key off `auth.jwt() ->> 'device_id'` and `tent_ids`. A device can
only read/write rows for tents it is bound to.

---

## 2. Transport

Two channels, chosen per payload:

- **HTTPS (Supabase Edge Functions + REST)** — control plane, batch telemetry,
  large blobs (camera snapshots). Idempotent, retryable.
- **MQTT over WSS (Supabase Realtime broadcast channel)** — live sensor stream,
  command fan-out, presence. Lossy by design; never the system of record.

Every record written via MQTT is also persisted via HTTPS within 60 s
(write-behind buffer on the Pi). MQTT is an accelerator, not storage.

---

## 3. Data model (Supabase tables the Pi touches)

| Table | Pi access | Purpose |
|---|---|---|
| `devices` | read self | identity, firmware, last_seen |
| `tents` | read bound | tent metadata (id, name, owner) |
| `equipment` | read bound, update `state` | lights, fans, pumps, valves |
| `sensor_readings` | insert | time-series telemetry |
| `camera_frames` | insert | snapshot rows (URL in storage) |
| `device_commands` | read pending, update `status` | command queue |
| `device_events` | insert | audit log (boot, errors, threshold trips) |

Storage buckets:
- `camera-frames/<tent_id>/<yyyy-mm-dd>/<hh-mm-ss>.jpg` — private, signed URL.
- `pi-logs/<device_id>/<date>.ndjson.gz` — diagnostic log uploads (opt-in).

All inserts include `schema_version` (int) for forward compatibility.

---

## 4. Telemetry (Pi → Verdant)

### 4.1 Sensor reading

`POST /functions/v1/pi-ingest-readings` (batch, ≤500 rows)

```json
{
  "device_id": "8a1b…",
  "schema_version": 1,
  "readings": [
    {
      "tent_id": "…",
      "sensor_id": "tent1-air-1",
      "metric": "temperature_c",
      "value": 24.6,
      "quality": "ok",
      "ts": "2026-05-16T12:00:00.000Z"
    }
  ]
}
```

`metric` enum: `temperature_c`, `humidity_pct`, `vpd_kpa`, `co2_ppm`,
`soil_moisture_pct`, `ec_ms_cm`, `ph`, `par_umol`, `lux`, `water_level_pct`,
`tank_temp_c`.

`quality` enum: `ok | degraded | stale | invalid`. Anything other than `ok`
must NOT be classified as a healthy reading downstream (per data-integrity rules).

**Live mirror (MQTT):**
- Topic: `tents/<tent_id>/sensors/<sensor_id>`
- Payload: same `reading` object, single row, QoS 0.

### 4.2 Camera frame

1. Pi requests a signed upload URL: `POST /functions/v1/pi-camera-upload-url`
   with `{ device_id, tent_id, camera_id, captured_at }`.
2. Pi `PUT`s the JPEG to the returned URL.
3. Pi confirms: `POST /functions/v1/pi-camera-frame` with
   `{ camera_id, tent_id, captured_at, storage_path, width, height, bytes, sha256 }`.

Max frame: 5 MB. Recommended cadence: 1/min during lights-on, 1/5 min otherwise.

### 4.3 Device event / audit

`POST /functions/v1/pi-events` — boot, firmware update, sensor offline, command
failures. Append-only. Sensitive transitions (equipment forced off, safety trip)
must include `severity` and structured `meta`.

---

## 5. Commands (Verdant → Pi)

Verdant never pushes to the Pi. The Pi pulls/subscribes.

### 5.1 Command row

```sql
device_commands (
  id uuid pk,
  device_id uuid not null,
  tent_id uuid not null,
  equipment_id uuid,
  kind text not null,         -- 'set_light' | 'set_fan' | 'pulse_pump' | 'snapshot' | 'reboot' | 'sync_clock' | 'update_firmware'
  payload jsonb not null,
  issued_by uuid not null,    -- user id
  issued_at timestamptz default now(),
  expires_at timestamptz not null,
  status text not null default 'pending',  -- pending | acked | running | done | failed | expired
  attempts int default 0,
  result jsonb,
  schema_version int default 1
)
```

### 5.2 Delivery

- **Live:** MQTT topic `devices/<device_id>/commands` carries `{id, kind, payload}`.
- **Catch-up:** `GET /functions/v1/pi-commands?since=<ts>&status=pending` returns
  rows the Pi missed while offline.

### 5.3 Lifecycle (Pi obligations)

1. `ack` within 2 s of receipt → `PATCH … status=acked`.
2. Execute. While running → `status=running` with heartbeat every 10 s.
3. Terminal → `status=done|failed` with `result` (and `error_code` on failure).
4. Any command past `expires_at` is dropped and marked `expired`.
5. Commands are **idempotent by `id`**. Re-delivery must not double-execute.

### 5.4 Command catalog (v1)

| kind | payload | notes |
|---|---|---|
| `set_light` | `{ equipment_id, on: bool, intensity_pct?: 0–100 }` | dimming optional per fixture |
| `set_fan` | `{ equipment_id, speed_pct: 0–100 }` | |
| `pulse_pump` | `{ equipment_id, duration_ms: 100–60000, flow_ml?: int }` | safety-capped server-side |
| `set_schedule` | `{ equipment_id, schedule: [{start,end,value}…] }` | Pi runs locally if offline |
| `snapshot` | `{ camera_id }` | one-off frame |
| `sync_clock` | `{}` | NTP forced sync |
| `reboot` | `{ reason }` | audit-logged |
| `update_firmware` | `{ channel, version }` | Pi fetches signed bundle |

Safety: server-side validators reject obviously unsafe payloads (pump duration
> 60 s, intensity outside 0–100, schedules with overlapping windows). The Pi
revalidates locally and refuses on mismatch.

---

## 6. Presence & health

- Pi publishes retained MQTT message on `devices/<device_id>/presence` with
  `{ online: true, ts, fw_version }` on connect; LWT clears it on disconnect.
- Pi `PATCH`es `devices.last_seen` every 60 s via HTTPS as the durable signal.
- Verdant flags a device `offline` after 3 missed heartbeats (≥180 s).
- A device considered offline must NOT have its last reading shown as "live"
  on the dashboard — display `stale` chip per data-integrity rules.

---

## 7. Offline behavior (Pi)

- Local SQLite ring buffer for ≥7 days of readings at 1 Hz/sensor.
- Local schedule cache: lights/fans keep running on the last known schedule.
- Backfill on reconnect via `pi-ingest-readings` in 500-row batches, oldest first.
- Safety stop: if no command channel for >30 min AND a pump command is pending,
  refuse to execute on reconnect unless `expires_at` is still in the future.

---

## 8. Versioning & compatibility

- Every payload carries `schema_version`. Server accepts current and previous
  major version; deprecates with 90-day notice via `device_events`.
- Firmware advertises supported `schema_version` range in `pi-auth` response;
  the Pi degrades gracefully if asked for a newer one.

---

## 9. Security

- Device tokens hashed (argon2id) at rest. Plain token shown once on pairing.
- All HTTPS endpoints require `Authorization: Bearer <device_jwt>` and verify
  `device_id` matches the path/body.
- MQTT ACLs: a device may only publish to `tents/<bound_tent>/…` and
  `devices/<self>/…`; subscribe to `devices/<self>/commands`.
- Storage uploads use short-lived signed URLs (≤5 min) bound to `device_id` +
  `content-type: image/jpeg` + max size.
- Rate limits per device (defaults): readings 2000/min, commands ack 600/min,
  frames 60/min. Excess → 429 + event row.
- Tampering: every command result includes the executing firmware's signed
  attestation when available.

---

## 10. Out of scope for v1

- Multi-tenant device sharing across owners (single owner per device).
- Direct LAN fallback (Pi ↔ browser without Supabase).
- Video streaming (frames only; RTSP planned for v2).
- OTA firmware rollback UI (manual via Settings → Devices).

---

## 11. Open questions

1. MQTT broker: Supabase Realtime broadcast vs. self-hosted Mosquitto behind an
   edge function proxy. Decision blocks 4.1/5.2.
2. Time-series storage: keep in Postgres + partitioning, or offload to a
   purpose-built TSDB once we exceed ~50 M rows.
3. Pairing UX: QR code vs. 6-digit code. Likely both.
4. Safety interlocks (e.g. "no pump while heater on"): policy engine on the Pi
   or server-side validation in edge function? Probably both, server authoritative.

---

## 12. Implementation checklist (next PRs)

- [ ] Migration: `devices`, `equipment`, `device_commands`, `device_events`,
      `camera_frames`, plus RLS keyed on JWT `device_id`/`tent_ids`.
- [ ] Edge functions: `pi-pair`, `pi-auth`, `pi-ingest-readings`,
      `pi-camera-upload-url`, `pi-camera-frame`, `pi-events`, `pi-commands`.
- [ ] Storage bucket: `camera-frames` (private) + signed-URL helper.
- [ ] Settings → Devices UI: pair, list, rotate token, revoke.
- [ ] Replace mock `useSensorReadings` with Supabase query + realtime channel.
- [ ] Tests: schema validation, idempotent command dispatch, RLS isolation,
      stale/quality classification, rate limits.
