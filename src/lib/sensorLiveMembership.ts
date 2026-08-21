/**
 * sensorLiveMembership — documents the four intentional "live"-related
 * membership tables left after #584 (transport language fix).
 *
 * Pure. No I/O. No React. Deterministic.
 *
 * These are NOT four competing definitions of "healthy live data." Each
 * answers a different question:
 *
 * 1. RECEIVING_TRANSPORT_SOURCES — "is the pipe delivering packets?"
 *    Transport freshness only. Never a verified-live claim. (#584 badge:
 *    "Receiving data — unverified source")
 *
 * 2. LIVE_WINDOW_ALIASES — "which provenance uses the 15-minute current-
 *    state window?" Window selection only; never upgrades to trust label
 *    `live`. Owned by sensorTruthCanon LIVE_ALIASES (re-exported shape).
 *
 * 3. VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES — "may snapshotFromReadings claim
 *    aggregate source `live`?" Only rows that literally prove live-class
 *    ingest (`live` | `pi_bridge`) and are not testbench.
 *
 * 4. TRUST_LIVE_ALIASES — "what normalizes to trust label `live`?" Used by
 *    normalizeSensorSource. Only `live` is isHealthySensorSource.
 *
 * Prefer importing these named sets over inventing a fifth local list.
 */

/** (1) Transport-receiving membership — proves pipe only, never verified live. */
export const RECEIVING_TRANSPORT_SOURCES: ReadonlySet<string> = new Set([
  "live",
  "ecowitt",
  "webhook",
  "webhook_generic",
  "pi_bridge",
  "node_red_bridge",
  "home_assistant_bridge",
  "ha_forwarded",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
  "mqtt",
]);

/**
 * (2) Provenance labels that use the live 15-minute current-state window.
 * Keep in sync with sensorTruthCanon LIVE_ALIASES (string list form for
 * set membership tests without importing the classifier).
 */
export const LIVE_WINDOW_ALIASES: ReadonlySet<string> = new Set([
  "live",
  "pi_bridge",
  "pi-bridge",
  "mqtt",
  "ecowitt",
  "ecowitt_api",
  "ecowitt_mqtt",
  "bridge",
  "webhook",
  "ggs",
  "ggs_controller",
  "home_assistant",
  "ha",
]);

/**
 * (3) Row sources that may participate in a verified aggregate `live`
 * snapshot claim (see sensorSnapshot.snapshotFromReadings allLive gate).
 */
export const VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES: ReadonlySet<string> = new Set([
  "live",
  "pi_bridge",
]);

/**
 * (4) Trust-label aliases that normalizeSensorSource maps to `live`.
 * Unknown tokens must never appear here.
 *
 * Display vs trust-live: these aliases affect trust normalization and
 * health fences only. User-visible Source labels must still go through
 * `resolveSensorSourceDisplayCanon` / `sensorSourceLabel` so vendor and
 * bridge tokens never render as the Source word (provenance is separate).
 * First-party bridge tokens such as `pi_bridge` may also normalize to
 * `live` via `sensorSourceRules` ALIAS for trust — that is not a sixth
 * display source.
 */
export const TRUST_LIVE_ALIASES: ReadonlySet<string> = new Set(["live", "sensor", "realtime"]);

export function isReceivingTransportSource(source: string | null | undefined): boolean {
  if (source == null) return false;
  return RECEIVING_TRANSPORT_SOURCES.has(String(source).trim().toLowerCase());
}

export function isVerifiedSnapshotLiveRowSource(source: string | null | undefined): boolean {
  if (source == null) return false;
  return VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES.has(String(source).trim().toLowerCase());
}

export type LiveMembershipRole =
  "receiving_transport" | "live_window" | "verified_snapshot_row" | "trust_live_alias";

/**
 * Classify which live-related membership role(s) a raw source token hits.
 * Empty array = none (never invent live membership).
 */
export function classifyLiveMembershipRoles(
  source: string | null | undefined,
): LiveMembershipRole[] {
  if (source == null) return [];
  const raw = String(source).trim().toLowerCase();
  if (!raw) return [];
  const roles: LiveMembershipRole[] = [];
  if (RECEIVING_TRANSPORT_SOURCES.has(raw)) roles.push("receiving_transport");
  if (LIVE_WINDOW_ALIASES.has(raw)) roles.push("live_window");
  if (VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES.has(raw)) roles.push("verified_snapshot_row");
  if (TRUST_LIVE_ALIASES.has(raw)) roles.push("trust_live_alias");
  return roles;
}
