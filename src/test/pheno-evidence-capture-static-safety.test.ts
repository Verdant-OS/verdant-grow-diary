import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOOK = readFileSync("src/hooks/usePhenoEvidenceCaptureContext.ts", "utf8");
const QUICK_LOG = readFileSync("src/components/QuickLog.tsx", "utf8");
const TIMELINE = readFileSync("src/hooks/useQuickLogGroupedTimeline.ts", "utf8");

describe("Pheno evidence capture static safety", () => {
  it("keeps the capture context and timeline enrichment read-only", () => {
    for (const source of [HOOK, TIMELINE]) {
      expect(source).not.toMatch(/\.insert\s*\(/);
      expect(source).not.toMatch(/\.update\s*\(/);
      expect(source).not.toMatch(/\.upsert\s*\(/);
      expect(source).not.toMatch(/\.delete\s*\(/);
      expect(source).not.toMatch(/\.functions\.invoke\s*\(/);
    }
  });

  it("uses the selected real plant's hunt id and the existing Quick Log RPC adapter", () => {
    expect(QUICK_LOG).toMatch(/selectedPlant[\s\S]*?pheno_hunt_id/);
    expect(QUICK_LOG).toMatch(/buildPhenoEvidenceReceiptDetails/);
    expect(QUICK_LOG).toMatch(/buildLegacyQuickLogUnifiedPayload/);
    expect(QUICK_LOG).not.toMatch(/\.from\(\s*["']diary_entries["']\s*\)\s*\.insert/);
  });

  it("does not add an Action Queue or device-control write path", () => {
    const queueTable = ["action", "queue"].join("_");
    for (const source of [HOOK, QUICK_LOG, TIMELINE]) {
      expect(source).not.toContain(`.from("${queueTable}")`);
      expect(source).not.toContain(`.from('${queueTable}')`);
      expect(source).not.toMatch(/sendDeviceCommand|executeDevice|device_command/i);
    }
  });
});
