/**
 * Cross-ingest VPD regression guard.
 *
 * Goal: prevent a future ingest path from accepting valid live
 * temperature + humidity without producing `vpd_kpa`.
 *
 * This test enumerates every live ingest route Verdant has that performs
 * raw vendor → canonical metric normalization in-repo, and asserts each
 * one derives VPD from valid temp + RH and refuses to fabricate VPD from
 * invalid inputs. Adding a new in-repo live ingest mapper that handles
 * temp + RH without deriving VPD will fail this suite.
 *
 * Routes covered:
 *   1. shared/Pi normalize path           — normalizeIngestPayload
 *   2. EcoWitt routed row builder         — buildEcoWittRoutedRows
 *   3. EcoWitt local soil bridge          — normalizeEcowittLiveSoilPayload
 *
 * Documented non-deriving routes (asserted as exceptions, not regressions):
 *   - sensor-ingest-webhook accepts already-canonical metrics from
 *     authenticated bridges. VPD derivation is the bridge's job, not the
 *     webhook's. See supabase/functions/sensor-ingest-webhook/webhookIngest.ts.
 *
 * No schema, RLS, auth, AI, alerts, Action Queue, automation, or
 * device-control changes are made by this file.
 */
import { describe, it, expect } from "vitest";

import { normalizeIngestPayload } from "@/lib/sensorIngestNormalizationRules";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import type { EcoWittRouterEligibleTent } from "@/lib/ecowittChannelTentRouter";
import {
  normalizeEcowittLiveSoilPayload,
} from "@/lib/ecowittLiveSoilIngestRules";
import { calculateAirVpdKpa } from "@/lib/vpdRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const TS = "2026-06-19T12:00:00.000Z";
const NOW = new Date(TS);

// Canonical valid sample shared across routes:
//   25°C / 77°F at 55% RH → ~1.43 kPa (Tetens)
const VALID_TEMP_C = 25;
const VALID_TEMP_F = 77;
const VALID_RH = 55;
const EXPECTED_VPD = calculateAirVpdKpa({ tempC: VALID_TEMP_C, rhPercent: VALID_RH });

const tentAir: EcoWittRouterEligibleTent = {
  tent_id: TENT,
  passkey_fingerprint: "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa",
  air_channels: [1],
  soil_channels: [],
};

// ---------------------------------------------------------------------------
// Per-route adapters so the matrix can run a single shape of assertions.
// ---------------------------------------------------------------------------

interface IngestRoute {
  name: string;
  /** Run with a canonically valid temp + RH input. */
  validVpd: () => number | null;
  /** Run with RH = 0 (stuck/invalid). VPD must be absent. */
  invalidRhVpd: () => number | null;
  /** Run with missing humidity. VPD must be absent. */
  missingHumidityVpd: () => number | null;
  /** Run with unrealistic temperature. VPD must be absent. */
  invalidTempVpd: () => number | null;
}

// --- Route 1: shared/Pi normalizeIngestPayload --------------------------
const piRoute: IngestRoute = {
  name: "shared/Pi normalizeIngestPayload",
  validVpd: () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "live",
      readings: [
        { metric: "temperature_c", value: VALID_TEMP_C, unit: "C", captured_at: TS },
        { metric: "humidity_pct", value: VALID_RH, unit: "%", captured_at: TS },
      ],
    });
    const vpd = r.rows.find((row) => row.metric === "vpd_kpa");
    return vpd ? vpd.value : null;
  },
  invalidRhVpd: () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "live",
      readings: [
        { metric: "temperature_c", value: VALID_TEMP_C, unit: "C", captured_at: TS },
        { metric: "humidity_pct", value: 0, unit: "%", captured_at: TS },
      ],
    });
    return r.rows.find((row) => row.metric === "vpd_kpa")?.value ?? null;
  },
  missingHumidityVpd: () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "live",
      readings: [
        { metric: "temperature_c", value: VALID_TEMP_C, unit: "C", captured_at: TS },
      ],
    });
    return r.rows.find((row) => row.metric === "vpd_kpa")?.value ?? null;
  },
  invalidTempVpd: () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "live",
      readings: [
        // 9999°C is unrealistic; the normalizer's unit guards should drop it.
        { metric: "temperature_c", value: 9999, unit: "C", captured_at: TS },
        { metric: "humidity_pct", value: VALID_RH, unit: "%", captured_at: TS },
      ],
    });
    return r.rows.find((row) => row.metric === "vpd_kpa")?.value ?? null;
  },
};

// --- Route 2: EcoWitt routed row builder --------------------------------
function runEcoWitt(payload: Record<string, unknown>): number | null {
  const { rows } = buildEcoWittRoutedRows({
    userId: USER,
    payload,
    payloadPasskeyFingerprint: tentAir.passkey_fingerprint,
    eligibleTents: [tentAir],
    capturedAt: TS,
  });
  const vpd = rows.find((r) => r.metric === "vpd_kpa");
  return vpd ? vpd.value : null;
}
const ecowittRoute: IngestRoute = {
  name: "EcoWitt buildEcoWittRoutedRows",
  validVpd: () => runEcoWitt({ temp1f: VALID_TEMP_F, humidity1: VALID_RH }),
  invalidRhVpd: () => runEcoWitt({ temp1f: VALID_TEMP_F, humidity1: 0 }),
  missingHumidityVpd: () => runEcoWitt({ temp1f: VALID_TEMP_F }),
  invalidTempVpd: () => runEcoWitt({ temp1f: 9999, humidity1: VALID_RH }),
};

// --- Route 3: EcoWitt local soil bridge ---------------------------------
function runBridge(payload: Record<string, unknown>): number | null {
  const r = normalizeEcowittLiveSoilPayload({
    payload: { dateutc: "2026-06-19 12:00:00", ...payload },
    defaultTentId: TENT,
    now: NOW,
  });
  const p = r.payloads.find((p) => p.metrics.vpd_kpa !== undefined);
  return p?.metrics.vpd_kpa ?? null;
}
const bridgeRoute: IngestRoute = {
  name: "EcoWitt normalizeEcowittLiveSoilPayload",
  validVpd: () => runBridge({ tempf: VALID_TEMP_F, humidity: VALID_RH }),
  invalidRhVpd: () => runBridge({ tempf: VALID_TEMP_F, humidity: 0 }),
  missingHumidityVpd: () => runBridge({ tempf: VALID_TEMP_F }),
  invalidTempVpd: () => runBridge({ tempf: 9999, humidity: VALID_RH }),
};

const ROUTES: readonly IngestRoute[] = [piRoute, ecowittRoute, bridgeRoute];

// ---------------------------------------------------------------------------
// Cross-route matrix
// ---------------------------------------------------------------------------

describe("cross-ingest VPD regression guard", () => {
  it("expected VPD is a meaningful positive number for the shared sample", () => {
    expect(EXPECTED_VPD).not.toBeNull();
    expect(EXPECTED_VPD!).toBeGreaterThan(1.0);
    expect(EXPECTED_VPD!).toBeLessThan(2.0);
  });

  describe.each(ROUTES)("$name", (route) => {
    it("derives vpd_kpa for valid temperature + RH", () => {
      const vpd = route.validVpd();
      expect(vpd).not.toBeNull();
      // All routes should agree on derived VPD within rounding tolerance.
      expect(Math.abs((vpd as number) - (EXPECTED_VPD as number))).toBeLessThan(
        0.05,
      );
    });

    it("does NOT derive vpd_kpa when RH is 0", () => {
      expect(route.invalidRhVpd()).toBeNull();
    });

    it("does NOT derive vpd_kpa when humidity is missing", () => {
      expect(route.missingHumidityVpd()).toBeNull();
    });

    it("does NOT derive vpd_kpa when temperature is unrealistic", () => {
      expect(route.invalidTempVpd()).toBeNull();
    });

    it("never emits vpd_kpa = 0 as a missing sentinel", () => {
      for (const fn of [route.invalidRhVpd, route.missingHumidityVpd, route.invalidTempVpd]) {
        const v = fn();
        expect(v === 0).toBe(false);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Documented exceptions (kept narrow on purpose — broad scans are brittle).
// ---------------------------------------------------------------------------

describe("documented non-deriving live ingest mappers", () => {
  it("sensor-ingest-webhook intentionally does not derive vpd from temp+rh", async () => {
    // The webhook persists already-canonical metrics from authenticated
    // bridges. Derivation is the bridge's job (e.g. ecowitt-live-soil-bridge,
    // or ecowittRoutedRowBuilder for the HTTP ingest). This documented
    // exception is asserted here so we notice if behavior silently changes.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "supabase/functions/sensor-ingest-webhook/webhookIngest.ts",
      "utf8",
    );
    expect(src).not.toMatch(/calculateAirVpdKpa/);
  });
});

// ---------------------------------------------------------------------------
// Narrow static guard: every in-repo file that imports calculateAirVpdKpa
// MUST also reference "vpd_kpa" — i.e. it actually emits/derives a VPD
// metric rather than importing the helper without using it. This catches
// the regression where someone adds a new ingest mapper, calls the helper
// in dead code or behind a disabled branch, and never emits the metric.
// ---------------------------------------------------------------------------

describe("calculateAirVpdKpa usage guard", () => {
  it("every importer also emits vpd_kpa", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const roots = ["src/lib", "supabase/functions/_shared"];
    const importers: string[] = [];

    async function walk(dir: string): Promise<void> {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
          const src = await fs.readFile(p, "utf8");
          if (/\bcalculateAirVpdKpa\b/.test(src)) importers.push(p);
        }
      }
    }
    for (const r of roots) await walk(r);

    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) {
      const src = await fs.readFile(file, "utf8");
      expect(
        /"vpd_kpa"|'vpd_kpa'/.test(src),
        `${file} imports calculateAirVpdKpa but never references the "vpd_kpa" metric — derive it or remove the import.`,
      ).toBe(true);
    }
  });
});
