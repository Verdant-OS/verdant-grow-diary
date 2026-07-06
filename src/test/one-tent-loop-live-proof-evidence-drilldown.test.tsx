/**
 * Evidence references, provenance badges, and missing-evidence drilldown tests.
 *
 * Verifies:
 *  - enrichLoopStepRow attaches provenance for every status.
 *  - Present steps yield an evidence_ref with label + safe link + kind + source.
 *  - Missing/blocked/needs_review steps yield a drilldown (what / why / where).
 *  - View-model text report includes overall status header,
 *    "Generated from current app state" wording, drilldown lines,
 *    provenance/source labels, and never leaks raw payloads / secrets / tokens.
 *  - Presenter renders provenance and source badges + drilldown panels
 *    for missing/blocked/needs_review steps, and still has zero write controls.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  enrichLoopStepRow,
  evaluateLoop,
  LOOP_STEP_IDS,
  type LoopEvidence,
  type LoopStepRow,
} from "@/lib/oneTentLoopProofRules";
import {
  buildOneTentLoopLiveProofView,
  buildOneTentLoopLiveProofTextReport,
} from "@/lib/oneTentLoopLiveProofViewModel";

const NOW = Date.parse("2026-06-09T12:00:00.000Z");

const EMPTY: LoopEvidence = {
  grow: null,
  tent: null,
  plant: null,
  latest_quick_log: null,
  timeline: null,
  latest_sensor_snapshot: null,
  latest_ai_doctor: null,
  latest_alert: null,
  latest_action_queue: null,
  latest_follow_up: null,
  now_ms: NOW,
};

const FRESH: LoopEvidence = {
  grow: { id: "g1", name: "Grow A", stage: "veg", status: "active" },
  tent: { id: "t1", name: "Tent A", grow_id: "g1", has_environment_target: true },
  plant: {
    id: "p1",
    name: "Plant A",
    stage: "veg",
    medium: "coco",
    pot_size: "3 gal",
    tent_id: "t1",
  },
  latest_quick_log: {
    id: "d1",
    entry_at: "2026-06-09T11:00:00.000Z",
    entry_type: "note",
    has_note: true,
    has_photo: true,
    has_action_context: false,
    plant_id: "p1",
    tent_id: "t1",
  },
  timeline: { event_count: 5, latest_entry_id: "d1", linked_directly: true },
  latest_sensor_snapshot: {
    source: "live",
    captured_at: "2026-06-09T11:55:00.000Z",
    confidence: 0.9,
    metric: "temp",
  },
  latest_ai_doctor: {
    session_id: "s1",
    created_at: "2026-06-09T11:30:00.000Z",
    had_plant_stage: true,
    had_medium: true,
    had_pot_size: true,
    had_recent_log: true,
    had_recent_photo: true,
    had_recent_sensor_snapshot: true,
    had_alerts: true,
  },
  latest_alert: {
    id: "a1",
    metric: "temp",
    severity: "warning",
    reason: "temp above target",
    status: "open",
    created_at: "2026-06-09T11:00:00.000Z",
  },
  latest_action_queue: {
    id: "aq1",
    status: "pending_approval",
    approval_required: true,
    has_device_control_marker: false,
    reason: "raise humidity",
    risk_level: "low",
    linked_alert_id: "a1",
  },
  latest_follow_up: { id: "f1", kind: "diary", entry_at: "2026-06-09T11:40:00.000Z" },
  now_ms: NOW,
};

describe("enrichLoopStepRow — provenance + refs + drilldown", () => {
  it("every enriched row from evaluateLoop has a provenance", () => {
    const rows = evaluateLoop(EMPTY);
    for (const r of rows) {
      expect(r.provenance).toBeDefined();
    }
  });

  it("fresh evidence produces direct provenance and evidence refs with safe deep links", () => {
    const rows = evaluateLoop(FRESH);
    const grow = rows.find((r) => r.id === "grow")!;
    expect(grow.provenance).toBe("direct");
    expect(grow.evidence_refs?.[0].kind).toBe("direct");
    expect(grow.evidence_refs?.[0].deep_link).toBe("/grows/g1");
    expect(grow.evidence_refs?.[0].label).toMatch(/Grow: Grow A/);
    // never a drilldown on passed
    expect(grow.drilldown).toBeUndefined();
  });

  it("empty evidence produces missing provenance and drilldown for every step", () => {
    const rows = evaluateLoop(EMPTY);
    for (const r of rows) {
      expect(["missing", "blocked", "inferred", "stale", "invalid", "demo_only"]).toContain(
        r.provenance,
      );
      // For empty input, every step is missing or blocked -> drilldown present
      expect(r.drilldown).toBeDefined();
      expect(r.drilldown?.what_is_missing.length).toBeGreaterThan(0);
      expect(r.drilldown?.why_it_matters.length).toBeGreaterThan(0);
      expect(r.drilldown?.where_to_record.length).toBeGreaterThan(0);
    }
  });

  it("demo sensor snapshot yields demo_only provenance and a source label", () => {
    const rows = evaluateLoop({
      ...EMPTY,
      latest_sensor_snapshot: {
        source: "demo",
        captured_at: "2026-06-09T11:59:00.000Z",
      },
    });
    const s = rows.find((r) => r.id === "sensor-snapshot")!;
    expect(s.provenance).toBe("demo_only");
    expect(s.source).toBe("demo");
    expect(s.drilldown).toBeDefined();
  });

  it("stale live snapshot yields stale provenance", () => {
    const rows = evaluateLoop({
      ...EMPTY,
      latest_sensor_snapshot: {
        source: "live",
        captured_at: "2026-06-09T10:00:00.000Z",
      },
    });
    const s = rows.find((r) => r.id === "sensor-snapshot")!;
    expect(s.provenance).toBe("stale");
  });

  it("enrichLoopStepRow never invents evidence refs for missing inputs", () => {
    const bare: LoopStepRow = {
      id: "grow",
      label: "Grow",
      status: "missing",
      evidence: [],
      missing_info: ["No active grow found."],
      safety_note: "…",
    };
    const enriched = enrichLoopStepRow(bare, EMPTY);
    expect(enriched.evidence_refs).toEqual([]);
    expect(enriched.drilldown).toBeDefined();
  });
});

describe("text report — overall status + drilldown + no leaks", () => {
  it("includes overall status header and 'generated from current app state' wording", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY);
    const txt = buildOneTentLoopLiveProofTextReport(v);
    expect(txt.toLowerCase()).toMatch(/overall status/);
    expect(txt.toLowerCase()).toMatch(/generated from current app state/);
  });

  it("includes drilldown what/why/where lines for missing steps", () => {
    const v = buildOneTentLoopLiveProofView(EMPTY);
    const txt = buildOneTentLoopLiveProofTextReport(v);
    expect(txt).toMatch(/drilldown — what:/);
    expect(txt).toMatch(/drilldown — why:/);
    expect(txt).toMatch(/drilldown — where:/);
  });

  it("includes provenance and ref lines when evidence exists", () => {
    const v = buildOneTentLoopLiveProofView(FRESH);
    const txt = buildOneTentLoopLiveProofTextReport(v);
    expect(txt).toMatch(/provenance: direct/);
    expect(txt).toMatch(/ref: /);
    expect(txt).toMatch(/kind=direct/);
  });

  it("text report never leaks raw payloads, tokens, secrets, or internal ID keywords", () => {
    const evil = {
      ...FRESH,
      latest_sensor_snapshot: {
        source: "live" as const,
        captured_at: "2026-06-09T11:55:00.000Z",
        raw_payload: { bridge_token: "BRIDGE_LEAK", service_role: "SRV_LEAK" },
      } as unknown as LoopEvidence["latest_sensor_snapshot"],
    };
    const v = buildOneTentLoopLiveProofView(evil, NOW);
    const txt = buildOneTentLoopLiveProofTextReport(v);
    for (const forbidden of [
      "BRIDGE_LEAK",
      "SRV_LEAK",
      "service_role",
      "raw_payload",
      "bridge_token",
      "SUPABASE_SERVICE_ROLE",
      "anon_key",
    ]) {
      expect(txt).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Presenter tests (empty inputs -> all steps missing/blocked)
// ---------------------------------------------------------------------------

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: null,
    activeGrowId: null,
    grows: [],
    setActiveGrowId: () => {},
    refresh: async () => {},
    loading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [] }) }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: [] }) }));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
    status: "ok",
    snapshot: {
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
    },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: () => {} }),
}));
vi.mock("@/hooks/use-ai-doctor-sessions", () => ({
  useAiDoctorSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({ rows: [], isLoading: false, isError: false, error: null }),
}));

import OneTentLoopLiveProof from "@/pages/OneTentLoopLiveProof";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/one-tent-loop-proof"]}>
      <Routes>
        <Route path="/one-tent-loop-proof" element={<OneTentLoopLiveProof />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OneTentLoopLiveProof — evidence/drilldown UI", () => {
  it("renders a provenance badge for every step", () => {
    renderPage();
    for (const id of LOOP_STEP_IDS) {
      const card = screen.getByTestId(`loop-live-proof-step-${id}`);
      expect(card.getAttribute("data-provenance")).not.toBeNull();
      expect(card.getAttribute("data-provenance")).not.toBe("unknown");
    }
  });

  it("renders a drilldown panel with what/why/where for missing/blocked steps", () => {
    renderPage();
    for (const id of LOOP_STEP_IDS) {
      const drilldown = screen.queryByTestId(`loop-live-proof-step-${id}-drilldown`);
      expect(drilldown, `drilldown for ${id}`).not.toBeNull();
      expect(screen.getByTestId(`loop-live-proof-step-${id}-drilldown-what`)).toBeTruthy();
      expect(screen.getByTestId(`loop-live-proof-step-${id}-drilldown-why`)).toBeTruthy();
      expect(screen.getByTestId(`loop-live-proof-step-${id}-drilldown-where`)).toBeTruthy();
    }
  });

  it("copyable text report includes overall status + generated-from-current-state wording", () => {
    renderPage();
    const pre = screen.getByTestId("one-tent-loop-live-proof-report-text");
    const txt = (pre.textContent ?? "").toLowerCase();
    expect(txt).toMatch(/overall status/);
    expect(txt).toMatch(/generated from current app state/);
  });

  it("still has zero write controls after enrichment", () => {
    renderPage();
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
    // Also: no clipboard API surface should be referenced in DOM attributes
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain("navigator.clipboard");
    expect(html).not.toContain("onclick=");
  });
});
