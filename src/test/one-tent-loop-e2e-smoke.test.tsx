/**
 * One-Tent Loop — end-to-end smoke test (pure-rules orchestration).
 *
 * Walks the full grower-controlled loop using existing helpers — no
 * duplicated business rules, no live DB, no UI mocks of mocks:
 *
 *   manual reading
 *     → latest snapshot (source = "manual", never "live")
 *     → target comparison (real breach)
 *     → persistable environment alert
 *     → action_queue draft (approval-required, alert back-pointer, safe)
 *     → idempotency check (no duplicate when clicked twice)
 *     → grower-driven completion transition
 *     → follow-up diary draft + matcher (timeline + ActionDetail visibility)
 *
 * Safety fences asserted along the way:
 *   - manual sensor reading source is preserved
 *   - demo / stale / invalid contexts do NOT persist alerts
 *   - action_queue draft has no device-control language, no user_id, no
 *     service_role, no automation verbs
 *   - completion transition writes only status/completed_at — never device fields
 *   - follow-up diary entry never carries user_id; details link back to action
 */
import { describe, it, expect } from "vitest";

import {
  snapshotFromReadings,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { buildEnvironmentAlerts } from "@/lib/environmentAlerts";
import {
  selectPersistableAlerts,
  isSnapshotPersistable,
  derivedAlertKey,
} from "@/lib/environmentAlertPersistence";
import {
  buildActionQueueDraftFromAlert,
  actionMatchesAlert,
  type AlertLike,
} from "@/lib/alertToActionQueueRules";
import { buildTransitionPatch } from "@/lib/actionQueueTransitions";
import {
  buildActionFollowupDiaryDraft,
  followupMatchesAction,
  isActionEligibleForFollowup,
  ACTION_FOLLOWUP_EVENT_TYPE,
  type CompletedActionInput,
} from "@/lib/actionFollowupRules";

// --- Fixtures: real grow / tent / plant, manual reading only ---------------

const GROW_ID = "grow-e2e-1";
const TENT_ID = "tent-e2e-1";
const PLANT_ID = "plant-e2e-1";

const NOW_MS = Date.parse("2026-06-05T10:30:00Z");
const FRESH_TS = new Date(NOW_MS - 60_000).toISOString(); // 1 min ago

/** Single manual reading that breaches a high-humidity max target. */
const MANUAL_READINGS: SensorReadingLike[] = [
  { ts: FRESH_TS, metric: "temperature_c", value: 24.5, source: "manual" },
  { ts: FRESH_TS, metric: "humidity_pct", value: 78, source: "manual" },
];

const GROW_TARGETS = {
  temp: { min: 20, max: 28 },
  rh: { min: 40, max: 65 }, // 78% manual reading breaches max=65
};

const QUALITY_GOOD = { quality: "good" as const, reasons: [] as string[] };

describe("One-Tent Loop E2E smoke", () => {
  // --- Step 1: manual reading -> latest snapshot ---------------------------
  const snapshot = snapshotFromReadings(MANUAL_READINGS);

  it("manual reading produces a snapshot labelled 'manual' (never relabelled live)", () => {
    expect(snapshot).not.toBeNull();
    expect(snapshot!.source).toBe("manual");
    expect(snapshot!.rh).toBe(78);
    expect(snapshot!.ts).toBe(FRESH_TS);
  });

  it("latest snapshot reflects the newest manual reading", () => {
    // Add an older reading to confirm only the latest ts is folded in.
    const older: SensorReadingLike = {
      ts: new Date(NOW_MS - 60 * 60_000).toISOString(),
      metric: "humidity_pct",
      value: 55,
      source: "manual",
    };
    const snap = snapshotFromReadings([...MANUAL_READINGS, older]);
    expect(snap!.rh).toBe(78);
    expect(snap!.source).toBe("manual");
  });

  // --- Step 2: target breach -> derived alerts -----------------------------
  const targets = compareSnapshotToTargets(snapshot, GROW_TARGETS);
  const derivedAlerts = buildEnvironmentAlerts({
    snapshot,
    quality: QUALITY_GOOD,
    targets,
    now: NOW_MS,
  });

  it("target comparison flags the manual reading as breaching humidity max", () => {
    const rh = targets.metrics.find((m) => m.metric === "rh");
    expect(rh?.state).toBe("high");
    expect(targets.status === "out_of_range" || targets.status === "warning").toBe(true);
  });

  it("derives at least one real environment alert from the manual breach", () => {
    expect(derivedAlerts.length).toBeGreaterThan(0);
    const rhAlert = derivedAlerts.find((a) => a.metric === "rh");
    expect(rhAlert).toBeTruthy();
    expect(rhAlert!.severity).not.toBe("info"); // not a synthetic missing-data alert
  });

  // --- Step 3: persistability fences ---------------------------------------
  it("manual+good snapshot is persistable", () => {
    expect(
      isSnapshotPersistable({ snapshot, quality: "good", now: NOW_MS }),
    ).toBe(true);
  });

  it("demo data is NEVER persistable (no fake live data)", () => {
    const demoSnap = { ...snapshot!, source: "sim" as const };
    expect(
      isSnapshotPersistable({ snapshot: demoSnap, quality: "good", now: NOW_MS }),
    ).toBe(false);
    expect(
      isSnapshotPersistable({
        snapshot,
        quality: "good",
        isDemoData: true,
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("stale snapshot is NEVER persistable", () => {
    const staleSnap = {
      ...snapshot!,
      ts: new Date(NOW_MS - 90 * 60_000).toISOString(),
    };
    expect(
      isSnapshotPersistable({
        snapshot: staleSnap,
        quality: "good",
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  it("invalid (unavailable quality) snapshot is NEVER persistable", () => {
    expect(
      isSnapshotPersistable({
        snapshot,
        quality: "unavailable",
        now: NOW_MS,
      }),
    ).toBe(false);
  });

  const persistable = selectPersistableAlerts(derivedAlerts, {
    snapshot,
    quality: "good",
    now: NOW_MS,
  });

  it("persistable selection includes the real RH alert and excludes synthetic ones", () => {
    expect(persistable.length).toBeGreaterThan(0);
    for (const a of persistable) {
      expect(a.id).not.toMatch(/^snapshot:|^targets:/);
    }
    expect(persistable.find((a) => a.metric === "rh")).toBeTruthy();
  });

  // --- Step 4: alert row -> action_queue draft -----------------------------
  // Simulate the persisted alert row a grower would open in Alert Detail.
  const rhDerived = persistable.find((a) => a.metric === "rh")!;
  const persistedAlert: AlertLike = {
    id: "alert-e2e-1",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    status: "open",
    severity: rhDerived.severity,
    metric: "humidity_pct",
    title: rhDerived.title,
    reason: rhDerived.reason,
    source: "environment_alerts",
  };

  const draftResult = buildActionQueueDraftFromAlert(persistedAlert);

  it("Add to Action Queue produces an approval-required draft tied to the alert", () => {
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const d = draftResult.draft;
    expect(d.status).toBe("pending_approval");
    expect(d.source).toBe("environment_alert");
    expect(d.action_type).toBe("advisory");
    expect(d.grow_id).toBe(GROW_ID);
    expect(d.tent_id).toBe(TENT_ID);
    expect(d.reason).toContain("[alert:alert-e2e-1]"); // back-pointer
  });

  it("draft carries no executable device payload, no user_id, no service_role", () => {
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const blob = JSON.stringify(draftResult.draft).toLowerCase();
    for (const tok of [
      "user_id",
      "service_role",
      "mqtt",
      "relay",
      "actuator",
      "webhook",
      "turn on",
      "turn off",
      "auto-execute",
      "automatically",
    ]) {
      expect(blob).not.toContain(tok);
    }
  });

  it("clicking Add to Action Queue twice is idempotent — matcher recognises existing row", () => {
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    // First click writes a row with [alert:alert-e2e-1] in reason.
    const existingRow = {
      id: "aq-existing-1",
      source: "environment_alert",
      status: "pending_approval",
      reason: draftResult.draft.reason,
    };
    expect(actionMatchesAlert(existingRow, persistedAlert.id)).toBe(true);
    // Second click MUST detect the existing row and skip insert.
  });

  // --- Step 5: grower completes the action ---------------------------------
  const completionPatch = buildTransitionPatch(
    "complete",
    new Date(NOW_MS + 60 * 60_000),
  );

  it("completion transition writes only status + completed_at (no device fields)", () => {
    expect(completionPatch.status).toBe("completed");
    expect(completionPatch.completed_at).toBeTruthy();
    expect(Object.keys(completionPatch).sort()).toEqual(
      ["completed_at", "status"].sort(),
    );
    const blob = JSON.stringify(completionPatch).toLowerCase();
    for (const tok of ["device", "relay", "mqtt", "actuator", "turn on", "turn off"]) {
      expect(blob).not.toContain(tok);
    }
  });

  // --- Step 6: follow-up diary entry ---------------------------------------
  const completedAction: CompletedActionInput = {
    id: "aq-existing-1",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    target_metric: "humidity_pct",
    suggested_change: "Review humidity control and increase airflow.",
    reason: `Humidity is high (78% > 65%) [alert:${persistedAlert.id}]`,
    status: "completed",
    completed_at: completionPatch.completed_at!,
  };

  it("completed action is eligible for follow-up", () => {
    expect(isActionEligibleForFollowup(completedAction)).toBe(true);
  });

  const followup = buildActionFollowupDiaryDraft(completedAction);

  it("follow-up diary draft is built with no user_id and links back to the action", () => {
    expect(followup.ok).toBe(true);
    if (!followup.ok) return;
    const draft = followup.draft;
    expect(draft).not.toHaveProperty("user_id");
    expect(draft.grow_id).toBe(GROW_ID);
    expect(draft.tent_id).toBe(TENT_ID);
    expect(draft.plant_id).toBe(PLANT_ID);
    expect(draft.details.event_type).toBe(ACTION_FOLLOWUP_EVENT_TYPE);
    expect(draft.details.action_queue_id).toBe(completedAction.id);
    expect(draft.details.source_alert_id).toBe(persistedAlert.id);
    expect(typeof draft.note).toBe("string");
    expect((draft.note ?? "").length).toBeGreaterThan(0);
  });

  it("timeline / ActionDetail follow-up chip matches via followupMatchesAction", () => {
    expect(followup.ok).toBe(true);
    if (!followup.ok) return;
    const persistedDiaryRow = { details: followup.draft.details };
    expect(followupMatchesAction(persistedDiaryRow, completedAction.id)).toBe(true);
    expect(followupMatchesAction(persistedDiaryRow, "some-other-action")).toBe(false);
  });

  // --- Step 7: persistence idempotency across the rule key -----------------
  it("derived alert key is stable across consecutive snapshots (no duplicate rows)", () => {
    const k1 = derivedAlertKey(rhDerived);
    const k2 = derivedAlertKey({ ...rhDerived, reason: rhDerived.reason + " 2nd tick" });
    expect(k1).toBe(k2); // keyed on source/metric/title, not reason text
  });
});
