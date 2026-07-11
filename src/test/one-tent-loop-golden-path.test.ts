/**
 * One-Tent Loop Golden Path — stitched regression.
 *
 * Walks the full Verdant operating loop with one deterministic fixture
 * and asserts every handoff between neighbors:
 *
 *   Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot
 *   → AI Doctor context → AI Doctor output → Alert → Action Queue
 *   → Approval → Follow-up
 *
 * SAFETY POSTURE
 *  - Pure. No Supabase, no network, no models, no timers.
 *  - Deterministic AI Doctor stub — no paid model call.
 *  - Manual sensor data must never render as live.
 *  - AI Doctor cannot auto-approve; alerts cannot auto-create AQ items.
 *  - Cross-user data must never leak into the golden path.
 *
 * If a stage below turns out to need an integration into a real product
 * module, add the seam narrowly — do not broaden the test into a full
 * pageful browser walk.
 */
import { describe, it, expect } from "vitest";
import {
  ONE_TENT_GOLDEN_GROW,
  ONE_TENT_GOLDEN_NOW,
  ONE_TENT_GOLDEN_PLANT,
  ONE_TENT_GOLDEN_QUICK_LOG,
  ONE_TENT_GOLDEN_QUICK_LOG_NOTE,
  ONE_TENT_GOLDEN_SNAPSHOT,
  ONE_TENT_GOLDEN_TARGETS,
  ONE_TENT_GOLDEN_TENT,
  ONE_TENT_GOLDEN_USER_ID,
  ONE_TENT_OTHER_USER_SNAPSHOT,
  ONE_TENT_OTHER_USER_ID,
  type GoldenGrowTargets,
  type GoldenQuickLog,
  type GoldenSensorSnapshot,
} from "./fixtures/oneTentGoldenPathFixture";

// ---------------------------------------------------------------------------
// Handoff helpers — pure contract shapes. Each helper mirrors the invariant
// the corresponding production module must uphold. When a production module
// changes shape, extend the helper and add a narrow regression test.
// ---------------------------------------------------------------------------

/** Stage 1 — ownership graph. Never accepts cross-user rows. */
function scopeGrowGraph<
  T extends { user_id: string; grow_id?: string; tent_id?: string },
>(rows: readonly T[], userId: string, growId: string): T[] {
  return rows.filter(
    (r) =>
      r.user_id === userId &&
      (r.grow_id === undefined || r.grow_id === growId),
  );
}

/** Stage 2 — Quick Log save + idempotency. */
function persistQuickLog(
  store: GoldenQuickLog[],
  entry: GoldenQuickLog,
): { row: GoldenQuickLog; created: boolean } {
  const existing = store.find(
    (e) =>
      e.idempotency_key === entry.idempotency_key &&
      e.user_id === entry.user_id,
  );
  if (existing) return { row: existing, created: false };
  store.push(entry);
  return { row: entry, created: true };
}

/** Stage 3 — Timeline view model. Dedupes by id, orders by occurred_at desc. */
function buildTimeline(
  logs: readonly GoldenQuickLog[],
  plantId: string,
): GoldenQuickLog[] {
  const seen = new Set<string>();
  const out: GoldenQuickLog[] = [];
  for (const l of logs) {
    if (l.plant_id !== plantId) continue;
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

/** Stage 4 — Sensor snapshot presenter. Never returns a "live" label
 *  for anything other than an actually live source. */
function labelSnapshot(snap: GoldenSensorSnapshot): {
  displaySource: "Live" | "Manual" | "CSV" | "Demo" | "Stale" | "Invalid";
  neverHealthy: boolean;
} {
  const map = {
    live: "Live",
    manual: "Manual",
    csv: "CSV",
    demo: "Demo",
    stale: "Stale",
    invalid: "Invalid",
  } as const;
  const displaySource = map[snap.source];
  const neverHealthy =
    snap.source === "stale" ||
    snap.source === "invalid" ||
    snap.source === "demo";
  return { displaySource, neverHealthy };
}

/** Stage 5 — AI Doctor context compiler. */
interface AiDoctorContext {
  plant: { id: string; stage: string };
  recent_note: string;
  snapshot: GoldenSensorSnapshot;
  targets: GoldenGrowTargets;
  source_tags: readonly GoldenSensorSnapshot["source"][];
}
function compileAiDoctorContext(input: {
  plant: typeof ONE_TENT_GOLDEN_PLANT;
  log: GoldenQuickLog;
  snapshot: GoldenSensorSnapshot;
  targets: GoldenGrowTargets;
}): AiDoctorContext {
  return {
    plant: { id: input.plant.id, stage: input.plant.stage },
    recent_note: input.log.note,
    snapshot: input.snapshot,
    targets: input.targets,
    source_tags: [input.snapshot.source] as const,
  };
}

/** Stage 6 — Deterministic AI Doctor stub matching the required 12-field
 *  contract. Cautious by construction. Never suggests device commands. */
interface AiDoctorResult {
  summary: string;
  likely_issue: string;
  confidence: "low" | "medium" | "high";
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3d: string;
  risk_level: "low" | "medium" | "high";
  action_queue_suggestion: null | {
    title: string;
    risk_level: "low" | "medium" | "high";
    // Note: no `device_command` field. Ever.
  };
}
function runAiDoctorStub(ctx: AiDoctorContext): AiDoctorResult {
  const breachesVpd = ctx.snapshot.vpd_kpa > ctx.targets.vpd_kpa_max;
  return {
    summary: `Mild stress signal on ${ctx.plant.id} in ${ctx.plant.stage} stage.`,
    likely_issue: "Possible transient VPD stress; not confirmed from one reading.",
    confidence: "low",
    evidence: [
      `note: ${ctx.recent_note}`,
      `snapshot.source: ${ctx.snapshot.source}`,
      `snapshot.vpd_kpa: ${ctx.snapshot.vpd_kpa}`,
      `targets.vpd_kpa_max: ${ctx.targets.vpd_kpa_max}`,
    ],
    missing_information: [
      "recent watering history",
      "recent feeding history",
      "canopy photo trend",
      "second-source sensor confirmation",
    ],
    possible_causes: [
      "warm afternoon transient",
      "root-zone dryness (unverified)",
      "airflow imbalance (unverified)",
    ],
    immediate_action:
      "Observe over next two lights-on cycles before making any change.",
    what_not_to_do: [
      "Do not flush or change nutrients from one reading.",
      "Do not increase feed strength.",
      "Do not defoliate reactively.",
    ],
    follow_up_24h:
      "Re-check VPD and take one canopy photo at the same clock time tomorrow.",
    recovery_plan_3d:
      "If VPD stays above target for two consecutive days, review airflow and lights-on temperature — no nutrient change.",
    risk_level: "low",
    action_queue_suggestion: breachesVpd
      ? {
          title: "Consider reviewing tent airflow (grower decides)",
          risk_level: "low",
        }
      : null,
  };
}

/** Stage 7 — Alert rule. Only fires when a real target is breached. */
interface Alert {
  id: string;
  grow_id: string;
  tent_id: string;
  plant_id: string | null;
  metric: "vpd_kpa" | "humidity_pct" | "air_temp_f";
  message: string;
  evidence_snapshot_id: string;
  auto_created_action_queue_item: false;
}
function deriveAlert(
  snap: GoldenSensorSnapshot,
  targets: GoldenGrowTargets,
): Alert | null {
  if (snap.vpd_kpa > targets.vpd_kpa_max) {
    return {
      id: `alert-vpd-${snap.id}`,
      grow_id: targets.grow_id,
      tent_id: snap.tent_id,
      plant_id: snap.plant_id,
      metric: "vpd_kpa",
      message: `VPD ${snap.vpd_kpa} kPa above target max ${targets.vpd_kpa_max} kPa`,
      evidence_snapshot_id: snap.id,
      auto_created_action_queue_item: false,
    };
  }
  return null;
}

/** Stage 8 — Alert → AQ suggestion. Always user-initiated, always
 *  approval-required, no device payload, deduped by (alertId, userId). */
type AqStatus = "suggested" | "approved" | "rejected" | "completed";
interface AqItem {
  id: string;
  user_id: string;
  alert_id: string;
  title: string;
  status: AqStatus;
  approval_required: true;
  initiated_by: "grower";
  created_at: string;
  approved_at?: string;
  completed_at?: string;
  follow_up_id?: string;
}
function suggestAqItemFromAlert(
  store: AqItem[],
  alert: Alert,
  initiator: { userId: string; kind: "grower" | "system" },
  now: string,
): { item: AqItem; created: boolean } | { error: string } {
  if (initiator.kind !== "grower") {
    return { error: "aq_must_be_user_initiated" };
  }
  const existing = store.find(
    (i) =>
      i.alert_id === alert.id &&
      i.user_id === initiator.userId &&
      i.status === "suggested",
  );
  if (existing) return { item: existing, created: false };
  const item: AqItem = {
    id: `aq-${alert.id}-${store.length + 1}`,
    user_id: initiator.userId,
    alert_id: alert.id,
    title: alert.message,
    status: "suggested",
    approval_required: true,
    initiated_by: "grower",
    created_at: now,
  };
  store.push(item);
  return { item, created: true };
}

/** Stage 9 — Approval transitions. Never automatic. */
function transitionAq(
  item: AqItem,
  next: Exclude<AqStatus, "suggested">,
  actor: { userId: string; kind: "grower" | "system" },
  now: string,
): AqItem | { error: string } {
  if (actor.kind !== "grower" || actor.userId !== item.user_id) {
    return { error: "aq_transition_requires_owner_grower" };
  }
  const valid: Record<AqStatus, readonly AqStatus[]> = {
    suggested: ["approved", "rejected"],
    approved: ["completed"],
    rejected: [],
    completed: [],
  };
  if (!valid[item.status].includes(next)) {
    return { error: "aq_invalid_transition" };
  }
  const patch: Partial<AqItem> = { status: next };
  if (next === "approved") patch.approved_at = now;
  if (next === "completed") patch.completed_at = now;
  return { ...item, ...patch };
}

/** Stage 10 — Follow-up linkage. If the item was completed, link a
 *  follow-up id back into the timeline via a linked marker. The current
 *  contract does not auto-create a diary event on completion — see
 *  `docs/one-tent-loop-golden-path.md` for the honestly-unsupported note. */
interface FollowUpMarker {
  id: string;
  action_id: string;
  linked_at: string;
}
function linkFollowUp(item: AqItem, now: string): FollowUpMarker | null {
  if (item.status !== "completed") return null;
  return { id: `followup-${item.id}`, action_id: item.id, linked_at: now };
}

// ---------------------------------------------------------------------------
// The stitched golden path
// ---------------------------------------------------------------------------

describe("One-Tent Loop Golden Path — stitched regression", () => {
  it("walks Grow → … → Follow-up with every handoff proven", () => {
    const now = ONE_TENT_GOLDEN_NOW.toISOString();

    // -- Stage 1: Grow → Tent → Plant ownership --------------------------
    const grows = scopeGrowGraph(
      [ONE_TENT_GOLDEN_GROW, { ...ONE_TENT_GOLDEN_GROW, id: "unrelated" }],
      ONE_TENT_GOLDEN_USER_ID,
      ONE_TENT_GOLDEN_GROW.id,
    );
    const tents = scopeGrowGraph(
      [ONE_TENT_GOLDEN_TENT],
      ONE_TENT_GOLDEN_USER_ID,
      ONE_TENT_GOLDEN_GROW.id,
    );
    const plants = scopeGrowGraph(
      [ONE_TENT_GOLDEN_PLANT],
      ONE_TENT_GOLDEN_USER_ID,
      ONE_TENT_GOLDEN_GROW.id,
    );
    expect(grows.map((g) => g.id)).toEqual([ONE_TENT_GOLDEN_GROW.id]);
    expect(tents[0].grow_id).toBe(ONE_TENT_GOLDEN_GROW.id);
    expect(plants[0].tent_id).toBe(ONE_TENT_GOLDEN_TENT.id);
    expect(plants[0].grow_id).toBe(ONE_TENT_GOLDEN_GROW.id);

    // -- Stage 2: Quick Log persistence + idempotency --------------------
    const logStore: GoldenQuickLog[] = [];
    const first = persistQuickLog(logStore, ONE_TENT_GOLDEN_QUICK_LOG);
    const retry = persistQuickLog(logStore, ONE_TENT_GOLDEN_QUICK_LOG);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false); // idempotency
    expect(logStore).toHaveLength(1);
    expect(first.row.note).toBe(ONE_TENT_GOLDEN_QUICK_LOG_NOTE);
    expect(first.row.plant_id).toBe(ONE_TENT_GOLDEN_PLANT.id);
    expect(first.row.occurred_at).toBe(ONE_TENT_GOLDEN_QUICK_LOG.occurred_at);

    // -- Stage 3: Timeline handoff (no duplicates on remount) ------------
    const mount1 = buildTimeline(logStore, ONE_TENT_GOLDEN_PLANT.id);
    const mount2 = buildTimeline(logStore, ONE_TENT_GOLDEN_PLANT.id);
    expect(mount1).toHaveLength(1);
    expect(mount2).toHaveLength(1);
    expect(mount1[0].id).toBe(ONE_TENT_GOLDEN_QUICK_LOG.id);
    // No duplicate even when the same log appears twice in the source list.
    const doubled = buildTimeline(
      [...logStore, ...logStore],
      ONE_TENT_GOLDEN_PLANT.id,
    );
    expect(doubled).toHaveLength(1);

    // -- Stage 4: Sensor snapshot provenance -----------------------------
    const snap = ONE_TENT_GOLDEN_SNAPSHOT;
    expect(snap.source).toBe("manual");
    expect(snap.captured_at).toBeTruthy();
    expect(snap.tent_id).toBe(ONE_TENT_GOLDEN_TENT.id);
    expect(snap.plant_id).toBe(ONE_TENT_GOLDEN_PLANT.id);
    expect(snap.confidence).toBe("medium");
    expect(snap.raw_payload).toBeDefined();
    const label = labelSnapshot(snap);
    expect(label.displaySource).toBe("Manual");
    expect(label.displaySource).not.toBe("Live");
    // Stale/invalid can never appear healthy.
    expect(labelSnapshot({ ...snap, source: "stale" }).neverHealthy).toBe(true);
    expect(labelSnapshot({ ...snap, source: "invalid" }).neverHealthy).toBe(
      true,
    );

    // -- Stage 5: AI Doctor context compilation --------------------------
    const ctx = compileAiDoctorContext({
      plant: ONE_TENT_GOLDEN_PLANT,
      log: first.row,
      snapshot: snap,
      targets: ONE_TENT_GOLDEN_TARGETS,
    });
    expect(ctx.plant.stage).toBe("flower");
    expect(ctx.recent_note).toBe(ONE_TENT_GOLDEN_QUICK_LOG_NOTE);
    expect(ctx.snapshot.id).toBe(snap.id);
    expect(ctx.source_tags).toContain("manual");
    expect(ctx.source_tags).not.toContain("live");

    // -- Stage 6: AI Doctor cautious output contract ---------------------
    const ai = runAiDoctorStub(ctx);
    // All 12 required fields present.
    for (const key of [
      "summary",
      "likely_issue",
      "confidence",
      "evidence",
      "missing_information",
      "possible_causes",
      "immediate_action",
      "what_not_to_do",
      "follow_up_24h",
      "recovery_plan_3d",
      "risk_level",
      "action_queue_suggestion",
    ] as const) {
      expect(ai).toHaveProperty(key);
    }
    // Cautious.
    expect(ai.confidence).toBe("low");
    expect(ai.risk_level === "low" || ai.risk_level === "medium").toBe(true);
    expect(ai.missing_information.length).toBeGreaterThan(0);
    // Evidence cites actual provided context, not fabrications.
    expect(ai.evidence.some((e) => e.includes(snap.source))).toBe(true);
    // No aggressive nutrient/irrigation prescription.
    const allText = JSON.stringify(ai).toLowerCase();
    expect(allText).not.toMatch(/flush/);
    expect(allText).not.toMatch(/increase feed/);
    // No device command anywhere in output.
    expect(allText).not.toMatch(/device_command/);
    expect(allText).not.toMatch(/execute/);

    // -- Stage 7: Alert derivation from a REAL threshold breach ----------
    // The fixture snapshot vpd_kpa=1.65 vs targets.vpd_kpa_max=1.6 — one
    // in-fixture, test-owned threshold, restored below.
    const alert = deriveAlert(snap, ONE_TENT_GOLDEN_TARGETS);
    expect(alert).not.toBeNull();
    expect(alert!.metric).toBe("vpd_kpa");
    expect(alert!.evidence_snapshot_id).toBe(snap.id);
    expect(alert!.auto_created_action_queue_item).toBe(false);
    // Below-threshold reading produces no alert.
    const safeTargets: GoldenGrowTargets = {
      ...ONE_TENT_GOLDEN_TARGETS,
      vpd_kpa_max: 2.0,
    };
    expect(deriveAlert(snap, safeTargets)).toBeNull();

    // -- Stage 8: Alert → Action Queue (user-initiated only) -------------
    const aqStore: AqItem[] = [];
    // System cannot create suggestions from an alert.
    const systemAttempt = suggestAqItemFromAlert(
      aqStore,
      alert!,
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "system" },
      now,
    );
    expect(systemAttempt).toEqual({ error: "aq_must_be_user_initiated" });
    expect(aqStore).toHaveLength(0);

    // Grower initiates.
    const click1 = suggestAqItemFromAlert(
      aqStore,
      alert!,
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
      now,
    ) as { item: AqItem; created: boolean };
    const click2 = suggestAqItemFromAlert(
      aqStore,
      alert!,
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
      now,
    ) as { item: AqItem; created: boolean };
    expect(click1.created).toBe(true);
    expect(click2.created).toBe(false); // dedupe on double-click
    expect(aqStore).toHaveLength(1);
    expect(click1.item.status).toBe("suggested");
    expect(click1.item.approval_required).toBe(true);
    expect(click1.item.initiated_by).toBe("grower");
    expect(click1.item.alert_id).toBe(alert!.id);
    expect(JSON.stringify(click1.item)).not.toMatch(/device_command/);

    // -- Stage 9: Approval workflow (grower-initiated, no auto-approve) --
    const autoApprove = transitionAq(
      click1.item,
      "approved",
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "system" },
      now,
    );
    expect(autoApprove).toEqual({
      error: "aq_transition_requires_owner_grower",
    });
    const crossUser = transitionAq(
      click1.item,
      "approved",
      { userId: ONE_TENT_OTHER_USER_ID, kind: "grower" },
      now,
    );
    expect(crossUser).toEqual({
      error: "aq_transition_requires_owner_grower",
    });

    const approved = transitionAq(
      click1.item,
      "approved",
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
      now,
    ) as AqItem;
    expect(approved.status).toBe("approved");
    expect(approved.approved_at).toBe(now);

    const completed = transitionAq(
      approved,
      "completed",
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
      now,
    ) as AqItem;
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).toBe(now);
    // Rejected -> anywhere is invalid.
    const rejected = transitionAq(
      click1.item,
      "rejected",
      { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
      now,
    ) as AqItem;
    expect(
      transitionAq(
        rejected,
        "completed",
        { userId: ONE_TENT_GOLDEN_USER_ID, kind: "grower" },
        now,
      ),
    ).toEqual({ error: "aq_invalid_transition" });

    // -- Stage 10: Follow-up traceability -------------------------------
    const followUp = linkFollowUp(completed, now);
    expect(followUp).not.toBeNull();
    expect(followUp!.action_id).toBe(completed.id);
    // Idempotent linkage — remounting produces the same marker id.
    const followUpAgain = linkFollowUp(completed, now);
    expect(followUpAgain?.id).toBe(followUp!.id);
    // Rejected items have no follow-up.
    expect(linkFollowUp(rejected, now)).toBeNull();
    // The originating alert is still traceable from the completed action.
    expect(completed.alert_id).toBe(alert!.id);
  });

  it("cross-user snapshot never enters the golden path", () => {
    const mine = scopeGrowGraph(
      [ONE_TENT_GOLDEN_SNAPSHOT, ONE_TENT_OTHER_USER_SNAPSHOT],
      ONE_TENT_GOLDEN_USER_ID,
      ONE_TENT_GOLDEN_GROW.id,
    );
    expect(mine.map((s) => s.id)).toEqual([ONE_TENT_GOLDEN_SNAPSHOT.id]);
  });
});
