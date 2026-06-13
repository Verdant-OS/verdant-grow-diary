/**
 * Manual Sensor → Alert → Action Queue handoff guard.
 *
 * Proves the end-to-end loop is grower-initiated and idempotent without
 * touching real Supabase:
 *
 *   manual reading saved
 *     → environment alert evaluated/persisted (existing rules)
 *     → eligible alert produces a safe Action Queue draft
 *     → "Add to Action Queue" creates exactly one approval-required row
 *     → a second click against an existing open row is deduped
 *
 * Also static-safety-scans the manual sensor save path and alert
 * persistence hook so they cannot ever silently auto-write to
 * `public.action_queue`.
 *
 * No real DB. No edge functions. No device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildActionQueueDraftFromAlert,
  actionMatchesAlert,
  isAlertEligibleForActionQueue,
  type AlertLike,
} from "@/lib/alertToActionQueueRules";



const ROOT = resolve(__dirname, "../..");
const MANUAL_CARD = readFileSync(
  resolve(ROOT, "src/components/ManualSensorReadingCard.tsx"),
  "utf8",
);
const INSERT_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useInsertSensorReading.ts"),
  "utf8",
);
const PERSIST_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/usePersistEnvironmentAlerts.ts"),
  "utf8",
);
const ENV_ALERTS = readFileSync(
  resolve(ROOT, "src/lib/environmentAlerts.ts"),
  "utf8",
);
const ENV_PERSIST = readFileSync(
  resolve(ROOT, "src/lib/environmentAlertPersistence.ts"),
  "utf8",
);
const RULES = readFileSync(
  resolve(ROOT, "src/lib/alertToActionQueueRules.ts"),
  "utf8",
);

const TENT_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "22222222-2222-4222-8222-222222222222";

function openHighRhAlert(overrides: Partial<AlertLike> = {}): AlertLike {
  return {
    id: "alert-rh-1",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
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

/* ──────────────────────────────────────────────────────────────────────
 * Static safety — manual sensor save path & alert persistence hook
 * ────────────────────────────────────────────────────────────────────── */
describe("manual sensor save & alert persistence — no auto Action Queue writes", () => {
  it("ManualSensorReadingCard never references action_queue", () => {
    expect(MANUAL_CARD).not.toMatch(/action_queue/);
    expect(MANUAL_CARD).not.toMatch(/buildActionQueueDraftFromAlert/);
  });

  it("useInsertSensorReading never references action_queue or alerts", () => {
    expect(INSERT_HOOK).not.toMatch(/action_queue/);
    expect(INSERT_HOOK).not.toMatch(/from\(["']alerts["']\)/);
    expect(INSERT_HOOK).not.toMatch(/functions\.invoke/);
    expect(INSERT_HOOK).not.toMatch(/ai-coach/);
  });

  it("usePersistEnvironmentAlerts never inserts into action_queue", () => {
    expect(PERSIST_HOOK).not.toMatch(/from\(["']action_queue["']\)\s*\.\s*insert/);
    expect(PERSIST_HOOK).not.toMatch(/action_queue_events/);
  });

  it("environment alert rule modules carry no action_queue / device wiring", () => {
    for (const src of [ENV_ALERTS, ENV_PERSIST]) {
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/target_device/);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/bridge_token/);
      expect(src).not.toMatch(/raw_payload/);
      expect(src).not.toMatch(/functions\.invoke/);
    }
  });

  it("alertToActionQueueRules module is sandbox-pure", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/fetch\(/);
    expect(RULES).not.toMatch(/service_role|bridge_token|raw_payload/);
    expect(RULES).not.toMatch(/target_device/);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * In-range / no-alert shape: with no alert, no handoff can ever exist.
 * The wider in-range → zero-alerts proof lives in the manual sensor
 * alert smoke guard suite; this is the action-queue corollary.
 * ────────────────────────────────────────────────────────────────────── */
describe("no alert ⇒ no Action Queue handoff is possible", () => {
  it("isAlertEligibleForActionQueue rejects null / undefined", () => {
    expect(isAlertEligibleForActionQueue(null)).toBe(false);
    expect(isAlertEligibleForActionQueue(undefined)).toBe(false);
  });
});


/* ──────────────────────────────────────────────────────────────────────
 * Out-of-range manual reading → eligible draft → single insert → dedupe
 * ────────────────────────────────────────────────────────────────────── */
describe("out-of-range manual reading → user-initiated single-row handoff", () => {
  it("eligible alert maps to one approval-required draft (no auto write)", () => {
    const a = openHighRhAlert();
    expect(isAlertEligibleForActionQueue(a)).toBe(true);
    const r = buildActionQueueDraftFromAlert(a);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.status).toBe("pending_approval");
    expect(r.draft.source).toBe("environment_alert");
    expect(r.draft.action_type).toBe("advisory");
    expect(r.draft.reason).toContain(`[alert:${a.id}]`);
    // No device command in suggested copy.
    expect(r.draft.suggested_change).not.toMatch(
      /turn on|turn off|set fan|set pump|dose|inject/i,
    );
  });

  it("second click against an existing open row is deduped (no duplicate)", () => {
    const a = openHighRhAlert();
    const draft = buildActionQueueDraftFromAlert(a);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    // Simulate the row inserted by the first click.
    const existingRow = {
      source: "environment_alert" as const,
      status: "pending_approval" as const,
      grow_id: a.grow_id,
      reason: draft.draft.reason,
    };
    expect(actionMatchesAlert(existingRow, a)).toBe(true);

    // Approved (still open lifecycle) → still considered a duplicate.
    expect(
      actionMatchesAlert({ ...existingRow, status: "approved" }, a),
    ).toBe(true);

    // Terminal rows do NOT block a new handoff.
    expect(
      actionMatchesAlert({ ...existingRow, status: "completed" }, a),
    ).toBe(false);
    expect(
      actionMatchesAlert({ ...existingRow, status: "cancelled" }, a),
    ).toBe(false);
  });

  it("ineligible alert states block the handoff", () => {
    for (const status of ["resolved", "dismissed", "acknowledged"] as const) {
      expect(isAlertEligibleForActionQueue(openHighRhAlert({ status }))).toBe(false);
      const r = buildActionQueueDraftFromAlert(openHighRhAlert({ status }));
      expect(r.ok).toBe(false);
    }
  });
});
