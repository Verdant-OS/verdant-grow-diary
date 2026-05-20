/**
 * Verifies docs/architecture.md documents Verdant's structure, data flow,
 * safety model, and grow-scoped navigation pattern.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/architecture.md");

describe("Verdant architecture documentation", () => {
  it("docs/architecture.md exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const content = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("includes grow-scoped navigation", () => {
    expect(content).toMatch(/Grow-scoped navigation/i);
    expect(content).toContain("?growId=");
    expect(content).toContain("/dashboard?growId=");
    expect(content).toContain("useScopedGrow");
  });

  it("includes RLS ownership model", () => {
    expect(content).toMatch(/Supabase\s*\/\s*RLS ownership model/i);
    expect(content).toContain("auth.uid()");
    expect(content).toMatch(/Row Level Security/i);
  });

  it("includes AI Coach read-only model", () => {
    expect(content).toMatch(/AI Coach read-only model/i);
    expect(content).toContain("src/test/ai-coach-security.test.ts");
  });

  it("includes Action Queue approval / audit model", () => {
    expect(content).toMatch(/Action Queue approval\s*\/\s*audit model/i);
    expect(content).toMatch(/append[-\s]?only/i);
    expect(content).toContain("src/test/action-queue-audit.test.ts");
  });

  it("includes sensor data truthfulness", () => {
    expect(content).toMatch(/Sensor data model/i);
    expect(content).toMatch(/never\s+fabricated|never silently substituted/i);
  });

  it("includes the Dashboard intelligence stack", () => {
    expect(content).toMatch(/Dashboard intelligence stack/i);
    for (const ref of [
      "useLatestSensorSnapshot",
      "sensorQuality",
      "useEnvironmentTrends",
      "environmentTargetComparison",
    ]) {
      expect(content).toContain(ref);
    }
  });

  it("documents the future external-control layer as out of scope", () => {
    expect(content).toMatch(/external[-\s]?control/i);
    expect(content).toMatch(/out of scope/i);
  });

  it("references README, security checklist, exceptions, and PR template", () => {
    expect(content).toContain("README.md");
    expect(content).toContain("docs/security-checklist.md");
    expect(content).toContain("docs/security-exceptions.md");
    expect(content).toContain(".github/pull_request_template.md");
  });
});
