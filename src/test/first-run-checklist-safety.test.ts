/**
 * Static safety scan for the First-Run Checklist:
 * - never mounted on public/demo/welcome routes
 * - no automation / device-control / live-required wording
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string) {
  return readFileSync(resolve(__dirname, "..", p), "utf8");
}

const PUBLIC_SURFACES = [
  "pages/Landing.tsx",
  "pages/Welcome.tsx",
  "pages/Auth.tsx",
  "pages/PartnerCsvPreviewLanding.tsx",
];

describe("FirstRunChecklist safety", () => {
  it("is not mounted on any public/demo/welcome surface", () => {
    for (const file of PUBLIC_SURFACES) {
      let src: string;
      try {
        src = read(file);
      } catch {
        continue;
      }
      expect(
        src.includes("FirstRunChecklist"),
        `${file} should not import or render FirstRunChecklist`,
      ).toBe(false);
    }
  });

  it("component copy avoids automation / device-control / live-required claims", () => {
    const vm = read("lib/firstRunChecklistViewModel.ts");
    const ui = read("components/FirstRunChecklist.tsx");
    const joined = vm + "\n" + ui;
    expect(joined).not.toMatch(/\bautomation\b/i);
    expect(joined).not.toMatch(/\bdevice control\b/i);
    expect(joined).not.toMatch(/live sensor data is required/i);
    expect(joined).not.toMatch(/\bguaranteed\b/i);
    expect(joined).not.toMatch(/\bconfirmed diagnosis\b/i);
  });

  it("is mounted on the authenticated Dashboard", () => {
    const dash = read("pages/Dashboard.tsx");
    expect(dash).toMatch(/FirstRunChecklist/);
  });
});
