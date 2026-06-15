/**
 * Action Queue review safety polish — presenter-only.
 *
 * Locks in:
 *  - Safe target_device fallback (never renders raw enum/internal value).
 *  - Environment alert label helper renders safe names; unknown -> "Environment alert".
 *  - Approval dialog includes explicit no-automatic-equipment-command reassurance.
 *  - Action Queue row + Action Detail show neutral evidence-quality copy when
 *    sanitized snapshot evidence is unavailable.
 *  - No raw token / payload / service_role leakage in the polished surfaces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatActionTargetLabel,
  APPROVE_DIALOG_REASSURANCE,
  ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE,
} from "@/lib/actionQueueRowView";
import {
  formatEnvironmentAlertLabel,
  ENVIRONMENT_ALERT_FALLBACK_LABEL,
} from "@/lib/environmentAlertLabelRules";

describe("formatActionTargetLabel — safe target_device fallback", () => {
  it("returns the metric verbatim when target_metric is set", () => {
    expect(formatActionTargetLabel("vpd", null)).toBe("vpd");
    expect(formatActionTargetLabel("temperature_c", "fan_a")).toBe("temperature_c");
  });

  it("never renders a raw target_device value, even hardware-looking ones", () => {
    expect(formatActionTargetLabel(null, "fan_a")).toBe("Grow-room equipment");
    expect(formatActionTargetLabel(null, "relay_2")).toBe("Grow-room equipment");
    expect(formatActionTargetLabel("", "humidifier-3")).toBe("Grow-room equipment");
  });

  it("falls back to a manual-review label when neither is set", () => {
    expect(formatActionTargetLabel(null, null)).toBe("Manual review target");
    expect(formatActionTargetLabel("", "")).toBe("Manual review target");
    expect(formatActionTargetLabel(undefined, undefined)).toBe(
      "Manual review target",
    );
  });
});

describe("formatEnvironmentAlertLabel — safe environment alert labels", () => {
  it("maps known internal enum types to grower-friendly labels", () => {
    expect(formatEnvironmentAlertLabel("high_vpd")).toBe("High VPD");
    expect(formatEnvironmentAlertLabel("low_humidity")).toBe("Low humidity");
    expect(formatEnvironmentAlertLabel("HIGH_TEMPERATURE")).toBe("High temperature");
  });

  it("renders 'Environment alert' for unknown / malformed inputs (never raw enum)", () => {
    expect(formatEnvironmentAlertLabel("mystery_signal")).toBe(
      ENVIRONMENT_ALERT_FALLBACK_LABEL,
    );
    expect(formatEnvironmentAlertLabel("")).toBe(ENVIRONMENT_ALERT_FALLBACK_LABEL);
    expect(formatEnvironmentAlertLabel(null)).toBe(ENVIRONMENT_ALERT_FALLBACK_LABEL);
    expect(formatEnvironmentAlertLabel(undefined)).toBe(
      ENVIRONMENT_ALERT_FALLBACK_LABEL,
    );
    // never echoes the raw token back
    expect(formatEnvironmentAlertLabel("mystery_signal")).not.toMatch(
      /mystery_signal/,
    );
  });
});

describe("APPROVE_DIALOG_REASSURANCE — explicit no-automatic-command copy", () => {
  it("contains explicit reassurance that no equipment command runs automatically", () => {
    expect(APPROVE_DIALOG_REASSURANCE).toMatch(/will not send equipment commands automatically/i);
    expect(APPROVE_DIALOG_REASSURANCE).toMatch(/records your decision/i);
  });

  it("does not use device-control / automation language outside the reassurance", () => {
    // Calm framing only — no "execute", "dispatch", "trigger", "autopilot"
    expect(APPROVE_DIALOG_REASSURANCE).not.toMatch(/execute|dispatch|autopilot|trigger/i);
  });
});

describe("ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE — neutral evidence chip copy", () => {
  it("is calm, does not claim current-room support, and references the action record", () => {
    expect(ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE).toBe(
      "Evidence quality: not available from this action record",
    );
    expect(ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE).not.toMatch(/healthy|live|current room/i);
  });
});

// ---------------------------------------------------------------------------
// Source scans — confirm the polish is wired into the grower-facing surfaces
// and that no raw payload / token / service_role / internal id leaks alongside it.
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE_SRC = readFileSync(
  resolve(ROOT, "src/pages/ActionQueue.tsx"),
  "utf8",
);
const ACTION_DETAIL_SRC = readFileSync(
  resolve(ROOT, "src/pages/ActionDetail.tsx"),
  "utf8",
);

describe("Action Queue / Action Detail — wired polish", () => {
  it("Action Queue row uses formatActionTargetLabel instead of the raw target_device fallback", () => {
    expect(ACTION_QUEUE_SRC).toContain("formatActionTargetLabel");
    // Old pattern must be gone from grower-visible fallback spots.
    expect(ACTION_QUEUE_SRC).not.toMatch(/row\.target_metric\s*\?\?\s*row\.target_device/);
  });

  it("Action Queue + Action Detail include the approval reassurance constant", () => {
    expect(ACTION_QUEUE_SRC).toContain("APPROVE_DIALOG_REASSURANCE");
    expect(ACTION_DETAIL_SRC).toContain("APPROVE_DIALOG_REASSURANCE");
  });

  it("Action Queue + Action Detail surface the neutral evidence-quality copy", () => {
    expect(ACTION_QUEUE_SRC).toContain("ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE");
    expect(ACTION_DETAIL_SRC).toContain("ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE");
  });

  it("polished surfaces never reference raw_payload / service_role / secrets", () => {
    for (const src of [ACTION_QUEUE_SRC, ACTION_DETAIL_SRC]) {
      expect(src).not.toMatch(/raw_payload/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/i);
    }
  });

  it("polished surfaces do not introduce device-control language", () => {
    const banned = [
      /\bautopilot\b/i,
      /\bauto[-_ ]?execute\b/i,
      /\bdispatch[_-]?command\b/i,
      /\bexecute_action\b/i,
      /\brelay\.(on|off|toggle)/i,
      /\bactuator\.(send|trigger|run|fire)/i,
    ];
    for (const src of [ACTION_QUEUE_SRC, ACTION_DETAIL_SRC]) {
      for (const re of banned) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
