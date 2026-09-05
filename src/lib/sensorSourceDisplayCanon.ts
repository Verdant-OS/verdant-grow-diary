/**
 * sensorSourceDisplayCanon — display-only source / provenance split.
 *
 * Visible `source` labels are always one of the six canonical trust labels
 * produced by `normalizeSensorSource`. Vendor / bridge / app / transport
 * tokens (`pi_bridge`, `home_assistant`, `eco_witt`, …) never appear as the
 * Source label; they belong in a separate provenance string only.
 *
 * This module does not change ingest write paths, membership tables, or
 * trust-live alias sets. It only formats what the grower sees.
 *
 * Pure. No I/O. No React. Deterministic.
 */

import { isCanonicalSensorSource } from "@/constants/sensorIngestProvenance";
import {
  isHealthySensorSource,
  normalizeSensorSource,
  sensorSourceLabel,
  type SensorSource,
} from "@/lib/sensor/sensorSourceRules";

export interface SensorSourceDisplayCanon {
  /** Canonical trust/state class after normalizeSensorSource. */
  canonical: SensorSource;
  /** Grower-facing Source label — never a vendor/bridge/app token. */
  sourceLabel: string;
  /**
   * Optional provenance copy for the raw token when it is not already a
   * canonical source word. Never used as the Source label.
   */
  provenanceLabel: string | null;
  /** Lower-cased raw token when a non-empty string was supplied. */
  rawToken: string | null;
  /** True only when canonical === "live" (never for demo/stale/invalid/…). */
  isHealthyLive: boolean;
}

/**
 * Humanized provenance for known non-canonical raw tokens.
 * Presentation-only — does not expand the canonical source set.
 */
const PROVENANCE_ALIAS_LABELS: Readonly<Record<string, string>> = {
  pi_bridge: "Pi bridge",
  "pi-bridge": "Pi bridge",
  raspberry_pi_bridge: "Raspberry Pi bridge",
  home_assistant: "Home Assistant",
  home_assistant_bridge: "Home Assistant",
  ha: "Home Assistant",
  ha_forwarded: "Home Assistant",
  eco_witt: "EcoWitt",
  ecowitt: "EcoWitt",
  ecowitt_api: "EcoWitt",
  ecowitt_mqtt: "EcoWitt",
  spider_farmer_ggs: "Spider Farmer GGS",
  ggs: "Spider Farmer GGS",
  ggs_controller: "Spider Farmer GGS",
  ggs_api: "Spider Farmer GGS",
  ggs_export: "Spider Farmer GGS",
  esp32_bridge: "ESP32 bridge",
  esp32_arduino: "ESP32",
  esp32_arduino_sht31: "ESP32 (SHT31)",
  esp32_esphome: "ESPHome",
  esp32_mqtt_bridge: "MQTT bridge",
  mqtt: "MQTT",
  mqtt_esp32: "MQTT",
  webhook: "Webhook",
  webhook_generic: "Webhook",
  node_red_bridge: "Node-RED bridge",
  ble: "BLE",
  api: "API",
  bridge: "Bridge",
  sensor: "Sensor alias",
  realtime: "Realtime alias",
};

function readRawToken(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function provenanceLabelForRawToken(rawToken: string | null): string | null {
  if (!rawToken) return null;
  // Canonical source words are the Source label — no separate provenance.
  if (isCanonicalSensorSource(rawToken)) return null;
  const known = PROVENANCE_ALIAS_LABELS[rawToken];
  if (known) return known;
  // Unknown non-canonical tokens stay out of the Source label. Prefer a
  // calm generic provenance line over echoing raw vendor-ish tokens as
  // if they were a sixth source class.
  return "External ingest";
}

/**
 * Resolve the display-only source/provenance canon for any raw source token.
 *
 * Invariants:
 *  - `sourceLabel` is always `sensorSourceLabel(normalizeSensorSource(raw))`.
 *  - `manual` / `csv` / `demo` / `stale` / `invalid` never become live here.
 *  - Raw `pi_bridge` / `home_assistant` never appear as the Source label.
 */
export function resolveSensorSourceDisplayCanon(rawSource: unknown): SensorSourceDisplayCanon {
  const rawToken = readRawToken(rawSource);
  const canonical = normalizeSensorSource(rawSource);
  return {
    canonical,
    sourceLabel: sensorSourceLabel(canonical),
    provenanceLabel: provenanceLabelForRawToken(rawToken),
    rawToken,
    isHealthyLive: isHealthySensorSource(canonical),
  };
}

/** Convenience: Source label only (canonical six). */
export function formatSensorSourceDisplayLabel(rawSource: unknown): string {
  return resolveSensorSourceDisplayCanon(rawSource).sourceLabel;
}

/**
 * Optional combined line for presenters that only have one string slot.
 * Source stays canonical; provenance is appended after a middle dot when
 * present. Never invents a vendor name as the Source word.
 */
export function formatSensorSourceDisplayWithProvenance(rawSource: unknown): string {
  const { sourceLabel, provenanceLabel } = resolveSensorSourceDisplayCanon(rawSource);
  if (!provenanceLabel) return sourceLabel;
  return `${sourceLabel} · ${provenanceLabel}`;
}
