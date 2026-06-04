/**
 * EcoWitt routed row builder — pure helper.
 *
 * Given a raw EcoWitt payload, a precomputed PASSKEY fingerprint, and the
 * caller's eligible tents (already scoped to the bridge token's tent or to
 * the JWT user's tents by the edge function), produce:
 *
 *   - a list of `sensor_readings`-shaped rows ready to insert
 *   - a safe summary the edge function can return as JSON
 *
 * What this helper does NOT do (stop-ship if violated):
 *  - No fetch, no DB client, no auth, no wall-clock reads (caller injects
 *    `capturedAt`).
 *  - Never authenticates the request via PASSKEY/MAC. Auth is the caller's
 *    job. PASSKEY is used only as a fingerprint match.
 *  - Never stores raw PASSKEY/MAC/token/auth fields in `raw_payload`. Only
 *    the safe fingerprint and per-channel mapping context.
 *  - Never emits alerts, Action Queue items, AI calls, or device-control
 *    commands. Never marks data as "live" beyond `source = 'ecowitt'` (the
 *    existing source label — Verdant's freshness/suspicion layer decides
 *    "live" vs "stale" downstream).
 *  - Never fans out across tents the caller does not own. The router rejects
 *    mismatched fingerprints; callers MUST also pre-filter tents to the
 *    authenticated principal.
 */

import {
  routeEcoWittPayloadToTents,
  type EcoWittRouterEligibleTent,
  type EcoWittRouterReading,
  type EcoWittRouterResult,
} from "@/lib/ecowittChannelTentRouter";
import { calculateAirVpdKpa } from "@/lib/vpdRules";

export type EcoWittRoutedMetric =
  | "temperature_c"
  | "humidity_pct"
  | "soil_moisture_pct"
  | "vpd_kpa";

export interface EcoWittRoutedRawPayload {
  provider: "ecowitt";
  channel: number;
  mapping_type: "air" | "soil";
  /** Lowercased payload key (e.g. "temp1f"). Never a credential key. */
  raw_key: string;
  /** Original payload value, coerced to string. Never a credential value. */
  raw_value: string;
  /** Safe one-way fingerprint of the gateway PASSKEY. */
  passkey_fingerprint: string;
  /** True for derived rows (VPD). */
  calculated?: true;
  /**
   * For derived rows (e.g. vpd_kpa), the lowercased payload keys this row
   * was computed from. Pure metadata in raw_payload — no schema change.
   */
  derived_from?: string[];
}

export interface EcoWittRoutedRow {
  user_id: string;
  tent_id: string;
  source: "ecowitt";
  metric: EcoWittRoutedMetric;
  value: number;
  captured_at: string;
  quality: "ok";
  raw_payload: EcoWittRoutedRawPayload;
}

export interface EcoWittRoutedBuildSummary {
  accepted: boolean;
  rows_built: number;
  per_tent: Array<{ tent_id: string; rows: number }>;
  dropped: Array<{
    channel_key: string;
    channel: number | null;
    metric: string | null;
    reason: string;
  }>;
  matched_fingerprint: string | null;
}

export interface EcoWittRoutedBuildInput {
  userId: string;
  payload: Record<string, unknown>;
  payloadPasskeyFingerprint: string | null;
  eligibleTents: EcoWittRouterEligibleTent[];
  capturedAt: string;
}

export interface EcoWittRoutedBuildResult {
  rows: EcoWittRoutedRow[];
  summary: EcoWittRoutedBuildSummary;
}

/** Lowercase a value for raw_value storage. Caps at 64 chars defensively. */
function safeRawValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  return s.length > 64 ? s.slice(0, 64) : s;
}

export function buildEcoWittRoutedRows(
  input: EcoWittRoutedBuildInput,
): EcoWittRoutedBuildResult {
  const router: EcoWittRouterResult = routeEcoWittPayloadToTents({
    payload: input.payload,
    eligibleTents: input.eligibleTents,
    payloadPasskeyFingerprint: input.payloadPasskeyFingerprint,
  });

  const rows: EcoWittRoutedRow[] = [];
  const perTent: Array<{ tent_id: string; rows: number }> = [];
  const fingerprint = router.matched_fingerprint;

  // We also need to remember which channel a value came from inside the
  // input.payload (lowercased) so we can echo it as raw_key/raw_value
  // without falling back to a credential key. The router preserves
  // source_channel_key on each reading for exactly this.
  const lowerPayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.payload)) {
    lowerPayload[k.toLowerCase()] = v;
  }

  for (const group of router.groups) {
    let groupRowCount = 0;

    // Index channel → reading for VPD derivation.
    const byChannel = new Map<
      number,
      Partial<Record<"temperature_c" | "humidity_pct", EcoWittRouterReading>>
    >();

    for (const r of group.readings) {
      // Skip if the metric somehow isn't a Verdant-canonical one.
      if (
        r.metric !== "temperature_c" &&
        r.metric !== "humidity_pct" &&
        r.metric !== "soil_moisture_pct"
      ) {
        continue;
      }

      const mappingType: "air" | "soil" =
        r.metric === "soil_moisture_pct" ? "soil" : "air";

      rows.push({
        user_id: input.userId,
        tent_id: group.tent_id,
        source: "ecowitt",
        metric: r.metric,
        value: r.value,
        captured_at: input.capturedAt,
        quality: "ok",
        raw_payload: {
          provider: "ecowitt",
          channel: r.channel,
          mapping_type: mappingType,
          raw_key: r.source_channel_key,
          raw_value: safeRawValue(lowerPayload[r.source_channel_key]),
          passkey_fingerprint: fingerprint as string,
        },
      });
      groupRowCount += 1;

      if (mappingType === "air") {
        const slot = byChannel.get(r.channel) ?? {};
        if (r.metric === "temperature_c") slot.temperature_c = r;
        else if (r.metric === "humidity_pct") slot.humidity_pct = r;
        byChannel.set(r.channel, slot);
      }
    }

    // Derive VPD ONLY when the same air channel produced both a valid
    // temperature and a valid humidity reading routed to this tent.
    for (const [channel, slot] of byChannel.entries()) {
      if (!slot.temperature_c || !slot.humidity_pct) continue;
      const vpd = calculateAirVpdKpa({
        tempC: slot.temperature_c.value,
        rhPercent: slot.humidity_pct.value,
      });
      if (vpd === null) continue;

      rows.push({
        user_id: input.userId,
        tent_id: group.tent_id,
        source: "ecowitt",
        metric: "vpd_kpa",
        value: vpd,
        captured_at: input.capturedAt,
        quality: "ok",
        raw_payload: {
          provider: "ecowitt",
          channel,
          mapping_type: "air",
          raw_key: `derived:vpd_kpa:ch${channel}`,
          raw_value: "",
          passkey_fingerprint: fingerprint as string,
          calculated: true,
          derived_from: [
            slot.temperature_c.source_channel_key,
            slot.humidity_pct.source_channel_key,
          ],
        },
      });
      groupRowCount += 1;
    }

    perTent.push({ tent_id: group.tent_id, rows: groupRowCount });
  }

  const summary: EcoWittRoutedBuildSummary = {
    accepted: rows.length > 0,
    rows_built: rows.length,
    per_tent: perTent,
    dropped: router.dropped.map((d) => ({
      channel_key: d.channel_key,
      channel: d.channel,
      metric: d.metric,
      reason: d.reason,
    })),
    matched_fingerprint: router.matched_fingerprint,
  };

  return { rows, summary };
}
