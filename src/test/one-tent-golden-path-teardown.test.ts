/**
 * One-Tent golden-path fixture teardown — safety tests.
 *
 * Pure + mocked: the planner/executor take an injected ops adapter, so
 * no Supabase, no network, no service_role anywhere in this file.
 * Covers identity gating, marker/owner scoping, delete ordering,
 * fail-stop, idempotency, flag gating, receipt reconciliation, and
 * static import hygiene.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  FIXTURE_NAMES,
  GOLDEN_MARKER,
  ONE_TENT_TEARDOWN_JSON_PREFIX,
  buildFixtureNames,
  buildTeardownReceipt,
  discoverFixture,
  executeTeardown,
  parseTeardownArgs,
  parseOneTentFixtureMarker,
  renderTeardownReceipt,
  zeroCounts,
} from "../../scripts/e2e/one-tent-golden-path-fixture-cleanup.mjs";
import { evaluateManagedSession } from "../../scripts/e2e/one-tent-preflight-core.mjs";

const ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Fake ops adapter — records call order; simulates a seeded fixture.
// ---------------------------------------------------------------------------

interface FakeState {
  growExists: boolean;
  growName: string;
  tents: string[];
  plants: string[];
  diaryEntryIds: string[];
  diaryAuditScopeIds: string[];
  diaryEntryAuditRows: number;
  actionQueue: number;
  actionQueueEvents: number;
  alertIds: string[];
  alertEvents: number;
  alerts: number;
  quickLogIds: string[];
  environmentEvents: number;
  quicklogIdempotencyKeys: string[];
  quicklogAuditIdsByEvent: string[];
  quicklogAuditIdsByKey: string[];
  sensorRows: number;
  growTargets: number;
  /** Stage keys whose delete should throw. */
  failDeletes?: Set<string>;
  /** Stage keys whose rows survive deletion (RLS-blocked). */
  survivors?: Set<string>;
}

function makeOps(state: FakeState) {
  const calls: string[] = [];
  const del = (key: string, drain: () => number) => async () => {
    calls.push(`delete:${key}`);
    if (state.failDeletes?.has(key)) throw new Error("provider error with SECRET details");
    if (state.survivors?.has(key)) return 0;
    return drain();
  };
  const ops = {
    calls,
    async findGrowByExactName(name: string) {
      calls.push("find:grow");
      if (!state.growExists) return null;
      // Exact-equality lookup: a differently-named grow is never found.
      if (state.growName !== name) return null;
      return { id: "grow-1", name: state.growName };
    },
    async listTentIds() {
      return [...state.tents];
    },
    async listPlantIds() {
      return [...state.plants];
    },
    async listDiaryEntryIds() {
      return [...state.diaryEntryIds];
    },
    async countDiaryEntries() {
      return state.diaryEntryIds.length;
    },
    async countDiaryEntryAudits(diaryEntryIds: string[]) {
      expect(diaryEntryIds).toEqual(state.diaryAuditScopeIds);
      return state.diaryEntryAuditRows;
    },
    async countActionQueue() {
      return state.actionQueue;
    },
    async countActionQueueEvents() {
      return state.actionQueueEvents;
    },
    async listAlertIds() {
      return [...state.alertIds];
    },
    async countAlertEvents(alertIds: string[]) {
      expect(alertIds).toEqual(state.alertIds);
      return state.alertEvents;
    },
    async countAlerts() {
      return state.alerts;
    },
    async listQuickLogIds() {
      return [...state.quickLogIds];
    },
    async countEnvironmentEvents(quickLogIds: string[]) {
      expect(quickLogIds).toEqual(state.quickLogIds);
      return state.environmentEvents;
    },
    async listQuickLogIdempotencyKeys(quickLogIds: string[]) {
      expect(quickLogIds).toEqual(state.quickLogIds);
      return [...state.quicklogIdempotencyKeys];
    },
    async listQuickLogAuditIdsByEvent(quickLogIds: string[]) {
      expect(quickLogIds).toEqual(state.quickLogIds);
      return [...state.quicklogAuditIdsByEvent];
    },
    async listQuickLogAuditIdsByKey(keys: string[]) {
      expect(keys).toEqual(state.quicklogIdempotencyKeys);
      return [...state.quicklogAuditIdsByKey];
    },
    async countSensorRows() {
      return state.sensorRows;
    },
    async countGrowTargets() {
      return state.growTargets;
    },
    deleteDiaryEntries: del("diary_entries", () => {
      const n = state.diaryEntryIds.length;
      state.diaryEntryIds = [];
      state.diaryEntryAuditRows += n;
      return n;
    }),
    deleteAlerts: del("alerts", () => {
      const n = state.alerts;
      state.alerts = 0;
      state.alertIds = [];
      state.alertEvents = 0;
      return n;
    }),
    deleteSensorRows: del("sensor_rows", () => {
      const n = state.sensorRows;
      state.sensorRows = 0;
      return n;
    }),
    deleteGrowTargets: del("grow_targets", () => {
      const n = state.growTargets;
      state.growTargets = 0;
      return n;
    }),
    deletePlants: del("plants", () => {
      const n = state.plants.length;
      state.plants = [];
      return n;
    }),
    deleteTents: del("tents", () => {
      const n = state.tents.length;
      state.tents = [];
      return n;
    }),
    deleteGrow: del("grows", () => {
      const n = state.growExists ? 1 : 0;
      state.growExists = false;
      if (!state.survivors?.has("action_queue")) state.actionQueue = 0;
      return n;
    }),
  };
  return ops;
}

function seededState(): FakeState {
  return {
    growExists: true,
    growName: FIXTURE_NAMES.grow,
    tents: ["tent-1"],
    plants: ["plant-1"],
    diaryEntryIds: ["diary-1"],
    diaryAuditScopeIds: ["diary-1"],
    diaryEntryAuditRows: 1,
    actionQueue: 0,
    actionQueueEvents: 0,
    alertIds: ["alert-1"],
    alertEvents: 2,
    alerts: 1,
    quickLogIds: ["event-parent", "event-environment"],
    environmentEvents: 1,
    quicklogIdempotencyKeys: ["fixture-key"],
    quicklogAuditIdsByEvent: ["audit-shared"],
    quicklogAuditIdsByKey: ["audit-started", "audit-shared"],
    sensorRows: 0, // sensor delete is RLS-blocked in prod; 0 keeps happy path pure
    growTargets: 1,
  };
}

// ---------------------------------------------------------------------------
// Identity prerequisites (via the same preflight core the CLI uses)
// ---------------------------------------------------------------------------

describe("teardown identity prerequisites", () => {
  const VALID_SESSION = JSON.stringify({ access_token: "t", user: { id: "u1" } });

  it("signed-out session blocks teardown", () => {
    const r = evaluateManagedSession({ authStatus: "signed_out" });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("reported_signed_out");
  });

  it("missing access token blocks teardown", () => {
    const r = evaluateManagedSession({
      authStatus: "signed_in",
      sessionJson: JSON.stringify({ user: { id: "u1" } }),
      storageKey: "k",
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("missing_access_token");
  });

  it("missing user ID blocks teardown", () => {
    const r = evaluateManagedSession({
      authStatus: "signed_in",
      sessionJson: JSON.stringify({ access_token: "t" }),
      storageKey: "k",
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("missing_user_id");
  });

  it("target-project mismatch blocks teardown", () => {
    const r = evaluateManagedSession({
      authStatus: "signed_in",
      sessionJson: VALID_SESSION,
      storageKey: "k",
      supabaseUrl: "https://realproject.supabase.co",
      targetProjectRef: "expectedproject",
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("target_project_mismatch");
  });

  it("cookie-only mode without seed identity blocks teardown", () => {
    const r = evaluateManagedSession({
      authStatus: "signed_in",
      cookiesJsonCanonical: JSON.stringify([{ name: "c", value: "v", domain: "x.example" }]),
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("cookie_only_seed_unavailable");
  });
});

// ---------------------------------------------------------------------------
// Scope protection
// ---------------------------------------------------------------------------

describe("fixture scope protection", () => {
  it("uses the canonical static marker only when the marker env is absent", () => {
    expect(parseOneTentFixtureMarker(undefined)).toBe(GOLDEN_MARKER);
    expect(parseOneTentFixtureMarker("[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-1]")).toBe(
      "[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-1]",
    );
    expect(() => parseOneTentFixtureMarker("")).toThrow("fixture_marker_invalid");
    expect(() => parseOneTentFixtureMarker("[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-2]")).toThrow(
      "fixture_marker_invalid",
    );
  });

  it("accepts only the static marker or a run-and-attempt-scoped dynamic marker", () => {
    const marker = "[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-1]";
    expect(parseOneTentFixtureMarker(marker)).toBe(marker);
    expect(buildFixtureNames(marker)).toEqual({
      grow: `One-Tent Golden Run ${marker}`,
      tent: `Flower Tent A ${marker}`,
      plant: `Golden Plant 1 ${marker}`,
    });
    for (const invalid of [
      "[GOLDEN-PATH-FIXTURE-RUN-123456]",
      "[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-2] trailing",
      "[GOLDEN-PATH-FIXTURE-RUN-x-ATTEMPT-1]",
      "",
    ]) {
      expect(() => parseOneTentFixtureMarker(invalid)).toThrow("fixture_marker_invalid");
    }
  });

  it("fixture names embed the exact marker", () => {
    expect(FIXTURE_NAMES.grow).toBe(`One-Tent Golden Run ${GOLDEN_MARKER}`);
    expect(FIXTURE_NAMES.tent).toBe(`Flower Tent A ${GOLDEN_MARKER}`);
    expect(FIXTURE_NAMES.plant).toBe(`Golden Plant 1 ${GOLDEN_MARKER}`);
  });

  it("fixture identity stays in lockstep with the seed script (drift guard)", () => {
    const seedSrc = readFileSync(join(ROOT, "scripts/e2e/seed-one-tent-golden-path.mjs"), "utf8");
    expect(seedSrc).toContain(
      'import { parseOneTentFixtureMarker } from "./one-tent-golden-path-fixture-cleanup.mjs"',
    );
    expect(seedSrc).toContain(
      "goldenMarker: parseOneTentFixtureMarker(process.env.E2E_ONE_TENT_FIXTURE_MARKER)",
    );
    expect(seedSrc).not.toContain("DEFAULT_FIXTURE_MARKER");
    expect(seedSrc).toContain('growName: "One-Tent Golden Run"');
    expect(seedSrc).toContain('tentName: "Flower Tent A"');
    expect(seedSrc).toContain('plantName: "Golden Plant 1"');
    expect(GOLDEN_MARKER).toBe("[GOLDEN-PATH-FIXTURE]");
  });

  it("same-name grow WITHOUT the marker is protected (exact-equality lookup finds nothing)", async () => {
    const state = seededState();
    state.growName = "One-Tent Golden Run"; // marker missing
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    expect(discovery.found).toBe(false);
  });

  it("similar marker text is protected", async () => {
    const state = seededState();
    state.growName = "One-Tent Golden Run [GOLDEN-PATH-FIXTURE-V2]";
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    expect(discovery.found).toBe(false);
  });

  it("another user's fixture-like grow is protected: the adapter is user-scoped AND RLS-scoped", () => {
    const cliSrc = readFileSync(
      join(ROOT, "scripts/e2e/teardown-one-tent-golden-path.mjs"),
      "utf8",
    );
    // Every query the CLI adapter builds filters on the managed user id.
    const eqUserCount = (cliSrc.match(/\.eq\("user_id", userId\)/g) ?? []).length;
    expect(eqUserCount).toBeGreaterThanOrEqual(15);
    // And the client is the managed user's own JWT — anon key + Bearer.
    expect(cliSrc).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(cliSrc).toMatch(/Authorization: `Bearer \$\{preflight\.session\.access_token\}`/);
  });

  it("dynamic child rows are scoped to fixture IDs (grow_id / tent_id filters)", () => {
    const cliSrc = readFileSync(
      join(ROOT, "scripts/e2e/teardown-one-tent-golden-path.mjs"),
      "utf8",
    );
    expect(cliSrc).toMatch(/\.eq\("grow_id", growId\)/);
    expect(cliSrc).toMatch(/\.in\("tent_id", tentIds\)/);
    // Tents/plants additionally require the EXACT fixture marker name —
    // grow_id linkage alone would put user rows re-pointed at the fixture
    // grow inside the blast radius.
    expect(cliSrc).toMatch(/\.eq\("name", fixtureNames\.tent\)/);
    expect(cliSrc).toMatch(/\.eq\("name", fixtureNames\.plant\)/);
    expect((cliSrc.match(/\.eq\("name", fixtureNames\.tent\)/g) ?? []).length).toBe(2);
    expect((cliSrc.match(/\.eq\("name", fixtureNames\.plant\)/g) ?? []).length).toBe(2);
    // The survivors gate must fail CLOSED on a missing count.
    expect(cliSrc).toMatch(/typeof res\.count !== "number"\) throw/);
    // Follow-ups additionally require the marker event_type.
    expect(cliSrc).toContain('contains("details", { event_type: ACTION_FOLLOWUP_EVENT_TYPE })');
    expect(ACTION_FOLLOWUP_EVENT_TYPE).toBe("action_followup");
    // No broad name matching anywhere: no ilike/like in the teardown CLI.
    expect(cliSrc).not.toMatch(/\.i?like\(/);
  });
});

// ---------------------------------------------------------------------------
// Delete order + failure behavior
// ---------------------------------------------------------------------------

describe("delete ordering (child before parent)", () => {
  it("removes owner-deletable rows but retains the protected Quick Log spine and parents", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("completed_with_retained_history");
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes).toEqual(["delete:diary_entries", "delete:alerts", "delete:grow_targets"]);
    expect(result.counts.quick_logs_deleted).toBe(0);
    expect(result.retainedHistory.quick_log_rows).toBe(2);
    expect(result.retainedHistory.environment_event_rows).toBe(1);
    expect(result.retainedHistory.quicklog_idempotency_rows).toBe(1);
    // audit-shared is reached by both exact event ID and exact key but counted once.
    expect(result.retainedHistory.quicklog_audit_event_rows).toBe(2);
    expect(result.retainedHistory.diary_entry_audit_rows).toBe(2);
    expect(result.retainedHistory.total_retained).toBe(11);
  });

  it("dry-run and execute report the same protected Quick Log topology and predicted diary audit", async () => {
    const dryState = seededState();
    const runState = seededState();
    const dry = await executeTeardown(makeOps(dryState), await discoverFixture(makeOps(dryState)), {
      dryRun: true,
    });
    const runOps = makeOps(runState);
    const run = await executeTeardown(runOps, await discoverFixture(runOps), { dryRun: false });

    for (const key of [
      "quick_log_rows",
      "environment_event_rows",
      "quicklog_idempotency_rows",
      "quicklog_audit_event_rows",
      "diary_entry_audit_rows",
      "total_retained",
    ] as const) {
      expect(dry.retainedHistory[key]).toBe(run.retainedHistory[key]);
    }
    expect(dry.counts.quick_logs_deleted).toBe(0);
    expect(run.counts.quick_logs_deleted).toBe(0);
    expect(runOps.calls).not.toContain("delete:quick_logs");
  });

  it.each([undefined, Number.NaN, -1, 1.5])(
    "fails closed before deletion for an invalid environment-event count: %s",
    async (invalidCount) => {
      const state = seededState();
      const ops = makeOps(state);
      const discovery = await discoverFixture(ops);
      ops.countEnvironmentEvents = async () => invalidCount as number;
      const result = await executeTeardown(ops, discovery, { dryRun: false });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("quick_log_retention_verification_failed");
      expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    },
  );

  it("fails closed before deletion when Quick Log verification throws", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    ops.listQuickLogIds = async () => {
      throw new Error("provider SECRET and fixture IDs");
    };
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("quick_log_retention_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("fails closed when a retained Quick Log ID changes at the same count", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    state.quickLogIds = ["different-event", "event-environment"];
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("quick_log_retention_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
  });

  it("fails closed for invalid idempotency keys or a changed deduped audit union", async () => {
    const invalidState = seededState();
    const invalidOps = makeOps(invalidState);
    const invalidDiscovery = await discoverFixture(invalidOps);
    invalidState.quicklogIdempotencyKeys = [""];
    const invalid = await executeTeardown(invalidOps, invalidDiscovery, { dryRun: false });
    expect(invalid.status).toBe("failed");
    expect(invalid.reason).toBe("quick_log_retention_verification_failed");
    expect(invalidOps.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);

    const changedState = seededState();
    const changedOps = makeOps(changedState);
    const changedDiscovery = await discoverFixture(changedOps);
    changedState.quicklogAuditIdsByKey.push("new-audit-row");
    const changed = await executeTeardown(changedOps, changedDiscovery, { dryRun: false });
    expect(changed.status).toBe("failed");
    expect(changed.reason).toBe("quick_log_retention_verification_failed");
    expect(changedOps.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
  });

  it.each([undefined, Number.NaN, -1, 1.5])(
    "fails closed before deletion for an invalid diary-audit baseline: %s",
    async (invalidCount) => {
      const state = seededState();
      const ops = makeOps(state);
      const discovery = await discoverFixture(ops);
      ops.countDiaryEntryAudits = async () => invalidCount as number;
      const result = await executeTeardown(ops, discovery, { dryRun: false });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("diary_audit_baseline_verification_failed");
      expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    },
  );

  it("fails closed before deletion when the diary audit baseline changes or throws", async () => {
    const changedState = seededState();
    const changedOps = makeOps(changedState);
    const changedDiscovery = await discoverFixture(changedOps);
    changedState.diaryEntryAuditRows += 1;
    const changed = await executeTeardown(changedOps, changedDiscovery, { dryRun: false });
    expect(changed.status).toBe("failed");
    expect(changed.reason).toBe("diary_audit_baseline_verification_failed");
    expect(changedOps.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);

    const thrownState = seededState();
    const thrownOps = makeOps(thrownState);
    const thrownDiscovery = await discoverFixture(thrownOps);
    thrownOps.countDiaryEntryAudits = async () => {
      throw new Error("raw SECRET failure");
    };
    const thrown = await executeTeardown(thrownOps, thrownDiscovery, { dryRun: false });
    expect(thrown.status).toBe("failed");
    expect(thrown.reason).toBe("diary_audit_baseline_verification_failed");
    expect(thrownOps.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    expect(JSON.stringify(thrown)).not.toContain("SECRET");
  });

  it.each([undefined, Number.NaN, -1, 1.5, 1])(
    "fails closed after diary deletion for an invalid or mismatched trigger count: %s",
    async (postCount) => {
      const state = seededState();
      const ops = makeOps(state);
      const discovery = await discoverFixture(ops);
      let verificationCalls = 0;
      ops.countDiaryEntryAudits = async () => {
        verificationCalls += 1;
        return (verificationCalls === 1 ? 1 : postCount) as number;
      };
      const result = await executeTeardown(ops, discovery, { dryRun: false });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("diary_audit_post_delete_verification_failed");
      expect(verificationCalls).toBe(2);
      expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([
        "delete:diary_entries",
      ]);
    },
  );

  it("sanitizes a thrown post-delete diary audit verification before later deletes", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    let verificationCalls = 0;
    ops.countDiaryEntryAudits = async () => {
      verificationCalls += 1;
      if (verificationCalls === 2) throw new Error("SECRET post-trigger failure");
      return 1;
    };
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("diary_audit_post_delete_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([
      "delete:diary_entries",
    ]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("still removes the parent hierarchy when no protected fixture history exists", async () => {
    const state = seededState();
    state.diaryEntryIds = [];
    state.diaryAuditScopeIds = [];
    state.diaryEntryAuditRows = 0;
    state.quickLogIds = [];
    state.environmentEvents = 0;
    state.quicklogIdempotencyKeys = [];
    state.quicklogAuditIdsByEvent = [];
    state.quicklogAuditIdsByKey = [];
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });

    expect(result.status).toBe("completed_active_rows_removed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([
      "delete:diary_entries",
      "delete:alerts",
      "delete:grow_targets",
      "delete:plants",
      "delete:tents",
      "delete:grows",
    ]);
  });

  it("retains append-only Action Queue history and its parent hierarchy honestly", async () => {
    const state = seededState();
    state.actionQueue = 1;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(result.status).toBe("completed_with_retained_history");
    expect(deletes).not.toContain("delete:action_queue");
    expect(deletes).not.toContain("delete:alerts");
    expect(deletes).not.toContain("delete:grows");
    expect(result.retainedHistory.action_queue_rows).toBe(1);
    expect(result.retainedHistory.alert_rows).toBe(1);
    expect(result.retainedHistory.alert_event_rows).toBe(2);
    expect(result.retainedHistory.grows).toBe(1);
    expect(result.retainedHistory.total_retained).toBe(15);
    expect(state.actionQueue).toBe(1);
    expect(state.alerts).toBe(1);
  });

  it("dry-run preserves the same source-alert link whenever Action Queue history is retained", async () => {
    const state = seededState();
    state.actionQueue = 1;
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: true });

    expect(result.status).toBe("dry_run");
    expect(result.counts.alerts_deleted).toBe(0);
    expect(result.retainedHistory.alert_rows).toBe(1);
    expect(result.retainedHistory.alert_event_rows).toBe(2);
    expect(result.retainedHistory.action_queue_rows).toBe(1);
    expect(result.retainedHistory.grows).toBe(1);
    expect(result.retainedHistory.total_retained).toBe(15);
    expect(ops.calls).not.toContain("delete:alerts");
  });

  it("retains the source alert when protected Action Queue events are the only visible history", async () => {
    const state = seededState();
    state.actionQueueEvents = 1;
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });

    expect(result.status).toBe("completed_with_retained_history");
    expect(result.retainedHistory.action_queue_event_rows).toBe(1);
    expect(result.retainedHistory.alert_rows).toBe(1);
    expect(result.retainedHistory.alert_event_rows).toBe(2);
    expect(ops.calls).not.toContain("delete:alerts");
    expect(state.alerts).toBe(1);
  });

  it("fails closed before deletion when retained source-alert verification cannot complete", async () => {
    const state = seededState();
    state.actionQueue = 1;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    ops.countAlertEvents = async () => {
      throw new Error("provider error with SECRET details");
    };
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("alert_events_retention_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it.each([undefined, Number.NaN, -1, 1.5])(
    "fails closed before deletion for an invalid retained alert-event count: %s",
    async (invalidCount) => {
      const state = seededState();
      state.actionQueue = 1;
      const ops = makeOps(state);
      const discovery = await discoverFixture(ops);
      ops.countAlertEvents = async () => invalidCount as number;
      const result = await executeTeardown(ops, discovery, { dryRun: false });

      expect(result.status).toBe("failed");
      expect(result.reason).toBe("alert_events_retention_verification_failed");
      expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
    },
  );

  it("fails closed before deletion when retained alert-event history changes after discovery", async () => {
    const state = seededState();
    state.actionQueue = 1;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    state.alertEvents += 1;
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("alert_events_retention_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
  });

  it("fails closed when the retained alert ID changes even if the alert count stays the same", async () => {
    const state = seededState();
    state.actionQueue = 1;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    state.alertIds = ["different-alert"];
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("alerts_retention_verification_failed");
    expect(ops.calls.filter((call) => call.startsWith("delete:"))).toEqual([]);
  });

  it("fails closed when an unreferenced alert survives its required deletion", async () => {
    const state = seededState();
    state.survivors = new Set(["alerts"]);
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("alerts_rows_survived_delete");
    expect(ops.calls).not.toContain("delete:grow_events");
    expect(ops.calls).not.toContain("delete:grows");
  });

  it("deletes unreferenced alert events by cascade and reports none as retained", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });

    expect(result.status).toBe("completed_with_retained_history");
    expect(result.retainedHistory.alert_event_rows).toBe(0);
    expect(state.alertEvents).toBe(0);
  });

  it("failed child deletion prevents parent deletion and reports sanitized reason", async () => {
    const state = seededState();
    state.failDeletes = new Set(["alerts"]);
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("alerts_delete_failed");
    // Nothing after the failed stage was attempted.
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes).toEqual(["delete:diary_entries", "delete:alerts"]);
    // The raw provider error never leaks.
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("reports RLS-retained sensor history without claiming cleanup failure or full cleanup", async () => {
    const state = seededState();
    state.sensorRows = 1;
    state.survivors = new Set(["sensor_rows"]);
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("completed_with_retained_history");
    expect(result.reason).toBe("owner_cleanup_completed_with_retained_history");
    expect(result.retainedHistory.sensor_rows).toBe(1);
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes).toContain("delete:grow_targets");
    expect(deletes).not.toContain("delete:plants");
    expect(deletes).not.toContain("delete:tents");
    expect(deletes).not.toContain("delete:grows");
  });

  it("never attempts a cascade that would erase append-only Action Queue history", async () => {
    const state = seededState();
    state.actionQueue = 1;
    state.survivors = new Set(["action_queue"]);
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });

    expect(result.status).toBe("completed_with_retained_history");
    expect(ops.calls).not.toContain("delete:grows");
    expect(result.retainedHistory.action_queue_rows).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Idempotency + dry-run
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("missing fixture rows produce an honest not-found result, never a zero/full-clean claim", async () => {
    const state = seededState();
    state.growExists = false;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("fixture_not_found");
    expect(result.reason).toBe("exact_fixture_not_found");
    expect(result.counts).toEqual(zeroCounts());
    expect(ops.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
  });

  it("repeated teardown safely retains the same protected history without new deletes", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const first = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(first.status).toBe("completed_with_retained_history");
    const second = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(second.status).toBe("completed_with_retained_history");
    expect(second.counts.total_deleted).toBe(0);
    expect(second.retainedHistory.quick_log_rows).toBe(2);
    expect(second.retainedHistory.diary_entry_audit_rows).toBe(0);
  });

  it("executor return counts carry a correct total_deleted (not just the receipt)", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(result.status).toBe("completed_with_retained_history");
    // 1 diary entry + 1 alert + 1 target. Protected Quick Log rows and
    // parent hierarchy are retained, and no audit row is called deleted.
    expect(result.counts.total_deleted).toBe(3);
    const dry = await executeTeardown(
      makeOps(seededState()),
      await discoverFixture(makeOps(seededState())),
      { dryRun: true },
    );
    expect(dry.counts.total_deleted).toBe(3);
    expect(dry.retainedHistory.total_retained).toBe(result.retainedHistory.total_retained);
  });

  it("executor fails closed on an ownership/marker violation (does not rely on the CLI check)", async () => {
    const result = await executeTeardown(
      makeOps(seededState()),
      { found: false, ownershipViolation: true },
      { dryRun: false },
    );
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fixture_marker_verification_failed");
    expect(result.counts.total_deleted).toBe(0);
  });

  it("dry-run discovers and counts but deletes nothing", async () => {
    const state = seededState();
    state.sensorRows = 2;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: true });
    expect(result.status).toBe("dry_run");
    expect(result.reason).toBe("dry_run_plan_only");
    expect(result.counts.sensor_rows_deleted).toBe(2);
    expect(result.counts.grows_deleted).toBe(0);
    expect(result.retainedHistory.quick_log_rows).toBe(2);
    expect(result.retainedHistory.diary_entry_audit_rows).toBe(2);
    expect(ops.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
    // State untouched.
    expect(state.growExists).toBe(true);
    expect(state.sensorRows).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CLI flag gate
// ---------------------------------------------------------------------------

describe("destructive flag gate", () => {
  it("no flags defaults to dry-run", () => {
    expect(parseTeardownArgs([])).toEqual({ mode: "dry_run" });
  });
  it("--dry-run is dry-run", () => {
    expect(parseTeardownArgs(["--dry-run"])).toEqual({ mode: "dry_run" });
  });
  it("execute requires BOTH destructive flags", () => {
    expect(parseTeardownArgs(["--execute", "--confirm-fixture-teardown"])).toEqual({
      mode: "execute",
    });
  });
  it("--execute alone deletes nothing (blocked)", () => {
    expect(parseTeardownArgs(["--execute"])).toEqual({
      mode: "blocked",
      reason: "missing_confirm_flag",
    });
  });
  it("confirmation alone deletes nothing (blocked)", () => {
    expect(parseTeardownArgs(["--confirm-fixture-teardown"])).toEqual({
      mode: "blocked",
      reason: "missing_execute_flag",
    });
  });
  it("conflicting dry-run/execute flags are rejected", () => {
    expect(parseTeardownArgs(["--dry-run", "--execute"])).toEqual({
      mode: "blocked",
      reason: "conflicting_flags",
    });
  });
  it("unknown flags are rejected — and there is no --force", () => {
    expect(parseTeardownArgs(["--force"])).toEqual({
      mode: "blocked",
      reason: "unknown_flag",
    });
    const cliSrc = readFileSync(
      join(ROOT, "scripts/e2e/teardown-one-tent-golden-path.mjs"),
      "utf8",
    );
    expect(cliSrc).not.toContain("--force");
  });
});

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

describe("teardown receipt", () => {
  it("count totals reconcile", () => {
    const counts = {
      ...zeroCounts(),
      follow_ups_deleted: 1,
      action_queue_deleted: 2,
      alerts_deleted: 1,
      quick_logs_deleted: 0,
      grows_deleted: 1,
    };
    const receipt = buildTeardownReceipt({
      status: "completed_with_retained_history",
      ownerVerified: true,
      targetProjectVerified: true,
      counts,
      retainedHistory: {
        sensor_rows: 3,
        action_queue_rows: 1,
        action_queue_event_rows: 1,
        alert_rows: 1,
        alert_event_rows: 2,
        quick_log_rows: 2,
        environment_event_rows: 1,
        quicklog_idempotency_rows: 1,
        quicklog_audit_event_rows: 2,
        diary_entry_audit_rows: 2,
        ai_doctor_session_rows: 1,
        ai_credit_accounting_rows: 0,
        plants: 1,
        tents: 1,
        grows: 1,
      },
    });
    expect(receipt.counts.total_deleted).toBe(5);
    expect(receipt.retained_history.total_retained).toBe(20);
  });

  it("receipt contains no IDs, tokens, emails, or paths", () => {
    const line = renderTeardownReceipt(
      buildTeardownReceipt({
        status: "failed",
        reason: "alerts_delete_failed",
        ownerVerified: true,
        targetProjectVerified: true,
        counts: zeroCounts(),
        retainedHistory: {
          quick_log_rows: 2,
          quicklog_idempotency_rows: 1,
          quicklog_audit_event_rows: 2,
          diary_entry_audit_rows: 2,
        },
      }),
    );
    expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(line).not.toMatch(/@/);
    expect(line).not.toMatch(/\/home\/|\/tmp\/|[A-Z]:\\/);
    expect(line).not.toMatch(/Bearer|token|cookie/i);
    expect(line).not.toContain("event-parent");
    expect(line).not.toContain("fixture-key");
    expect(line).not.toContain("diary-1");
  });

  it("deterministic inputs yield deterministic receipt JSON with stable key order", () => {
    const build = () =>
      renderTeardownReceipt(
        buildTeardownReceipt({
          status: "completed",
          reason: "dry_run",
          ownerVerified: true,
          targetProjectVerified: true,
          counts: { ...zeroCounts(), grows_deleted: 1 },
        }),
      );
    expect(build()).toBe(build());
    const parsed = JSON.parse(build().slice(ONE_TENT_TEARDOWN_JSON_PREFIX.length));
    expect(parsed.schema_version).toBe("3");
    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "status",
      "reason",
      "owner_verified",
      "target_project_verified",
      "counts",
      "retained_history",
    ]);
    expect(Object.keys(parsed.counts)).toEqual([
      "photo_objects_deleted",
      "diary_entries_deleted",
      "follow_ups_deleted",
      "action_queue_deleted",
      "alerts_deleted",
      "quick_logs_deleted",
      "sensor_rows_deleted",
      "grow_targets_deleted",
      "plants_deleted",
      "tents_deleted",
      "grows_deleted",
      "total_deleted",
    ]);
    expect(Object.keys(parsed.retained_history)).toEqual([
      "sensor_rows",
      "action_queue_rows",
      "action_queue_event_rows",
      "alert_rows",
      "alert_event_rows",
      "quick_log_rows",
      "environment_event_rows",
      "quicklog_idempotency_rows",
      "quicklog_audit_event_rows",
      "diary_entry_audit_rows",
      "ai_doctor_session_rows",
      "ai_credit_accounting_rows",
      "plants",
      "tents",
      "grows",
      "total_retained",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Static hygiene
// ---------------------------------------------------------------------------

describe("static hygiene", () => {
  const CLEANUP_SRC = readFileSync(
    join(ROOT, "scripts/e2e/one-tent-golden-path-fixture-cleanup.mjs"),
    "utf8",
  );
  const CLI_SRC = readFileSync(join(ROOT, "scripts/e2e/teardown-one-tent-golden-path.mjs"), "utf8");

  it("no service-role client is used", () => {
    expect(CLEANUP_SRC).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(CLI_SRC).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    // "service_role" may appear ONLY in prose explaining it is never used.
    for (const line of CLI_SRC.split("\n")) {
      if (/service_role/i.test(line)) {
        expect(line.trim().startsWith("*") || line.trim().startsWith("//")).toBe(true);
      }
    }
  });

  it("no scheduler is introduced", () => {
    for (const src of [CLEANUP_SRC, CLI_SRC]) {
      expect(src).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(|node-cron|cron\.schedule/);
    }
  });

  it("owner cleanup includes diary photos and all active fixture diary rows", () => {
    expect(CLI_SRC).toContain('.storage.from("diary-photos").remove');
    expect(CLI_SRC).toContain('.from("diary_entries")');
    expect(CLI_SRC).toContain('.eq("grow_id", growId)');
    expect(CLEANUP_SRC).toContain("completed_with_retained_history");
    expect(CLEANUP_SRC).not.toContain("status=completed with all-zero");
  });

  it("counts retained alert events only through owner-scoped exact discovered alert IDs", () => {
    expect(CLI_SRC).toContain('.from("alert_events")');
    expect(CLI_SRC).toContain('.eq("user_id", userId)');
    expect(CLI_SRC).toContain('.in("alert_id", alertIds)');
    expect(CLI_SRC).toContain("listAlertIds");
    expect(CLEANUP_SRC).toContain("discovery.alertIds");
  });

  it("honors the deployed grow_events revoke and never attempts direct Quick Log deletion", () => {
    const revoke = readFileSync(
      join(ROOT, "supabase/migrations/20260722062644_8cdef271-abf0-4d82-9eca-970a91b6c547.sql"),
      "utf8",
    );
    expect(revoke).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.grow_events\s+FROM anon, authenticated, PUBLIC/,
    );
    expect(CLI_SRC).not.toMatch(/\.from\("grow_events"\)[\s\S]{0,120}?\.delete\(\)/);
    expect(CLEANUP_SRC).not.toContain("ops.deleteQuickLogs");
  });

  it("scopes protected Quick Log and diary audit accounting to exact owner IDs and keys", () => {
    expect(CLI_SRC).toContain('.from("grow_events")');
    expect(CLI_SRC).toContain('.from("environment_events")');
    expect(CLI_SRC).toContain('.from("quicklog_idempotency")');
    expect(CLI_SRC).toContain('.from("quicklog_audit_events")');
    expect(CLI_SRC).toContain('.from("diary_entry_audit_log")');
    expect(CLI_SRC).toContain('.in("event_id", quickLogIds)');
    expect(CLI_SRC).toContain('.in("grow_event_id", quickLogIds)');
    expect(CLI_SRC).toContain('.in("idempotency_key", idempotencyKeys)');
    expect(CLI_SRC).toContain('.in("diary_entry_id", diaryEntryIds)');
    expect(CLEANUP_SRC).toContain("discovery.quickLogIds");
    expect(CLEANUP_SRC).toContain("discovery.diaryEntryIds");
  });

  it("no product code imports teardown tooling", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/[\\/]src[\\/]test[\\/]/.test(p)) continue;
        const txt = readFileSync(p, "utf8");
        if (/teardown-one-tent-golden-path|one-tent-golden-path-fixture-cleanup/.test(txt)) {
          offenders.push(p);
        }
      }
    }
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("Playwright spec never auto-tears-down after BLOCKED or FAIL", () => {
    const spec = readFileSync(join(ROOT, "e2e/one-tent-loop-golden-path-ui.spec.ts"), "utf8");
    // Opt-in env var + pass-only guard, both present.
    expect(spec).toContain(
      'const cleanupAfterSuccess = process.env.LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS === "true"',
    );
    expect(spec).toMatch(/proofReceiptStatus === "pass" &&[\s\S]{0,120}cleanupAfterSuccess/);
  });

  it("package.json wires the teardown script", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["e2e:one-tent:teardown"]).toBe(
      "node scripts/e2e/teardown-one-tent-golden-path.mjs",
    );
  });
});
