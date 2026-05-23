/**
 * Pi Ingest Status — read-only surface tests.
 *
 * Covers:
 *  - pure computePiIngestStatus rules (no-data / recent / stale, counts,
 *    latest metrics)
 *  - page static safety: no writes, no secrets, no automation / device
 *    control / Action Queue / alert persistence references
 *  - hook static safety: queries sensor_readings filtered by pi_bridge
 *    and never touches pi_ingest_bridge_credentials or secret columns
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PI_INGEST_DISCLOSURE_LINES,
  PI_INGEST_HEALTH_LABEL,
  PI_INGEST_SOURCE,
  computePiIngestStatus,
  type PiIngestReadingLike,
} from "@/lib/piIngestStatusRules";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const PAGE = read("src/pages/PiIngestStatus.tsx");
const HOOK = read("src/hooks/usePiIngestStatus.ts");
const RULES = read("src/lib/piIngestStatusRules.ts");
const APP = read("src/App.tsx");

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60 * 1000).toISOString();

describe("computePiIngestStatus — pure rules", () => {
  it("reports no_data when no pi_bridge readings exist", () => {
    const s = computePiIngestStatus([], NOW);
    expect(s.health).toBe("no_data");
    expect(s.latestAt).toBeNull();
    expect(s.count24h).toBe(0);
    expect(s.count7d).toBe(0);
    expect(s.latestMetrics).toEqual([]);
  });

  it("ignores non-pi_bridge readings entirely", () => {
    const rows: PiIngestReadingLike[] = [
      { ts: minutesAgo(1), metric: "temperature_c", source: "manual" },
      { ts: minutesAgo(2), metric: "humidity_pct", source: "sim" },
    ];
    expect(computePiIngestStatus(rows, NOW).health).toBe("no_data");
  });

  it("reports recently_active when latest pi_bridge reading is fresh", () => {
    const rows: PiIngestReadingLike[] = [
      {
        ts: minutesAgo(5),
        metric: "temperature_c",
        source: PI_INGEST_SOURCE,
        tent_id: "tent-1",
      },
      {
        ts: minutesAgo(6),
        metric: "humidity_pct",
        source: PI_INGEST_SOURCE,
        tent_id: "tent-1",
      },
    ];
    const s = computePiIngestStatus(rows, NOW);
    expect(s.health).toBe("recently_active");
    expect(s.latestTentId).toBe("tent-1");
    expect(s.latestMetrics).toContain("temperature_c");
    expect(s.latestMetrics).toContain("humidity_pct");
  });

  it("reports stale when latest pi_bridge reading is old", () => {
    const rows: PiIngestReadingLike[] = [
      {
        ts: minutesAgo(60 * 6),
        metric: "temperature_c",
        source: PI_INGEST_SOURCE,
      },
    ];
    expect(computePiIngestStatus(rows, NOW).health).toBe("stale");
  });

  it("counts last 24h and last 7d windows correctly", () => {
    const rows: PiIngestReadingLike[] = [
      { ts: minutesAgo(10), metric: "temperature_c", source: PI_INGEST_SOURCE },
      { ts: minutesAgo(60 * 12), metric: "humidity_pct", source: PI_INGEST_SOURCE },
      { ts: minutesAgo(60 * 48), metric: "vpd_kpa", source: PI_INGEST_SOURCE },
      { ts: minutesAgo(60 * 24 * 6), metric: "co2_ppm", source: PI_INGEST_SOURCE },
      { ts: minutesAgo(60 * 24 * 10), metric: "ppfd", source: PI_INGEST_SOURCE },
    ];
    const s = computePiIngestStatus(rows, NOW);
    expect(s.count24h).toBe(2);
    expect(s.count7d).toBe(4);
  });

  it("exposes labels and disclosure copy", () => {
    expect(PI_INGEST_HEALTH_LABEL.no_data).toMatch(/no data/i);
    expect(PI_INGEST_HEALTH_LABEL.recently_active).toMatch(/recent/i);
    expect(PI_INGEST_HEALTH_LABEL.stale).toMatch(/stale/i);
    const joined = PI_INGEST_DISCLOSURE_LINES.join(" ").toLowerCase();
    expect(joined).toContain("read-only");
    expect(joined).toContain("no automation");
    expect(joined).toContain("no device control");
    expect(joined).toContain("sensor_readings");
  });
});

describe("PiIngestStatus page — read-only & safety contract", () => {
  it("renders the read-only disclosure copy", () => {
    for (const line of PI_INGEST_DISCLOSURE_LINES) {
      expect(RULES).toContain(line);
    }
    expect(PAGE).toContain("PI_INGEST_DISCLOSURE_LINES");
    expect(PAGE).toContain("Read-only");
  });

  it("does not write to sensor_readings, idempotency keys, alerts, or action_queue", () => {
    const text = `${PAGE}\n${HOOK}`;
    expect(text).not.toMatch(/\.from\(["']sensor_readings["']\)[\s\S]*?\.insert\(/);
    expect(text).not.toMatch(/pi_ingest_idempotency_keys/);
    expect(text).not.toMatch(/\.from\(["']alerts["']\)[\s\S]*?\.insert\(/);
    expect(text).not.toMatch(/\.from\(["']action_queue["']\)[\s\S]*?\.insert\(/);
    expect(text).not.toMatch(/\.insert\(/);
    expect(text).not.toMatch(/\.update\(/);
    expect(text).not.toMatch(/\.delete\(/);
    expect(text).not.toMatch(/\.upsert\(/);
  });

  it("does not reference bridge secret columns or the credentials table", () => {
    const text = `${PAGE}\n${HOOK}\n${RULES}`;
    expect(text).not.toMatch(/pi_ingest_bridge_credentials/);
    expect(text).not.toMatch(/secret_hash/);
    expect(text).not.toMatch(/secret_ciphertext/);
    expect(text).not.toMatch(/secret_nonce/);
    expect(text).not.toMatch(/secret_key_version/);
  });

  it("does not reference automation, device control, relays, or actuators", () => {
    const text = `${PAGE}\n${HOOK}\n${RULES}`.toLowerCase();
    expect(text).not.toMatch(/\brelay\b/);
    expect(text).not.toMatch(/\bactuator\b/);
    expect(text).not.toMatch(/\bmqtt\b/);
    expect(text).not.toMatch(/home.?assistant/);
    expect(text).not.toMatch(/\bwebhook\b/);
    expect(text).not.toMatch(/device.?control/);
  });

  it("hook filters sensor_readings by source = pi_bridge", () => {
    expect(HOOK).toMatch(/from\(["']sensor_readings["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']source["'],\s*PI_INGEST_SOURCE\)/);
  });

  it("is wired as a route in App.tsx", () => {
    expect(APP).toContain("PiIngestStatus");
    expect(APP).toContain("/pi-ingest-status");
  });
});
