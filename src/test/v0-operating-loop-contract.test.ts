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
import { MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQuality } from "@/lib/sensorQuality";
import { buildActionQueueDraftFromAlert, actionMatchesAlert } from "@/lib/alertToActionQueueRules";
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
const ACTION_QUEUE_CREATE_SERVICE = read("src/lib/actionQueueCreateService.ts");
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
    expect(isSnapshotPersistable({ snapshot: null, quality: "good" })).toBe(false);
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
    expect(isSnapshotPersistable({ snapshot: fresh, quality: "unavailable" })).toBe(false);
    expect(
      isSnapshotPersistable({
        snapshot: fresh,
        quality: "good",
        isDemoData: true,
      }),
    ).toBe(false);
    // Stale. This fixture is a MANUAL snapshot, and staleness is source-aware
    // (see sensorTruthCanon: live = 15 minutes, manual/diary = 24 hours), so
    // the age must exceed the MANUAL window to be rejected. The previous 60
    // minutes predated cb98fe4e4, when isSnapshotPersistable called isStale
    // without a source and every snapshot got the flat live window. Derived
    // from the canon constant rather than hardcoded so the two cannot drift.
    const stale = {
      ...fresh,
      ts: new Date(Date.now() - (MANUAL_CURRENT_STATE_STALE_MS + 60 * 60 * 1000)).toISOString(),
    };
    expect(isSnapshotPersistable({ snapshot: stale, quality: "good" })).toBe(false);
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
    expect(ALERT_DETAIL).toMatch(/Action already queued/);
  });

  it("does not auto-insert action_queue rows on render", () => {
    expect(ALERT_DETAIL).not.toMatch(/useEffect\([\s\S]{0,800}action_queue[\s\S]{0,200}\.insert\(/);
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

  it("AlertDetail action-queue payload omits user_id", () => {
    // The client must never send an owner field; the DB default auth.uid()
    // owns it. dc29093b5 (#586) replaced AlertDetail's inline
    // `.insert({...})` with the action_queue_create RPC, so the payload is
    // now assembled in TWO places and both must stay owner-free. Scanning
    // only the call site would miss the service injecting user_id on the way
    // to the RPC — which is exactly the gap the old single-anchor scan left
    // once it stopped matching anything.
    const callIdx = ALERT_DETAIL.indexOf("createActionQueueItem({");
    expect(
      callIdx,
      "AlertDetail no longer calls createActionQueueItem({ — re-point this scan at the current write path",
    ).toBeGreaterThan(-1);
    const callBlock = ALERT_DETAIL.slice(callIdx, callIdx + 800);
    expect(callBlock).toMatch(/grow_id\s*:/);
    expect(callBlock).not.toMatch(/\buser_id\s*:/);
    expect(callBlock).not.toMatch(/\btarget_device\s*:/);

    // The service maps the draft onto an explicit p_* allowlist. Assert the
    // allowlist itself, so a future field added there cannot smuggle an owner
    // or device column through.
    const rpcIdx = ACTION_QUEUE_CREATE_SERVICE.indexOf("const rpcArgs = {");
    expect(
      rpcIdx,
      "actionQueueCreateService no longer builds `const rpcArgs = {` — re-point this scan",
    ).toBeGreaterThan(-1);
    const rpcEnd = ACTION_QUEUE_CREATE_SERVICE.indexOf("};", rpcIdx);
    expect(rpcEnd).toBeGreaterThan(rpcIdx);
    const rpcBlock = ACTION_QUEUE_CREATE_SERVICE.slice(rpcIdx, rpcEnd);
    expect(rpcBlock).toMatch(/p_grow_id\s*:/);
    expect(rpcBlock).not.toMatch(/user_id/);
    expect(rpcBlock).not.toMatch(/target_device/);

    // And the service must reach the queue only through the RPC — never a
    // direct client insert that would bypass the server-side dedupe/audit.
    expect(ACTION_QUEUE_CREATE_SERVICE).toMatch(/\.rpc\(\s*["']action_queue_create["']/);
    expect(ACTION_QUEUE_CREATE_SERVICE).not.toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,40}\.insert\(/,
    );
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
    expect(ACTION_QUEUE).toMatch(/ACTION_QUEUE_SOURCE_VALUES|environment_alert/);
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
        {
          source: "environment_alert",
          status: "pending_approval",
          reason: `x [alert:${alertId}]`,
          grow_id: "g1",
        },
        a,
      ),
    ).toBe(true);
    expect(
      actionMatchesAlert(
        {
          source: "ai_coach",
          status: "pending_approval",
          reason: `x [alert:${alertId}]`,
          grow_id: "g1",
        },
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
    expect(hasPendingActionsForClosedAlert("resolved", [{ status: "pending_approval" }])).toBe(
      true,
    );
    expect(hasPendingActionsForClosedAlert("dismissed", [{ status: "pending_approval" }])).toBe(
      true,
    );
    expect(hasPendingActionsForClosedAlert("open", [{ status: "pending_approval" }])).toBe(false);
    expect(ALERT_DETAIL).toMatch(/data-testid="stale-action-warning"/);
  });

  it("ActionDetail warns when pending action's source alert is closed", () => {
    expect(shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "resolved")).toBe(true);
    expect(shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "dismissed")).toBe(true);
    expect(shouldWarnPendingActionHasClosedSourceAlert("approved", "resolved")).toBe(false);
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
    expect(ACTION_DETAIL).not.toMatch(/sourceAlertStatus\s*===\s*["'](?:resolved|dismissed)["']/);
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
      expect(src, `${f} must not reference device/service_role surfaces`).not.toMatch(
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
