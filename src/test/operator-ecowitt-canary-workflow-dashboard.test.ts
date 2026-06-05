/**
 * Operator EcoWitt Canary — self-contained workflow + results dashboard.
 * Static-source assertions only. No Supabase writes, no functions.invoke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/pages/OperatorEcowittCanary.tsx"), "utf8");

describe("OperatorEcowittCanary — workflow + dashboard", () => {
  it("renders a no-browser-POSTs security notice", () => {
    expect(src).toContain('data-testid="no-browser-posts-notice"');
    expect(src).toContain("does not run EcoWitt canary POSTs from the browser");
  });

  it("renders a self-contained workflow status bar with 4 stages", () => {
    expect(src).toContain("CanaryWorkflowStatusBar");
    expect(src).toContain('data-testid="canary-workflow-status-bar"');
    for (const stage of ["preflight", "run", "import", "verdict"]) {
      expect(src).toContain(`key: "${stage}"`);
    }
  });

  it("renders a dedicated results dashboard with verdict pill and metrics", () => {
    expect(src).toContain("ResultsDashboard");
    expect(src).toContain('data-testid="canary-results-dashboard"');
    expect(src).toContain('data-testid="dashboard-verdict-pill"');
    for (const m of ["preflight", "main-rows", "malformed-rows", "channel-9"]) {
      expect(src).toContain(`data-metric="${m}"`);
    }
  });

  it("does not introduce ingest/network/automation side effects", () => {
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .toLowerCase();
    for (const w of ["functions.invoke", ".rpc(", "action_queue", "mqtt", "relay", "actuator"]) {
      expect(stripped).not.toContain(w);
    }
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
  });
});
