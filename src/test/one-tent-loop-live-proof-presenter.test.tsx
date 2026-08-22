/**
 * OneTentLoopLiveProof presenter tests.
 *
 * Mocks all data hooks to return empty; verifies:
 *  - Renders all 10 loop step cards
 *  - Renders banner and safety summary
 *  - Renders missing/blocked flags without "healthy" language
 *  - Contains zero write controls (button/form/input/select/textarea)
 *  - Renders approval-required + no-device-command copy for Action Queue
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "@/lib/react-router-compat";

const fixtures = vi.hoisted(() => ({
  activeGrow: null as Record<string, unknown> | null,
  tents: [] as Array<Record<string, unknown>>,
  plants: [] as Array<Record<string, unknown>>,
  diary: [] as Array<Record<string, unknown>>,
  sensorSnapshot: {
    source: "unavailable",
    ts: null,
    temp: null,
    rh: null,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  } as Record<string, unknown>,
  alerts: [] as Array<Record<string, unknown>>,
  aiSessions: [] as Array<Record<string, unknown>>,
  actions: [] as Array<Record<string, unknown>>,
  proofSelectedPlantAiCoachRow: null as Record<string, unknown> | null,
  proofSelectedAlertActionRow: null as Record<string, unknown> | null,
  proofSelectedAiDoctorActionRow: null as Record<string, unknown> | null,
  actionHookCalls: [] as unknown[][],
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: fixtures.activeGrow,
    activeGrowId: fixtures.activeGrow?.id ?? null,
    grows: fixtures.activeGrow ? [fixtures.activeGrow] : [],
    setActiveGrowId: () => {},
    refresh: async () => {},
    loading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: fixtures.tents }) }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: fixtures.plants }) }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: fixtures.diary }) }));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
    status: "ok",
    snapshot: fixtures.sensorSnapshot,
  }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-current" }, loading: false }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: fixtures.alerts, error: null, reload: () => {} }),
}));
vi.mock("@/hooks/use-ai-doctor-sessions", () => ({
  useAiDoctorSessions: () => ({ data: fixtures.aiSessions }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: (...args: unknown[]) => {
    fixtures.actionHookCalls.push(args);
    return {
      rows: fixtures.actions,
      proofSelectedPlantAiCoachRow: fixtures.proofSelectedPlantAiCoachRow,
      proofSelectedAlertActionRow: fixtures.proofSelectedAlertActionRow,
      proofSelectedAiDoctorActionRow: fixtures.proofSelectedAiDoctorActionRow,
      isLoading: false,
      isError: false,
      error: null,
    };
  },
}));

import OneTentLoopLiveProof from "@/pages/OneTentLoopLiveProof";
import { LOOP_STEP_IDS } from "@/lib/oneTentLoopProofRules";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/one-tent-loop-proof"]}>
      <Routes>
        <Route path="/one-tent-loop-proof" element={<OneTentLoopLiveProof />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fixtures.activeGrow = null;
  fixtures.tents = [];
  fixtures.plants = [];
  fixtures.diary = [];
  fixtures.sensorSnapshot = {
    source: "unavailable",
    ts: null,
    temp: null,
    rh: null,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
  fixtures.alerts = [];
  fixtures.aiSessions = [];
  fixtures.actions = [];
  fixtures.proofSelectedPlantAiCoachRow = null;
  fixtures.proofSelectedAlertActionRow = null;
  fixtures.proofSelectedAiDoctorActionRow = null;
  fixtures.actionHookCalls = [];
});

function setCurrentTentPlantScope() {
  fixtures.activeGrow = { id: "grow-current", name: "Current grow", status: "active" };
  fixtures.tents = [{ id: "tent-current", name: "Current tent", grow_id: "grow-current" }];
  fixtures.plants = [
    {
      id: "plant-current",
      name: "Current plant",
      grow_id: "grow-current",
      tent_id: "tent-current",
    },
  ];
}

const FORBIDDEN_HEALTH_COPY = [
  " healthy ",
  " ok ",
  " normal ",
  " verified ",
  " success",
  " all good",
  " no issues detected",
];

describe("OneTentLoopLiveProof page", () => {
  it("renders at /one-tent-loop-proof", () => {
    renderPage();
    expect(screen.getByTestId("one-tent-loop-live-proof-page")).toBeTruthy();
  });

  it("renders the read-only proof banner", () => {
    renderPage();
    const banner = screen.getByTestId("one-tent-loop-live-proof-banner");
    expect((banner.textContent ?? "").toLowerCase()).toMatch(/read-only proof view/);
    expect((banner.textContent ?? "").toLowerCase()).toMatch(
      /does not create logs, alerts, actions, ai results, or device commands/,
    );
  });

  it("renders all 10 loop step cards", () => {
    renderPage();
    expect(LOOP_STEP_IDS.length).toBe(10);
    for (const id of LOOP_STEP_IDS) {
      expect(screen.getByTestId(`loop-live-proof-step-${id}`)).toBeTruthy();
    }
  });

  it("renders missing/blocked flags without healthy language", () => {
    const { container } = renderPage();
    const text = " " + (container.textContent ?? "").toLowerCase() + " ";
    for (const forbidden of FORBIDDEN_HEALTH_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
    expect(text).toMatch(/missing evidence/);
    expect(text).toMatch(/blocked/);
  });

  it("renders approval-required + no-device-command copy for Action Queue", () => {
    renderPage();
    const card = screen.getByTestId("loop-live-proof-step-action-queue");
    const t = (card.textContent ?? "").toLowerCase();
    expect(t).toMatch(/approval required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders zero write controls (button/form/input/select/textarea)", () => {
    renderPage();
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  it("renders the safety summary", () => {
    renderPage();
    const s = screen.getByTestId("one-tent-loop-live-proof-safety-summary");
    const t = (s.textContent ?? "").toLowerCase();
    expect(t).toMatch(/never shown as healthy/);
    expect(t).toMatch(/approval-required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders the copyable text report block", () => {
    renderPage();
    const pre = screen.getByTestId("one-tent-loop-live-proof-report-text");
    expect((pre.textContent ?? "").toLowerCase()).toMatch(/one-tent loop/);
  });

  it("uses only the selected grow/tent/plant alert when proving an alert-derived action", () => {
    setCurrentTentPlantScope();
    fixtures.sensorSnapshot = {
      source: "live",
      ts: "2026-06-09T10:55:00.000Z",
      temp: 24,
      rh: 58,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      tent_id: "tent-current",
      metric_refs: {
        rh: {
          id: "event-current",
          captured_at: "2026-06-09T10:55:00.000Z",
          source: "live",
        },
      },
    };
    fixtures.alerts = [
      {
        id: "alert-other",
        grow_id: "grow-current",
        tent_id: "tent-other",
        plant_id: "plant-other",
        metric: "temperature_c",
        severity: "warning",
        reason: "Other tent temperature",
        status: "open",
        created_at: "2026-06-09T12:00:00.000Z",
      },
      {
        id: "alert-current",
        grow_id: "grow-current",
        tent_id: "tent-current",
        plant_id: "plant-current",
        metric: "humidity_pct",
        severity: "warning",
        reason: "Current tent humidity",
        status: "open",
        created_at: "2026-06-09T11:00:00.000Z",
        source: "environment_alerts",
        originating_timeline_events: [
          {
            id: "event-current",
            type: "sensor_snapshot",
            source: "live",
            occurred_at: "2026-06-09T10:55:00.000Z",
          },
        ],
      },
    ];
    fixtures.actions = [
      {
        id: "aq-current",
        growId: "grow-current",
        tentId: "tent-current",
        status: "pending_approval",
        source: "environment_alert",
        reason: "Review humidity [alert:alert-current]",
        riskLevel: "low",
        alertBackPointerId: "alert-current",
        hasTargetDevice: false,
      },
    ];
    // A valid direct Coach candidate must not displace the stronger passed
    // alert-derived action that is already inside the ordinary bounded list.
    fixtures.proofSelectedPlantAiCoachRow = {
      id: "aq-coach-selected",
      growId: "grow-current",
      tentId: "tent-current",
      plantId: "plant-current",
      status: "pending_approval",
      source: "ai_coach",
      reason: "Review the selected plant.",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    };

    renderPage();

    const alert = screen.getByTestId("loop-live-proof-step-alert");
    expect(alert.textContent).toMatch(/humidity_pct/);
    expect(alert.textContent).not.toMatch(/temperature_c/);
    const action = screen.getByTestId("loop-live-proof-step-action-queue");
    expect(action.getAttribute("data-status")).toBe("passed");
    expect(action.textContent).toMatch(/Alert-derived advisory/);
  });

  it("does not let a newer AI Coach action for another plant pass this plant's proof", () => {
    setCurrentTentPlantScope();
    fixtures.actions = [
      {
        id: "aq-coach-other-plant",
        growId: "grow-current",
        tentId: "tent-current",
        plantId: "plant-other",
        status: "pending_approval",
        source: "ai_coach",
        reason: "Review leaves.",
        riskLevel: "low",
        alertBackPointerId: null,
        aiDoctorSessionBackPointerId: null,
        hasTargetDevice: false,
      },
    ];

    renderPage();

    expect(
      screen.getByTestId("loop-live-proof-step-action-queue").getAttribute("data-status"),
    ).not.toBe("passed");
  });

  it("requests pre-cap selected-plant filtering for AI Coach proof evidence", () => {
    setCurrentTentPlantScope();

    renderPage();

    expect(fixtures.actionHookCalls).toContainEqual([
      "tent-current",
      "grow-current",
      {
        selectedPlantIdForAiCoach: "plant-current",
        selectedAlertIdForProof: null,
        selectedAiDoctorSessionIdForProof: null,
      },
    ]);
  });

  it("prefers older exact current-alert evidence over Coach when newer unrelated actions fill the generic cap", () => {
    setCurrentTentPlantScope();
    fixtures.sensorSnapshot = {
      source: "live",
      ts: "2026-06-09T10:55:00.000Z",
      temp: 24,
      rh: 58,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      tent_id: "tent-current",
      metric_refs: {
        rh: {
          id: "event-current",
          captured_at: "2026-06-09T10:55:00.000Z",
          source: "live",
        },
      },
    };
    fixtures.alerts = [
      {
        id: "alert-current",
        grow_id: "grow-current",
        tent_id: "tent-current",
        plant_id: "plant-current",
        metric: "humidity_pct",
        severity: "warning",
        reason: "Current tent humidity",
        status: "open",
        created_at: "2026-06-09T11:00:00.000Z",
        source: "environment_alerts",
        originating_timeline_events: [
          {
            id: "event-current",
            type: "sensor_snapshot",
            source: "live",
            occurred_at: "2026-06-09T10:55:00.000Z",
          },
        ],
      },
    ];
    fixtures.aiSessions = [
      {
        id: "session-current",
        grow_id: "grow-current",
        tent_id: "tent-current",
        plant_id: "plant-current",
        created_at: "2026-06-09T11:45:00.000Z",
      },
    ];
    fixtures.actions = Array.from({ length: 6 }, (_, index) => ({
      id: `newer-unrelated-${index + 1}`,
      growId: "grow-current",
      tentId: "tent-current",
      plantId: null,
      status: "pending_approval",
      source: "manual",
      reason: "Manual action without a proof back-pointer.",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    }));
    fixtures.proofSelectedAlertActionRow = {
      id: "older-current-alert-action",
      growId: "grow-current",
      tentId: "tent-current",
      plantId: null,
      status: "pending_approval",
      source: "environment_alert",
      reason: "Review humidity [alert:alert-current]",
      riskLevel: "low",
      alertBackPointerId: "alert-current",
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    };
    fixtures.proofSelectedAiDoctorActionRow = {
      id: "older-current-ai-doctor-action",
      growId: "grow-current",
      tentId: "tent-current",
      plantId: null,
      status: "pending_approval",
      source: "ai_doctor",
      reason: "Review leaf context [session:session-current]",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: "session-current",
      hasTargetDevice: false,
    };
    fixtures.proofSelectedPlantAiCoachRow = {
      id: "selected-plant-coach",
      growId: "grow-current",
      tentId: "tent-current",
      plantId: "plant-current",
      status: "pending_approval",
      source: "ai_coach",
      reason: "Review the selected plant.",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    };

    renderPage();

    const action = screen.getByTestId("loop-live-proof-step-action-queue");
    expect(action.getAttribute("data-status")).toBe("passed");
    expect(action.textContent).toMatch(/Alert-derived advisory/);
    expect(action.textContent).not.toMatch(/AI Coach advisory/);
    expect(fixtures.actionHookCalls).toContainEqual([
      "tent-current",
      "grow-current",
      {
        selectedPlantIdForAiCoach: "plant-current",
        selectedAlertIdForProof: "alert-current",
        selectedAiDoctorSessionIdForProof: "session-current",
      },
    ]);
  });

  it("allows an exact selected-plant AI Coach action to remain advisory evidence", () => {
    setCurrentTentPlantScope();
    fixtures.actions = [
      {
        id: "aq-coach-current-plant",
        growId: "grow-current",
        tentId: "tent-current",
        plantId: "plant-current",
        status: "pending_approval",
        source: "ai_coach",
        reason: "Review leaves.",
        riskLevel: "low",
        alertBackPointerId: null,
        aiDoctorSessionBackPointerId: null,
        hasTargetDevice: false,
      },
    ];

    renderPage();

    expect(
      screen.getByTestId("loop-live-proof-step-action-queue").getAttribute("data-status"),
    ).toBe("passed");
  });

  it("uses the bounded exact selected-plant AI Coach proof row when newer non-causal actions fill the shared display cap", () => {
    setCurrentTentPlantScope();
    fixtures.actions = Array.from({ length: 6 }, (_, index) => ({
      id: `aq-manual-${index + 1}`,
      growId: "grow-current",
      tentId: "tent-current",
      plantId: null,
      status: "pending_approval",
      source: "manual",
      reason: "Manual action without a proof back-pointer.",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    }));
    fixtures.proofSelectedPlantAiCoachRow = {
      id: "aq-coach-selected-beyond-display-cap",
      growId: "grow-current",
      tentId: "tent-current",
      plantId: "plant-current",
      status: "pending_approval",
      source: "ai_coach",
      reason: "Review the selected plant.",
      riskLevel: "low",
      alertBackPointerId: null,
      aiDoctorSessionBackPointerId: null,
      hasTargetDevice: false,
    };

    renderPage();

    const action = screen.getByTestId("loop-live-proof-step-action-queue");
    expect(action.getAttribute("data-status")).toBe("passed");
    expect(action.textContent).toMatch(/AI Coach advisory/);
  });

  it("uses the page's current clock instead of the fixed proof fallback for live freshness", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:20:00.000Z"));
    try {
      setCurrentTentPlantScope();
      fixtures.sensorSnapshot = {
        source: "live",
        ts: "2026-06-09T12:00:00.000Z",
        temp: 24,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
      };

      renderPage();

      const sensor = screen.getByTestId("loop-live-proof-step-sensor-snapshot");
      expect(sensor.getAttribute("data-status")).toBe("stale");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-evaluates a live snapshot after it ages past the freshness limit while the page stays open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:00:00.000Z"));
    try {
      setCurrentTentPlantScope();
      fixtures.sensorSnapshot = {
        source: "live",
        ts: "2026-06-09T11:50:00.000Z",
        temp: 24,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
      };

      const page = renderPage();
      const sensor = screen.getByTestId("loop-live-proof-step-sensor-snapshot");
      expect(sensor.getAttribute("data-status")).toBe("passed");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6 * 60_000);
      });

      expect(sensor.getAttribute("data-status")).toBe("stale");
      page.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a trusted top-level diary photo reference without accepting a foreign storage path", () => {
    setCurrentTentPlantScope();
    fixtures.diary = [
      {
        id: "diary-photo-current",
        plant_id: "plant-current",
        tent_id: "tent-current",
        entry_at: "2026-06-09T11:30:00.000Z",
        note: "",
        photo_url: "owner-current/grow-current/quick-log.jpg",
        details: {},
      },
    ];

    const trusted = renderPage();
    expect(screen.getByTestId("loop-live-proof-step-quick-log").textContent).toMatch(
      /includes:\s*photo/i,
    );
    trusted.unmount();

    fixtures.diary = [
      {
        id: "diary-photo-foreign",
        plant_id: "plant-current",
        tent_id: "tent-current",
        entry_at: "2026-06-09T11:30:00.000Z",
        note: "",
        photo_url: "other-owner/grow-current/quick-log.jpg",
        details: {},
      },
    ];

    renderPage();
    expect(screen.getByTestId("loop-live-proof-step-quick-log").textContent).toMatch(
      /no note\/photo\/action context/i,
    );
  });

  it("marks a fresh live snapshot with no finite recognized metric as needs review", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:05:00.000Z"));
    try {
      setCurrentTentPlantScope();
      fixtures.sensorSnapshot = {
        source: "live",
        ts: "2026-06-09T12:00:00.000Z",
        temp: null,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
      };

      renderPage();

      const sensor = screen.getByTestId("loop-live-proof-step-sensor-snapshot");
      expect(sensor.getAttribute("data-status")).toBe("needs_review");
      expect(sensor.textContent).toMatch(/finite recognized metric/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not label current-state reconstruction as frozen AI Doctor session evidence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:00:00.000Z"));
    try {
      setCurrentTentPlantScope();
      fixtures.plants = [
        {
          id: "plant-current",
          name: "Current plant",
          grow_id: "grow-current",
          tent_id: "tent-current",
          stage: "veg",
          medium: "coco",
          pot_size: "3 gal",
        },
      ];
      fixtures.diary = [
        {
          id: "diary-current",
          plant_id: "plant-current",
          tent_id: "tent-current",
          entry_at: "2026-06-09T11:30:00.000Z",
          note: "Observed leaves.",
          photos: [{ id: "photo-current" }],
        },
      ];
      fixtures.sensorSnapshot = {
        source: "live",
        ts: "2026-06-09T11:55:00.000Z",
        temp: 24,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
      };
      fixtures.alerts = [
        {
          id: "alert-current",
          grow_id: "grow-current",
          tent_id: "tent-current",
          plant_id: "plant-current",
          metric: "humidity_pct",
          severity: "warning",
          reason: "Current tent humidity",
          status: "open",
          created_at: "2026-06-09T11:00:00.000Z",
          source: "environment_alerts",
          originating_timeline_events: [
            {
              id: "event-current",
              type: "sensor_snapshot",
              source: "live",
              occurred_at: "2026-06-09T10:55:00.000Z",
            },
          ],
        },
      ];
      fixtures.aiSessions = [
        {
          id: "session-current",
          grow_id: "grow-current",
          tent_id: "tent-current",
          plant_id: "plant-current",
          created_at: "2026-06-09T11:45:00.000Z",
        },
      ];
      // Exercise the separately bounded direct candidate, not the generic
      // display list: current-state reconstruction must still fail closed.
      fixtures.proofSelectedAiDoctorActionRow = {
        id: "aq-ai-current",
        growId: "grow-current",
        tentId: "tent-current",
        status: "pending_approval",
        source: "ai_doctor",
        reason: "Review humidity [session:session-current]",
        riskLevel: "low",
        alertBackPointerId: null,
        aiDoctorSessionBackPointerId: "session-current",
        hasTargetDevice: false,
      };

      renderPage();

      const aiDoctor = screen.getByTestId("loop-live-proof-step-ai-doctor");
      expect(aiDoctor.getAttribute("data-status")).toBe("needs_review");
      expect(aiDoctor.textContent).toMatch(/reconstructed.*current app state/i);
      expect(aiDoctor.textContent).toMatch(/not frozen/i);
      const action = screen.getByTestId("loop-live-proof-step-action-queue");
      expect(action.getAttribute("data-status")).toBe("needs_review");
      expect(action.textContent).toMatch(/selected ai doctor session.*not eligible/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not pass a resolved alert as current alert evidence", () => {
    setCurrentTentPlantScope();
    fixtures.alerts = [
      {
        id: "alert-current",
        grow_id: "grow-current",
        tent_id: "tent-current",
        plant_id: "plant-current",
        metric: "humidity_pct",
        severity: "warning",
        reason: "Resolved humidity alert",
        status: "resolved",
        created_at: "2026-06-09T11:00:00.000Z",
        source: "environment_alerts",
        originating_timeline_events: [
          {
            id: "event-current",
            type: "sensor_snapshot",
            source: "live",
            occurred_at: "2026-06-09T10:55:00.000Z",
          },
        ],
      },
    ];
    fixtures.actions = [
      {
        id: "aq-current",
        growId: "grow-current",
        tentId: "tent-current",
        status: "pending_approval",
        source: "environment_alert",
        reason: "Review humidity [alert:alert-current]",
        riskLevel: "low",
        alertBackPointerId: "alert-current",
        hasTargetDevice: false,
      },
    ];

    renderPage();

    const alert = screen.getByTestId("loop-live-proof-step-alert");
    expect(alert.getAttribute("data-status")).toBe("needs_review");
    expect(alert.textContent).toMatch(/not open|resolved/i);
    const action = screen.getByTestId("loop-live-proof-step-action-queue");
    expect(action.getAttribute("data-status")).toBe("needs_review");
    expect(action.textContent).toMatch(/selected alert.*not eligible/i);
  });

  it("does not pass an alert-derived action when no scoped matching alert exists", () => {
    setCurrentTentPlantScope();
    fixtures.alerts = [
      {
        id: "alert-other",
        grow_id: "grow-current",
        tent_id: "tent-other",
        plant_id: "plant-other",
        metric: "temperature_c",
        severity: "warning",
        reason: "Other tent temperature",
        status: "open",
        created_at: "2026-06-09T12:00:00.000Z",
      },
    ];
    fixtures.actions = [
      {
        id: "aq-current",
        growId: "grow-current",
        tentId: "tent-current",
        status: "pending_approval",
        source: "environment_alert",
        reason: "Review humidity",
        riskLevel: "low",
        alertBackPointerId: "alert-current",
        hasTargetDevice: false,
      },
    ];

    renderPage();

    const action = screen.getByTestId("loop-live-proof-step-action-queue");
    expect(action.getAttribute("data-status")).toBe("needs_review");
    expect(action.textContent).toMatch(/matching.*alert/i);
  });
});

/**
 * TopGapPanel ↔ report parity + never-healthy DOM regression.
 *
 * This is the DETERMINISTIC browser-DOM layer for the never-healthy contract.
 * The Playwright spec's rich proof-branch assertions only run when
 * /one-tent-loop-proof renders authenticated; unauthenticated (and CI-mocked)
 * loads redirect to /auth, so those assertions are effectively skipped there.
 * Here the real presenter renders in jsdom with mocked-empty hooks (no auth),
 * which resolves a top gap of "grow missing" whose entire evidence checklist is
 * unknown-equivalent (missing / blocked) — the exact rows this contract guards.
 */
describe("OneTentLoopLiveProof — TopGapPanel unknown/equivalent never-healthy DOM", () => {
  const UNKNOWN_EQUIVALENT_STATES = new Set([
    "missing",
    "weak",
    "stale",
    "invalid",
    "demo_only",
    "unknown",
    "blocked",
  ]);

  // Forbidden for unknown/equivalent checklist rows (scoped to those rows only,
  // NOT truly-`present` rows elsewhere). Honest negations are not banned.
  const FORBIDDEN_ROW_WORDS =
    /\bpresent\b|\bok\b|\bsuccess(ful)?\b|\bverified\b|\bhealthy\b|all good|no issues detected|confirmed safe|validated live|\bcheck(ed)?\b|\bcomplete(d)?\b|\bpassed\b|\bready\b/i;

  const FORBIDDEN_CLASS =
    /bg-green|text-green|border-green|ring-green|bg-success|text-success|success-tone|check-?mark|healthy-tone/i;

  function checklistItems(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid^="one-tent-loop-live-proof-top-gap-checklist-item-"][data-state]',
      ),
    );
  }

  it("renders a top-gap panel whose checklist is entirely unknown-equivalent (empty app state)", () => {
    const { container } = renderPage();
    const panel = screen.getByTestId("one-tent-loop-live-proof-top-gap");
    // The gap is real (not resolved): a status attribute is present and is not
    // a healthy/passed claim.
    const status = panel.getAttribute("data-status");
    expect(status).toBeTruthy();
    expect(status).not.toBe("resolved");
    expect(status).not.toBe("passed");

    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);
    // Empty app state → no checklist row may be `present`.
    for (const li of items) {
      expect(li.getAttribute("data-state")).not.toBe("present");
    }
  });

  it("unknown/equivalent checklist rows never render success/present/checkmark wording, classes, or aria", () => {
    const { container } = renderPage();
    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);

    for (const li of items) {
      const state = li.getAttribute("data-state") ?? "";
      if (!UNKNOWN_EQUIVALENT_STATES.has(state)) continue;

      // data-state itself is honest.
      expect(state).not.toBe("present");

      // The visible state badge must read an honest label, never "Present"/success.
      const badge = li.querySelector<HTMLElement>('[data-testid$="-state"]');
      const badgeText = (badge?.textContent ?? "").trim();
      expect(badgeText.length).toBeGreaterThan(0);
      expect(badgeText).not.toBe("Present");
      expect(FORBIDDEN_ROW_WORDS.test(badgeText)).toBe(false);

      // The whole row's visible text carries no success/checkmark wording.
      const rowText = li.textContent ?? "";
      expect(
        FORBIDDEN_ROW_WORDS.test(rowText),
        `row for state=${state} contained forbidden wording: "${rowText}"`,
      ).toBe(false);

      // No success/checkmark/green classes anywhere in the row markup.
      expect(FORBIDDEN_CLASS.test(li.outerHTML)).toBe(false);

      // No check/success/verified icon or aria hooks.
      for (const el of li.querySelectorAll<HTMLElement>("*")) {
        const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
        expect(/check|success|verified|complete|passed/.test(aria)).toBe(false);
        for (const attr of ["data-icon", "data-lucide"]) {
          const v = (el.getAttribute(attr) ?? "").toLowerCase();
          expect(/check|check-circle|success/.test(v)).toBe(false);
        }
      }
    }
  });

  it("rendered checklist order + states exactly match the sanitized report text block (req-1 parity)", () => {
    const { container } = renderPage();
    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);

    // DOM: ordered [{ label, state }] straight from the rendered panel.
    const dom = items.map((li) => ({
      label: (li.querySelector("span")?.textContent ?? "").trim(),
      state: li.getAttribute("data-state") ?? "",
    }));

    // Report: the checklist sub-block parsed out of the copyable <pre>.
    const reportText = screen.getByTestId("one-tent-loop-live-proof-report-text").textContent ?? "";
    const lines = reportText.split("\n");
    const ci = lines.indexOf("- Evidence checklist for this gap:");
    expect(ci, "report is missing the evidence checklist block").toBeGreaterThanOrEqual(0);
    const reportLines: string[] = [];
    for (let i = ci + 1; i < lines.length && lines[i].startsWith("    - "); i += 1) {
      reportLines.push(lines[i]);
    }

    // Same count (nothing dropped/added between panel and report).
    expect(reportLines.length).toBe(dom.length);

    // Same order + same label + same state, item by item.
    for (let i = 0; i < dom.length; i += 1) {
      expect(dom[i].label, `panel row ${i} missing label text`).not.toBe("");
      expect(dom[i].state, `panel row ${i} missing data-state`).not.toBe("");
      expect(
        reportLines[i].includes(dom[i].label),
        `panel row ${i} label "${dom[i].label}" not at report line ${i}: "${reportLines[i]}"`,
      ).toBe(true);
      expect(
        reportLines[i].includes(`[${dom[i].state}]`),
        `panel row ${i} state "[${dom[i].state}]" not at report line ${i}: "${reportLines[i]}"`,
      ).toBe(true);
    }
  });
});
