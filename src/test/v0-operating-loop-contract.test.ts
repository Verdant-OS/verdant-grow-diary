/**
 * V0 Operating Loop — Contract Test
 *
 * Locks down the core product spine so future changes cannot silently
 * break it:
 *
 *   manual/real reading → dashboard snapshot → derived alert →
 *   persisted alert + alert_events → AlertDetail → user-initiated
 *   Action Queue handoff → provenance → ActionDetail backlink →
 *   stale-warning behavior when source alert closes.
 *
 * Deterministic only: no Supabase, no network, no React rendering.
 * Asserts pure helpers, static page contracts, and safety properties.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isSnapshotPersistable, selectPersistableAlerts } from "@/lib/environmentAlertPersistence";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQuality } from "@/lib/sensorQuality";
import {
  buildActionQueueDraftFromAlert,
  actionMatchesAlert,
} from "@/lib/alertToActionQueueRules";
import {
  ACTION_QUEUE_SOURCE_VALUES,
  extractSourceAlertId,
  hasPendingActionsForClosedAlert,
  isActionDerivedFromAlert,
  isAlertDerived,
  isClosedAlertStatus,
  shouldWarnPendingActionHasClosedSourceAlert,
} from "@/lib/actionQueueProvenanceRules";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const ALERT_DETAIL = read("src/pages/AlertDetail.tsx");
const ACTION_DETAIL = read("src/pages/ActionDetail.tsx");
const ACTION_QUEUE = read("src/pages/ActionQueue.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const MANUAL_CARD = read("src/components/ManualSensorReadingCard.tsx");
const DEMO_DOC = read("docs/v0-operating-loop-demo.md");

// ---------- helpers --------------------------------------------------------

function freshManualSnapshot(): SensorSnapshot {
  return {
    source: "manual",
    ts: new Date().toISOString(),
    temp: 31, // out-of-range high to trigger a derived alert
    rh: 65,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
}

function realDerivedTempAlert(): EnvironmentAlert {
  return {
    id: "temp:high",
    severity: "warning",
    metric: "temp",
    title: "Temperature high",
    reason: "Temperature is above the target range.",
    source: "target_comparison",
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// 1. Manual readings are treated as real when fresh and valid
// ============================================================================
describe("V0 loop · manual readings count as real input", () => {
  it("isSnapshotPersistable accepts a fresh manual snapshot", () => {
    const ctx = { snapshot: freshManualSnapshot(), quality: "good" as SensorQuality };
    expect(isSnapshotPersistable(ctx)).toBe(true);
  });

  it("rejects stale, unavailable, demo, or non-live/manual snapshots", () => {
    const fresh = freshManualSnapshot();
    expect(
      isSnapshotPersistable({ snapshot: null, quality: "good" }),
    ).toBe(false);
    expect(
      isSnapshotPersistable({
        snapshot: { ...fresh, source: "diary" },
        quality: "good",
      }),
    ).toBe(false);
    expect(
      isSnapshotPersistable({
        snapshot: { ...fresh, source: "unavailable" },
        quality: "good",
      }),
    ).toBe(false);
    expect(
      isSnapshotPersistable({ snapshot: fresh, quality: "unavailable" }),
    ).toBe(false);
    expect(
      isSnapshotPersistable({
        snapshot: fresh,
        quality: "good",
        isDemoData: true,
      }),
    ).toBe(false);
    // stale
    const stale = {
      ...fresh,
      ts: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    expect(
      isSnapshotPersistable({ snapshot: stale, quality: "good" }),
    ).toBe(false);
  });
});

// ============================================================================
// 2. Persistable alert selection only emits real environment problems
// ============================================================================
describe("V0 loop · only real environment problems become persistable alerts", () => {
  it("a fresh out-of-range manual reading yields a persistable derived alert", () => {
    const ctx = { snapshot: freshManualSnapshot(), quality: "good" as SensorQuality };
    const out = selectPersistableAlerts([realDerivedTempAlert()], ctx);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("temp:high");
  });

  it("excludes synthetic 'data missing / stale / targets missing' signals", () => {
    const ctx = { snapshot: freshManualSnapshot(), quality: "good" as SensorQuality };
    const synthetic: EnvironmentAlert[] = [
      { ...realDerivedTempAlert(), id: "snapshot:unavailable" },
      { ...realDerivedTempAlert(), id: "snapshot:stale" },
      { ...realDerivedTempAlert(), id: "targets:missing" },
    ];
    expect(selectPersistableAlerts(synthetic, ctx)).toHaveLength(0);
  });

  it("emits nothing when the snapshot is not persistable", () => {
    expect(
      selectPersistableAlerts([realDerivedTempAlert()], {
        snapshot: null,
        quality: "unavailable",
      }),
    ).toHaveLength(0);
  });
});

// ============================================================================
// 3. Alert persistence is approval-only — never creates action queue rows
// ============================================================================
describe("V0 loop · alert persistence does NOT auto-create actions", () => {
  it("environmentAlertPersistence only references alerts/alert_events tables", () => {
    const persistHook = read("src/hooks/usePersistEnvironmentAlerts.ts");
    expect(persistHook).toMatch(/alerts/);
    expect(persistHook).toMatch(/alert_events/);
    expect(persistHook).not.toMatch(/action_queue/);
  });
});

// ============================================================================
// 4. AlertDetail is the only user-initiated handoff into Action Queue
// ============================================================================
describe("V0 loop · AlertDetail is the handoff point", () => {
  it("exposes a click-gated Add to Action Queue control", () => {
    expect(ALERT_DETAIL).toMatch(/onClick=\{addAlertToActionQueue\}/);
    expect(ALERT_DETAIL).toMatch(/Add to Action Queue/);
    expect(ALERT_DETAIL).toMatch(/Already in Action Queue/);
  });

  it("does not auto-insert action_queue rows on render", () => {
    expect(ALERT_DETAIL).not.toMatch(
      /useEffect\([\s\S]{0,800}action_queue[\s\S]{0,200}\.insert\(/,
    );
  });
});

// ============================================================================
// 5. Draft shape is approval-required, advisory, no device payload
// ============================================================================
describe("V0 loop · action drafts are safe by construction", () => {
  const alert = {
    id: "11111111-1111-4111-8111-111111111111",
    grow_id: "22222222-2222-4222-8222-222222222222",
    tent_id: null,
    plant_id: null,
    metric: "temp",
    severity: "warning" as const,
    status: "open" as const,
    reason: "Temperature is above the target range.",
  };

  it("creates an advisory, pending_approval, environment_alert draft", () => {
    const out = buildActionQueueDraftFromAlert(alert);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.action_type).toBe("advisory");
    expect(out.draft.status).toBe("pending_approval");
    expect(out.draft.source).toBe(ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT);
    expect(out.draft.reason).toContain(`[alert:${alert.id}]`);
    // No executable command surface present on the draft.
    expect(Object.keys(out.draft)).not.toContain("target_device");
    expect(Object.keys(out.draft)).not.toContain("command");
    expect(Object.keys(out.draft)).not.toContain("payload");
    expect(Object.keys(out.draft)).not.toContain("device_command");
    // No client user_id field — DB default auth.uid() owns this.
    expect(Object.keys(out.draft)).not.toContain("user_id");
  });

  it("refuses drafts for closed alerts or missing context", () => {
    expect(buildActionQueueDraftFromAlert({ ...alert, status: "resolved" }).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert({ ...alert, status: "dismissed" }).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert({ ...alert, grow_id: "" }).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert({ ...alert, reason: "" }).ok).toBe(false);
    expect(buildActionQueueDraftFromAlert({ ...alert, metric: "" }).ok).toBe(false);
  });

  it("AlertDetail insert payload omits user_id", () => {
    // Static check: the insert object passed in AlertDetail must not set user_id.
    const insertIdx = ALERT_DETAIL.indexOf('.from("action_queue")');
    expect(insertIdx).toBeGreaterThan(-1);
    const block = ALERT_DETAIL.slice(insertIdx, insertIdx + 1200);
    expect(block).toMatch(/\.insert\(\{/);
    expect(block).not.toMatch(/user_id\s*:/);
  });
});

// ============================================================================
// 6. Provenance: AlertDetail ↔ ActionQueue ↔ ActionDetail bi-directional
// ============================================================================
describe("V0 loop · provenance back-pointers", () => {
  const alertId = "abc-1234";
  const action = {
    source: "environment_alert",
    reason: `RH high [alert:${alertId}]`,
    status: "pending_approval",
  };

  it("identifies alert-derived actions deterministically", () => {
    expect(isAlertDerived(action)).toBe(true);
    expect(extractSourceAlertId(action.reason)).toBe(alertId);
    expect(isActionDerivedFromAlert(action, alertId)).toBe(true);
    expect(isActionDerivedFromAlert(action, "other")).toBe(false);
  });

  it("ActionQueue can filter by source kind", () => {
    expect(ACTION_QUEUE).toMatch(/getActionQueueSourceKind|isAlertDerived/);
    expect(ACTION_QUEUE).toMatch(
      /ACTION_QUEUE_SOURCE_VALUES|environment_alert/,
    );
  });

  it("ActionDetail parses back-pointer and links to source alert", () => {
    expect(ACTION_DETAIL).toMatch(/extractSourceAlertId\(row\.reason\)/);
    expect(ACTION_DETAIL).toMatch(/alertDetailPath\(sourceAlertId\)/);
    expect(ACTION_DETAIL).toMatch(/Open source alert/);
  });

  it("AlertDetail lists related action queue items", () => {
    expect(ALERT_DETAIL).toMatch(/aria-label="Related Action Queue Items"/);
    expect(ALERT_DETAIL).toMatch(/isActionDerivedFromAlert/);
  });

  it("idempotency matcher rejects unrelated rows", () => {
    const a = { id: alertId, grow_id: "g1" };
    expect(
      actionMatchesAlert(
        { source: "environment_alert", status: "pending_approval", reason: `x [alert:${alertId}]`, grow_id: "g1" },
        a,
      ),
    ).toBe(true);
    expect(
      actionMatchesAlert(
        { source: "ai_coach", status: "pending_approval", reason: `x [alert:${alertId}]`, grow_id: "g1" },
        a,
      ),
    ).toBe(false);
  });
});

// ============================================================================
// 7. Stale-warning behavior on both detail pages
// ============================================================================
describe("V0 loop · stale-warning behavior", () => {
  it("helpers treat resolved/dismissed alerts as closed", () => {
    expect(isClosedAlertStatus("resolved")).toBe(true);
    expect(isClosedAlertStatus("dismissed")).toBe(true);
    expect(isClosedAlertStatus("open")).toBe(false);
  });

  it("AlertDetail warns when closed alert has pending related action", () => {
    expect(
      hasPendingActionsForClosedAlert("resolved", [{ status: "pending_approval" }]),
    ).toBe(true);
    expect(
      hasPendingActionsForClosedAlert("dismissed", [{ status: "pending_approval" }]),
    ).toBe(true);
    expect(
      hasPendingActionsForClosedAlert("open", [{ status: "pending_approval" }]),
    ).toBe(false);
    expect(ALERT_DETAIL).toMatch(/data-testid="stale-action-warning"/);
  });

  it("ActionDetail warns when pending action's source alert is closed", () => {
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "resolved"),
    ).toBe(true);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "dismissed"),
    ).toBe(true);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("approved", "resolved"),
    ).toBe(false);
    expect(ACTION_DETAIL).toMatch(/data-testid="stale-source-alert-warning"/);
  });
});

// ============================================================================
// 8. Coach → Action Queue path is not broken
// ============================================================================
describe("V0 loop · Coach handoff still works", () => {
  it("Coach actions are surfaced as ai_coach in provenance helper", () => {
    expect(ACTION_QUEUE_SOURCE_VALUES.AI_COACH).toBe("ai_coach");
  });
});

// ============================================================================
// 9. Business rules live outside JSX (no inline closed-status / alert-token logic)
// ============================================================================
describe("V0 loop · rules live outside JSX", () => {
  it("ActionDetail does not inline closed-status comparisons", () => {
    expect(ACTION_DETAIL).not.toMatch(
      /sourceAlertStatus\s*===\s*["'](?:resolved|dismissed)["']/,
    );
  });

  it("Detail pages do not inline a raw [alert:...] regex", () => {
    expect(ALERT_DETAIL).not.toMatch(/new RegExp\(["']\\\[alert:/);
    expect(ACTION_DETAIL).not.toMatch(/new RegExp\(["']\\\[alert:/);
  });
});

// ============================================================================
// 10. Static safety — no automation, no device control, no service_role
// ============================================================================
describe("V0 loop · static safety", () => {
  const FILES = [
    "src/pages/AlertDetail.tsx",
    "src/pages/ActionDetail.tsx",
    "src/pages/ActionQueue.tsx",
    "src/pages/Dashboard.tsx",
    "src/components/ManualSensorReadingCard.tsx",
    "src/hooks/usePersistEnvironmentAlerts.ts",
    "src/lib/environmentAlertPersistence.ts",
    "src/lib/alertToActionQueueRules.ts",
    "src/lib/actionQueueProvenanceRules.ts",
  ];

  it("contains no device-control or service_role surface", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(
        src,
        `${f} must not reference device/service_role surfaces`,
      ).not.toMatch(
        /service_role|mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
      );
    }
  });

  it("contains no auto-cancel/auto-approve/auto-reject behavior", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src).not.toMatch(/auto[_-]?cancel|auto[_-]?approve|auto[_-]?reject/i);
    }
  });

  it("Dashboard and Manual card are not silently editing alerts/actions", () => {
    expect(DASHBOARD).not.toMatch(/\.from\(["']action_queue["']\)[\s\S]{0,200}\.insert\(/);
    expect(MANUAL_CARD).not.toMatch(/\.from\(["']alerts["']\)[\s\S]{0,200}\.insert\(/);
    expect(MANUAL_CARD).not.toMatch(/\.from\(["']action_queue["']\)/);
  });
});

// ============================================================================
// 11. Demo doc contract
// ============================================================================
describe("V0 loop · demo doc contract", () => {
  it("docs/v0-operating-loop-demo.md exists and covers the required surface", () => {
    for (const phrase of [
      "Manual sensor reading",
      "Dashboard latest environment",
      "persisted alert",
      "Action Queue",
      "approval-required",
      "no automation",
      "no device control",
      "stale-warning behavior",
      "Your hardware collects the data. Verdant turns it into plant memory, alert context, and approval-required decisions.",
    ]) {
      expect(DEMO_DOC.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
