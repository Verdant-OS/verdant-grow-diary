import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"), "utf8");

describe("SensorsTestbenchPanel static safety", () => {
  it("does not reference service_role keys or env", () => {
    expect(PANEL).not.toMatch(/SERVICE_ROLE/);
    expect(PANEL).not.toMatch(/serviceRoleKey/);
  });

  it("does not log or console-print plaintext tokens", () => {
    expect(PANEL).not.toMatch(/console\.(log|info|warn|error)\([^)]*reveal/);
    expect(PANEL).not.toMatch(/analytics\.[a-z]+\([^)]*reveal/i);
  });

  it("does not label testbench data as live/healthy/connected sensor", () => {
    // The receiving badge is gated on indicator === "receiving"; the
    // testbench branch must use the testbench label.
    const testbenchBranch = PANEL.match(
      /indicator === "testbench"[\s\S]*?indicator === "receiving"/,
    );
    expect(testbenchBranch).toBeTruthy();
    expect(testbenchBranch?.[0]).toContain("EcoWitt testbench");
    expect(testbenchBranch?.[0]).not.toMatch(/Live connected/);
  });

  it("never renders the word live on any transport badge (#584)", () => {
    // Transport freshness must not borrow the strict taxonomy's vocabulary:
    // no badge copy may claim "live"; the receiving badge says unverified.
    const badgeFn = PANEL.match(/function indicatorBadge[\s\S]*?\n\}/);
    expect(badgeFn).toBeTruthy();
    expect(badgeFn?.[0]).not.toMatch(/Live\b/);
    expect(badgeFn?.[0]).toContain("Receiving data — unverified source");
  });

  it("uses bridge token Bearer auth for the test send", () => {
    expect(PANEL).toMatch(/Authorization: `Bearer \$\{reveal\}`/);
  });

  it("clears reveal/result when the tent changes", () => {
    expect(PANEL).toMatch(/setReveal\(null\)[\s\S]*setResult\(null\)[\s\S]*\}, \[tentId\]\)/);
  });
});
