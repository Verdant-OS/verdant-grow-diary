# ADR: Spider Farmer GGS Backhaul Strategy

**Status:** `Accepted for experimental read-only bridge`

**Date:** 2026-06-06

**Scope:** Verdant sensor bridge for Spider Farmer GGS controllers. This ADR governs the wireless backhaul strategy between the Verdant bridge hardware (Leaf / Gateway / Root) and the Verdant backend ingest path.

---

## Context

Verdant’s Spider Farmer GGS integration is an **experimental, read-only** bridge. The current hardware stack consists of:

- **Leaf nodes:** collect BLE sensor/controller data inside the grow tent.
- **Gateway nodes:** aggregate Leaf data and backhaul toward the Root.
- **Root node:** connects to the local network and forwards normalized payloads to Verdant.

Grow rooms are hostile 2.4 GHz environments (microwave ovens, Wi-Fi congestion, reflective metal surfaces, high humidity). Before jumping to more complex radio or protocol stacks, we will improve RF discipline and roaming stability.

---

## Decision

We accept the following escalation-oriented backhaul strategy:

1. **ESP-NOW / ESP-MESH first** — use Espressif’s existing 2.4 GHz mesh and connectionless broadcast primitives for Leaf → Gateway → Root relay.
2. **RF mitigation before protocol escalation** — fix placement, antenna orientation, clean power, channel discipline, and parent-roaming stability before adding buffering or switching transports.
3. **Go-Back-N before Selective Repeat** — if packet loss appears, add simple Go-Back-N buffering with small sequence numbers and a bounded replay window. Go-Back-N is easier to reason about, uses less RAM, and is usually sufficient for low-bandwidth sensor traffic.
4. **Raw LoRa point-to-point before LoRaWAN** — only if 2.4 GHz remains unstable after RF fixes and ESP-MESH tuning, consider raw LoRa P2P for the Gateway → Root backhaul segment. This is a targeted transport swap, not a full architecture rewrite.
5. **LoRaWAN deferred** — do not adopt LoRaWAN unless Verdant later needs many gateways, multi-site deployments, or managed network security / roaming / join-server infrastructure. For a few tents inside one building, LoRaWAN adds unnecessary network-server, key-management, and join complexity.

---

## Current Architecture

```
GGS BLE / controller data
        ↓
    Leaf (ESP32, BLE scanning)
        ↓  ESP-NOW / ESP-MESH
    Gateway (ESP32, aggregation + relay)
        ↓  ESP-NOW / ESP-MESH (or future raw LoRa P2P)
    Root (ESP32, Wi-Fi or Ethernet)
        ↓  MQTT / adapter contract
    Verdant normalizer (Supabase Edge Function or ingest)
        ↓
    Verdant sensor readings table
```

---

## Integration Boundaries

The integration remains:

- **Read-only** — Verdant does not write to the GGS controller.
- **Publish-only from bridge to Verdant** — the Root sends normalized payloads upward; there is no downward command channel.
- **No device control** — no fan, light, pump, heater, humidifier, or dosing commands are issued.
- **No setpoint writes** — temperature, humidity, light-schedule, or irrigation setpoints are not modified by Verdant.
- **No automation** — no closed-loop control runs on Verdant’s side for Spider Farmer hardware.

---

## Escalation Ladder

| Step | Action | Trigger |
|------|--------|---------|
| 1 | Placement, antenna orientation, clean power supply, fixed Wi-Fi channel discipline, reduce 2.4 GHz contention | Initial deployment or observed instability |
| 2 | ESP-MESH roaming stability tuning (parent-selection thresholds, RSSI hysteresis, layer-threshold tuning) | Parent flapping, routing table churn |
| 3 | Go-Back-N buffering (small sequence window, bounded retry counter, duplicate detection) | Measured packet loss > acceptable threshold |
| 4 | Selective Repeat only if loss is bursty and Go-Back-N retransmits waste bandwidth | Bursty loss patterns on packet-capture logs |
| 5 | Raw LoRa P2P for Gateway → Root backhaul segment | 2.4 GHz still unstable after steps 1–4 |
| 6 | LoRaWAN only for many gateways, multi-site, or managed-network requirements | Future business need, not current need |

---

## Rationale

- **Grow rooms are 2.4 GHz hostile.** Metal walls, ventilation ducts, high humidity, and Wi-Fi saturation create unpredictable multipath and interference. Physical fixes often outperform protocol changes.
- **Fix physical / RF causes before complex protocols.** Moving to a more sophisticated protocol without fixing antenna placement or power noise is premature optimization.
- **Sensor packets are tiny and infrequent.** A typical payload is tens of bytes sent every 30–300 seconds. Go-Back-N overhead is negligible for this duty cycle.
- **Go-Back-N is simpler and probably enough first.** It needs only a send buffer, a sequence number, and a timeout. On ESP32 with limited RAM, simplicity is a safety feature.
- **Selective Repeat is RAM-safe on ESP32 but more complex.** It requires per-packet state and larger buffers. We will adopt it only if packet captures prove bursty loss makes Go-Back-N wasteful.
- **Raw LoRa is useful only as a backhaul replacement, not a full architecture rewrite.** Swapping Gateway → Root from ESP-NOW to raw LoRa P2P preserves the rest of the stack (BLE → Leaf, MQTT → Verdant).
- **LoRaWAN adds unnecessary network-server / key / join complexity.** For a few tents in one building, joining, ADR, duty-cycle limits, and a network server are overkill. Defer until scale justifies it.

---

## Validation Guidance

Before escalating to the next step, collect and review:

- **ESP-NOW retry / NACK counts** — log `esp_now_send` return codes and retry events.
- **ESP-MESH parent changes and routing table events** — log `MESH_EVENT_PARENT_CONNECTED`, `MESH_EVENT_PARENT_DISCONNECTED`, layer changes, and routing-table size.
- **Packet loss** — count sent vs. acknowledged application-level sequence numbers.
- **Latency** — measure time from Leaf capture to Root MQTT publish.
- **Retransmits** — count Go-Back-N replay events and duplicate-sequence detections.
- **Stale buffered readings** — if buffering is active, track how long readings sit in the replay window and whether they are delivered past freshness thresholds.

All metrics should be logged locally (SD card, serial, or local syslog) and reviewed before protocol changes are justified.

---

## Sensor-Truth Warning

Buffered or relayed readings must preserve the **original `captured_at`** timestamp from the Leaf node. The Verdant normalizer must:

- Never make late buffered readings look fresh by overwriting `captured_at` with arrival time.
- Classify stale or delayed data honestly using the existing source labels (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`).
- Preserve `raw_payload` so that debugging can trace a reading back to its original bridge packet.

If a reading arrives more than 30 minutes after its `captured_at`, the normalizer should flag it `stale` and downgrade confidence.

---

## Non-Goals

The following are explicitly out of scope for this backhaul strategy:

- **No LoRaWAN now** — deferred until multi-gateway / multi-site needs arise.
- **No device control** — Verdant does not command Spider Farmer equipment.
- **No controller writes** — no setpoint, schedule, or configuration changes are sent to the GGS controller.
- **No automation** — no closed-loop algorithms running on Verdant for this hardware.
- **No high-frequency streaming** — sensor duty cycle remains low (tens of bytes every 30–300 seconds).
- **No production partnership claim** — this is an experimental, community-grade integration. It does not represent an official Spider Farmer partnership, certification, or production-ready product.

---

## Consequences

- Firmware developers should focus on RF discipline and ESP-MESH stability before adding buffering or new radios.
- If packet loss persists after RF fixes, Go-Back-N is the next approved increment.
- Raw LoRa P2P is approved only for the Gateway → Root segment and only after documented evidence from steps 1–4.
- LoRaWAN requires a future ADR with business justification, network-server selection, and security review.
- Verdant backend teams should assume payloads may arrive delayed or out of order and must normalize accordingly.
- The integration remains read-only; any future write or control capability requires a separate security and safety review.

---

## Related Documents

- `docs/integrations/spider-farmer-ggs.md` — integration overview and adapter contract
- `docs/integrations/fixtures/spider-farmer-ggs-sample-payloads.json` — synthetic sample payloads
- `src/lib/spiderFarmerGgsMappingRules.ts` — normalizer mapping rules
- `src/test/spider-farmer-ggs-mapping-rules.test.ts` — mapping rule tests
