/**
 * Pure-helper coverage for `src/lib/alertToActionQueueRules.ts`, scoped to the
 * Manual Sensor Alert → Alert Detail → Action Queue handoff guard.
 *
 * Confirms the mapping is deterministic, safe, review-first, and never emits
 * executable device commands or nutrient changes from environment-only alerts.
 *
 * Companion file: `alert-to-action-queue.test.ts` already covers the broad
 * pure-rules surface — this file pins the specific guarantees the manual
 * sensor handoff relies on so a regression here fails fast under
 * `bunx vitest run src/test/alert-to-action-queue-rules.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  actionMatchesAlert,
  buildActionQueueDraftFromAlert,
  isAlertEligibleForActionQueue,
  recommendedActionForAlert,
  type AlertLike,
} from "@/lib/alertToActionQueueRules";

function alert(overrides: Partial<AlertLike> = {}): AlertLike {
  return {
    id: "alert-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: null,
    status: "open",
    severity: "warning",
    metric: "humidity_pct",
    reason: "Humidity is high (78% > 65%)",
    title: "High humidity",
    source: "environment_alerts",
    ...overrides,
  };
}

const EXECUTABLE_VERBS =
  /\b(turn on|turn off|enable|disable|start|stop|open|close|set\s+(?:fan|pump|light|heater|humidifier|dehumidifier)|dose|inject|feed (?:more|less)|nutrient (?:increase|decrease)|nute|add\s+nutrient)\b/i;

const FORBIDDEN_TOKENS =
  /(service_role|bridge_token|raw_payload|functions\.invoke|ai-coach|ai_doctor|sensor_readings)/i;

describe("alertToActionQueueRules — manual-sensor-aligned mappings", () => {
  it("maps high humidity to review-first text (no device verbs, no nutes)", () => {
    const r = buildActionQueueDraftFromAlert(alert());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.suggested_change).toMatch(/humidity|dehumid|airflow/i);
    expect(r.draft.suggested_change).not.toMatch(EXECUTABLE_VERBS);
    expect(r.draft.suggested_change).not.toMatch(/nutrient|feed|EC|ppm of/i);
  });

  it("maps low humidity to gradual humidification copy", () => {
    const t = recommendedActionForAlert(
      alert({ reason: "Humidity is low (28% < 40%)" }),
    );
    expect(t).toMatch(/humid/i);
    expect(t).not.toMatch(EXECUTABLE_VERBS);
  });

  it("maps high temperature to heat-load review", () => {
    const t = recommendedActionForAlert(
      alert({ metric: "temperature_c", reason: "Temp too high (32C > 28C)" }),
    );
    expect(t).toMatch(/heat|exhaust|light/i);
    expect(t).not.toMatch(EXECUTABLE_VERBS);
  });

  it("maps low temperature to gradual warm-up", () => {
    const t = recommendedActionForAlert(
      alert({ metric: "temperature_c", reason: "Temp too low (15C < 20C)" }),
    );
    expect(t).toMatch(/temperature|heater/i);
    expect(t).not.toMatch(EXECUTABLE_VERBS);
  });

  it("maps high VPD to balance review (no irrigation/feed change)", () => {
    const t = recommendedActionForAlert(
      alert({ metric: "vpd_kpa", reason: "VPD high (1.8 > 1.5)" }),
    );
    expect(t).toMatch(/RH|temperature|balance/i);
    expect(t).not.toMatch(EXECUTABLE_VERBS);
    expect(t).not.toMatch(/change irrigation now|change feed now/i);
  });

  it("maps low VPD to airflow/RH reduction copy", () => {
    const t = recommendedActionForAlert(
      alert({ metric: "vpd_kpa", reason: "VPD low (0.4 < 0.6)" }),
    );
    expect(t).toMatch(/RH|airflow|humid/i);
    expect(t).not.toMatch(EXECUTABLE_VERBS);
  });

  it("rejects closed / resolved / dismissed / acknowledged alerts", () => {
    for (const status of ["resolved", "dismissed", "acknowledged"] as const) {
      const r = buildActionQueueDraftFromAlert(alert({ status }));
      expect(r.ok).toBe(false);
      expect(isAlertEligibleForActionQueue(alert({ status }))).toBe(false);
    }
  });

  it("rejects alerts missing required context", () => {
    expect(buildActionQueueDraftFromAlert(alert({ id: "" })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(alert({ grow_id: null })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(alert({ metric: null })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(alert({ reason: "  " })).ok).toBe(false);
  });

  it("rejects synthetic 'data unavailable' alerts", () => {
    expect(
      buildActionQueueDraftFromAlert(alert({ id: "snapshot:unavailable" })).ok,
    ).toBe(false);
    expect(
      buildActionQueueDraftFromAlert(alert({ metric: "snapshot" })).ok,
    ).toBe(false);
  });

  it("draft is approval-required, advisory, and back-pointer-stamped", () => {
    const r = buildActionQueueDraftFromAlert(alert({ id: "alert-xyz" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.status).toBe("pending_approval");
    expect(r.draft.action_type).toBe("advisory");
    expect(r.draft.source).toBe("environment_alert");
    expect(r.draft.reason).toContain("[alert:alert-xyz]");
    expect(r.draft.alert_back_pointer).toBe("[alert:alert-xyz]");
  });

  it("actionMatchesAlert only matches non-terminal rows with the back-pointer", () => {
    const a = alert({ id: "alert-7" });
    expect(
      actionMatchesAlert(
        {
          source: "environment_alert",
          status: "pending_approval",
          grow_id: "grow-1",
          reason: "x [alert:alert-7] y",
        },
        a,
      ),
    ).toBe(true);
    // terminal status → not a duplicate
    expect(
      actionMatchesAlert(
        {
          source: "environment_alert",
          status: "completed",
          grow_id: "grow-1",
          reason: "x [alert:alert-7] y",
        },
        a,
      ),
    ).toBe(false);
    // wrong source / wrong back-pointer
    expect(
      actionMatchesAlert(
        {
          source: "ai_doctor",
          status: "pending_approval",
          grow_id: "grow-1",
          reason: "x [alert:alert-7] y",
        },
        a,
      ),
    ).toBe(false);
  });

  it("draft never emits forbidden tokens or executable device commands", () => {
    for (const metric of [
      "humidity_pct",
      "temperature_c",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
    ]) {
      for (const direction of ["too high", "too low"]) {
        const r = buildActionQueueDraftFromAlert(
          alert({ metric, reason: `${metric} ${direction}` }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.draft.suggested_change).not.toMatch(EXECUTABLE_VERBS);
        expect(r.draft.suggested_change).not.toMatch(FORBIDDEN_TOKENS);
        expect(r.draft.reason).not.toMatch(FORBIDDEN_TOKENS);
      }
    }
  });
});

describe("alertToActionQueueRules — module-level static safety", () => {
  const RULES = readFileSync(
    resolve(__dirname, "../lib/alertToActionQueueRules.ts"),
    "utf8",
  );

  it("rules module references no sensitive backend / model surfaces", () => {
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/bridge_token/);
    expect(RULES).not.toMatch(/raw_payload/);
    expect(RULES).not.toMatch(/functions\.invoke/);
    expect(RULES).not.toMatch(/ai-coach/);
    expect(RULES).not.toMatch(/ai_doctor_sessions/);
    expect(RULES).not.toMatch(/from\(["']sensor_readings["']\)/);
  });

  it("rules module declares no device-control fields", () => {
    expect(RULES).not.toMatch(/target_device/);
  });
});
