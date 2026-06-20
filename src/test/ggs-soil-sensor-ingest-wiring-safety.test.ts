/**
 * ggs-soil-sensor-ingest-wiring-safety — static safety guards for the
 * GGS 3-in-1 Soil Sensor Pro normalizer + snapshot attach slice.
 *
 * These guards prove the slice rides existing ingest validation paths
 * and does not introduce new write surfaces, secret leakage, or
 * device-control side effects.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const NORMALIZER = readFileSync(
  resolve(ROOT, "src/lib/ggsSoilSensorReadingNormalizer.ts"),
  "utf8",
);
const ATTACH = readFileSync(
  resolve(ROOT, "src/lib/ggsSoilSensorSnapshotAttach.ts"),
  "utf8",
);
const TARGETS = [NORMALIZER, ATTACH];

describe("GGS soil sensor — slice purity", () => {
  it("introduces no Supabase write paths", () => {
    for (const src of TARGETS) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
      expect(src).not.toMatch(/method:\s*["']POST["']/);
    }
  });

  it("does not import the Supabase client", () => {
    for (const src of TARGETS) {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/createClient\s*\(/);
    }
  });

  it("does not leak service role / bridge tokens / secrets", () => {
    for (const src of TARGETS) {
      expect(src).not.toMatch(/service[_-]?role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(src).not.toMatch(/\bvbt_[A-Za-z0-9]/);
      expect(src).not.toMatch(/bridge[_-]?token/i);
      expect(src).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
      expect(src).not.toMatch(
        /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
      );
    }
  });

  it("does not call AI / alerts / Action Queue / device control", () => {
    for (const src of TARGETS) {
      expect(src).not.toMatch(/\bai-doctor-review\b/);
      expect(src).not.toMatch(/\bai-coach\b/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/\balerts\b/);
      expect(src).not.toMatch(
        /\b(turn|activate|switch)\b.*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i,
      );
    }
  });

  it("does not reintroduce XLSX / spreadsheet operator import surfaces", () => {
    for (const src of TARGETS) {
      expect(src).not.toMatch(/xlsx/i);
      expect(src).not.toMatch(/spreadsheet/i);
      expect(src).not.toMatch(/operator.*import/i);
    }
  });
});

describe("GGS soil sensor — ingest path reuse", () => {
  it("delegates payload parsing to the existing Spider Farmer GGS bridge rules", () => {
    expect(NORMALIZER).toMatch(/normalizeSpiderFarmerGgsPayload/);
    expect(NORMALIZER).toMatch(/@\/lib\/spiderFarmerGgsMappingRules/);
  });

  it("does not introduce a new edge function for GGS soil ingest", () => {
    const fnDir = resolve(ROOT, "supabase/functions");
    if (!existsSync(fnDir)) return;
    const dirs = readdirSync(fnDir).filter((n) =>
      /ggs|soil.*sensor|three.in.one/i.test(n),
    );
    expect(dirs).toEqual([]);
  });

  it("emits only canonical Verdant source kinds (live|manual|stale|invalid)", () => {
    // Match the exported union type, ignoring whitespace.
    expect(NORMALIZER.replace(/\s+/g, " ")).toMatch(
      /export type GgsSoilSource = "live" \| "manual" \| "stale" \| "invalid"/,
    );
    // No accidental "healthy" or fabricated source labels.
    expect(NORMALIZER).not.toMatch(/\bhealthy\b/);
    expect(NORMALIZER).not.toMatch(/source:\s*["']ok["']/);
  });
});

describe("GGS soil sensor — UI raw_payload leak guard", () => {
  it("no React component renders raw_payload from GGS drafts", () => {
    // Spot-check the snapshot strip and source badge presenters do
    // not surface raw_payload fields.
    const stripPath = resolve(ROOT, "src/components/QuickLogSensorSnapshotStrip.tsx");
    if (existsSync(stripPath)) {
      const strip = readFileSync(stripPath, "utf8");
      expect(strip).not.toMatch(/raw_payload/);
    }
    const badgePath = resolve(ROOT, "src/components/TimelineSensorSourceBadge.tsx");
    if (existsSync(badgePath)) {
      const badge = readFileSync(badgePath, "utf8");
      expect(badge).not.toMatch(/raw_payload/);
    }
  });
});
