# Ecowitt PC Dry-Run Runbook

A short, operator-friendly checklist for running the real PC pipeline from a
local Ecowitt gateway all the way to a **clean Verdant dry-run report** — and
only then sending live.

```
Ecowitt gateway ─► ecowitt2mqtt ─► Mosquitto ─► MQTT Explorer ─► Verdant dry-run ─► (gated) live ingest
```

> Live ingest goes **only** through Verdant's existing validated
> `sensor-ingest-webhook`. This workflow performs **no direct database writes**,
> uses **no `service_role`**, writes **no Action Queue / alerts**, and runs
> **no device control or automation**. The dry-run makes **no network call**.

For the deeper reference (env vars, sample payloads, troubleshooting), see
[`ecowitt-mqtt-local-bridge.md`](./ecowitt-mqtt-local-bridge.md).

---

## A. Required local tools

| Tool             | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| **Mosquitto**    | Local MQTT broker on `127.0.0.1:1883`                |
| **ecowitt2mqtt** | Receives Ecowitt custom uploads, publishes to MQTT   |
| **MQTT Explorer**| Eyeball the `ecowitt/grow` topic before sending      |
| **Verdant repo** | This repo, with **Bun** installed (`bun --version`)  |

---

## B. Start the local pipeline

```bash
# Terminal 1 — MQTT broker (verbose so you can watch connections)
mosquitto -v

# Terminal 2 — Ecowitt → MQTT bridge
ecowitt2mqtt --mqtt-broker 127.0.0.1 --mqtt-port 1883 --mqtt-topic ecowitt/grow
```

Leave both running.

---

## C. Ecowitt app settings (Customized upload)

| Setting     | Value                                            |
| ----------- | ------------------------------------------------ |
| Protocol    | **Ecowitt** / custom upload                      |
| Server / IP | Your PC's local **IPv4** (e.g. `192.168.x.x`)    |
| Port        | The port **ecowitt2mqtt** is listening on        |
| Path        | `/data/report`                                   |
| Interval    | `60` seconds                                     |

The gateway and the PC must be on the same LAN.

---

## D. Confirm in MQTT Explorer

1. Connect to `127.0.0.1:1883`.
2. Subscribe / watch `ecowitt/#`.
3. Confirm the target topic **`ecowitt/grow`** receives a fresh payload.

Do not continue until a real `ecowitt/grow` payload is visible here.

---

## E. Run the Verdant dry-run

Dry-run **first** — it normalizes and previews only, and makes **no network
call and no database write**.

```bash
# Built-in fresh sample (no MQTT needed) — sanity check the runner
bun run dev:ecowitt-mqtt:dry-run -- --sample --once

# Real payload from your local MQTT broker
bun run dev:ecowitt-mqtt:dry-run -- --once

# Same, but also write a redacted report file for review
bun run dev:ecowitt-mqtt:dry-run -- --once --write-report
```

`--write-report` writes only a **redacted** report to
`./tmp/ecowitt-last-ingest-report.json` (token already redacted).

---

## F. What to paste back for review

```text
Topic: ecowitt/grow
Redacted payload:
{ ... }
Dry-run report:
{ ... }
```

---

## G. What to NEVER paste

- **`VERDANT_BRIDGE_TOKEN`** — never paste the bridge token, anywhere.
- Supabase **service keys** / `service_role`.
- Any private env values.
- Raw, unredacted, token-bearing reports.

The runner always redacts the token to `vbt_…(redacted, len=NN)`. If you ever
see a full token in output, **stop** and rotate it.

---

## H. When live send is allowed

Only send live **after** the dry-run report confirms **all** of:

- Fresh timestamp (not stale, not future).
- Valid `temp` / `humidity` / `soil` / `CO2` values.
- **No** `invalid` / `stale` classification.
- Trust would resolve to **Live only through `fresh_live`**.
- The redacted report is clean.

If any of these fail, do not send live — fix the source first.

---

## I. Real send command

Gated strictly behind a clean dry-run (section H):

```bash
bun run dev:ecowitt-mqtt -- --once
```

This is the only command that performs a network call, and it posts **only**
to `VERDANT_INGEST_URL` (the validated webhook). It still refuses to POST
stale/invalid telemetry as live.

---

## J. Verify in Verdant

- **Provider chip:** Ecowitt.
- **Trust badge:** **Live** only if fresh + valid.
- **Stale / Invalid** snapshots are **never attachable** as live context.
- Quick Log snapshot strip shows the correct badge (trust badge rendered
  separately from the provider chip).

---

## Safety summary

- ✅ Dry-run makes **no network call** and **no direct database writes**.
- ✅ Bridge token is always redacted; never paste it.
- ✅ Live send only after a clean dry-run, only to the validated webhook.
- ✅ Stale / invalid / unknown telemetry is **never** promoted to Live.
- ❌ No `service_role`, no auth-admin, no Edge/RLS/schema changes here.
- ❌ No Action Queue writes, no alerts, no device control, no automation.
