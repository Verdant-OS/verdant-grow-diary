import { describe, expect, it } from "vitest";

import { getGrowWalkContextForOwnedTarget } from "@/lib/growWalkContextReadModels";

interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

type FixtureResult = { data: unknown; error: { message: string } | null };

function clientFor(fixtures: Record<string, FixtureResult>) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      let metric: string | null = null;
      let capturedMode: "captured" | "legacy" | null = null;
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return chain;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          if (table === "sensor_readings" && args[0] === "metric") metric = String(args[1]);
          return chain;
        },
        neq(...args: unknown[]) {
          calls.push({ table, method: "neq", args });
          return chain;
        },
        gte(...args: unknown[]) {
          calls.push({ table, method: "gte", args });
          return chain;
        },
        in(...args: unknown[]) {
          calls.push({ table, method: "in", args });
          return chain;
        },
        not(...args: unknown[]) {
          calls.push({ table, method: "not", args });
          capturedMode = "captured";
          return chain;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          capturedMode = "legacy";
          return chain;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return chain;
        },
        limit(...args: unknown[]) {
          calls.push({ table, method: "limit", args });
          return chain;
        },
        maybeSingle() {
          calls.push({ table, method: "maybeSingle", args: [] });
          const fixture = fixtures[table] ?? { data: null, error: null };
          const data = Array.isArray(fixture.data) ? fixture.data[0] ?? null : fixture.data;
          return Promise.resolve({ data, error: fixture.error });
        },
        then<TResult1 = FixtureResult, TResult2 = never>(
          onfulfilled?: ((value: FixtureResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const fixture = fixtures[table] ?? { data: [], error: null };
          let data = fixture.data;
          if (table === "sensor_readings" && Array.isArray(data)) {
            data = data.filter((row) => {
              const candidate = row as { metric?: string; captured_at?: string | null };
              if (metric && candidate.metric !== metric) return false;
              if (capturedMode === "captured" && candidate.captured_at == null) return false;
              if (capturedMode === "legacy" && candidate.captured_at != null) return false;
              return true;
            });
          }
          return Promise.resolve({ data, error: fixture.error }).then(onfulfilled, onrejected);
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

function fixtures(): Record<string, FixtureResult> {
  return {
    plants: {
      data: {
        id: "plant-1",
        name: "Sour Diesel Auto",
        strain: "Sour Diesel",
        tent_id: "tent-1",
        grow_id: "grow-1",
        stage: "flower",
        health: "watch",
        is_archived: false,
        medium: "coco",
        pot_size: "5 gal",
        plant_type: "autoflower",
      },
      error: null,
    },
    tents: {
      data: {
        id: "tent-1",
        name: "Flower Tent",
        grow_id: "grow-1",
        stage: "flower",
        is_archived: false,
      },
      error: null,
    },
    grows: {
      data: { id: "grow-1", name: "Home Grow", grow_type: "indoor", stage: "flower" },
      error: null,
    },
    grow_events: {
      data: [
        {
          id: "water-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "watering",
          source: "manual",
          occurred_at: "2026-08-07T08:00:00.000Z",
          note: "  Watered   slowly.  ",
          created_at: "2026-08-07T08:00:01.000Z",
          is_deleted: false,
        },
        {
          id: "photo-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "photo",
          source: "manual",
          occurred_at: "2026-08-07T09:00:00.000Z",
          note: null,
          created_at: "2026-08-07T09:00:01.000Z",
          is_deleted: false,
        },
        {
          id: "obs-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T10:00:00.000Z",
          note: "Plant response is the same.",
          created_at: "2026-08-07T10:00:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    },
    alerts: {
      data: [
        {
          id: "alert-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          title: "High humidity",
          reason: "Humidity needs physical confirmation.",
          severity: "high",
          status: "open",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-08-07T11:30:00.000Z",
        },
      ],
      error: null,
    },
    ai_doctor_sessions: {
      data: [
        {
          id: "session-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          created_at: "2026-08-07T11:00:00.000Z",
          displayed_confidence: 0.55,
          context_confidence_ceiling: "medium",
          context_sufficiency: { missing_information: ["current photo"] },
          sensor_snapshot_status: "usable",
          sensor_snapshot_reason_code: "fresh_live",
        },
      ],
      error: null,
    },
    action_queue: {
      data: [
        {
          id: "aq-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          status: "suggested",
          risk_level: "low",
          reason: "  Review   airflow after confirmation. ",
          created_at: "2026-08-07T11:10:00.000Z",
        },
      ],
      error: null,
    },
    sensor_readings: {
      data: [
        {
          id: "reading-1",
          tent_id: "tent-1",
          metric: "humidity_pct",
          value: 78,
          quality: "ok",
          source: "live",
          ts: "2026-08-07T11:45:00.000Z",
          captured_at: "2026-08-07T11:45:00.000Z",
          created_at: "2026-08-07T11:45:01.000Z",
          raw_payload: { authorization: "must-not-cross" },
        },
      ],
      error: null,
    },
  };
}

describe("getGrowWalkContextForOwnedTarget", () => {
  it("proves exact plant, tent, and grow scope before reading evidence lanes", async () => {
    const { client, calls } = clientFor(fixtures());
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1", lookbackHours: 72 },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.scope).toEqual({
      growId: "grow-1",
      growName: "Home Grow",
      tentId: "tent-1",
      tentName: "Flower Tent",
      plantId: "plant-1",
      plantName: "Sour Diesel Auto",
    });
    expect(result.data.context.profile).toEqual({
      stage: "flower",
      strain: "Sour Diesel",
      medium: "coco",
      potSize: "5 gal",
      growType: "autoflower",
      plantStatus: "watch",
    });
    expect(result.data.context.evidence.photos).toEqual([
      {
        id: "photo-1",
        capturedAt: "2026-08-07T09:00:00.000Z",
        source: "manual",
        inspectedInThisRun: false,
      },
    ]);
    expect(result.data.context.evidence.aiDoctor).toMatchObject({
      sessionId: "session-1",
      confidenceBand: "medium",
      missingInformationCount: 1,
      summaryExcerpt: null,
    });
    expect(result.data.context.evidence.actionQueue).toEqual({
      openCount: 1,
      items: [
        {
          id: "aq-1",
          status: "suggested",
          riskLevel: "low",
          reasonExcerpt: "Review airflow after confirmation.",
          createdAt: "2026-08-07T11:10:00.000Z",
        },
      ],
    });
    expect(result.data.context.evidence.sensors.readings.humidity_pct?.current_live).toBe(true);
    expect(result.data.context.receipt.partialLanes).toEqual([]);

    const firstChild = calls.findIndex((call) =>
      ["grow_events", "alerts", "ai_doctor_sessions", "action_queue"].includes(call.table),
    );
    expect(calls.findIndex((call) => call.table === "grows" && call.method === "maybeSingle")).toBeLessThan(
      firstChild,
    );
  });

  it("fails closed before evidence reads when the target is foreign or missing", async () => {
    const { client, calls } = clientFor({ plants: { data: null, error: null } });
    await expect(
      getGrowWalkContextForOwnedTarget(client, { targetType: "plant", targetId: "foreign" }),
    ).resolves.toEqual({
      ok: false,
      reason: "not_found",
      message: "Grow Walk target not found for the signed-in grower.",
    });
    expect(
      calls.some((call) =>
        ["grow_events", "alerts", "ai_doctor_sessions", "action_queue", "sensor_readings"].includes(
          call.table,
        ),
      ),
    ).toBe(false);
  });

  it("rejects a contradictory plant-tent-grow relationship before loading lanes", async () => {
    const bad = fixtures();
    bad.tents = {
      data: { ...(bad.tents.data as object), grow_id: "other-grow" },
      error: null,
    };
    const { client, calls } = clientFor(bad);
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result).toEqual({
      ok: false,
      reason: "not_found",
      message: "Grow Walk target not found for the signed-in grower.",
    });
    expect(calls.some((call) => call.table === "grow_events")).toBe(false);
  });

  it("allows an owned plant without a tent but marks the sensor lane partial", async () => {
    const data = fixtures();
    data.plants = {
      data: { ...(data.plants.data as object), tent_id: null },
      error: null,
    };
    const { client } = clientFor(data);
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.scope.tentId).toBeNull();
    expect(result.data.context.evidence.sensors.available).toBe(false);
    expect(result.data.context.receipt.partialLanes).toContain("sensors");
  });

  it("supports an owned tent target without inventing a plant profile", async () => {
    const { client } = clientFor(fixtures());
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.scope.plantId).toBeNull();
    expect(result.data.context.profile.strain).toBeNull();
    expect(result.data.context.profile.medium).toBeNull();
    expect(result.data.context.scope.tentId).toBe("tent-1");
  });

  it.each([
    { requested: undefined, expectedHours: 72, cutoff: "2026-08-04T12:00:00.000Z" },
    { requested: 1, expectedHours: 24, cutoff: "2026-08-06T12:00:00.000Z" },
    { requested: 500, expectedHours: 168, cutoff: "2026-07-31T12:00:00.000Z" },
  ])("clamps lookback $requested", async ({ requested, expectedHours, cutoff }) => {
    const { client, calls } = clientFor(fixtures());
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1", lookbackHours: requested },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.context.receipt.lookbackHours).toBe(expectedHours);
    expect(calls).toContainEqual({
      table: "grow_events",
      method: "gte",
      args: ["occurred_at", cutoff],
    });
  });

  it("returns a successful partial context when one non-scope lane fails", async () => {
    const data = fixtures();
    data.alerts = { data: null, error: { message: "alerts unavailable" } };
    const { client } = clientFor(data);
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.alerts).toEqual([]);
    expect(result.data.context.receipt.partialLanes).toContain("alerts");
    expect(result.data.context.derived.evidenceConfidence).not.toBe("high");
  });

  it("bounds and sanitizes untrusted text and excludes secret or executable fields", async () => {
    const data = fixtures();
    const longText = `  ${"word   ".repeat(80)}  `;
    data.grow_events = {
      data: [
        {
          ...(data.grow_events.data as object[])[0],
          note: longText,
        },
      ],
      error: null,
    };
    data.alerts = {
      data: [
        {
          ...(data.alerts.data as object[])[0],
          reason: longText,
        },
      ],
      error: null,
    };
    const { client } = clientFor(data);
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.recentEvents[0]?.noteExcerpt?.length).toBeLessThanOrEqual(240);
    expect(result.data.context.evidence.alerts[0]?.reasonExcerpt.length).toBeLessThanOrEqual(240);
    expect(JSON.stringify(result)).not.toMatch(
      /raw_payload|authorization|access_token|refresh_token|signed_url|storage_path|target_device|suggested_change|diagnosis|suggested_actions/i,
    );
  });
});
