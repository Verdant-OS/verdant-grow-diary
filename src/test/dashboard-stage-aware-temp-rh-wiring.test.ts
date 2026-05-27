import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const DASH = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const HELPER = readFileSync(
  resolve(__dirname, "../lib/environmentStageTargetRules.ts"),
  "utf8",
);

const FORBIDDEN =
  /saveAlert\(|logAlertEvent\(|action_queue|service_role|insertAlert\(|device\.control|\bsetAutomation\b|\bautomate\(/i;

describe("Dashboard env strip — stage-aware Temp/RH wiring", () => {
  it("imports the stage-aware Temp/RH helpers", () => {
    expect(DASH).toMatch(
      /import\s+\{[\s\S]*classifyTempAgainstStage[\s\S]*\}\s+from\s+["']@\/lib\/environmentStageTargetRules["']/,
    );
    expect(DASH).toMatch(/classifyRhAgainstStage/);
    expect(DASH).toMatch(/environmentMetricChipStatus/);
  });

  it("Temperature MetricChip uses classifyTempAgainstStage + environmentMetricChipStatus", () => {
    expect(DASH).toMatch(
      /label="T"[\s\S]*environmentMetricChipStatus\(classifyTempAgainstStage\(/,
    );
  });

  it("RH MetricChip uses classifyRhAgainstStage + environmentMetricChipStatus", () => {
    expect(DASH).toMatch(
      /label="RH"[\s\S]*environmentMetricChipStatus\(classifyRhAgainstStage\(/,
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
