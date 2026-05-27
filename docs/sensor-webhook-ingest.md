# Sensor Webhook Ingest

> This file is the Gate 2B spec alias. The full contract, payload examples,
> auth notes, source labels, bridge flows, and the explicit read-only
> safety statement live in [`v1-sensor-ingest.md`](./v1-sensor-ingest.md).
>
> Webhook sensor ingest is **read-only**. It never triggers alerts, the
> Action Queue, AI Doctor, or any device control. MQTT is supported only via
> a local bridge pattern (MQTT broker → Node-RED / Pi / ESP32 script →
> Verdant webhook); there is no Supabase-hosted MQTT subscriber.

See [`v1-sensor-ingest.md`](./v1-sensor-ingest.md) for:

- Endpoint purpose and full payload contract
- Auth model (Supabase Auth JWT, no client-trusted `user_id`)
- Allowed `source` labels (`webhook_generic`, `pi_bridge`,
  `node_red_bridge`, `esp32_*`, `home_assistant_bridge`, …)
- Validation ranges (temp, humidity, VPD, pH, EC, CO₂, PPFD)
- Idempotency / dedupe behavior
- Example bridge flows (ESP32, ESPHome, Home Assistant `rest_command`,
  Node-RED, Pi, MQTT-bridge)
