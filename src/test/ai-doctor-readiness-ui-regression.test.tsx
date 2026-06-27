/**
 * ai-doctor-readiness-ui-regression
 *
 * Read-only regression coverage for the AI Doctor Context Readiness UI:
 *  - source-quality badge inline snapshots (live/manual/csv/demo/stale/invalid)
 *  - cautious labeling of untrusted sources (no "healthy" on demo/stale/invalid)
 *  - evidence/limitations rendering for sensor-missing path
 *  - fallback copy on missing plantId, loading, and compile-error paths
 *  - quick-action mount dispatches navigation-only CustomEvents with safe payloads
 *
 * Hard constraints:
 *  - No model/API calls. No Supabase writes. No alerts. No Action Queue writes.
 *  - Render-time mocks throw on supabase / fetch / functions.invoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in readiness regression test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in readiness regression test");
      },
    },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in readiness regression test");
  }) as never);

let recentActivityState: { data?: unknown; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
let manualLogsState: { data?: unknown; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
let alertsState: { rows: ReadonlyArray<{ id: string }> } = { rows: [] };

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
  usePlantRecentActivity: () => recentActivityState,
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  PLANT_MANUAL_SENSOR_HISTORY_LIMIT: 30,
  usePlantManualSensorHistory: () => ({ data: undefined, isLoading: false }),
  usePlantManualSensorLogs: () => manualLogsState,
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "idle",
    rows: alertsState.rows,
    error: null,
  }),
}));

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const plant = {
  id: "p1",
  name: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
};

function ctx(
  growEvents: ReadonlyArray<Record<string, unknown>>,
  sensorReadings: ReadonlyArray<Record<string, unknown>>,
) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents,
    sensorReadings,
    now: NOW,
  });
}

beforeEach(() => {
  recentActivityState = { data: [], isLoading: false };
  manualLogsState = { data: [], isLoading: false };
  alertsState = { rows: [] };
  fetchSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Source-quality badge inline snapshots — per source, deterministic single
// reading. Locks label text, count text, and trustworthy classification so
// untrusted sources cannot drift to "live"/trusted styling.
// ---------------------------------------------------------------------------

const SOURCE_BADGE_CASES = [
  { source: "live", label: "Live", trustworthy: "true" },
  { source: "manual", label: "Manual", trustworthy: "true" },
  { source: "csv", label: "CSV / imported", trustworthy: "false" },
  { source: "demo", label: "Demo", trustworthy: "false" },
  { source: "stale", label: "Stale", trustworthy: "false" },
  { source: "invalid", label: "Invalid", trustworthy: "false" },
] as const;

const UNTRUSTED_FORBIDDEN_NEAR = ["healthy"] as const;

describe("AI Doctor Readiness UI — source-quality badge snapshots", () => {
  for (const cse of SOURCE_BADGE_CASES) {
    it(`renders ${cse.source} badge with label, count, and trustworthy=${cse.trustworthy}`, () => {
      const reading: Record<string, unknown> = {
        metric: "temperature_c",
        value: 24,
        captured_at: ago(HOUR),
        source: cse.source === "stale" || cse.source === "invalid" ? "live" : cse.source,
      };
      if (cse.source === "stale") reading.quality = "stale";
      if (cse.source === "invalid") reading.quality = "invalid";

      render(<AiDoctorContextReadinessPanel context={ctx([], [reading])} />);
      const badge = screen.getByTestId(
        `ai-doctor-context-readiness-panel-source-${cse.source}`,
      );
      expect(badge.getAttribute("data-source")).toBe(cse.source);
      expect(badge.getAttribute("data-trustworthy")).toBe(cse.trustworthy);
      expect(badge.textContent ?? "").toContain(cse.label);
      expect(badge.textContent ?? "").toMatch(/·\s*1\b/);

      if (cse.trustworthy === "false") {
        const text = (badge.textContent ?? "").toLowerCase();
        for (const word of UNTRUSTED_FORBIDDEN_NEAR) {
          expect(text).not.toContain(word);
        }
      }
    });
  }

  it("does not merge multiple untrusted sources into a single trusted badge", () => {
    const context = ctx(
      [],
      [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "demo" },
        { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "csv" },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const demo = screen.getByTestId("ai-doctor-context-readiness-panel-source-demo");
    const csv = screen.getByTestId("ai-doctor-context-readiness-panel-source-csv");
    expect(demo.getAttribute("data-trustworthy")).toBe("false");
    expect(csv.getAttribute("data-trustworthy")).toBe("false");
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Evidence / limitations rendering — order within the limitations list is
// deterministic per `buildAiDoctorReadinessView`. Lock the documented order
// for the sensor-missing / unknown-stage path:
//   1) no_sensors  2) no_recent_events  3) missing_stage
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI — limitations ordering (sensor-missing path)", () => {
  it("renders limitations in deterministic order: no_sensors → no_recent_events → missing_stage", () => {
    const context = compileAiDoctorContextFromRows({
      plant: { ...plant, stage: null },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const list = screen.getByTestId("ai-doctor-context-readiness-panel-limitations");
    const items = Array.from(list.querySelectorAll("li")).map(
      (li) => li.getAttribute("data-testid") ?? "",
    );
    expect(items).toEqual([
      "ai-doctor-context-readiness-panel-limitation-no_sensors",
      "ai-doctor-context-readiness-panel-limitation-no_recent_events",
      "ai-doctor-context-readiness-panel-limitation-missing_stage",
    ]);
  });

  it("flags stale/invalid telemetry as untrusted with caution copy (never healthy)", () => {
    const context = ctx(
      [],
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: ago(HOUR),
          source: "live",
          quality: "stale",
        },
      ],
    );
    render(<AiDoctorContextReadinessPanel context={context} />);
    const limitation = screen.getByTestId(
      "ai-doctor-context-readiness-panel-limitation-stale_or_invalid",
    );
    const text = (limitation.textContent ?? "").toLowerCase();
    expect(text).toContain("untrusted");
    expect(text).not.toContain("healthy");
  });
});

// ---------------------------------------------------------------------------
// Fallback copy — mount-level. Both the missing plantId path and the
// compile-error path must render the same cautious "not available yet"
// message, with no certainty / device-control / healthy wording, and
// without firing any network calls.
// ---------------------------------------------------------------------------

const FALLBACK_FORBIDDEN_PHRASES = [
  "healthy",
  "guaranteed",
  "definitely",
  "diagnosed",
  "turn on",
  "turn off",
  "auto execute",
  "auto-execute",
  "execute command",
  "device command",
  "automatically control",
];

function assertSafeFallback(text: string) {
  const lower = text.toLowerCase();
  expect(lower).toContain("ai doctor context is not available");
  for (const phrase of FALLBACK_FORBIDDEN_PHRASES) {
    expect(lower).not.toContain(phrase);
  }
}

describe("AI Doctor Readiness UI — fallback copy", () => {
  it("missing plantId path renders cautious empty fallback", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId=""
        growId="g1"
        tentId="t1"
        plantName="Plant A"
      />,
    );
    const node = screen.getByTestId(
      "plant-detail-ai-doctor-context-readiness-mount-empty",
    );
    assertSafeFallback(node.textContent ?? "");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loading path renders cautious 'Checking AI Doctor context…' copy", () => {
    recentActivityState = { data: undefined, isLoading: true };
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
      />,
    );
    const node = screen.getByTestId(
      "plant-detail-ai-doctor-context-readiness-mount-loading",
    );
    const text = (node.textContent ?? "").toLowerCase();
    expect(text).toContain("checking ai doctor context");
    for (const phrase of FALLBACK_FORBIDDEN_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("compile-error path renders the same cautious fallback message", () => {
    const exploding = {
      [Symbol.iterator]() {
        throw new Error("boom");
      },
    };
    recentActivityState = {
      data: exploding as unknown as unknown[],
      isLoading: false,
    };
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
      />,
    );
    const node = screen.getByTestId(
      "plant-detail-ai-doctor-context-readiness-mount-fallback",
    );
    assertSafeFallback(node.textContent ?? "");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Quick-action safety — when the mount wires watering/feeding handlers,
// clicking them must only dispatch the navigation-only CustomEvent with a
// safe `{plantId, growId, tentId}` payload. No write/command semantics.
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI — quick-action safety (mount)", () => {
  it("dispatches verdant:open-quicklog with safe identifiers only on Add Watering", () => {
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };

    const events: CustomEvent[] = [];
    const handler = (e: Event) => {
      events.push(e as CustomEvent);
    };
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    try {
      render(
        <PlantDetailAiDoctorContextReadinessMount
          plantId="p1"
          growId="g1"
          tentId="t1"
          plantName="Plant A"
          stage="veg"
        />,
      );
      const button = screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-watering",
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
    }

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt.type).toBe("verdant:open-quicklog");
    expect(evt.detail).toEqual({ plantId: "p1", growId: "g1", tentId: "t1" });

    // Payload must contain only safe identifiers — no command/action/write
    // semantics smuggled in.
    const detailKeys = Object.keys((evt.detail ?? {}) as Record<string, unknown>);
    expect(detailKeys.sort()).toEqual(["growId", "plantId", "tentId"]);
    const detailJson = JSON.stringify(evt.detail).toLowerCase();
    for (const banned of [
      "command",
      "execute",
      "automate",
      "turn_on",
      "turn_off",
      "action_queue",
      "insert",
      "update",
      "delete",
      "upsert",
    ]) {
      expect(detailJson).not.toContain(banned);
    }

    // And no network egress
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders Add Watering disabled when growId or tentId are missing (no invented routes)", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId={null}
        tentId={null}
        plantName="Plant A"
      />,
    );
    const button = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-add-watering",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-disabled")).toBe("true");
  });
});
