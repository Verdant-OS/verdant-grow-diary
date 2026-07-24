/**
 * Post-Action Outcome Analysis — authenticated wrapper.
 * Fully mocked client: no network, no Supabase, no service role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeActionOutcome } from "@/lib/actionOutcomeAnalysisService";

const ROOT = resolve(__dirname, "../..");
const ANALYSIS = "2026-07-11T12:00:00.000Z";

type TableFixtures = {
  action_queue?: { data: unknown; error: unknown };
  diary_entries?: { data: unknown; error: unknown };
  sensor_readings?: { data: unknown; error: unknown };
  grow_targets?: { data: unknown; error: unknown };
  grow_events?: { data: unknown; error: unknown };
};

/** Chainable fake supabase client; records tables queried + methods used. */
function fakeClient(fixtures: TableFixtures) {
  const queried: string[] = [];
  const forbiddenCalls: string[] = [];
  function chain(table: string) {
    const result = fixtures[table as keyof TableFixtures] ?? { data: null, error: null };
    const self: Record<string, unknown> = {};
    const returnsSelf = ["select", "eq", "gte", "lte", "contains", "order", "limit"];
    for (const m of returnsSelf) {
      self[m] = (..._args: unknown[]) => self;
    }
    for (const m of ["insert", "update", "delete", "upsert"]) {
      self[m] = () => {
        forbiddenCalls.push(`${table}.${m}`);
        return self;
      };
    }
    self.maybeSingle = async () => result;
    // Awaiting the chain itself resolves list queries.
    (self as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled);
    return self;
  }
  return {
    queried,
    forbiddenCalls,
    from(table: string) {
      queried.push(table);
      return chain(table);
    },
  };
}

const COMPLETED_ACTION = {
  id: "aq-1",
  status: "completed",
  completed_at: "2026-07-10T12:00:00.000Z",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: null,
  action_type: "environment_adjustment",
  target_metric: "vpd_kpa",
  suggested_change: null,
  reason: "VPD above target",
};

function fixtures(overrides: TableFixtures = {}): TableFixtures {
  return {
    action_queue: { data: COMPLETED_ACTION, error: null },
    diary_entries: { data: [], error: null },
    sensor_readings: {
      data: [
        {
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 30,
          captured_at: "2026-07-10T06:00:00.000Z",
          source: "live",
          quality: "ok",
        },
        {
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 26,
          captured_at: "2026-07-10T18:00:00.000Z",
          source: "live",
          quality: "ok",
        },
      ],
      error: null,
    },
    grow_targets: { data: null, error: null },
    grow_events: { data: [], error: null },
    ...overrides,
  };
}

describe("analyzeActionOutcome (mocked client)", () => {
  it("uses only the injected authenticated client and performs no writes", async () => {
    const client = fakeClient(fixtures());
    const r = await analyzeActionOutcome("aq-1", {
      client: client as never,
      analysisAt: ANALYSIS,
    });
    expect(r.ok).toBe(true);
    expect(client.forbiddenCalls).toEqual([]);
  });

  it("query order is deterministic: action → follow-ups → sensors → targets → diary", async () => {
    const client = fakeClient(fixtures());
    await analyzeActionOutcome("aq-1", { client: client as never, analysisAt: ANALYSIS });
    expect(client.queried).toEqual([
      "action_queue",
      "diary_entries",
      "sensor_readings",
      "grow_targets",
      "grow_events",
    ]);
  });

  it("RLS-null action returns a safe not-found (no provider details)", async () => {
    const client = fakeClient(fixtures({ action_queue: { data: null, error: null } }));
    const r = await analyzeActionOutcome("aq-1", {
      client: client as never,
      analysisAt: ANALYSIS,
    });
    expect(r).toEqual({ ok: false, reason: "action_not_found" });
  });

  it("query errors are sanitized to stable reason codes", async () => {
    const client = fakeClient(
      fixtures({
        action_queue: { data: null, error: { message: "SECRET provider detail" } },
      }),
    );
    const r = await analyzeActionOutcome("aq-1", {
      client: client as never,
      analysisAt: ANALYSIS,
    });
    expect(r).toEqual({ ok: false, reason: "action_query_failed" });
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("invalid injected analysis time is rejected before any query", async () => {
    const client = fakeClient(fixtures());
    const r = await analyzeActionOutcome("aq-1", {
      client: client as never,
      analysisAt: "not-a-time",
    });
    expect(r).toEqual({ ok: false, reason: "invalid_analysis_time" });
    expect(client.queried).toEqual([]);
  });

  it("same mocked rows return the same receipt (determinism)", async () => {
    const a = await analyzeActionOutcome("aq-1", {
      client: fakeClient(fixtures()) as never,
      analysisAt: ANALYSIS,
    });
    const b = await analyzeActionOutcome("aq-1", {
      client: fakeClient(fixtures()) as never,
      analysisAt: ANALYSIS,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("incomplete actions surface the pure-layer block reason", async () => {
    const client = fakeClient(
      fixtures({
        action_queue: { data: { ...COMPLETED_ACTION, status: "approved" }, error: null },
      }),
    );
    const r = await analyzeActionOutcome("aq-1", {
      client: client as never,
      analysisAt: ANALYSIS,
    });
    expect(r).toEqual({ ok: false, reason: "action_not_completed" });
  });
});

describe("service static hygiene", () => {
  const SRC = readFileSync(join(ROOT, "src/lib/actionOutcomeAnalysisService.ts"), "utf8");

  it("no service-role import or key reference", () => {
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/);
  });

  it("no insert/update/delete/upsert calls", () => {
    expect(SRC).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });

  it("no clock reads — analysisAt must be injected", () => {
    expect(SRC).not.toMatch(/Date\.now\(\)|new Date\(\)\.toISOString/);
  });

  it("selects raw_payload with sensor rows so provenance can fail closed", () => {
    const sensorQuery = SRC.match(/\.from\("sensor_readings"\)[\s\S]{0,220}/)?.[0] ?? "";
    expect(sensorQuery).toContain("raw_payload");
  });
});
