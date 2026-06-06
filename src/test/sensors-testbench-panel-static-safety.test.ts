import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(
  resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"),
  "utf8",
);

describe("SensorsTestbenchPanel static safety", () => {
  it("does not reference service_role", () => {
    expect(PANEL).not.toMatch(/service_role/i);
    expect(PANEL).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does not log or console-print plaintext tokens", () => {
    expect(PANEL).not.toMatch(/console\.(log|info|warn|error)\([^)]*reveal/);
    expect(PANEL).not.toMatch(/analytics\.[a-z]+\([^)]*reveal/i);
  });

  it("does not label testbench data as live/healthy/connected sensor", () => {
    // The "Live connected sensor" string only appears in the live branch,
    // gated on indicator === "live". Testbench branch must use the
    // testbench label.
    const testbenchBranch = PANEL.match(/indicator === "testbench"[\s\S]*?indicator === "live"/);
    expect(testbenchBranch).toBeTruthy();
    expect(testbenchBranch?.[0]).toContain("EcoWitt testbench");
    expect(testbenchBranch?.[0]).not.toMatch(/Live connected/);
  });

  it("uses bridge token Bearer auth for the test send", () => {
    expect(PANEL).toMatch(/Authorization: `Bearer \$\{reveal\}`/);
  });

  it("clears reveal/result when the tent changes", () => {
    expect(PANEL).toMatch(/setReveal\(null\)[\s\S]*setResult\(null\)[\s\S]*\}, \[tentId\]\)/);
  });
});
