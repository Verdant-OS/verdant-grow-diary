import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SymptomEvidenceChecklistCard from "@/components/SymptomEvidenceChecklistCard";
import { buildSymptomEvidenceChecklist } from "@/lib/symptomEvidenceChecklistRules";

describe("Timeline Symptom Evidence card", () => {
  it("renders four ordered categories, honest provenance, guide, and exact entry link", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: {
        id: "symptom",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        entry_at: "2026-08-01T12:00:00Z",
        event_type: "observation",
        details: { subtype: "issue", observedSign: "spots", observation_stage: "flower" },
      },
      entries: [
        {
          id: "env-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          entry_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
          source: "manual",
          note: "Canopy observation",
        },
      ],
      historyComplete: false,
    })!;
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-1"]}>
        <SymptomEvidenceChecklistCard view={view} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("complementary", { name: /evidence checklist for spots/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/confirmed stage: flower/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent),
    ).toEqual(["Environment Check", "Watering", "Feeding", "Lighting"]);
    expect(screen.getByText("Manual observation")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/history is not loaded/i);
    expect(screen.getByRole("link", { name: "View entry" })).toHaveAttribute(
      "href",
      "/timeline?growId=grow-1#timeline-entry-env-1",
    );
    expect(screen.getByRole("link", { name: "Review the symptom guide" })).toHaveAttribute(
      "href",
      "/guides/cannabis-leaf-spots-lesions",
    );
  });
});
