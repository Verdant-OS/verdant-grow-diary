/**
 * Tests for aiDoctorCheckInReceiptView — pure plain-text receipt formatter.
 *
 * Verifies deterministic formatting, field inclusion, exclusion of secrets,
 * and the mandatory preview-only source note.
 */
import { describe, it, expect } from "vitest";
import {
  formatAiDoctorCheckInReceipt,
  type AiDoctorCheckInReceiptInput,
} from "@/lib/aiDoctorCheckInReceiptView";
import type { AiDoctorCheckInPreviewView } from "@/lib/aiDoctorCheckInPreviewViewModel";

const NOW = new Date("2026-06-10T12:00:00.000Z");

function makeView(
  overrides: Partial<AiDoctorCheckInPreviewView> = {},
): AiDoctorCheckInPreviewView {
  return {
    notices: {
      previewOnly: "Preview only — not saved.",
      noModelCalled: "No live AI model was called.",
    },
    contextWeak: false,
    summary: "Cautious observation-only summary.",
    likelyIssue: "Possible heat stress.",
    confidence: 0.35,
    confidenceBand: "low",
    evidence: ["Sensor group live: 3 reading(s) in last 7d"],
    missingInformation: ["No recent grow events."],
    possibleCauses: ["Environmental drift."],
    immediateAction: "Observe and re-check.",
    whatNotToDo: ["Do not adjust nutrients."],
    followUp24h: "Re-check sensors.",
    recoveryPlan3Day: "Log daily.",
    riskLevel: "low",
    limitations: [],
    actionQueueSuggestion: null,
    ...overrides,
  };
}

describe("formatAiDoctorCheckInReceipt", () => {
  it("includes title and local timestamp", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    expect(receipt.title).toBe("AI Doctor Check-In Preview");
    expect(receipt.generatedAt).toBe("2026-06-10T12:00:00.000Z");
    expect(receipt.body).toContain("AI Doctor Check-In Preview");
    expect(receipt.body).toContain("Generated: 2026-06-10T12:00:00.000Z");
  });

  it("includes plant name, id, and stage when available", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      plantName: "Plant A",
      plantId: "p1",
      stage: "veg",
      now: NOW,
    });
    expect(receipt.body).toContain("Plant: Plant A");
    expect(receipt.body).toContain("Plant ID: p1");
    expect(receipt.body).toContain("Stage: veg");
  });

  it("omits plant/stage fields when null or undefined", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    expect(receipt.body).not.toContain("Plant:");
    expect(receipt.body).not.toContain("Plant ID:");
    expect(receipt.body).not.toContain("Stage:");
  });

  it("includes summary, likely issue, confidence, evidence, missing info, immediate action, what not to do, follow-up, recovery plan, and risk", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    expect(receipt.body).toContain("Cautious observation-only summary.");
    expect(receipt.body).toContain("Possible heat stress.");
    expect(receipt.body).toContain("Confidence: low (0.35)");
    expect(receipt.body).toContain("Sensor group live: 3 reading(s) in last 7d");
    expect(receipt.body).toContain("No recent grow events.");
    expect(receipt.body).toContain("Observe and re-check.");
    expect(receipt.body).toContain("Do not adjust nutrients.");
    expect(receipt.body).toContain("Re-check sensors.");
    expect(receipt.body).toContain("Log daily.");
    expect(receipt.body).toContain("Risk Level: low");
  });

  it("includes the preview-only / no-live-AI source note", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    expect(receipt.body).toContain("Preview only — not saved.");
    expect(receipt.body).toContain("No live AI model was called.");
  });

  it("is deterministic with injected timestamp", () => {
    const input = { view: makeView(), now: NOW };
    const a = formatAiDoctorCheckInReceipt(input);
    const b = formatAiDoctorCheckInReceipt(input);
    expect(a.body).toBe(b.body);
    expect(a.generatedAt).toBe(b.generatedAt);
  });

  it("excludes raw payloads, secrets, token-like values", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    // No JWT-looking strings
    expect(receipt.body).not.toMatch(/eyJ[\w-]+\.eyJ[\w-]+/);
    // No api key patterns
    expect(receipt.body).not.toMatch(/api[_-]?key/i);
    expect(receipt.body).not.toMatch(/service[_-]?role/i);
    expect(receipt.body).not.toMatch(/secret/i);
    expect(receipt.body).not.toMatch(/token/i);
  });

  it("handles empty evidence and missing information gracefully", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView({ evidence: [], missingInformation: [] }),
      now: NOW,
    });
    expect(receipt.body).toContain("No evidence collected for this preview.");
    expect(receipt.body).toContain("No critical missing information detected.");
  });

  it("handles empty whatNotToDo with em dash", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView({ whatNotToDo: [] }),
      now: NOW,
    });
    expect(receipt.body).toContain("What Not To Do");
    expect(receipt.body).toContain("—");
  });

  it("outputs null plantName/plantId/stage when not provided", () => {
    const receipt = formatAiDoctorCheckInReceipt({
      view: makeView(),
      now: NOW,
    });
    expect(receipt.plantName).toBeNull();
    expect(receipt.plantId).toBeNull();
    expect(receipt.stage).toBeNull();
  });
});
