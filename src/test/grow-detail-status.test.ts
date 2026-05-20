/**
 * GrowDetail status summary — read-only, no AI, no device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");

describe("GrowDetail — status summary", () => {
  it("renders a Grow Status card", () => {
    expect(PAGE).toMatch(/data-testid="grow-status-card"/);
    expect(PAGE).toMatch(/Grow Status/);
  });

  it("queries pending action_queue risk levels by grow_id", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,200}\.select\(\s*["']risk_level["']\s*\)[\s\S]{0,200}\.eq\(\s*["']status["']\s*,\s*["']pending_approval["']\s*\)/,
    );
  });

  it("queries latest diary entry for last activity timestamp", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']diary_entries["']\s*\)[\s\S]{0,200}\.order\(\s*["']entry_at["'][\s\S]{0,80}\.limit\(\s*1\s*\)/,
    );
  });

  it("computes status levels: good / watch / needs_review / unavailable", () => {
    expect(PAGE).toMatch(/level\s*=\s*"needs_review"/);
    expect(PAGE).toMatch(/level\s*=\s*"watch"/);
    expect(PAGE).toMatch(/level\s*=\s*"good"/);
    expect(PAGE).toMatch(/level:\s*"unavailable"/);
  });

  it("treats high or critical pending risk as Needs Review", () => {
    expect(PAGE).toMatch(/highestRisk === "critical" \|\| highestRisk === "high"/);
  });

  it("falls back to Status unavailable on failure", () => {
    expect(PAGE).toMatch(/Status unavailable/);
  });

  it("links to Action Queue when pending > 0 and to Timeline", () => {
    expect(PAGE).toMatch(/pendingNum > 0[\s\S]{0,200}to="\/actions"/);
    expect(PAGE).toMatch(/to="\/logs"/);
  });

  it("declares the summary is not an AI diagnosis", () => {
    expect(PAGE).toMatch(/not an AI diagnosis/i);
  });

  it("does not call ai-coach from Grow Detail", () => {
    expect(PAGE).not.toMatch(/["']ai-coach["']/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("remains read-only and free of device-control surface", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(PAGE).not.toMatch(/service_role/i);
  });
});
