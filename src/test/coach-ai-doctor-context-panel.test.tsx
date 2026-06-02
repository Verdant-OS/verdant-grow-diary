import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CoachAiDoctorContextPanel, {
  COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY,
} from "@/components/CoachAiDoctorContextPanel";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const insertSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
      },
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const renderPanel = (props: React.ComponentProps<typeof CoachAiDoctorContextPanel>) =>
  render(
    <MemoryRouter>
      <CoachAiDoctorContextPanel {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  insertSpy.mockReset();
});

describe("CoachAiDoctorContextPanel — plant selection ambiguity", () => {
  it("uses the explicitly selected plant when provided", () => {
    renderPanel({
      plants: [
        { id: "p1", name: "Alpha", strain: "NL", stage: "veg" },
        { id: "p2", name: "Beta", strain: "AK", stage: "flower" },
      ],
      selectedPlantId: "p2",
      diaryEntries: [{ entry_type: "watering", entry_at: ago(HOUR) }],
      growId: "g1",
    });
    expect(screen.queryByTestId("coach-ai-doctor-context-ambiguous-notice")).toBeNull();
    expect(screen.getByTestId("coach-ai-doctor-context-panel").getAttribute("data-ambiguous")).toBeNull();
  });

  it("uses the single plant when only one is available", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: "NL", stage: "veg" }],
      selectedPlantId: null,
      diaryEntries: [{ entry_type: "watering", entry_at: ago(HOUR) }],
      growId: "g1",
    });
    expect(screen.queryByTestId("coach-ai-doctor-context-ambiguous-notice")).toBeNull();
    expect(screen.getByTestId("coach-ai-doctor-context-readiness")).toBeTruthy();
  });

  it("shows ambiguous fallback when multiple plants and no selection — does not use plants[0]", () => {
    renderPanel({
      plants: [
        { id: "p1", name: "Alpha", strain: "NL", stage: "veg" },
        { id: "p2", name: "Beta", strain: "AK", stage: "flower" },
      ],
      selectedPlantId: null,
      diaryEntries: [{ entry_type: "watering", entry_at: ago(HOUR) }],
      growId: "g1",
    });
    const notice = screen.getByTestId("coach-ai-doctor-context-ambiguous-notice");
    expect(notice.textContent).toContain(COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY);
    expect(screen.queryByTestId("coach-ai-doctor-context-readiness")).toBeNull();
  });
});

describe("CoachAiDoctorContextPanel — quick actions", () => {
  it("renders Add recent log quick action that dispatches the existing quicklog event", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: "NL", stage: "veg", medium: "Coco", photo: "x" }],
      selectedPlantId: null,
      diaryEntries: [],
      growId: "g1",
    });
    const btn = screen.getByTestId("ai-doctor-context-quick-action-add-recent-log");
    const spy = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, spy as EventListener);
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, spy as EventListener);
  });

  it("renders Add manual sensor snapshot quick action that links to the existing sensors route", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: "NL", stage: "veg", medium: "Coco", photo: "x" }],
      selectedPlantId: null,
      diaryEntries: [
        { entry_type: "watering", entry_at: ago(HOUR) },
        { entry_type: "note", entry_at: ago(2 * HOUR) },
      ],
      growId: "g1",
    });
    const btn = screen.getByTestId("ai-doctor-context-quick-action-add-manual-sensor-snapshot");
    expect(btn).toBeTruthy();
    const link = btn.querySelector("a");
    expect(link?.getAttribute("href")).toMatch(/\/sensors/);
  });

  it("renders Update plant profile when strain/stage/medium are missing", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: null, stage: null, medium: null }],
      selectedPlantId: null,
      diaryEntries: [{ entry_type: "watering", entry_at: ago(HOUR) }],
      growId: "g1",
    });
    expect(screen.getByTestId("ai-doctor-context-quick-action-update-plant-profile")).toBeTruthy();
  });

  it("shows no-warning calm copy when no warnings — and does not produce a misleading action", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: "NL", stage: "veg", medium: "Coco", photo: "x" }],
      selectedPlantId: null,
      diaryEntries: [{ entry_type: "watering", entry_at: ago(HOUR) }],
      growId: "g1",
    });
    expect(screen.getByTestId("coach-ai-doctor-context-no-warning").textContent)
      .toContain("No warning context found.");
    expect(screen.queryByText(/warning/i)).toBeTruthy();
    // No quick-action button is labeled around warnings.
    const buttons = Array.from(document.querySelectorAll("[data-testid^=\"ai-doctor-context-quick-action-\"]"));
    for (const b of buttons) {
      expect((b as HTMLElement).getAttribute("data-testid")).not.toMatch(/warning/);
    }
  });

  it("does not write to Supabase on render or click", () => {
    renderPanel({
      plants: [{ id: "p1", name: "Alpha", strain: "NL", stage: "veg" }],
      selectedPlantId: null,
      diaryEntries: [],
      growId: "g1",
    });
    const btn = screen.queryByTestId("ai-doctor-context-quick-action-add-recent-log");
    if (btn) fireEvent.click(btn);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
