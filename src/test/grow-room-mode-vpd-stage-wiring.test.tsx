/**
 * GrowRoomMode — stage-aware VPD wiring.
 *
 * Static + behavioral assertions that the canonical helper is reused, no
 * VPD target ranges are duplicated in JSX, and no automation / device-control
 * surfaces were introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyVpdAgainstStage,
  vpdMetricChipStatus,
} from "@/lib/vpdStageTargetRules";

const SRC = readFileSync(
  resolve(__dirname, "../pages/GrowRoomMode.tsx"),
  "utf8",
);

describe("GrowRoomMode — stage-aware VPD wiring (static)", () => {
  it("imports classifyVpdAgainstStage from the canonical rules module", () => {
    expect(SRC).toMatch(/classifyVpdAgainstStage/);
    expect(SRC).toMatch(/from\s+["']@\/lib\/vpdStageTargetRules["']/);
  });

  it("passes per-tent stage and stale context to the classifier", () => {
    expect(SRC).toMatch(/classifyVpdAgainstStage\(\s*\{[\s\S]{0,200}stage:/);
    expect(SRC).toMatch(/stale:\s*card\.snapshotState\s*===\s*["']stale["']/);
  });

  it("renders the stage-aware VPD hint test hook", () => {
    expect(SRC).toMatch(/grow-room-vpd-stage-hint/);
  });

  it("does not hardcode VPD target ranges in JSX", () => {
    // No literal numeric VPD bands (e.g. 0.6 / 1.6 / 1.2 kPa thresholds).
    expect(SRC).not.toMatch(/vpd\s*[<>]=?\s*0?\.[0-9]/i);
    expect(SRC).not.toMatch(/vpd\s*[<>]=?\s*1\.[0-9]/i);
  });
});

describe("GrowRoomMode — classifier behavior (via shared helper)", () => {
  it("flower-stage in-range VPD → in_target / ok", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "flower" });
    expect(r.classification).toBe("in_target");
    expect(vpdMetricChipStatus(r)).toBe("ok");
    expect(r.label).toMatch(/In Flower VPD range/);
  });

  it("unknown stage does not render an 'in target' verdict", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: null });
    expect(r.classification).toBe("stage_unknown");
    expect(r.label.toLowerCase()).not.toContain("in target");
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
  });

  it("stale VPD is never treated as ok/live", () => {
    const r = classifyVpdAgainstStage({
      value: 1.2,
      stage: "flower",
      stale: true,
    });
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
    expect(r.label.toLowerCase()).toMatch(/historical|stale/);
  });

  it("harvest/drying renders context-only copy", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "drying" });
    expect(r.classification).toBe("context_only");
    expect(r.label.toLowerCase()).toContain("context only");
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
  });
});

describe("GrowRoomMode — safety contract", () => {
  it("contains no service_role / automation / device-control strings", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
    );
    expect(SRC).not.toMatch(/ai[\s_-]?coach|ai_doctor/i);
  });

  it("does not write to alerts / action_queue / sensor_readings", () => {
    expect(SRC).not.toMatch(
      /\.from\(["'](alerts|action_queue|sensor_readings)["']\)\s*\.(insert|update|delete|upsert)/,
    );
  });
});
