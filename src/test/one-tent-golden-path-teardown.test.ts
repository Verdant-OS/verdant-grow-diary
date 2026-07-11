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
  buildTeardownReceipt,
  discoverFixture,
  executeTeardown,
  parseTeardownArgs,
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
  followUps: number;
  actionQueue: number;
  alerts: number;
  quickLogs: number;
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
    async countFollowUps() {
      return state.followUps;
    },
    async countActionQueue() {
      return state.actionQueue;
    },
    async countAlerts() {
      return state.alerts;
    },
    async countQuickLogs() {
      return state.quickLogs;
    },
    async countSensorRows() {
      return state.sensorRows;
    },
    async countGrowTargets() {
      return state.growTargets;
    },
    deleteFollowUps: del("follow_ups", () => {
      const n = state.followUps;
      state.followUps = 0;
      return n;
    }),
    deleteActionQueue: del("action_queue", () => {
      const n = state.actionQueue;
      state.actionQueue = 0;
      return n;
    }),
    deleteAlerts: del("alerts", () => {
      const n = state.alerts;
      state.alerts = 0;
      return n;
    }),
    deleteQuickLogs: del("quick_logs", () => {
      const n = state.quickLogs;
      state.quickLogs = 0;
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
    followUps: 1,
    actionQueue: 1,
    alerts: 1,
    quickLogs: 1,
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
  it("fixture names embed the exact marker", () => {
    expect(FIXTURE_NAMES.grow).toBe(`One-Tent Golden Run ${GOLDEN_MARKER}`);
    expect(FIXTURE_NAMES.tent).toBe(`Flower Tent A ${GOLDEN_MARKER}`);
    expect(FIXTURE_NAMES.plant).toBe(`Golden Plant 1 ${GOLDEN_MARKER}`);
  });

  it("fixture identity stays in lockstep with the seed script (drift guard)", () => {
    const seedSrc = readFileSync(join(ROOT, "scripts/e2e/seed-one-tent-golden-path.mjs"), "utf8");
    expect(seedSrc).toContain('goldenMarker: "[GOLDEN-PATH-FIXTURE]"');
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
    expect(cliSrc).toMatch(/\.eq\("name", FIXTURE_NAMES\.tent\)/);
    expect(cliSrc).toMatch(/\.eq\("name", FIXTURE_NAMES\.plant\)/);
    expect((cliSrc.match(/\.eq\("name", FIXTURE_NAMES\.tent\)/g) ?? []).length).toBe(2);
    expect((cliSrc.match(/\.eq\("name", FIXTURE_NAMES\.plant\)/g) ?? []).length).toBe(2);
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
  it("full happy path deletes in reverse dependency order", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("completed");
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes).toEqual([
      "delete:follow_ups",
      "delete:action_queue",
      "delete:alerts",
      "delete:quick_logs",
      "delete:sensor_rows",
      "delete:grow_targets",
      "delete:plants",
      "delete:tents",
      "delete:grows",
    ]);
  });

  it("action_queue rows are deleted before alerts and before plant/grow parents", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    await executeTeardown(ops, discovery, { dryRun: false });
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes.indexOf("delete:action_queue")).toBeLessThan(deletes.indexOf("delete:alerts"));
    expect(deletes.indexOf("delete:alerts")).toBeLessThan(deletes.indexOf("delete:plants"));
    expect(deletes.indexOf("delete:plants")).toBeLessThan(deletes.indexOf("delete:grows"));
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
    expect(deletes).toEqual(["delete:follow_ups", "delete:action_queue", "delete:alerts"]);
    // The raw provider error never leaks.
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("RLS-surviving sensor rows stop the run before parents (documented sensor_readings limit)", async () => {
    const state = seededState();
    state.sensorRows = 1;
    state.survivors = new Set(["sensor_rows"]);
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("sensor_rows_delete_blocked_by_rls");
    const deletes = ops.calls.filter((c) => c.startsWith("delete:"));
    expect(deletes).not.toContain("delete:grow_targets");
    expect(deletes).not.toContain("delete:plants");
    expect(deletes).not.toContain("delete:tents");
    expect(deletes).not.toContain("delete:grows");
  });
});

// ---------------------------------------------------------------------------
// Idempotency + dry-run
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("missing fixture rows produce a successful zero-count result", async () => {
    const state = seededState();
    state.growExists = false;
    const ops = makeOps(state);
    const discovery = await discoverFixture(ops);
    const result = await executeTeardown(ops, discovery, { dryRun: false });
    expect(result.status).toBe("completed");
    expect(result.counts).toEqual(zeroCounts());
    expect(ops.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
  });

  it("repeated teardown is safe (second run is a zero-count success)", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const first = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(first.status).toBe("completed");
    const second = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(second.status).toBe("completed");
    expect(second.counts.total_deleted).toBe(0);
  });

  it("executor return counts carry a correct total_deleted (not just the receipt)", async () => {
    const state = seededState();
    const ops = makeOps(state);
    const result = await executeTeardown(ops, await discoverFixture(ops), { dryRun: false });
    expect(result.status).toBe("completed");
    // 1 follow-up + 1 AQ + 1 alert + 1 quick log + 0 sensor + 1 target
    // + 1 plant + 1 tent + 1 grow = 8
    expect(result.counts.total_deleted).toBe(8);
    const dry = await executeTeardown(
      makeOps(seededState()),
      await discoverFixture(makeOps(seededState())),
      { dryRun: true },
    );
    expect(dry.counts.total_deleted).toBe(8);
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
    expect(result.status).toBe("completed");
    expect(result.reason).toBe("dry_run");
    expect(result.counts.sensor_rows_deleted).toBe(2);
    expect(result.counts.grows_deleted).toBe(1);
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
      quick_logs_deleted: 3,
      grows_deleted: 1,
    };
    const receipt = buildTeardownReceipt({
      status: "completed",
      ownerVerified: true,
      targetProjectVerified: true,
      counts,
    });
    expect(receipt.counts.total_deleted).toBe(8);
  });

  it("receipt contains no IDs, tokens, emails, or paths", () => {
    const line = renderTeardownReceipt(
      buildTeardownReceipt({
        status: "failed",
        reason: "alerts_delete_failed",
        ownerVerified: true,
        targetProjectVerified: true,
        counts: zeroCounts(),
      }),
    );
    expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(line).not.toMatch(/@/);
    expect(line).not.toMatch(/\/home\/|\/tmp\/|[A-Z]:\\/);
    expect(line).not.toMatch(/Bearer|token|cookie/i);
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
    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "status",
      "reason",
      "owner_verified",
      "target_project_verified",
      "counts",
    ]);
    expect(Object.keys(parsed.counts)).toEqual([
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
    expect(spec).toContain("LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS");
    expect(spec).toMatch(/proofReceiptStatus === "pass" &&[\s\S]{0,120}TEARDOWN_AFTER_SUCCESS/);
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
