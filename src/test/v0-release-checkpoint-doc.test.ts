/**
 * Static guardrail: the V0 release checkpoint doc must exist and cover the
 * required surface (release name, test count, safety guarantees, demo
 * script reference, stop-ship rule).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC = resolve(__dirname, "../../docs/v0-release-checkpoint.md");

describe("V0 release checkpoint doc", () => {
  it("exists at docs/v0-release-checkpoint.md", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const d = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("declares the release name", () => {
    expect(d).toMatch(/Verdant V0 Operating Loop Protected Build/);
  });

  it("declares the current test count (2052/2052)", () => {
    expect(d).toMatch(/2028\s*\/\s*2028/);
  });

  it.each([
    /no automation/i,
    /no device control/i,
    /approval-required/i,
    /no fake live sensor data/i,
    /stale-warning/i,
  ])("documents safety guarantee %s", (re) => {
    expect(d).toMatch(re);
  });

  it("references the demo script", () => {
    expect(d).toContain("docs/v0-operating-loop-demo.md");
  });

  it("states the stop-ship rule referencing the contract test", () => {
    expect(d).toMatch(/stop-ship/i);
    expect(d).toContain("src/test/v0-operating-loop-contract.test.ts");
  });

  it("includes the partner demo positioning line", () => {
    expect(d).toContain(
      "Your hardware collects the data. Verdant turns it into plant memory, alert context, and approval-required decisions.",
    );
  });
});
