import { describe, expect, it } from "vitest";

import { getGrowWalkContextForOwnedTarget } from "@/lib/growWalkContextReadModels";

interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

type FixtureResult = { data: unknown; error: { message: string; code?: string } | null };

function clientFor(
  fixtures: Record<string, FixtureResult>,
  options: { missingDiaryRetractionColumn?: boolean } = {},
) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      let metric: string | null = null;
      let capturedMode: "captured" | "legacy" | null = null;
      let filtersRetractedAt = false;
      let actionQueueCreatedAtCutoff: string | null = null;
      let alertLastSeenAtCutoff: string | null = null;
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
          if (table === "action_queue" && args[0] === "created_at") {
            actionQueueCreatedAtCutoff = String(args[1]);
          }
          if (table === "alerts" && args[0] === "last_seen_at") {
            alertLastSeenAtCutoff = String(args[1]);
          }
          return chain;
        },
        in(...args: unknown[]) {
          calls.push({ table, method: "in", args });
          return chain;
        },
        or(...args: unknown[]) {
          calls.push({ table, method: "or", args });
          return chain;
        },
        not(...args: unknown[]) {
          calls.push({ table, method: "not", args });
          capturedMode = "captured";
          return chain;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          if (table === "diary_entries" && args[0] === "retracted_at") {
            filtersRetractedAt = true;
          }
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
          const data = Array.isArray(fixture.data) ? (fixture.data[0] ?? null) : fixture.data;
          return Promise.resolve({ data, error: fixture.error });
        },
        then<TResult1 = FixtureResult, TResult2 = never>(
          onfulfilled?: ((value: FixtureResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const fixture =
            table === "diary_entries" && options.missingDiaryRetractionColumn && filtersRetractedAt
              ? {
                  data: null,
                  error: {
                    code: "42703",
                    message: "column diary_entries.retracted_at does not exist",
                  },
                }
              : (fixtures[table] ?? { data: [], error: null });
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
          const actionQueueCutoff = actionQueueCreatedAtCutoff;
          if (table === "action_queue" && Array.isArray(data) && actionQueueCutoff) {
            data = data.filter((row) => {
              const createdAt = (row as { created_at?: unknown }).created_at;
              return typeof createdAt !== "string" || createdAt >= actionQueueCutoff;
            });
          }
          const alertCutoff = alertLastSeenAtCutoff;
          if (table === "alerts" && Array.isArray(data) && alertCutoff) {
            data = data.filter((row) => {
              const lastSeenAt = (row as { last_seen_at?: unknown }).last_seen_at;
              return typeof lastSeenAt !== "string" || lastSeenAt >= alertCutoff;
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
      data: {
        id: "grow-1",
        name: "Home Grow",
        grow_type: "indoor",
        stage: "flower",
        is_archived: false,
      },
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
    diary_entries: {
      data: [
        {
          id: "photo-top-level",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-08-07T09:00:00.000Z",
          photo_url: "verdant-photo://private/top-level",
          details: {},
          retracted_at: null,
        },
        {
          id: "photo-legacy-details",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-08-07T09:30:00.000Z",
          photo_url: null,
          details: { photo_url: "verdant-photo://private/legacy-details" },
          retracted_at: null,
        },
        {
          id: "photo-retracted",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-08-07T10:00:00.000Z",
          photo_url: "verdant-photo://private/retracted",
          details: {},
          retracted_at: "2026-08-07T10:05:00.000Z",
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
          status: "pending_approval",
          risk_level: "low",
          reason: "  Review   airflow after confirmation. [alert:alert-1] ",
          created_at: "2026-08-07T11:10:00.000Z",
          action_type: "inspect_environment",
          source: "environment_alert",
          suggested_change: "Do not expose this suggestion in the Grow Walk receipt.",
          target_device: "must-not-cross",
          originating_timeline_events: [{ token: "must-not-cross" }],
          dedupe_key: "must-not-cross",
          user_id: "must-not-cross",
        },
      ],
      error: null,
    },
    action_queue_events: {
      data: [
        {
          id: "aq-event-1",
          action_queue_id: "aq-1",
          grow_id: "grow-1",
          event_type: "created",
          previous_status: null,
          new_status: "pending_approval",
          note: "  Approval is still required. ",
          created_at: "2026-08-07T11:10:01.000Z",
          user_id: "must-not-cross",
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

function tentRelationPlants(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tent-plant-${index + 1}`,
    grow_id: "grow-1",
    tent_id: "tent-1",
  }));
}

function actionQueueAuditEvents(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `aq-event-${index + 1}`,
    action_queue_id: "aq-1",
    grow_id: "grow-1",
    event_type: "note",
    previous_status: "pending_approval",
    new_status: "pending_approval",
    note: `Audit ${index + 1}`,
    created_at: `2026-08-07T11:${String(index).padStart(2, "0")}:00.000Z`,
  }));
}

function boundedEvidenceFixtures(input: {
  events: number;
  photos: number;
  alerts: number;
  aiDoctor: number;
}): Record<string, FixtureResult> {
  const data = fixtures();
  const event = (data.grow_events.data as Record<string, unknown>[])[0]!;
  const photo = (data.diary_entries.data as Record<string, unknown>[])[0]!;
  const alert = (data.alerts.data as Record<string, unknown>[])[0]!;
  const aiDoctor = (data.ai_doctor_sessions.data as Record<string, unknown>[])[0]!;
  data.grow_events = {
    data: Array.from({ length: input.events }, (_, index) => ({
      ...event,
      id: `event-${index + 1}`,
    })),
    error: null,
  };
  data.diary_entries = {
    data: Array.from({ length: input.photos }, (_, index) => ({
      ...photo,
      id: `photo-${index + 1}`,
    })),
    error: null,
  };
  data.alerts = {
    data: Array.from({ length: input.alerts }, (_, index) => ({
      ...alert,
      id: `alert-${index + 1}`,
    })),
    error: null,
  };
  data.ai_doctor_sessions = {
    data: Array.from({ length: input.aiDoctor }, (_, index) => ({
      ...aiDoctor,
      id: `session-${index + 1}`,
    })),
    error: null,
  };
  return data;
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
      targetArchived: false,
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
        id: "photo-top-level",
        capturedAt: "2026-08-07T09:00:00.000Z",
        source: "diary",
        inspectedInThisRun: false,
      },
      {
        id: "photo-legacy-details",
        capturedAt: "2026-08-07T09:30:00.000Z",
        source: "diary",
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
          growId: "grow-1",
          tentId: "tent-1",
          plantId: "plant-1",
          relatedAlertId: "alert-1",
          status: "pending_approval",
          riskLevel: "low",
          reasonExcerpt: "Review airflow after confirmation.",
          createdAt: "2026-08-07T11:10:00.000Z",
          auditTrail: [
            {
              id: "aq-event-1",
              eventType: "created",
              previousStatus: null,
              newStatus: "pending_approval",
              noteExcerpt: "Approval is still required.",
              createdAt: "2026-08-07T11:10:01.000Z",
            },
          ],
        },
      ],
    });
    expect(result.data.context.evidence.sensors.readings.humidity_pct?.current_live).toBe(true);
    expect(result.data.context.receipt.partialLanes).toEqual([]);

    const firstChild = calls.findIndex((call) =>
      ["grow_events", "diary_entries", "alerts", "ai_doctor_sessions", "action_queue"].includes(
        call.table,
      ),
    );
    expect(
      calls.findIndex((call) => call.table === "grows" && call.method === "maybeSingle"),
    ).toBeLessThan(firstChild);
    expect(calls).toContainEqual({
      table: "diary_entries",
      method: "is",
      args: ["retracted_at", null],
    });
    expect(calls).toContainEqual({
      table: "alerts",
      method: "in",
      args: ["status", ["open", "acknowledged"]],
    });
    expect(calls).toContainEqual({
      table: "action_queue",
      method: "in",
      args: ["status", ["pending_approval", "approved", "simulated"]],
    });
    expect(calls).toContainEqual({
      table: "action_queue_events",
      method: "in",
      args: ["action_queue_id", ["aq-1"]],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /suggested_change|target_device|originating_timeline_events|dedupe_key|user_id|must-not-cross|\[alert:/i,
    );
  });

  it("derives a Quick Log Worse response from the persisted observation note", async () => {
    const data = fixtures();
    data.grow_events = {
      data: (data.grow_events.data as Record<string, unknown>[]).map((row) =>
        row.id === "obs-1" ? { ...row, note: "Response check: Worse." } : row,
      ),
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
    expect(result.data.context.evidence.recentEvents).toContainEqual(
      expect.objectContaining({
        id: "obs-1",
        eventType: "observation",
        response: "worse",
      }),
    );
    expect(result.data.context.derived.reasonCodes).toContain("worsening_observation");
    expect(result.data.context.derived.attentionBand).toBe("immediate_physical_verification");
  });

  it("detects coeval sensor-source disagreement before reducing to the latest reading", async () => {
    const data = fixtures();
    data.sensor_readings = {
      data: [
        {
          id: "z-live-humidity",
          tent_id: "tent-1",
          metric: "humidity_pct",
          value: 60,
          quality: "ok",
          source: "live",
          ts: "2026-08-07T11:55:00.000Z",
          captured_at: "2026-08-07T11:55:00.000Z",
          created_at: "2026-08-07T11:55:01.000Z",
          raw_payload: { secret: "must-not-cross" },
        },
        {
          id: "manual-humidity",
          tent_id: "tent-1",
          metric: "humidity_pct",
          value: 80,
          quality: "ok",
          source: "manual",
          ts: "2026-08-07T11:54:30.000Z",
          captured_at: "2026-08-07T11:54:30.000Z",
          created_at: "2026-08-07T11:54:31.000Z",
          raw_payload: { secret: "must-not-cross" },
        },
      ],
      error: null,
    };

    const result = await getGrowWalkContextForOwnedTarget(
      clientFor(data).client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.sensors.readings.humidity_pct?.id).toBe("z-live-humidity");
    expect(result.data.context.evidence.sensors.contradictionMetrics).toEqual(["humidity_pct"]);
    expect(result.data.context.derived.contradictionCodes).toContain("sensor_sources_disagree");
    expect(result.data.context.derived.reasonCodes).toContain("contradictory_evidence");
    expect(result.data.context.derived.evidenceConfidence).toBe("low");
    expect(result.data.context.derived.attentionBand).toBe("immediate_physical_verification");
    expect(JSON.stringify(result)).not.toContain("must-not-cross");
  });

  it("reports the displayed AI Doctor confidence and only uses context confidence as a cap", async () => {
    const cases = [
      { displayed: 0.2, ceiling: "high", expected: "low" },
      { displayed: 0.9, ceiling: "medium", expected: "medium" },
      { displayed: 0.9, ceiling: "low", expected: "low" },
      { displayed: null, ceiling: "high", expected: "unknown" },
      { displayed: 1.1, ceiling: "high", expected: "unknown" },
    ] as const;

    for (const fixture of cases) {
      const data = fixtures();
      const session = (data.ai_doctor_sessions.data as Record<string, unknown>[])[0]!;
      session.displayed_confidence = fixture.displayed;
      session.context_confidence_ceiling = fixture.ceiling;

      const result = await getGrowWalkContextForOwnedTarget(
        clientFor(data).client,
        { targetType: "plant", targetId: "plant-1" },
        { now: new Date("2026-08-07T12:00:00.000Z") },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.context.evidence.aiDoctor?.confidenceBand).toBe(fixture.expected);
    }
  });

  it("includes only environmental enclosing-tent events for a plant without importing watering, Worse, sibling, or grow-wide logs", async () => {
    const data = fixtures();
    data.grow_events = {
      data: [
        ...(data.grow_events.data as Record<string, unknown>[]),
        {
          id: "tent-watering",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "watering",
          source: "manual",
          occurred_at: "2026-08-07T11:25:00.000Z",
          note: "Tent-only watering must not become a plant log.",
          created_at: "2026-08-07T11:25:01.000Z",
          is_deleted: false,
        },
        {
          id: "tent-worse",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:30:00.000Z",
          note: "Response check: Worse.",
          created_at: "2026-08-07T11:30:01.000Z",
          is_deleted: false,
        },
        {
          id: "tent-environment",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "environment",
          source: "manual",
          occurred_at: "2026-08-07T11:35:00.000Z",
          note: "Tent-wide humidity check.",
          created_at: "2026-08-07T11:35:01.000Z",
          is_deleted: false,
        },
        {
          id: "sibling-quick-log",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-2",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:40:00.000Z",
          note: "Sibling-only check.",
          created_at: "2026-08-07T11:40:01.000Z",
          is_deleted: false,
        },
        {
          id: "grow-wide-quick-log",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:45:00.000Z",
          note: "Grow-wide check.",
          created_at: "2026-08-07T11:45:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const eventIds = result.data.context.evidence.recentEvents.map((event) => event.id);
    expect(eventIds).toContain("tent-environment");
    expect(eventIds).not.toContain("tent-watering");
    expect(eventIds).not.toContain("tent-worse");
    expect(eventIds).not.toContain("sibling-quick-log");
    expect(eventIds).not.toContain("grow-wide-quick-log");
    const eventScope = calls.find((call) => call.table === "grow_events" && call.method === "or");
    expect(String(eventScope?.args[0])).toContain("plant_id.eq.plant-1");
    expect(String(eventScope?.args[0])).toContain("plant_id.is.null");
    expect(String(eventScope?.args[0])).toContain("tent_id.eq.tent-1");
    expect(String(eventScope?.args[0])).toContain("event_type.eq.environment");
  });

  it("keeps unassigned tent watering and Worse events in a tent context", async () => {
    const data = fixtures();
    data.grow_events = {
      data: [
        ...(data.grow_events.data as Record<string, unknown>[]),
        {
          id: "tent-watering",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "watering",
          source: "manual",
          occurred_at: "2026-08-07T11:25:00.000Z",
          note: "Tent watering remains tent evidence.",
          created_at: "2026-08-07T11:25:01.000Z",
          is_deleted: false,
        },
        {
          id: "tent-worse",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:30:00.000Z",
          note: "Response check: Worse.",
          created_at: "2026-08-07T11:30:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };

    const result = await getGrowWalkContextForOwnedTarget(
      clientFor(data).client,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const eventIds = result.data.context.evidence.recentEvents.map((event) => event.id);
    expect(eventIds).toContain("tent-watering");
    expect(eventIds).toContain("tent-worse");
  });

  it("includes enclosing tent alerts for a plant without importing a sibling plant alert", async () => {
    const data = fixtures();
    data.alerts = {
      data: [
        ...(data.alerts.data as Record<string, unknown>[]),
        {
          id: "tent-alert-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          title: "Tent humidity",
          reason: "The tent needs a physical check.",
          severity: "medium",
          status: "acknowledged",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-08-07T11:45:00.000Z",
        },
        {
          id: "sibling-plant-alert",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-2",
          title: "Sibling only",
          reason: "This must not leak into Plant 1 context.",
          severity: "high",
          status: "open",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-08-07T11:50:00.000Z",
        },
      ],
      error: null,
    };
    data.action_queue = {
      data: [
        ...(data.action_queue.data as Record<string, unknown>[]),
        {
          id: "grow-wide-no-tent-action",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          source: "manual",
          status: "pending_approval",
          risk_level: "low",
          reason: "Grow-wide action must not cross into an unassigned plant.",
          created_at: "2026-08-07T11:45:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.alerts.map((alert) => alert.id)).toEqual([
      "alert-1",
      "tent-alert-1",
    ]);
    const alertScope = calls.find((call) => call.table === "alerts" && call.method === "or");
    expect(String(alertScope?.args[0])).toContain("plant_id.eq.plant-1");
    expect(String(alertScope?.args[0])).toContain("plant_id.is.null");
    expect(String(alertScope?.args[0])).toContain("tent_id.eq.tent-1");
  });

  it("includes an exact-plant and unassigned enclosing-tent Action Queue item without importing sibling or grow-wide actions", async () => {
    const data = fixtures();
    data.action_queue = {
      data: [
        ...(data.action_queue.data as Record<string, unknown>[]),
        {
          id: "tent-action-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          source: "environment_alert",
          status: "approved",
          risk_level: "medium",
          reason: "Confirm tent humidity before any change. [alert:tent-alert-1]",
          created_at: "2026-08-07T11:20:00.000Z",
        },
        {
          id: "sibling-action",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-2",
          source: "manual",
          status: "pending_approval",
          risk_level: "high",
          reason: "Sibling action must not cross into Plant 1.",
          created_at: "2026-08-07T11:25:00.000Z",
        },
        {
          id: "grow-wide-action",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          source: "manual",
          status: "pending_approval",
          risk_level: "low",
          reason: "Grow-wide action must not cross into Plant 1.",
          created_at: "2026-08-07T11:30:00.000Z",
        },
      ],
      error: null,
    };
    data.action_queue_events = {
      data: [
        ...(data.action_queue_events.data as Record<string, unknown>[]),
        {
          id: "tent-action-event",
          action_queue_id: "tent-action-1",
          grow_id: "grow-1",
          event_type: "approved",
          previous_status: "pending_approval",
          new_status: "approved",
          note: "Grower approved a tent-level physical check.",
          created_at: "2026-08-07T11:20:01.000Z",
        },
        {
          id: "sibling-action-event",
          action_queue_id: "sibling-action",
          grow_id: "grow-1",
          event_type: "created",
          previous_status: null,
          new_status: "pending_approval",
          note: "Sibling audit must not cross into Plant 1.",
          created_at: "2026-08-07T11:25:01.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.actionQueue.items.map((item) => item.id)).toEqual([
      "aq-1",
      "tent-action-1",
    ]);
    expect(result.data.context.evidence.actionQueue.items[1]).toMatchObject({
      growId: "grow-1",
      tentId: "tent-1",
      plantId: null,
      relatedAlertId: "tent-alert-1",
      status: "approved",
      auditTrail: [
        {
          id: "tent-action-event",
          eventType: "approved",
          previousStatus: "pending_approval",
          newStatus: "approved",
          noteExcerpt: "Grower approved a tent-level physical check.",
        },
      ],
    });
    const actionScope = calls.find((call) => call.table === "action_queue" && call.method === "or");
    expect(String(actionScope?.args[0])).toContain("plant_id.eq.plant-1");
    expect(String(actionScope?.args[0])).toContain("plant_id.is.null");
    expect(String(actionScope?.args[0])).toContain("tent_id.eq.tent-1");
    expect(calls).toContainEqual({
      table: "action_queue_events",
      method: "in",
      args: ["action_queue_id", ["aq-1", "tent-action-1"]],
    });
    expect(JSON.stringify(result)).not.toMatch(/sibling-action|grow-wide-action|Sibling audit/i);
    const { client: tentClient, calls: tentCalls } = clientFor(data);
    const tentResult = await getGrowWalkContextForOwnedTarget(
      tentClient,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );
    expect(tentResult.ok).toBe(true);
    if (!tentResult.ok) return;
    expect(tentResult.data.context.evidence.actionQueue.items.map((item) => item.id)).toEqual([
      "aq-1",
      "tent-action-1",
      "sibling-action",
    ]);
    expect(tentResult.data.context.evidence.actionQueue.items[2]).toMatchObject({
      plantId: "plant-2",
      auditTrail: [
        {
          id: "sibling-action-event",
          eventType: "created",
          newStatus: "pending_approval",
          noteExcerpt: "Sibling audit must not cross into Plant 1.",
        },
      ],
    });
    expect(tentCalls).toContainEqual({
      table: "action_queue",
      method: "eq",
      args: ["tent_id", "tent-1"],
    });
    expect(tentCalls.some((call) => call.table === "action_queue" && call.method === "or")).toBe(
      false,
    );
    expect(tentCalls).toContainEqual({
      table: "action_queue_events",
      method: "in",
      args: ["action_queue_id", ["aq-1", "tent-action-1", "sibling-action"]],
    });
    expect(tentResult.data.context.evidence.actionQueue.items.map((item) => item.id)).not.toContain(
      "grow-wide-action",
    );
  });

  it("keeps an acknowledged current alert when it predates the evidence lookback", async () => {
    const data = fixtures();
    data.alerts = {
      data: [
        ...(data.alerts.data as Record<string, unknown>[]),
        {
          id: "acknowledged-current-alert",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          title: "Older active humidity alert",
          reason: "Acknowledged alerts remain current until resolved.",
          severity: "medium",
          status: "acknowledged",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-07-01T11:45:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.alerts.map((alert) => alert.id)).toContain(
      "acknowledged-current-alert",
    );
    expect(calls).not.toContainEqual({
      table: "alerts",
      method: "gte",
      args: ["last_seen_at", "2026-08-04T12:00:00.000Z"],
    });
  });

  it("includes a tent's legacy null-grow plant evidence only when the linked plant belongs to that tent", async () => {
    const data = fixtures();
    data.plants = {
      data: [
        data.plants.data,
        {
          id: "plant-legacy",
          name: "Legacy Tent Plant",
          strain: null,
          tent_id: "tent-1",
          grow_id: null,
          stage: "flower",
          health: null,
          is_archived: false,
          medium: null,
          pot_size: null,
          plant_type: null,
        },
        {
          id: "plant-other",
          name: "Other Tent Plant",
          strain: null,
          tent_id: "tent-other",
          grow_id: "grow-1",
          stage: "flower",
          health: null,
          is_archived: false,
          medium: null,
          pot_size: null,
          plant_type: null,
        },
      ],
      error: null,
    };
    data.grow_events = {
      data: [
        ...(data.grow_events.data as Record<string, unknown>[]),
        {
          id: "legacy-plant-event",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-legacy",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:35:00.000Z",
          note: "Legacy plant evidence.",
          created_at: "2026-08-07T11:35:01.000Z",
          is_deleted: false,
        },
        {
          id: "other-legacy-plant-event",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-other",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:36:00.000Z",
          note: "Other tent evidence.",
          created_at: "2026-08-07T11:36:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };
    data.diary_entries = {
      data: [
        ...(data.diary_entries.data as Record<string, unknown>[]),
        {
          id: "legacy-plant-photo",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-legacy",
          entry_at: "2026-08-07T11:37:00.000Z",
          photo_url: "verdant-photo://private/legacy-plant",
          details: {},
          retracted_at: null,
        },
        {
          id: "other-legacy-plant-photo",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-other",
          entry_at: "2026-08-07T11:38:00.000Z",
          photo_url: "verdant-photo://private/other-plant",
          details: {},
          retracted_at: null,
        },
      ],
      error: null,
    };
    data.alerts = {
      data: [
        ...(data.alerts.data as Record<string, unknown>[]),
        {
          id: "legacy-plant-alert",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-legacy",
          title: "Legacy plant alert",
          reason: "This belongs to Flower Tent through the plant relationship.",
          severity: "medium",
          status: "open",
          metric: null,
          source: "manual",
          last_seen_at: "2026-08-07T11:40:00.000Z",
        },
        {
          id: "other-legacy-plant-alert",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-other",
          title: "Other legacy alert",
          reason: "This belongs to a different tent.",
          severity: "high",
          status: "open",
          metric: null,
          source: "manual",
          last_seen_at: "2026-08-07T11:50:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.recentEvents.map((event) => event.id)).toEqual([
      "water-1",
      "photo-1",
      "obs-1",
      "legacy-plant-event",
    ]);
    expect(result.data.context.evidence.photos.map((photo) => photo.id)).toEqual([
      "photo-top-level",
      "photo-legacy-details",
      "legacy-plant-photo",
    ]);
    expect(result.data.context.evidence.alerts.map((alert) => alert.id)).toEqual([
      "alert-1",
      "legacy-plant-alert",
    ]);
    expect(calls).toContainEqual({
      table: "plants",
      method: "eq",
      args: ["tent_id", "tent-1"],
    });
    expect(calls).toContainEqual({
      table: "plants",
      method: "or",
      args: ["grow_id.eq.grow-1,grow_id.is.null"],
    });
    const alertScope = calls.find((call) => call.table === "alerts" && call.method === "or");
    expect(String(alertScope?.args[0])).toContain("tent_id.eq.tent-1");
    expect(String(alertScope?.args[0])).toContain("plant_id.in.(plant-1,plant-legacy)");
    const relationalScopes = calls.filter(
      (call) =>
        call.method === "or" && ["grow_events", "diary_entries", "alerts"].includes(call.table),
    );
    expect(relationalScopes).toHaveLength(3);
    expect(relationalScopes.map((call) => call.table)).toEqual(
      expect.arrayContaining(["grow_events", "diary_entries", "alerts"]),
    );
  });

  it("keeps an owned archived target readable when it was explicitly selected from the inactive target list", async () => {
    const data = fixtures();
    data.plants = {
      data: { ...(data.plants.data as Record<string, unknown>), is_archived: true },
      error: null,
    };
    data.tents = {
      data: { ...(data.tents.data as Record<string, unknown>), is_archived: true },
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.context.scope.targetArchived).toBe(true);
    expect(calls).not.toContainEqual({
      table: "plants",
      method: "eq",
      args: ["is_archived", false],
    });
    expect(calls).not.toContainEqual({
      table: "tents",
      method: "eq",
      args: ["is_archived", false],
    });
  });

  it("keeps every Action Queue item inside the declared 20-row lane bound", async () => {
    const data = fixtures();
    data.action_queue = {
      data: Array.from({ length: 11 }, (_, index) => ({
        id: `aq-${index + 1}`,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        status: "pending_approval",
        risk_level: "low",
        reason: `Review item ${index + 1}.`,
        created_at: `2026-08-07T11:${String(index).padStart(2, "0")}:00.000Z`,
      })),
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
    expect(result.data.context.evidence.actionQueue.openCount).toBe(11);
    expect(result.data.context.evidence.actionQueue.items).toHaveLength(11);
    expect(result.data.context.receipt.truncatedLanes).not.toContain("action_queue");
  });

  it("uses lookahead rows before marking every bounded evidence lane truncated", async () => {
    const exactData = boundedEvidenceFixtures({
      events: 100,
      photos: 100,
      alerts: 50,
      aiDoctor: 1,
    });
    const { client: exactClient, calls: exactCalls } = clientFor(exactData);
    const exact = await getGrowWalkContextForOwnedTarget(
      exactClient,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.data.context.evidence.recentEvents).toHaveLength(100);
    expect(exact.data.context.evidence.photos).toHaveLength(100);
    expect(exact.data.context.evidence.alerts).toHaveLength(50);
    expect(exact.data.context.evidence.aiDoctor?.sessionId).toBe("session-1");
    expect(exact.data.context.receipt.truncatedLanes).not.toEqual(
      expect.arrayContaining(["events", "photos", "alerts", "ai_doctor"]),
    );
    expect(exactCalls).toContainEqual({ table: "grow_events", method: "limit", args: [101] });
    expect(exactCalls).toContainEqual({ table: "diary_entries", method: "limit", args: [101] });
    expect(exactCalls).toContainEqual({ table: "alerts", method: "limit", args: [51] });
    expect(exactCalls).toContainEqual({ table: "ai_doctor_sessions", method: "limit", args: [2] });

    const overflowData = boundedEvidenceFixtures({
      events: 101,
      photos: 101,
      alerts: 51,
      aiDoctor: 2,
    });
    const overflow = await getGrowWalkContextForOwnedTarget(
      clientFor(overflowData).client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(overflow.ok).toBe(true);
    if (!overflow.ok) return;
    expect(overflow.data.context.evidence.recentEvents).toHaveLength(100);
    expect(overflow.data.context.evidence.photos).toHaveLength(100);
    expect(overflow.data.context.evidence.alerts).toHaveLength(50);
    expect(overflow.data.context.evidence.aiDoctor?.sessionId).toBe("session-1");
    expect(overflow.data.context.receipt.truncatedLanes).toEqual(
      expect.arrayContaining(["events", "photos", "alerts", "ai_doctor"]),
    );
  });

  it("keeps an existing nonterminal Action Queue item even when it predates the evidence lookback", async () => {
    const data = fixtures();
    data.action_queue = {
      data: [
        ...(data.action_queue.data as Record<string, unknown>[]),
        {
          id: "aq-open-before-lookback",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          source: "manual",
          status: "pending_approval",
          risk_level: "medium",
          reason: "Still needs grower review.",
          created_at: "2026-07-01T11:00:00.000Z",
        },
        {
          id: "aq-completed-before-lookback",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          source: "manual",
          status: "completed",
          risk_level: "low",
          reason: "Completed work must not appear as current.",
          created_at: "2026-07-01T11:00:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.actionQueue.items.map((item) => item.id)).toEqual([
      "aq-1",
      "aq-open-before-lookback",
    ]);
    expect(calls).not.toContainEqual({
      table: "action_queue",
      method: "gte",
      args: ["created_at", "2026-08-04T12:00:00.000Z"],
    });
  });

  it("does not mark exactly 20 Action Queue items as truncated", async () => {
    const data = fixtures();
    data.action_queue = {
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `aq-${index + 1}`,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        status: "pending_approval",
        risk_level: "low",
        reason: `Review item ${index + 1}.`,
        created_at: `2026-08-07T11:${String(index).padStart(2, "0")}:00.000Z`,
      })),
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.actionQueue.openCount).toBe(20);
    expect(result.data.context.evidence.actionQueue.items).toHaveLength(20);
    expect(result.data.context.receipt.truncatedLanes).not.toContain("action_queue");
    expect(calls).toContainEqual({ table: "action_queue", method: "limit", args: [21] });
  });

  it("marks Action Queue evidence truncated only after its 20-row lookahead", async () => {
    const data = fixtures();
    data.action_queue = {
      data: Array.from({ length: 21 }, (_, index) => ({
        id: `aq-${index + 1}`,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        source: "manual",
        status: "pending_approval",
        risk_level: "low",
        reason: `Review item ${index + 1}.`,
        created_at: `2026-08-07T11:${String(index).padStart(2, "0")}:00.000Z`,
      })),
      error: null,
    };
    const { client, calls } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.actionQueue.openCount).toBe(20);
    expect(result.data.context.evidence.actionQueue.items).toHaveLength(20);
    expect(result.data.context.receipt.truncatedLanes).toContain("action_queue");
    expect(calls).toContainEqual({ table: "action_queue", method: "limit", args: [21] });
  });

  it("marks supporting tent-relationship and audit reads truncated only after their 100-row lookahead", async () => {
    const exactData = fixtures();
    exactData.plants = { data: tentRelationPlants(100), error: null };
    exactData.action_queue_events = { data: actionQueueAuditEvents(100), error: null };
    const exact = await getGrowWalkContextForOwnedTarget(
      clientFor(exactData).client,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.data.context.receipt.truncatedLanes).not.toEqual(
      expect.arrayContaining(["events", "photos", "alerts", "action_queue"]),
    );
    expect(exact.data.context.evidence.actionQueue.items[0]?.auditTrail).toHaveLength(100);

    const overflowData = fixtures();
    overflowData.plants = { data: tentRelationPlants(101), error: null };
    overflowData.action_queue_events = { data: actionQueueAuditEvents(101), error: null };
    const overflow = await getGrowWalkContextForOwnedTarget(
      clientFor(overflowData).client,
      { targetType: "tent", targetId: "tent-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(overflow.ok).toBe(true);
    if (!overflow.ok) return;
    expect(overflow.data.context.receipt.truncatedLanes).toEqual(
      expect.arrayContaining(["events", "photos", "alerts", "action_queue"]),
    );
    expect(overflow.data.context.evidence.actionQueue.items[0]?.auditTrail).toHaveLength(100);
  });

  it("retries photo metadata without the new column only for a pre-migration database", async () => {
    const { client, calls } = clientFor(fixtures(), { missingDiaryRetractionColumn: true });
    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context.evidence.photos).toHaveLength(2);
    const selects = calls
      .filter((call) => call.table === "diary_entries" && call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain("retracted_at");
    expect(selects[1]).not.toContain("retracted_at");
  });

  it("labels a target historical when its owned grow is archived", async () => {
    const data = fixtures();
    data.grows = {
      data: {
        ...(data.grows.data as Record<string, unknown>),
        is_archived: true,
      },
      error: null,
    };
    const { client } = clientFor(data);

    const result = await getGrowWalkContextForOwnedTarget(
      client,
      { targetType: "plant", targetId: "plant-1" },
      { now: new Date("2026-08-07T12:00:00.000Z") },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.context.scope.targetArchived).toBe(true);
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
        [
          "grow_events",
          "diary_entries",
          "alerts",
          "ai_doctor_sessions",
          "action_queue",
          "sensor_readings",
        ].includes(call.table),
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

  it("includes grow-level alerts for an owned plant without a tent and marks the sensor lane partial", async () => {
    const data = fixtures();
    data.plants = {
      data: { ...(data.plants.data as object), tent_id: null },
      error: null,
    };
    data.alerts = {
      data: [
        ...(data.alerts.data as Record<string, unknown>[]),
        {
          id: "grow-alert-1",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          title: "Grow-wide check",
          reason: "This is relevant without a tent assignment.",
          severity: "medium",
          status: "open",
          metric: null,
          source: "manual",
          last_seen_at: "2026-08-07T11:40:00.000Z",
        },
        {
          id: "other-plant-alert",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: "plant-2",
          title: "Other plant only",
          reason: "This must not leak into Plant 1 context.",
          severity: "high",
          status: "open",
          metric: null,
          source: "manual",
          last_seen_at: "2026-08-07T11:45:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(data);
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
    expect(result.data.context.evidence.alerts.map((alert) => alert.id)).toEqual([
      "alert-1",
      "grow-alert-1",
    ]);
    expect(result.data.context.evidence.actionQueue.items.map((item) => item.id)).toEqual(["aq-1"]);
    expect(calls).toContainEqual({
      table: "action_queue",
      method: "eq",
      args: ["plant_id", "plant-1"],
    });
    const alertScope = calls.find((call) => call.table === "alerts" && call.method === "or");
    expect(String(alertScope?.args[0])).toContain("plant_id.eq.plant-1");
    expect(String(alertScope?.args[0])).toContain("plant_id.is.null");
    expect(String(alertScope?.args[0])).toContain("tent_id.is.null");
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
    expect(result.data.context.evidence.recentEvents[0]?.noteExcerpt?.length).toBeLessThanOrEqual(
      240,
    );
    expect(result.data.context.evidence.alerts[0]?.reasonExcerpt.length).toBeLessThanOrEqual(240);
    expect(JSON.stringify(result)).not.toMatch(
      /raw_payload|authorization|access_token|refresh_token|signed_url|storage_path|target_device|suggested_change|diagnosis|suggested_actions/i,
    );
    expect(JSON.stringify(result)).not.toContain("verdant-photo://");
    expect(JSON.stringify(result)).not.toContain("photo-retracted");
  });
});
