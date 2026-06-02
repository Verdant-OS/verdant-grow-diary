import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";

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

// useTimelineMemory pulls from react-query / supabase; stub for unit render.
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: [], isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 25,
}));

describe("PlantDetailAiDoctorContextPanel — quick actions", () => {
  it("renders quick actions for supported missing context with preserved plant scope", () => {
    render(
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId="p1"
          plant={{
            id: "p1",
            name: "Alpha",
            strain: null,
            stage: null,
            medium: null,
            photo: null,
            growId: "g1",
            tentId: "t1",
          }}
        />
      </MemoryRouter>,
    );
    const edit = screen.getByTestId("ai-doctor-context-quick-action-update-plant-profile");
    expect(edit.textContent).toContain("Edit plant details");
    const editHref =
      edit.getAttribute("href") ?? edit.querySelector("a")?.getAttribute("href") ?? "";
    expect(editHref).toContain("/plants/p1");

    const snap = screen.getByTestId(
      "ai-doctor-context-quick-action-add-manual-sensor-snapshot",
    );
    const snapHref =
      snap.getAttribute("href") ?? snap.querySelector("a")?.getAttribute("href") ?? "";
    expect(snapHref).toMatch(/\/sensors/);
    expect(snapHref).toContain("g1");

    // Add note / Add photo dispatch the existing QuickLog event.
    expect(
      screen.getByTestId("ai-doctor-context-quick-action-add-recent-log").textContent,
    ).toContain("Add note");
    expect(
      screen.getByTestId("ai-doctor-context-quick-action-add-plant-photo").textContent,
    ).toContain("Add photo");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("renders informational-only no-warning copy without a misleading action", () => {
    render(
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId="p1"
          plant={{
            id: "p1",
            name: "Alpha",
            strain: "NL",
            stage: "veg",
            medium: "Coco",
            photo: "x",
            growId: "g1",
            tentId: "t1",
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plant-ai-doctor-context-no-warning").textContent)
      .toContain("No warning context found.");
  });
});
