/**
 * alert → action_queue handoff
 *
 * Pure-rules tests + static safety assertions on AlertDetail.
 * No live DB. No automation. No device control.
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


const ROOT = resolve(__dirname, "../..");
const ALERT_DETAIL = readFileSync(
  resolve(ROOT, "src/pages/AlertDetail.tsx"),
  "utf8",
);
const PERSIST_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/usePersistEnvironmentAlerts.ts"),
  "utf8",
);
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const RULES = readFileSync(
  resolve(ROOT, "src/lib/alertToActionQueueRules.ts"),
  "utf8",
);

function baseAlert(overrides: Partial<AlertLike> = {}): AlertLike {
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

describe("alertToActionQueueRules — pure mapping", () => {
  it("maps a high-humidity alert to a safe suggested draft", () => {
    const r = buildActionQueueDraftFromAlert(baseAlert());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.suggested_change).toMatch(/airflow or dehumidification/i);
    expect(r.draft.action_type).toBe("advisory");

    expect(r.draft.source).toBe("environment_alert");
    expect(r.draft.status).toBe("pending_approval");
    expect(r.draft.risk_level).toBe("high");
    expect(r.draft.target_metric).toBe("humidity_pct");
    expect(r.draft.grow_id).toBe("grow-1");
    expect(r.draft.tent_id).toBe("tent-1");
    expect(r.draft.reason).toContain("[alert:alert-1]");
  });

  it("maps temp + vpd directions deterministically", () => {
    const hot = buildActionQueueDraftFromAlert(
      baseAlert({ metric: "temperature_c", reason: "Temperature is high" }),
    );
    const cold = buildActionQueueDraftFromAlert(
      baseAlert({ metric: "temperature_c", reason: "Temperature is low" }),
    );
    const highVpd = buildActionQueueDraftFromAlert(
      baseAlert({ metric: "vpd_kpa", reason: "VPD is high" }),
    );
    const lowVpd = buildActionQueueDraftFromAlert(
      baseAlert({ metric: "vpd_kpa", reason: "VPD is low" }),
    );
    expect(hot.ok && hot.draft.suggested_change).toMatch(/heat load/i);
    expect(cold.ok && cold.draft.suggested_change).toMatch(/raise temperature/i);
    expect(highVpd.ok && highVpd.draft.suggested_change).toMatch(/RH and temperature balance/i);
    expect(lowVpd.ok && lowVpd.draft.suggested_change).toMatch(/reduce overly humid/i);
  });

  it("rejects alerts missing grow_id / metric / reason / non-open status", () => {
    expect(buildActionQueueDraftFromAlert(baseAlert({ grow_id: null })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(baseAlert({ metric: null })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(baseAlert({ reason: "" })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(baseAlert({ status: "resolved" })).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert(baseAlert({ status: "dismissed" })).ok).toBe(false);
  });

  it("never emits executable device commands or nutrient changes", () => {
    const metrics = ["humidity_pct", "temperature_c", "vpd_kpa", "co2_ppm", "soil_moisture_pct"];
    for (const m of metrics) {
      const txt = recommendedActionForAlert(baseAlert({ metric: m })).toLowerCase();
      expect(txt).not.toMatch(/mqtt|webhook|relay|actuator|home[- ]?assistant|turn on|turn off|execute|nutrient|feed strength|ec to|ph to/);
      expect(txt).toMatch(/review/);
    }
  });

  it("actionMatchesAlert is idempotent on back-pointer + source + status + grow", () => {
    const alert = baseAlert();
    const row = {
      source: "environment_alert",
      status: "pending_approval",
      reason: "Humidity is high [alert:alert-1]",
      grow_id: "grow-1",
    };
    expect(actionMatchesAlert(row, alert)).toBe(true);
    expect(actionMatchesAlert({ ...row, status: "rejected" }, alert)).toBe(false);
    expect(actionMatchesAlert({ ...row, source: "ai_coach" }, alert)).toBe(false);
    expect(actionMatchesAlert({ ...row, grow_id: "other" }, alert)).toBe(false);
    expect(actionMatchesAlert({ ...row, reason: "no token" }, alert)).toBe(false);
  });
});

describe("AlertDetail — static safety", () => {
  it("renders Add to Action Queue button (eligible open alerts only)", () => {
    expect(ALERT_DETAIL).toMatch(/Add to Action Queue/);
    expect(ALERT_DETAIL).toMatch(/alert\.status === "open"/);
  });

  it("renders Already in Action Queue state when an existing row is found", () => {
    expect(ALERT_DETAIL).toMatch(/Already in Action Queue/);
    expect(ALERT_DETAIL).toMatch(/existingActionId/);
  });

  it("does NOT include user_id in client insert payload", () => {
    const match = ALERT_DETAIL.match(
      /\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/\buser_id\s*:/);
  });

  it("pins status='pending_approval' and source='environment_alert'", () => {
    expect(ALERT_DETAIL).toMatch(/status:\s*draft\.status/);
    expect(RULES).toMatch(/status:\s*"pending_approval"/);
    expect(RULES).toMatch(/source:\s*"environment_alert"/);
  });

  it("creation is wired to a click handler, not an effect", () => {
    expect(ALERT_DETAIL).toMatch(/onClick=\{addAlertToActionQueue\}/);
    expect(ALERT_DETAIL).not.toMatch(/useEffect\([\s\S]{0,400}action_queue[\s\S]{0,200}\.insert\(/);
  });

  it("does not introduce a device-control surface or service_role", () => {
    expect(ALERT_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("does not duplicate the alert-to-action mapping table inside JSX", () => {
    // Only the rules module owns the recommendation text.
    expect(ALERT_DETAIL).not.toMatch(/Review heat load, exhaust/);
    expect(ALERT_DETAIL).not.toMatch(/raise RH gradually/);
  });
});

describe("Alert persistence stays non-automated", () => {
  it("usePersistEnvironmentAlerts does NOT write to action_queue", () => {
    expect(PERSIST_HOOK).not.toMatch(/action_queue/);
  });
  it("Dashboard does not auto-create action_queue rows from alerts", () => {
    expect(DASHBOARD).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,200}\.insert\(/);
  });
});
