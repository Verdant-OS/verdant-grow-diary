import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const NEW_FILES = [
  "src/lib/ecowittBridgeTroubleshootingRules.ts",
  "src/lib/ecowittBridgeTroubleshootingViewModel.ts",
  "src/lib/sensorIngestAuditReportRules.ts",
  "src/lib/sensorIngestAuditReportViewModel.ts",
  "src/lib/environmentCheckSensorSnapshotLinkRules.ts",
  "src/components/EcowittBridgeTroubleshootingPanel.tsx",
  "src/components/SensorIngestAuditReport.tsx",
];

const FORBIDDEN = [
  /from\s+["']@\/integrations\/supabase\/client["']/,
  /\bservice_role\b/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /VERDANT_BRIDGE_TOKEN\s*=/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
  /\.from\([^)]*\)\.(insert|update|delete|upsert)\(/,
  /navigator\.serial|navigator\.usb|navigator\.bluetooth/,
];

describe("operator-visibility static safety", () => {
  for (const f of NEW_FILES) {
    it(`${f} contains no forbidden patterns`, () => {
      const src = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) {
        expect(src, `${f} matched ${re}`).not.toMatch(re);
      }
    });
  }

  it("no test file leaks a token-shaped literal", () => {
    const dir = "src/test";
    const ours = readdirSync(dir).filter((n) =>
      [
        "ecowitt-bridge-troubleshooting-rules.test.ts",
        "ecowitt-bridge-troubleshooting-panel.test.tsx",
        "sensor-ingest-audit-report-rules.test.ts",
        "sensor-ingest-audit-report.test.tsx",
        "environment-check-sensor-snapshot-link-rules.test.ts",
      ].includes(n),
    );
    for (const n of ours) {
      const src = readFileSync(join(dir, n), "utf8");
      expect(src).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});
