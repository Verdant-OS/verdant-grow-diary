import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const NEW_OR_TOUCHED = [
  "src/components/SensorIngestAuditReport.tsx",
  "src/components/EnvironmentCheckSnapshotLinkButton.tsx",
  "src/lib/sensorIngestAuditReportRules.ts",
];

const FORBIDDEN = [
  /from\s+["']@\/integrations\/supabase\/client["']/,
  /\bservice_role\b/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /\.from\([^)]*\)\.(insert|update|delete|upsert)\(/,
  /navigator\.(serial|usb|bluetooth)/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
];

describe("operator-visibility wiring — static safety", () => {
  for (const f of NEW_OR_TOUCHED) {
    it(`${f} contains no forbidden patterns`, () => {
      const src = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) {
        expect(src, `${f} matched ${re}`).not.toMatch(re);
      }
    });
  }

  it("Sensors operator section uses search-param gating only (no role mutation)", () => {
    const src = readFileSync("src/pages/Sensors.tsx", "utf8");
    expect(src).toContain('searchParams.get("operator") === "1"');
    expect(src).not.toMatch(/\.from\([^)]*\)\.(insert|update|delete|upsert)\(/);
  });
});
