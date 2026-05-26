/**
 * NEX-7 Tests: Approval-required Alert → Action Queue handoff.
 *
 * Covers all required test cases from the specification.
 */

import { describe, it, expect } from "vitest";
import {
  createActionSuggestion,
  approveSuggestion,
  rejectSuggestion,
  type HandoffInput,
  type ActionSuggestion,
} from "./alertActionQueueHandoffRules";
import type { AlertLike } from "./alertToActionQueueRules";
import type { AiDoctorSensorContext } from "./aiDoctorSensorContextRules";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = "2026-05-26T00:00:00.000Z";

function makeAlert(overrides: Partial<AlertLike> = {}): AlertLike {
  return {
    id: "alert-001",
    grow_id: "grow-abc",
    tent_id: "tent-1",
    plant_id: null,
    status: "open",
    severity: "warning",
    metric: "temperature_c",
    reason: "Temperature is above optimal range",
    title: "High Temperature",
    source: "environment",
    ...overrides,
  };
}

function makeLiveContext(overrides: Partial<AiDoctorSensorContext> = {}): AiDoctorSensorContext {
  return {
    sourceState: "live",
    sourceLabel: "Live sensor",
    capturedAt: "2026-05-25T23:30:00.000Z",
    recordedAt: "2026-05-25T23:30:00.000Z",
    isStale: false,
    isInvalid: false,
    usableMetrics: ["temperature_c", "humidity_pct", "vpd_kpa"],
    missingMetrics: ["co2_ppm", "soil_moisture_pct"],
    invalidMetrics: [],
    confidenceImpact: "none",
    contextSummary: "Live sensor reading with 3 usable metric(s).",
    safetyNotes: [
      "CO₂ not reported: this is acceptable and does not indicate risk.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
    ...overrides,
  };
}

function makeManualContext(): AiDoctorSensorContext {
  return makeLiveContext({
    sourceState: "manual",
    sourceLabel: "Manual entry",
    confidenceImpact: "none",
    safetyNotes: [
      "Manual entry: values are user-reported and not hardware-verified.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
  });
}

function makeDemoContext(): AiDoctorSensorContext {
  return makeLiveContext({
    sourceState: "demo",
    sourceLabel: "Demo data",
    confidenceImpact: "severely-reduced",
    contextSummary:
      "Sensor data is from demo/synthetic source. Not suitable for real grow decisions.",
    safetyNotes: [
      "Demo data: not from a real grow environment.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
  });
}

function makeStaleContext(): AiDoctorSensorContext {
  return makeLiveContext({
    sourceState: "stale",
    sourceLabel: "Stale reading",
    isStale: true,
    confidenceImpact: "reduced",
    contextSummary: "Sensor reading is stale. Values may not reflect current conditions.",
    safetyNotes: [
      "Reading is stale: conditions may have changed since capture.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
  });
}

function makeInvalidContext(): AiDoctorSensorContext {
  return makeLiveContext({
    sourceState: "invalid",
    sourceLabel: "Invalid telemetry",
    isInvalid: true,
    usableMetrics: [],
    invalidMetrics: ["temperature_c", "humidity_pct"],
    confidenceImpact: "untrusted",
    contextSummary: "Sensor telemetry is invalid. Do not rely on these values.",
    safetyNotes: [
      "Invalid telemetry: do not trust these sensor values.",
      "Critical metrics invalid: cannot assess environment health.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
  });
}

function makeEnvironmentOnlyContext(): AiDoctorSensorContext {
  return makeLiveContext({
    usableMetrics: ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm"],
    missingMetrics: ["soil_moisture_pct"],
    safetyNotes: [
      "CO₂ is context-only: do not base aggressive recommendations on CO₂ alone.",
      "Environment readings only: do not recommend nutrient changes from sensor data alone.",
      "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
      "Do not suggest device control actions or automation changes.",
    ],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NEX-7: alertActionQueueHandoffRules", () => {
  describe("createActionSuggestion", () => {
    it("valid live alert creates pending approval suggestion", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        sensorContextId: "ctx-123",
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const s = result.suggestion;
      expect(s.status).toBe("pending_approval");
      expect(s.originatingAlertId).toBe("alert-001");
      expect(s.sensorContextId).toBe("ctx-123");
      expect(s.riskLevel).toBe("high"); // warning → high
      expect(s.suggestedAction).not.toBe("");
      expect(s.rationale).toContain("Temperature is above optimal range");
      expect(s.createdAt).toBe(FIXED_NOW);
    });

    it("manual source creates suggestion with manual-source label", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeManualContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.suggestion.sourceContext.sourceState).toBe("manual");
      expect(result.suggestion.sourceContext.sourceLabel).toBe("Manual entry");
    });

    it("demo source creates caution-only suggestion", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeDemoContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const s = result.suggestion;
      expect(s.sourceContext.sourceState).toBe("demo");
      expect(s.cautionNotes.length).toBeGreaterThan(0);
      expect(s.cautionNotes.some((n) => n.toLowerCase().includes("demo"))).toBe(true);
    });

    it("stale context reduces confidence and adds caution", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeStaleContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const s = result.suggestion;
      expect(s.sourceContext.isStale).toBe(true);
      expect(s.sourceContext.confidenceImpact).toBe("reduced");
      expect(s.cautionNotes.some((n) => n.toLowerCase().includes("stale"))).toBe(true);
    });

    it("invalid context blocks or severely limits suggestion", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeInvalidContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const s = result.suggestion;
      expect(s.sourceContext.isInvalid).toBe(true);
      expect(s.riskLevel).toBe("low"); // capped due to invalid
      expect(s.suggestedAction).toContain("Verify");
      expect(s.cautionNotes.some((n) => n.includes("invalid"))).toBe(true);
      expect(s.doNotDo.some((n) => n.includes("invalid"))).toBe(true);
    });

    it("environment-only context does not recommend nutrients", () => {
      const input: HandoffInput = {
        alert: makeAlert({ metric: "nutrient_ec" }),
        sensorContext: makeEnvironmentOnlyContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      // Should fail because environment-only context cannot recommend nutrient changes
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).toContain("environment_only");
    });

    it("originating alert ID is preserved", () => {
      const input: HandoffInput = {
        alert: makeAlert({ id: "alert-xyz-789" }),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.suggestion.originatingAlertId).toBe("alert-xyz-789");
      expect(result.suggestion.suggestionId).toBe("suggestion:alert-xyz-789");
    });

    it("sensor/context reference is preserved when available", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        sensorContextId: "snapshot-456",
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.suggestion.sensorContextId).toBe("snapshot-456");
    });

    it("sensor/context reference is null when not available", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.suggestion.sensorContextId).toBeNull();
    });

    it("deterministic output for same input", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        sensorContextId: "ctx-det",
        now: FIXED_NOW,
      };

      const result1 = createActionSuggestion(input);
      const result2 = createActionSuggestion(input);

      expect(result1).toEqual(result2);
    });

    it("no action is created directly from raw sensor reading (requires alert)", () => {
      // Must have a valid alert — sensor readings alone cannot produce suggestions
      const result = createActionSuggestion({
        alert: undefined as unknown as AlertLike,
        now: FIXED_NOW,
      });
      expect(result.ok).toBe(false);
    });

    it("rejects alert without open status", () => {
      const input: HandoffInput = {
        alert: makeAlert({ status: "resolved" }),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const result = createActionSuggestion(input);
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).toBe("alert_not_open");
    });
  });

  describe("approveSuggestion", () => {
    it("approval converts suggestion into non-executable queued action", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        sensorContextId: "ctx-approve",
        now: FIXED_NOW,
      };

      const handoff = createActionSuggestion(input);
      expect(handoff.ok).toBe(true);
      if (!handoff.ok) return;

      const approvalResult = approveSuggestion(
        handoff.suggestion,
        "Looks correct, proceeding.",
        "2026-05-26T01:00:00.000Z",
      );
      expect(approvalResult.ok).toBe(true);
      if (!approvalResult.ok) return;

      const qa = approvalResult.queuedAction;
      expect(qa.status).toBe("queued_non_executable");
      expect(qa.originatingAlertId).toBe("alert-001");
      expect(qa.sensorContextId).toBe("ctx-approve");
      expect(qa.approvedAt).toBe("2026-05-26T01:00:00.000Z");
      expect(qa.approvalNote).toBe("Looks correct, proceeding.");
    });

    it("cannot approve already-approved suggestion", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const handoff = createActionSuggestion(input);
      if (!handoff.ok) return;

      // Simulate approved status
      const approved: ActionSuggestion = { ...handoff.suggestion, status: "approved" };
      const result = approveSuggestion(approved);
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).toBe("suggestion_not_pending");
    });
  });

  describe("rejectSuggestion", () => {
    it("rejection creates auditable rejection result with reason", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const handoff = createActionSuggestion(input);
      expect(handoff.ok).toBe(true);
      if (!handoff.ok) return;

      const rejResult = rejectSuggestion(
        handoff.suggestion,
        "Sensor appears faulty, ignoring.",
        "2026-05-26T01:00:00.000Z",
      );
      expect(rejResult.ok).toBe(true);
      if (!rejResult.ok) return;

      const rec = rejResult.record;
      expect(rec.suggestionId).toBe(handoff.suggestion.suggestionId);
      expect(rec.originatingAlertId).toBe("alert-001");
      expect(rec.reason).toBe("Sensor appears faulty, ignoring.");
      expect(rec.rejectedBy).toBe("grower");
      expect(rec.rejectedAt).toBe("2026-05-26T01:00:00.000Z");
    });

    it("rejection requires a reason", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const handoff = createActionSuggestion(input);
      if (!handoff.ok) return;

      const result = rejectSuggestion(handoff.suggestion, "");
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).toBe("missing_rejection_reason");
    });
  });

  describe("safety constraints", () => {
    it("no device-control strings in suggestion output", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const forbidden = [
        "turn on",
        "turn off",
        "set device",
        "activate",
        "deactivate",
        "switch on",
        "switch off",
      ];
      const fullText = JSON.stringify(result.suggestion).toLowerCase();
      for (const term of forbidden) {
        expect(fullText).not.toContain(term);
      }
    });

    it("no automation strings in suggestion output", () => {
      const input: HandoffInput = {
        alert: makeAlert(),
        sensorContext: makeLiveContext(),
        now: FIXED_NOW,
      };
      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const forbidden = ["automatically", "auto-run", "scheduled execution", "cron"];
      const fullText = JSON.stringify(result.suggestion).toLowerCase();
      for (const term of forbidden) {
        expect(fullText).not.toContain(term);
      }
    });

    it("no service_role usage in module", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const source = fs.readFileSync(path.join(dir, "alertActionQueueHandoffRules.ts"), "utf-8");
      // Strip block comments and line comments, then check for service_role in code
      const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
      expect(codeOnly).not.toContain("service_role");
    });

    it("no UI rule duplication (module exports only pure helpers)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const source = fs.readFileSync(path.join(dir, "alertActionQueueHandoffRules.ts"), "utf-8");
      // Should not import React or use JSX
      expect(source).not.toContain('from "react"');
      expect(source).not.toContain("from 'react'");
      expect(source).not.toContain("useState");
      expect(source).not.toContain("useEffect");
      expect(source).not.toContain("JSX");
    });

    it("missing CO2 does not create risk by itself", () => {
      const context = makeLiveContext({
        missingMetrics: ["co2_ppm"],
      });
      const input: HandoffInput = {
        alert: makeAlert({ metric: "temperature_c" }),
        sensorContext: context,
        now: FIXED_NOW,
      };

      const result = createActionSuggestion(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Risk should be based on alert severity, not elevated by missing CO2
      expect(result.suggestion.riskLevel).toBe("high"); // from "warning" severity
      // No caution note about missing CO2 creating risk
      const cautionText = result.suggestion.cautionNotes.join(" ").toLowerCase();
      expect(cautionText).not.toContain("co2 risk");
    });
  });
});
