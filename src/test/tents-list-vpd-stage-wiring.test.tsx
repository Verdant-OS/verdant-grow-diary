/**
 * Tents list — stage-aware VPD wiring.
 *
 * Asserts that the legacy hardcoded `vpd > 1.6 || vpd < 0.6` thresholds are
 * gone and that classification flows through `classifyVpdAgainstStage` with
 * the tent's own stage. Also static safety: no alerts/action_queue writes,
 * no service_role, no automation/device-control strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyVpdAgainstStage,
  vpdMetricChipStatus,
} from "@/lib/vpdStageTargetRules";

const TENTS_SRC = readFileSync(
  resolve(__dirname, "../pages/Tents.tsx"),
  "utf8",
);

describe("Tents list — VPD threshold cleanup", () => {
  it("no longer hardcodes 0.6 / 1.6 VPD thresholds in JSX", () => {
    expect(TENTS_SRC).not.toMatch(/vpd\s*>\s*1\.6/);
    expect(TENTS_SRC).not.toMatch(/vpd\s*<\s*0\.6/);
  });

  it("imports the canonical stage-aware helpers", () => {
    expect(TENTS_SRC).toMatch(/classifyVpdAgainstStage/);
    expect(TENTS_SRC).toMatch(/vpdMetricChipStatus/);
    expect(TENTS_SRC).toMatch(
      /from\s+["']@\/lib\/vpdStageTargetRules["']/,
    );
  });

  it("passes the tent's stage into the classifier", () => {
    expect(TENTS_SRC).toMatch(/classifyVpdAgainstStage\(\s*\{[^}]*stage:\s*t\.stage/);
  });
});

describe("Tents list — classifier behavior (via shared helper)", () => {
  it("flower-stage in-range VPD maps to ok", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "flower" });
    expect(r.classification).toBe("in_target");
    expect(vpdMetricChipStatus(r)).toBe("ok");
  });

  it("unknown stage does not yield an 'in target' verdict", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: null });
    expect(r.classification).toBe("stage_unknown");
    expect(r.label.toLowerCase()).not.toContain("in target");
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
  });

  it("stale VPD is never treated as ok", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "flower", stale: true });
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
    expect(r.label.toLowerCase()).toMatch(/historical|stale/);
  });

  it("harvest renders context-only, not in-target", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "harvest" });
    expect(r.classification).toBe("context_only");
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
  });
});

describe("Tents list — safety contract", () => {
  it("contains no automation / device-control / service_role strings", () => {
    expect(TENTS_SRC).not.toMatch(/service_role/);
    expect(TENTS_SRC).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
    );
    expect(TENTS_SRC).not.toMatch(/ai[\s_-]?coach|ai_doctor/i);
  });

  it("does not write to alerts / action_queue / sensor_readings", () => {
    expect(TENTS_SRC).not.toMatch(
      /\.from\(["'](alerts|action_queue|sensor_readings)["']\)\s*\.(insert|update|delete|upsert)/,
    );
  });
});
