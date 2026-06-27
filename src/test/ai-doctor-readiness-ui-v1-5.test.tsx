/**
 * ai-doctor-readiness-ui-v1-5
 *
 * v1.5 regression coverage extending v1.4:
 *  - Source badge edge cases: zero-count behavior, mixed trusted +
 *    untrusted badge sets, and unknown/missing-source collapse.
 *  - Desktop AND mobile viewport coverage for missing-context, loading,
 *    empty-plantId, and compile-error fallback states.
 *
 * Hard constraints (tests-only):
 *  - No runtime code, view-model, engine, schema, RLS, RPC, or Edge
 *    Function changes.
 *  - No model/API calls. No Supabase writes. No alerts. No Action Queue
 *    writes. No automation. No device control.
 *  - render-time mocks throw on supabase / fetch / functions.invoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";
import {
  buildAiDoctorReadinessView,
} from "@/lib/aiDoctorReadinessViewModel";
import {
  SOURCE_BADGE_CASES,
  buildReadingForSource,
  buildReadinessContext,
} from "@/test/utils/aiDoctorReadinessFixtures";

// ---------------------------------------------------------------------------
// Global mocks: forbid any network / supabase touch during render.
// ---------------------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in v1.5 readiness test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in v1.5 readiness test");
      },
    },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in v1.5 readiness test");
  }) as never);

// ---------------------------------------------------------------------------
// Mount hook mocks — drive loading / empty / compile-error states.
// ---------------------------------------------------------------------------
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

const baseMountProps = {
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  plantName: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
};

beforeEach(() => {
  recentActivityState = { data: [], isLoading: false };
  manualLogsState = { data: [], isLoading: false };
  alertsState = { rows: [] };
  fetchSpy.mockClear();
});

const TRUSTED_TONE_CLASSES = ["border-emerald-500/30", "text-emerald-200"];
const CAUTION_TONE_CLASSES = ["border-amber-500/30", "text-amber-200"];
const UNTRUSTED_FORBIDDEN_WORDS = ["healthy", "trusted", "live sensor"];
const FORBIDDEN_AUTOMATION_WORDS = [
  "auto-execute",
  "automatically",
  "device control",
  "turn on",
  "turn off",
  "set fan",
  "dose nutrients",
];

// ===========================================================================
// 1. Source-badge edge cases
// ===========================================================================

describe("AI Doctor Readiness UI v1.5 — source badge edge cases", () => {
  // ----- A. Zero-count contract --------------------------------------------
  it("view-model never emits zero-count badges: empty sensor input → no badges", () => {
    const context = buildReadinessContext({ sensorReadings: [] });
    const view = buildAiDoctorReadinessView({ context, openAlertsCount: 0 });
    expect(view.sourceBadges).toEqual([]);
    for (const b of view.sourceBadges) {
      // Defensive: if any badge ever does appear, it must have a real
      // sample, never a fake zero-count "trusted" stub.
      expect(b.sampleCount).toBeGreaterThan(0);
    }
  });

  it("panel: with zero badges, sources list collapses to safe 'No sensor data' note (no fake live)", () => {
    const context = buildReadinessContext({ sensorReadings: [] });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const note = screen.getByTestId(
      "ai-doctor-context-readiness-panel-no-sources",
    );
    expect(note).toBeTruthy();
    const lower = (note.textContent ?? "").toLowerCase();
    for (const word of UNTRUSTED_FORBIDDEN_WORDS) {
      expect(lower).not.toContain(word);
    }
    // The sources <ul> must not be rendered alongside the empty note.
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-sources"),
    ).toBeNull();
  });

  it("panel: every rendered source badge carries sampleCount >= 1", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("manual", { metric: "humidity_pct", value: 55 }),
        buildReadingForSource("csv", { metric: "vpd_kpa", value: 1.0 }),
        buildReadingForSource("demo", { metric: "co2_ppm", value: 410 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const list = screen.getByTestId(
      "ai-doctor-context-readiness-panel-sources",
    );
    const items = Array.from(list.querySelectorAll("li"));
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      const text = (li.textContent ?? "").trim();
      const m = text.match(/·\s*(\d+)\b/);
      expect(m).not.toBeNull();
      const n = m ? parseInt(m[1]!, 10) : 0;
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  // ----- B. Mixed trustworthy levels ---------------------------------------
  it("mixed set: trusted (live/manual) keep emerald palette; untrusted (csv/demo/stale/invalid) keep amber palette", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("manual", { metric: "humidity_pct", value: 55 }),
        buildReadingForSource("csv", { metric: "vpd_kpa", value: 1.0 }),
        buildReadingForSource("demo", { metric: "co2_ppm", value: 410 }),
        buildReadingForSource("stale", { metric: "temperature_c", value: 22 }),
        buildReadingForSource("invalid", { metric: "ph", value: 6.0 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} />);

    for (const cse of SOURCE_BADGE_CASES) {
      const badge = screen.queryByTestId(
        `ai-doctor-context-readiness-panel-source-${cse.source}`,
      );
      // All six sources should be present in this mixed fixture.
      expect(badge).not.toBeNull();
      if (!badge) continue;
      const cls = badge.className;
      const trusted = TRUSTED_TONE_CLASSES.every((c) => cls.includes(c));
      const caution = CAUTION_TONE_CLASSES.every((c) => cls.includes(c));
      if (cse.isTrustworthy) {
        expect(trusted).toBe(true);
        expect(caution).toBe(false);
        expect(badge.getAttribute("data-trustworthy")).toBe("true");
      } else {
        expect(caution).toBe(true);
        expect(trusted).toBe(false);
        expect(badge.getAttribute("data-trustworthy")).toBe("false");
        const lower = (badge.textContent ?? "").toLowerCase();
        for (const word of UNTRUSTED_FORBIDDEN_WORDS) {
          expect(lower).not.toContain(word);
        }
      }
    }
  });

  it("mixed set: csv badge stays separate from live and never inherits live label/tone", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("csv", { metric: "humidity_pct", value: 55 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const live = screen.getByTestId(
      "ai-doctor-context-readiness-panel-source-live",
    );
    const csv = screen.getByTestId(
      "ai-doctor-context-readiness-panel-source-csv",
    );
    expect(live.getAttribute("data-source")).toBe("live");
    expect(csv.getAttribute("data-source")).toBe("csv");
    expect(live.textContent).not.toBe(csv.textContent);
    expect(csv.textContent ?? "").not.toMatch(/\bLive\b/);
  });

  // ----- C. Unknown / missing source collapse ------------------------------
  it("compiler collapses unknown/missing rawSource into the invalid badge; never trusted, never 'live'", () => {
    const unknownReadings = [
      // Unknown vendor string
      { metric: "temperature_c", value: 24, captured_at: new Date("2026-06-10T11:00:00Z").toISOString(), source: "totally_unknown_vendor" },
      // Missing source
      { metric: "humidity_pct", value: 55, captured_at: new Date("2026-06-10T11:00:00Z").toISOString(), source: null as unknown as string },
      // Empty source
      { metric: "vpd_kpa", value: 1.1, captured_at: new Date("2026-06-10T11:00:00Z").toISOString(), source: "" },
    ];
    const context = buildReadinessContext({ sensorReadings: unknownReadings });
    render(<AiDoctorContextReadinessPanel context={context} />);

    const invalid = screen.getByTestId(
      "ai-doctor-context-readiness-panel-source-invalid",
    );
    expect(invalid.getAttribute("data-trustworthy")).toBe("false");
    expect(
      CAUTION_TONE_CLASSES.every((c) => invalid.className.includes(c)),
    ).toBe(true);
    expect(
      TRUSTED_TONE_CLASSES.every((c) => invalid.className.includes(c)),
    ).toBe(false);

    // No "live" badge appears.
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeNull();

    // Document: the current readiness badge type intentionally has NO
    // separate "unknown"/"untrusted" variant — these collapse into
    // `invalid`, which stays caution-styled.
    const lower = (invalid.textContent ?? "").toLowerCase();
    for (const word of UNTRUSTED_FORBIDDEN_WORDS) {
      expect(lower).not.toContain(word);
    }
  });
});

// ===========================================================================
// 2. Desktop + mobile viewport coverage
// ===========================================================================

const DESKTOP = { w: 1280, h: 900 } as const;
const MOBILE = { w: 375, h: 812 } as const;

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: w,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: h,
  });
  window.dispatchEvent(new Event("resize"));
}

function readHeaders(testId: string): string[] {
  const root = screen.getByTestId(testId);
  return Array.from(root.querySelectorAll("h2, h3")).map((h) =>
    (h.textContent ?? "").trim(),
  );
}

const EXPECTED_MISSING_HEADERS = [
  "AI Doctor Context Readiness",
  "Next evidence to add",
  "Sensor source labels",
  "Current reading quality",
  "Limitations",
  "Missing information",
  "Preview AI Doctor output",
  "Action Queue suggestion preview",
];

function assertNoForbiddenCopy(testId: string) {
  const root = screen.getByTestId(testId);
  const lower = (root.textContent ?? "").toLowerCase();
  for (const word of FORBIDDEN_AUTOMATION_WORDS) {
    expect(lower).not.toContain(word);
  }
  // Caution panels must not claim "healthy".
  expect(lower).not.toContain("healthy");
}

describe("AI Doctor Readiness UI v1.5 — missing context: desktop + mobile parity", () => {
  let prevW = 1024;
  let prevH = 768;
  beforeEach(() => {
    prevW = window.innerWidth;
    prevH = window.innerHeight;
  });
  afterEach(() => {
    setViewport(prevW, prevH);
  });

  for (const vp of [
    { name: "desktop", ...DESKTOP },
    { name: "mobile", ...MOBILE },
  ] as const) {
    it(`${vp.name}: missing-context panel renders deterministic headers + quick actions`, () => {
      setViewport(vp.w, vp.h);
      const context = buildReadinessContext({ plant: { stage: null } });
      render(<AiDoctorContextReadinessPanel context={context} />);

      expect(readHeaders("ai-doctor-context-readiness-panel")).toEqual(
        EXPECTED_MISSING_HEADERS,
      );
      expect(
        screen.getByTestId("ai-doctor-context-readiness-panel-limitations"),
      ).toBeTruthy();
      expect(
        screen.getByTestId("ai-doctor-context-readiness-panel-missing"),
      ).toBeTruthy();
      expect(
        screen.getByTestId(
          "ai-doctor-context-readiness-panel-quick-actions",
        ),
      ).toBeTruthy();

      assertNoForbiddenCopy("ai-doctor-context-readiness-panel");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});

// ===========================================================================
// 3. Loading / empty / compile-error fallback — desktop + mobile parity
// ===========================================================================

describe("AI Doctor Readiness UI v1.5 — mount fallback states: desktop + mobile parity", () => {
  let prevW = 1024;
  let prevH = 768;
  beforeEach(() => {
    prevW = window.innerWidth;
    prevH = window.innerHeight;
  });
  afterEach(() => {
    setViewport(prevW, prevH);
  });

  for (const vp of [
    { name: "desktop", ...DESKTOP },
    { name: "mobile", ...MOBILE },
  ] as const) {
    it(`${vp.name}: loading state renders safe checking copy and no panel`, () => {
      setViewport(vp.w, vp.h);
      recentActivityState = { data: undefined, isLoading: true };
      render(<PlantDetailAiDoctorContextReadinessMount {...baseMountProps} />);
      const loading = screen.getByTestId(
        "plant-detail-ai-doctor-context-readiness-mount-loading",
      );
      expect(loading.textContent ?? "").toContain("Checking AI Doctor context");
      assertNoForbiddenCopy(
        "plant-detail-ai-doctor-context-readiness-mount-loading",
      );
      expect(
        screen.queryByTestId("ai-doctor-context-readiness-panel"),
      ).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it(`${vp.name}: empty plantId renders fallback "not available" copy`, () => {
      setViewport(vp.w, vp.h);
      render(
        <PlantDetailAiDoctorContextReadinessMount
          {...baseMountProps}
          plantId=""
        />,
      );
      const empty = screen.getByTestId(
        "plant-detail-ai-doctor-context-readiness-mount-empty",
      );
      expect(empty.textContent ?? "").toContain(
        "AI Doctor context is not available",
      );
      assertNoForbiddenCopy(
        "plant-detail-ai-doctor-context-readiness-mount-empty",
      );
      expect(
        screen.queryByTestId("ai-doctor-context-readiness-panel"),
      ).toBeNull();
    });

    it(`${vp.name}: compile-error (malformed manual log) renders safe fallback, never the panel`, () => {
      setViewport(vp.w, vp.h);
      // Force the adapter/compiler to throw by feeding a getter that
      // explodes when read. This drives the try/catch fallback path.
      const exploder = new Proxy(
        {},
        {
          get() {
            throw new Error("synthetic compile failure");
          },
        },
      );
      manualLogsState = {
        data: [exploder] as unknown as unknown[],
        isLoading: false,
      };
      render(<PlantDetailAiDoctorContextReadinessMount {...baseMountProps} />);
      const fallback = screen.getByTestId(
        "plant-detail-ai-doctor-context-readiness-mount-fallback",
      );
      expect(fallback.textContent ?? "").toContain(
        "AI Doctor context is not available",
      );
      assertNoForbiddenCopy(
        "plant-detail-ai-doctor-context-readiness-mount-fallback",
      );
      expect(
        screen.queryByTestId("ai-doctor-context-readiness-panel"),
      ).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
