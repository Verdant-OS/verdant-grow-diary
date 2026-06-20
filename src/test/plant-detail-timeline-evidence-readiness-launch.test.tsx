/**
 * UI tests for PlantDetailTimelineEvidenceReadinessLaunch.
 *
 * Verifies:
 *  - Renders the Context Readiness panel before AI Doctor runs.
 *  - Render never triggers fetch / AI / Edge / Supabase writes.
 *  - Missing photo/watering/feeding/sensor-snapshot states surface the
 *    correct operator-action buttons.
 *  - Buttons dispatch existing client UI events / navigate to existing
 *    routes only — no record creation, no AI call.
 *  - Static safety: file imports no Supabase write client, no Edge
 *    Function invoke, no AI/model client, no Action Queue/alert writer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Mock the data hooks BEFORE importing the component.
const recentActivityMock = vi.fn();
const manualLogsMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string) => recentActivityMock(id),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: (id: string) => manualLogsMock(id),
}));

import PlantDetailTimelineEvidenceReadinessLaunch from "@/components/PlantDetailTimelineEvidenceReadinessLaunch";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const fetchSpy = vi.spyOn(globalThis, "fetch" as never);

function renderLaunch(overrides: {
  hasPhoto?: boolean;
  activity?: ReadonlyArray<Record<string, unknown>>;
  manualLogs?: ReadonlyArray<Record<string, unknown>>;
} = {}) {
  recentActivityMock.mockReturnValue({
    data: overrides.activity ?? [],
    isLoading: false,
  });
  manualLogsMock.mockReturnValue({
    data: overrides.manualLogs ?? [],
    isLoading: false,
  });
  return render(
    <MemoryRouter>
      <PlantDetailTimelineEvidenceReadinessLaunch
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
        strain="NL"
        stage={null}
        hasPlantPhoto={overrides.hasPhoto ?? false}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
  recentActivityMock.mockReset();
  manualLogsMock.mockReset();
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — mount", () => {
  it("renders the Context Readiness panel before AI Doctor runs", () => {
    renderLaunch();
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("timeline-evidence-readiness-panel"),
    ).toBeInTheDocument();
  });

  it("does not call fetch when rendered", () => {
    renderLaunch();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — operator actions", () => {
  it("shows Fast Add Photo when photo is missing", () => {
    renderLaunch({ hasPhoto: false });
    expect(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-photo",
      ),
    ).toBeInTheDocument();
  });

  it("shows Add Watering when watering history is missing", () => {
    renderLaunch();
    expect(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-watering",
      ),
    ).toBeInTheDocument();
  });

  it("shows Add Feeding when feeding history is missing", () => {
    renderLaunch();
    expect(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-feeding",
      ),
    ).toBeInTheDocument();
  });

  it("shows Add Sensor Snapshot linking to existing sensors route", () => {
    renderLaunch();
    const el = screen.getByTestId(
      "plant-detail-timeline-evidence-readiness-launch-action-add-sensor-snapshot",
    );
    const href = el.getAttribute("href") ?? el.querySelector("a")?.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/\/sensors/);
  });

  it("Fast Add Photo dispatches the existing QuickLog event without creating records", async () => {
    renderLaunch({ hasPhoto: false });
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    fireEvent.click(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-photo",
      ),
    );
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ suggestPhoto: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Add Watering / Add Feeding dispatch events only — no fetch, no record writes", () => {
    renderLaunch();
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    fireEvent.click(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-watering",
      ),
    );
    fireEvent.click(
      screen.getByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-feeding",
      ),
    );
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    expect(events).toHaveLength(2);
    expect(events[0].detail).toMatchObject({ eventType: "watering" });
    expect(events[1].detail).toMatchObject({ eventType: "feeding" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hides photo button when a recent photo is already attached", () => {
    renderLaunch({ hasPhoto: true });
    expect(
      screen.queryByTestId(
        "plant-detail-timeline-evidence-readiness-launch-action-add-photo",
      ),
    ).toBeNull();
  });
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — static safety", () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../components/PlantDetailTimelineEvidenceReadinessLaunch.tsx",
    ),
    "utf8",
  );

  it("does not import any AI/Edge/Supabase write surfaces", () => {
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase\/client/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/aiDoctorEngine.{0,40}run|invokeAiDoctor|runAiDoctor/);
    expect(source).not.toMatch(/action[_-]?queue/i);
    expect(source).not.toMatch(/createAlert|insertAlert|writeAlert/);
    expect(source).not.toMatch(/raw_payload/);
  });
});
