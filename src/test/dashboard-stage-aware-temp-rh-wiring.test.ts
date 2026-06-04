import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const DASH = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const VM = readFileSync(
  resolve(__dirname, "../lib/dashboardEnvironmentSnapshotViewModel.ts"),
  "utf8",
);
const HELPER = readFileSync(
  resolve(__dirname, "../lib/environmentStageTargetRules.ts"),
  "utf8",
);

const DASH_AND_VM = DASH + "\n" + VM;
const FORBIDDEN =
  /saveAlert\(|logAlertEvent\(|action_queue|service_role|insertAlert\(|device\.control|\bsetAutomation\b|\bautomate\(/i;

describe("Dashboard env strip — stage-aware Temp/RH wiring", () => {
  it("imports the stage-aware Temp/RH helpers", () => {
    expect(DASH_AND_VM).toMatch(
      /import\s+\{[\s\S]*classifyTempAgainstStage[\s\S]*\}\s+from\s+["']@\/lib\/environmentStageTargetRules["']/,
    );
    expect(DASH_AND_VM).toMatch(/classifyRhAgainstStage/);
    expect(DASH_AND_VM).toMatch(/environmentMetricChipStatus/);
  });

  it("Temperature uses classifyTempAgainstStage + environmentMetricChipStatus", () => {
    expect(VM).toMatch(
      /environmentMetricChipStatus\([\s\S]*classifyTempAgainstStage\(/,
    );
  });

  it("RH uses classifyRhAgainstStage + environmentMetricChipStatus", () => {
    expect(VM).toMatch(
      /environmentMetricChipStatus\([\s\S]*classifyRhAgainstStage\(/,
    );
  });

  it("removes hardcoded temp threshold expressions from JSX", () => {
    expect(DASH).not.toMatch(/last\.temp\s*>\s*28/);
    expect(DASH).not.toMatch(/last\.temp\s*<\s*19/);
  });

  it("removes hardcoded RH threshold expressions from JSX", () => {
    expect(DASH).not.toMatch(/last\.rh\s*>\s*65/);
    expect(DASH).not.toMatch(/last\.rh\s*<\s*35/);
  });
});

describe("environmentStageTargetRules safety", () => {
  it("performs no I/O and no React/Supabase imports", () => {
    expect(HELPER).not.toMatch(/supabase|fetch\(|from\s+["']react["']/);
  });

  it("introduces no alert/queue/automation/device-control writes", () => {
    expect(HELPER).not.toMatch(FORBIDDEN);
  });
});
