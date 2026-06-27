/**
 * ai-doctor-readiness-ui-regression
 *
 * Read-only regression coverage for the AI Doctor Context Readiness UI:
 *  - source-quality badge inline snapshots (live/manual/csv/demo/stale/invalid)
 *  - cautious labeling of untrusted sources (no "healthy" on demo/stale/invalid)
 *  - evidence/limitations rendering for sensor-missing path
 *  - evidence section header ordering snapshot
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
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  SOURCE_BADGE_CASES,
  buildReadingForSource,
  buildReadinessContext,
  readinessFixtureAgo,
  READINESS_FIXTURE_HOUR_MS,
} from "@/test/utils/aiDoctorReadinessFixtures";

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

const HOUR = READINESS_FIXTURE_HOUR_MS;
const ago = readinessFixtureAgo;

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

const UNTRUSTED_FORBIDDEN_NEAR = ["healthy"] as const;

describe("AI Doctor Readiness UI — source-quality badge snapshots", () => {
  for (const cse of SOURCE_BADGE_CASES) {
    it(`renders ${cse.source} badge with label, count, and isTrustworthy=${cse.isTrustworthy}`, () => {
      const context = buildReadinessContext({
        sensorReadings: [buildReadingForSource(cse.source)],
      });
      render(<AiDoctorContextReadinessPanel context={context} />);
      const badge = screen.getByTestId(
        `ai-doctor-context-readiness-panel-source-${cse.source}`,
      );
      expect(badge.getAttribute("data-source")).toBe(cse.source);
      expect(badge.getAttribute("data-trustworthy")).toBe(
        cse.isTrustworthy ? "true" : "false",
      );
      expect(badge.textContent ?? "").toContain(cse.label);
      expect(badge.textContent ?? "").toMatch(/·\s*1\b/);

      if (!cse.isTrustworthy) {
        const text = (badge.textContent ?? "").toLowerCase();
        for (const word of UNTRUSTED_FORBIDDEN_NEAR) {
          expect(text).not.toContain(word);
        }
      }
    });
  }

  it("does not merge multiple untrusted sources into a single trusted badge", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("demo"),
        buildReadingForSource("csv", { metric: "humidity_pct", value: 55 }),
      ],
    });
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
    const context = buildReadinessContext({ plant: { stage: null } });
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
    const context = buildReadinessContext({
      sensorReadings: [buildReadingForSource("stale")],
    });
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
// Evidence section header ordering snapshot — locks the actual H2/H3 ordering
// the panel renders today. The panel groups evidence by section header, not
// by event type (diary/photo/watering/feeding are surfaced via counts +
// quick actions + missing-information list, not as individual headers).
// Documenting the actual intended grouping per task instructions.
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI — evidence section header ordering", () => {
  it("renders H2/H3 section headers in deterministic order for a missing-evidence panel", () => {
    const context = buildReadinessContext({
      // No events, no sensors → triggers QuickActions + Limitations +
      // Missing information sections so we exercise the full header set.
      plant: { stage: null },
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const headers = Array.from(panel.querySelectorAll("h2, h3")).map(
      (h) => (h.textContent ?? "").trim(),
    );
    expect(headers).toEqual([
      "AI Doctor Context Readiness",
      "Next evidence to add",
      "Sensor source labels",
      "Current reading quality",
      "Limitations",
      "Missing information",
      "Preview AI Doctor output",
      "Action Queue suggestion preview",
    ]);
  });

  it("omits QuickActions/Limitations/Missing headers on a strong-context panel", () => {
    const context = buildReadinessContext({
      growEvents: [
        { occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(8 * HOUR), event_type: "feeding", source: "manual" },
        { occurred_at: ago(4 * HOUR), event_type: "photo", source: "manual" },
      ],
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("live", { metric: "humidity_pct", value: 55 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} openAlertsCount={0} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const headers = Array.from(panel.querySelectorAll("h2, h3")).map(
      (h) => (h.textContent ?? "").trim(),
    );
    // "Next evidence to add" still renders because the Add Sensor Snapshot
    // quick action is always offered (it has no automatic-fulfilment route).
    // No "Limitations" and no "Missing information" sections on strong context.
    expect(headers).toEqual([
      "AI Doctor Context Readiness",
      "Next evidence to add",
      "Sensor source labels",
      "Current reading quality",
      "Preview AI Doctor output",
      "Action Queue suggestion preview",
    ]);
  });

  it("counts panel surfaces Stage / Recent logs / Sensor readings (7d) / Open alerts", () => {
    const context = buildReadinessContext({
      growEvents: [
        { occurred_at: ago(2 * HOUR), event_type: "watering", source: "manual" },
      ],
      sensorReadings: [buildReadingForSource("manual")],
    });
    render(
      <AiDoctorContextReadinessPanel context={context} openAlertsCount={3} />,
    );
    const dl = screen.getByTestId("ai-doctor-context-readiness-panel-counts");
    const dtLabels = Array.from(dl.querySelectorAll("dt")).map(
      (n) => (n.textContent ?? "").trim(),
    );
    expect(dtLabels).toEqual([
      "Stage",
      "Recent logs",
      "Sensor readings (7d)",
      "Open alerts",
    ]);
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-count-recent-logs")
        .textContent,
    ).toBe("1");
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-count-sensor-readings",
      ).textContent,
    ).toBe("1");
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-count-open-alerts")
        .textContent,
    ).toBe("3");
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
// Disabled quick actions must dispatch nothing.
// ---------------------------------------------------------------------------

const QUICK_ACTION_DETAIL_BANNED_KEYS = [
  "command",
  "execute",
  "automation",
  "action",
  "action_queue",
  "insert",
  "update",
  "delete",
  "upsert",
  "device",
  "controller",
  "setpoint",
  "pump",
  "fan",
  "light",
  "irrigation",
] as const;

describe("AI Doctor Readiness UI — quick-action safety (mount)", () => {
  it("dispatches verdant:open-quicklog CustomEvent with safe identifiers only on Add Watering", () => {
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };

    const localStorageSetSpy = vi.spyOn(Storage.prototype, "setItem");
    const sessionStorageSetSpy = vi.spyOn(
      window.sessionStorage.__proto__,
      "setItem",
    );

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
      localStorageSetSpy.mockRestore();
      sessionStorageSetSpy.mockRestore();
    }

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt).toBeInstanceOf(CustomEvent);
    expect(evt.type).toBe("verdant:open-quicklog");

    const detail = (evt.detail ?? {}) as Record<string, unknown>;
    const detailKeys = Object.keys(detail).sort();
    expect(detailKeys).toEqual(["growId", "plantId", "tentId"]);
    expect(detail).toEqual({ plantId: "p1", growId: "g1", tentId: "t1" });

    // No banned write/command/device tokens anywhere in the payload keys
    // or stringified values.
    const detailJson = JSON.stringify(detail).toLowerCase();
    for (const banned of QUICK_ACTION_DETAIL_BANNED_KEYS) {
      expect(detailKeys.map((k) => k.toLowerCase())).not.toContain(banned);
      expect(detailJson).not.toContain(banned);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
    expect(sessionStorageSetSpy).not.toHaveBeenCalled();
  });

  it("Add Feeding dispatches the same navigation-only event payload shape", () => {
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
          plantId="p2"
          growId="g2"
          tentId="t2"
          plantName="Plant B"
          stage="veg"
        />,
      );
      const button = screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-add-feeding",
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("verdant:open-quicklog");
    expect(events[0].detail).toEqual({
      plantId: "p2",
      growId: "g2",
      tentId: "t2",
    });
  });

  it("disabled quick actions dispatch no event and trigger no network call", () => {
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };

    const events: Event[] = [];
    const handler = (e: Event) => {
      events.push(e);
    };
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    try {
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
      fireEvent.click(button);
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);
    }

    expect(events).toHaveLength(0);
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
