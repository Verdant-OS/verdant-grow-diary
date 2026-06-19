import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FLOW_DOC = resolve(__dirname, "../../docs/ai-doctor-phase1-read-only-flow.md");
const QA_DOC = resolve(__dirname, "../../docs/qa/ai-doctor-phase1-read-only-checklist.md");

describe("AI Doctor Phase 1 read-only docs", () => {
  it("both docs files exist", () => {
    expect(existsSync(FLOW_DOC)).toBe(true);
    expect(existsSync(QA_DOC)).toBe(true);
  });

  it("docs include required safety and source-truth phrases", () => {
    const flow = readFileSync(FLOW_DOC, "utf8");
    const qa = readFileSync(QA_DOC, "utf8");
    const combined = `${flow}\n${qa}`;

    const required = [
      "/operator/ai-doctor-phase1",
      "No Action Queue writes",
      "No diary/timeline writes",
      "No live AI/model calls",
      "No device control",
      "Unknown plantId blocks result rendering",
      "Stale/invalid/degraded telemetry must not be treated as healthy",
    ];

    for (const phrase of required) {
      expect(
        combined.toLowerCase().includes(phrase.toLowerCase()),
        `expected docs to mention: ${phrase}`,
      ).toBe(true);
    }
  });
});
