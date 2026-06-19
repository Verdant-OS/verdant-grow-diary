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

  it("user-visible copy avoids automation / device-control / live-required claims", async () => {
    const mod = await import("@/lib/firstRunChecklistViewModel");
    const vm = mod.buildFirstRunChecklistViewModel({
      growCount: 0,
      tentCount: 0,
      plantCount: 0,
    });
    const allCopy = [
      vm.intro,
      vm.safetyNote,
      vm.completedHeadline,
      ...vm.steps.flatMap((s) => [s.label, s.description, s.ctaLabel]),
    ].join(" | ");
    expect(allCopy).not.toMatch(/\bautomation\b/i);
    expect(allCopy).not.toMatch(/\bdevice control\b/i);
    expect(allCopy).not.toMatch(/live sensor data is required/i);
    expect(allCopy).not.toMatch(/\bguaranteed\b/i);
    expect(allCopy).not.toMatch(/\bconfirmed diagnosis\b/i);
  });

  it("is mounted on the authenticated Dashboard", () => {
    const dash = read("pages/Dashboard.tsx");
    expect(dash).toMatch(/FirstRunChecklist/);
  });
});
