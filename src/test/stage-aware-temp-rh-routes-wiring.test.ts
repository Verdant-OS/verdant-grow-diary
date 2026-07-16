import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const TENTS = readFileSync(resolve(__dirname, "../pages/Tents.tsx"), "utf8");
const DETAIL = readFileSync(resolve(__dirname, "../pages/TentDetail.tsx"), "utf8");
const SENSORS = readFileSync(resolve(__dirname, "../pages/Sensors.tsx"), "utf8");

const FORBIDDEN =
  /saveAlert\(|logAlertEvent\(|action_queue|service_role|insertAlert\(|device\.control|\bsetAutomation\b|\bautomate\(/i;

const IMPORT_RE =
  /import\s+\{[\s\S]*classifyTempAgainstStage[\s\S]*classifyRhAgainstStage[\s\S]*environmentMetricChipStatus[\s\S]*\}\s+from\s+["']@\/lib\/environmentStageTargetRules["']/;

// Tents list chips now flow through the shared Dashboard-strip presenter
// (`buildTentSnapshotView`), which wires Temp/RH through the same canonical
// stage-aware helpers. Assert the page uses the presenter and the presenter
// uses the helpers — no inline JSX classification, no hardcoded thresholds.
const SNAPSHOT_VM = readFileSync(
  resolve(__dirname, "../lib/dashboardEnvironmentSnapshotViewModel.ts"),
  "utf8",
);

describe("Tents list — stage-aware Temp/RH wiring", () => {
  it("renders chips from the shared truth-filtered presenter", () => {
    expect(TENTS).toMatch(/buildTentSnapshotView/);
    expect(TENTS).toMatch(/value=\{m\.display\}/);
    expect(TENTS).toMatch(/status=\{m\.chipStatus\}/);
  });
  it("presenter wires Temp/RH through the canonical stage-aware helpers", () => {
    expect(SNAPSHOT_VM).toMatch(/from\s+["']@\/lib\/environmentStageTargetRules["']/);
    expect(SNAPSHOT_VM).toMatch(/environmentMetricChipStatus\(\s*classifyTempAgainstStage\(/);
    expect(SNAPSHOT_VM).toMatch(/environmentMetricChipStatus\(\s*classifyRhAgainstStage\(/);
  });
  it("removes hardcoded temp threshold expressions", () => {
    expect(TENTS).not.toMatch(/last\.temp\s*>\s*28/);
    expect(TENTS).not.toMatch(/last\.temp\s*<\s*19/);
  });
  it("removes hardcoded RH threshold expressions", () => {
    expect(TENTS).not.toMatch(/last\.rh\s*>\s*65/);
    expect(TENTS).not.toMatch(/last\.rh\s*<\s*35/);
  });
});

describe("Tent Detail — stage-aware Temp/RH wiring", () => {
  it("imports the helpers", () => {
    expect(DETAIL).toMatch(IMPORT_RE);
  });
  it("wires Temperature MetricChip through classifyTempAgainstStage with stale flag", () => {
    expect(DETAIL).toMatch(
      /label="T"[\s\S]*classifyTempAgainstStage\(snap\.temp,\s*\{\s*stage:\s*tent\.stage,\s*stale:\s*header\.stale\s*\}\)/,
    );
  });
  it("wires RH MetricChip through classifyRhAgainstStage with stale flag", () => {
    expect(DETAIL).toMatch(
      /label="RH"[\s\S]*classifyRhAgainstStage\(snap\.rh,\s*\{\s*stage:\s*tent\.stage,\s*stale:\s*header\.stale\s*\}\)/,
    );
  });
  it("removes hardcoded temp threshold expressions", () => {
    expect(DETAIL).not.toMatch(/snap\.temp\s*>\s*28/);
    expect(DETAIL).not.toMatch(/snap\.temp\s*<\s*19/);
  });
  it("removes hardcoded RH threshold expressions", () => {
    expect(DETAIL).not.toMatch(/snap\.rh\s*>\s*65/);
    expect(DETAIL).not.toMatch(/snap\.rh\s*<\s*35/);
  });
});

describe("Sensors — stage-aware Temp/RH wiring", () => {
  it("imports the helpers", () => {
    expect(SENSORS).toMatch(IMPORT_RE);
  });
  it("uses classifyTempAgainstStage for the temperature pill", () => {
    expect(SENSORS).toMatch(/classifyTempAgainstStage\(latest\.temp/);
  });
  it("uses classifyRhAgainstStage for the humidity pill", () => {
    expect(SENSORS).toMatch(/classifyRhAgainstStage\(latest\.rh/);
  });
  it("uses environmentMetricChipStatus to map to chip status", () => {
    expect(SENSORS).toMatch(/environmentMetricChipStatus\(/);
  });
  it("renders per-metric status pills with stable testIds", () => {
    expect(SENSORS).toContain("`sensors-stage-status-${m.key}`");
  });
});

describe("Static safety", () => {
  it("Tents introduces no alert/queue/automation/device-control surfaces in changed region", () => {
    expect(TENTS).not.toMatch(FORBIDDEN);
  });
  it("Tent Detail introduces no alert/queue/automation/device-control surfaces", () => {
    expect(DETAIL).not.toMatch(FORBIDDEN);
  });
  it("Sensors introduces no alert/queue/automation/device-control surfaces", () => {
    expect(SENSORS).not.toMatch(FORBIDDEN);
  });
});
