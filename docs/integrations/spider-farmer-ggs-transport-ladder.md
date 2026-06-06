# Spider Farmer GGS — Transport Ladder (ADR addendum)

Status: **experimental, docs+tests only.** This ADR locks the safe order
in which Verdant may move toward GGS-derived sensor telemetry. It is an
extension of `spider-farmer-ggs-backhaul-decision.md` and inherits all
of that document's read-only / no-device-control constraints.

Verdant is not an official Spider Farmer partner. Nothing here
implies endorsement, certification, or production-readiness. The GGS
integration is an experimental, read-only research path.

## Transport ladder

Verdant adopts a strict step ladder. Each rung must be observed,
documented, and validated before the next is attempted.

1. **GGS BLE read-only capture**
   - BLE notifications only.
   - No write characteristic use.
   - No setpoints.
   - No commands.
   - No device control.
   - Purpose: observe the real payload shape on a confirmed controller
     model, in a real tent, before any code path treats the data as
     truthful.

2. **Synthetic / demo MQTT adapter (first)**
   - All adapter payloads MUST carry `source=demo`.
   - Used to develop the bridge transport, queueing, and ingest path
     without pretending demo data is live telemetry.
   - Verdant's sensor-truth rules ensure demo data is never shown as
     healthy live evidence and never feeds AI Doctor as current
     telemetry.

3. **Validated live adapter (later, gated)**
   - `source=live` is allowed ONLY after ALL of the following are true:
     - exact controller model confirmed (firmware version recorded);
     - real BLE payload observed and decoded from that model;
     - timestamp and units validated against the controller / Spider
       Farmer app display;
     - readings compared against the controller / app display and
       within tolerance;
     - stale and invalid checks pass under Verdant's normalization
       rules (`sensorReadingNormalizationRules`).
   - Until every check passes, the adapter MUST continue to emit
     `source=demo` (or `source=invalid` when the payload is malformed).

## What MQTT means here

MQTT in this ladder refers to **Verdant-owned bridge transport**. It is
the protocol Verdant's own bridge would speak to its own ingest path.

It is **not a documented Spider Farmer local MQTT broker.** Spider
Farmer GGS controllers are not known to expose a documented local MQTT
broker for third-party use. Any reference to MQTT in this document is
about Verdant's bridge, not the controller.

## Out-of-scope fallback routes

The following are separate, optional fallback routes for compatible
non-GGS WiFi gear and are not the default GGS assumption:

- Tuya local API
- Tuya cloud API
- ESPHome flashing of compatible Tuya hardware

These routes do not apply to GGS controllers and must not be implied as
a GGS integration path. They are listed only to make the boundary
explicit.

## Safety fences (locked)

- Read-only at every rung. No setpoints, no commands, no actuation.
- No Supabase writes, no Edge Functions, no UI changes are introduced
  by this ADR.
- No Action Queue writes and no alerts are produced by GGS-derived data
  until a future, separately-approved slice.
- `source=live` is gated by validation, never by hope.
- Demo data is always labeled and never aggregates as healthy current
  evidence.

## Rollback

Delete this file and the matching test
(`src/test/spider-farmer-ggs-transport-ladder.test.ts`). No application
code depends on this ADR.
