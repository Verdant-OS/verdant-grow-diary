import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const NEW_FILES = [
  "src/components/CanonicalSourceBadge.tsx",
  "src/components/SensorSnapshotDetailsDrawer.tsx",
  "src/lib/canonicalSourceBadgeViewModel.ts",
  "src/lib/sensorIngestAuditReportCsvExport.ts",
];

const FORBIDDEN = [
  /from\s+["']@\/integrations\/supabase\/client["']/,
  /\bservice_role\b/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /\.from\([^)]*\)\.(insert|update|delete|upsert)\(/,
  /navigator\.(serial|usb|bluetooth)/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/,
  /source:\s*["']ecowitt["']/,
];

describe("operator visibility polish — static safety", () => {
  for (const f of NEW_FILES) {
    it(`${f} contains no forbidden patterns`, () => {
      const src = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) {
        expect(src, `${f} matched ${re}`).not.toMatch(re);
      }
    });
  }
});
