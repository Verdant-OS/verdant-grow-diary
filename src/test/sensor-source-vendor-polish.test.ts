/**
 * Source / vendor lineage polish tests.
 *
 * Verifies:
 *  - Source matching is trimmed + case-insensitive + canonicalized.
 *  - Unsupported / empty / partial / fuzzy sources are rejected.
 *  - Historical allow-listed sources still work.
 *  - Vendor is trimmed, empty/whitespace dropped, never affects ownership.
 *  - Diary timeline source/vendor presenter helpers behave correctly.
 *  - Docs / sample CSV exist and contain the required mappings.
 *  - Static safety: no device-control / Action Queue / alerts /
 *    service_role / new functions.invoke from this slice.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeWebhookIngestPayload,
  normalizeWebhookSource,
  normalizeVendorLineage,
  sanitizeRawPayload,
} from "@/lib/sensorWebhookIngestRules";
import {
  resolveDiarySensorSourceLabel,
  resolveDiarySensorVendorLabel,
} from "@/lib/growDiaryTimelineRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-06-04T15:35:00Z");
const TS = "2026-06-04T15:30:00Z";

function base(over: Record<string, unknown> = {}) {
  return {
    tent_id: TENT,
    source: "webhook",
    captured_at: TS,
    metrics: { temp_c: 22.4, humidity_pct: 55 },
    ...over,
  } as Record<string, unknown>;
}

// ---------- 1–4: trim + case-insensitive canonicalization ------------------

describe("source normalization (hardening)", () => {
  it.each([
    [" EcoWitt ", "ecowitt"],
    ["MQTT", "mqtt"],
    [" WebHook ", "webhook"],
    [" CSV ", "csv"],
    ["ecowitt", "ecowitt"],
    ["PI_BRIDGE", "pi_bridge"],
    [" Home_Assistant_Bridge\n", "home_assistant_bridge"],
  ])("normalizes %j → %j", (input, expected) => {
    expect(normalizeWebhookSource(input)).toBe(expected);
  });

  it("end-to-end: payload with ' EcoWitt ' canonicalizes row.source to 'ecowitt'", () => {
    const r = normalizeWebhookIngestPayload(
      base({ source: " EcoWitt " }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(new Set(r.rows.map((x) => x.source))).toEqual(new Set(["ecowitt"]));
    expect((r.rows[0].raw_payload as Record<string, unknown>).source).toBe(
      "ecowitt",
    );
  });

  it("historical allow-list still works", () => {
    for (const s of [
      "webhook_generic",
      "pi_bridge",
      "node_red_bridge",
      "esp32_arduino",
      "esp32_esphome",
      "home_assistant_bridge",
      "ha_forwarded",
    ]) {
      expect(normalizeWebhookSource(s)).toBe(s);
    }
  });

  it("rejects unsupported / partial / fuzzy / empty / whitespace sources", () => {
    for (const bad of ["", "   ", "\t\n", "eco", "mq", "web", "autopilot", "live"]) {
      expect(normalizeWebhookSource(bad)).toBeNull();
      const r = normalizeWebhookIngestPayload(
        base({ source: bad }) as never,
        { now: NOW },
      );
      expect(r.ok).toBe(false);
    }
  });

  it("rejects non-string sources", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(normalizeWebhookSource(bad as unknown)).toBeNull();
    }
  });
});

// ---------- 9–11: vendor handling -----------------------------------------

describe("vendor normalization (lineage-only)", () => {
  it("trims non-empty vendor strings", () => {
    expect(normalizeVendorLineage("  EcoWitt  ")).toBe("EcoWitt");
    expect(normalizeVendorLineage("home_assistant")).toBe("home_assistant");
  });

  it("drops empty / whitespace-only / non-string vendor values", () => {
    for (const v of ["", "   ", "\n\t", null, undefined, 0, {}, []]) {
      expect(normalizeVendorLineage(v as unknown)).toBeNull();
    }
  });

  it("sanitizeRawPayload drops whitespace-only vendor", () => {
    const raw = sanitizeRawPayload(base({ vendor: "   " }) as never);
    expect("vendor" in raw).toBe(false);
  });

  it("sanitizeRawPayload preserves trimmed vendor casing", () => {
    const raw = sanitizeRawPayload(base({ vendor: "  Home Assistant " }) as never);
    expect(raw.vendor).toBe("Home Assistant");
  });

  it("vendor never changes source / user_id / tent_id / ownership", () => {
    const r = normalizeWebhookIngestPayload(
      base({
        source: " MQTT ",
        vendor: " EcoWitt ",
        user_id: "attacker-uuid",
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    for (const row of r.rows) {
      expect(row.source).toBe("mqtt");
      expect(row.tent_id).toBe(TENT);
      expect((row as { user_id?: unknown }).user_id).toBeUndefined();
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.vendor).toBe("EcoWitt");
      expect(raw.source).toBe("mqtt"); // canonical, not " MQTT "
      expect(raw.user_id).toBeUndefined();
    }
  });
});

// ---------- 12–15: diary timeline presenter helpers ------------------------

describe("diary timeline source/vendor presenters", () => {
  it("renders known source labels", () => {
    expect(resolveDiarySensorSourceLabel("ecowitt")).toBe("EcoWitt");
    expect(resolveDiarySensorSourceLabel("MQTT")).toBe("MQTT");
    expect(resolveDiarySensorSourceLabel("webhook")).toBe("Webhook");
    expect(resolveDiarySensorSourceLabel("csv")).toBe("CSV");
    expect(resolveDiarySensorSourceLabel("home_assistant_bridge")).toBe(
      "Home Assistant",
    );
  });

  it("never promotes unknown source to 'Live'", () => {
    expect(resolveDiarySensorSourceLabel("totally_made_up")).not.toMatch(
      /^Live$/i,
    );
    expect(resolveDiarySensorSourceLabel(null)).toBeNull();
    expect(resolveDiarySensorSourceLabel("")).toBeNull();
  });

  it("renders known vendor lineage labels", () => {
    expect(resolveDiarySensorVendorLabel("ecowitt")).toBe("EcoWitt");
    expect(resolveDiarySensorVendorLabel("home_assistant")).toBe(
      "Home Assistant",
    );
  });

  it("preserves grower-typed unknown vendor as lineage only", () => {
    expect(resolveDiarySensorVendorLabel("Acme Sensors v2")).toBe(
      "Acme Sensors v2",
    );
    expect(resolveDiarySensorVendorLabel("   ")).toBeNull();
    expect(resolveDiarySensorVendorLabel(null)).toBeNull();
  });
});

// ---------- 16–17: docs presence ------------------------------------------

describe("CSV mapping docs + sample", () => {
  const docPath = resolve(__dirname, "../../docs/csv-sensor-schema-mapping.md");
  const csvPath = resolve(
    __dirname,
    "../../docs/samples/ecowitt-sensor-readings.csv",
  );

  it("csv-sensor-schema-mapping.md exists and covers required mappings", () => {
    expect(existsSync(docPath)).toBe(true);
    const md = readFileSync(docPath, "utf8");
    for (const token of [
      "captured_at",
      "temp_f",
      "humidity",
      "co2_ppm",
      "soil_water_content",
      "soil_ec",
      "soil_temp",
      "ppfd",
      "reservoir_ec",
      "reservoir_ph",
      "vendor",
      "lineage only",
    ]) {
      expect(md.toLowerCase()).toContain(token.toLowerCase());
    }
    expect(md).toMatch(/not live data/i);
  });

  it("EcoWitt sample CSV exists with expected headers and rows", () => {
    expect(existsSync(csvPath)).toBe(true);
    const csv = readFileSync(csvPath, "utf8");
    expect(csv).toMatch(/captured_at,temp1f,humidity1,co2,soilmoisture1,source,vendor/);
    expect(csv).toMatch(/ecowitt,ecowitt/);
    // Note about MQTT lineage alternative
    expect(csv.toLowerCase()).toContain("source = mqtt");
    expect(csv.toLowerCase()).toContain("vendor = ecowitt");
    // At least 5 data rows
    const dataRows = csv
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("captured_at"));
    expect(dataRows.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------- 18–22: static safety scans -----------------------------------

describe("static safety (this slice introduces no unsafe writes)", () => {
  const files = [
    resolve(__dirname, "../lib/sensorWebhookIngestRules.ts"),
    resolve(__dirname, "../lib/growDiaryTimelineRules.ts"),
    resolve(__dirname, "../components/DiaryEntryBadges.tsx"),
    resolve(__dirname, "../../docs/csv-sensor-schema-mapping.md"),
    resolve(__dirname, "../../docs/samples/ecowitt-sensor-readings.csv"),
  ];
  const blobs = files.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : ""));

  it("no device-control method names", () => {
    for (const blob of blobs) {
      expect(blob).not.toMatch(/\b(setFanSpeed|setLight|togglePump|setRelay|sendDeviceCommand)\b/);
    }
  });

  it("no Action Queue writes", () => {
    for (const blob of blobs) {
      expect(blob).not.toMatch(/from\(["']action_queue["']\)\s*\.(insert|update|upsert|delete)/);
    }
  });

  it("no alerts writes", () => {
    for (const blob of blobs) {
      expect(blob).not.toMatch(/from\(["']alerts["']\)\s*\.(insert|update|upsert|delete)/);
    }
  });

  it("no service_role usage in this slice", () => {
    for (const blob of blobs) {
      expect(blob).not.toMatch(/SERVICE_ROLE|service_role_key/i);
    }
  });

  it("no functions.invoke added by this slice", () => {
    for (const blob of blobs) {
      expect(blob).not.toMatch(/functions\.invoke\(/);
    }
  });
});
