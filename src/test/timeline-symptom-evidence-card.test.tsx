import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SymptomEvidenceChecklistCard from "@/components/SymptomEvidenceChecklistCard";
import {
  buildSymptomEvidenceChecklist,
  buildSymptomEvidenceTimelineRows,
} from "@/lib/symptomEvidenceChecklistRules";

describe("Timeline Symptom Evidence card", () => {
  it("labels the parent event time separately from an attached snapshot capture time", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: {
        id: "symptom",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        entry_at: "2026-08-01T12:00:00Z",
        event_type: "observation",
        details: {
          subtype: "issue",
          observedSign: "spots",
          observation_stage: "flower",
        },
      },
      entries: [
        {
          id: "environment-with-distinct-capture",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
          source: "manual",
          details: {
            sensor_snapshot: {
              source: "manual",
              captured_at: "2026-07-31T11:45:00Z",
              metrics: { humidity_pct: 61 },
            },
          },
        },
      ],
      historyComplete: true,
    })!;

    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-1"]}>
        <SymptomEvidenceChecklistCard view={view} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/^Event time:/)).toHaveAttribute(
      "datetime",
      "2026-07-31T12:00:00.000Z",
    );
    expect(screen.getByLabelText(/^Snapshot captured time:/)).toHaveAttribute(
      "datetime",
      "2026-07-31T11:45:00.000Z",
    );
  });

  it("does not duplicate the snapshot clock when capture and event times are equal", () => {
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
          id: "environment-with-equal-clocks",
          grow_id: "grow-1",
          tent_id: "tent-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "environment",
          source: "manual",
          details: {
            sensor_snapshot: {
              source: "manual",
              captured_at: "2026-07-31T12:00:00Z",
              metrics: { humidity_pct: 61 },
            },
          },
        },
      ],
      historyComplete: true,
    })!;

    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-1"]}>
        <SymptomEvidenceChecklistCard view={view} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/^Event time:/)).toHaveAttribute(
      "datetime",
      "2026-07-31T12:00:00.000Z",
    );
    expect(screen.queryByLabelText(/^Snapshot captured time:/)).not.toBeInTheDocument();
  });

  it("renders four ordered categories, honest provenance, guide, and exact entry link", () => {
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: {
        id: "symptom",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        entry_at: "2026-08-01T12:00:00Z",
        event_type: "observation",
        details: {
          subtype: "issue",
          observedSign: "spots",
          observation_stage: "flower",
          observationLocation: "upper_growth",
        },
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
          timeline_anchor_entry_id: "env-1",
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
    expect(
      screen.getByRole("heading", {
        name: "Spots / lesions: verify the record before changing anything",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/confirmed stage: flower/i)).toBeInTheDocument();
    expect(screen.getByText(/location: upper \/ new growth/i)).toBeInTheDocument();
    expect(screen.getByText(/8\/1\/2026/i)).toHaveAttribute("datetime", "2026-08-01T12:00:00.000Z");
    expect(
      screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent),
    ).toEqual(["Environment Check", "Watering", "Feeding", "Lighting"]);
    expect(screen.getByText("Manual observation")).toBeInTheDocument();
    expect(screen.getByText("1 matching record")).toBeInTheDocument();
    expect(screen.getAllByText(/what to verify next:/i)).toHaveLength(4);
    expect(screen.getByRole("note")).toHaveTextContent(/history is not loaded/i);
    expect(
      screen.getByText(/avoid changing feeding, watering, lighting, and airflow/i),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View entry" })).toHaveAttribute(
      "href",
      "/timeline?growId=grow-1#timeline-entry-env-1",
    );
    expect(screen.getByRole("link", { name: "Review the symptom guide" })).toHaveAttribute(
      "href",
      "/guides/cannabis-leaf-spots-lesions",
    );
    expect(screen.getByRole("link", { name: "Open the symptom hub" })).toHaveAttribute(
      "href",
      "/guides/cannabis-leaf-symptoms",
    );
    expect(screen.queryByRole("link", { name: "Add missing context" })).not.toBeInTheDocument();
  });

  it("keeps the symptom card and loaded evidence visible when a filter hides the anchor owner", () => {
    const parentId = "watering-grow-event-with-filtered-companion";
    const entries = buildSymptomEvidenceTimelineRows({
      growId: "grow-1",
      recentLaneEntries: [
        {
          id: parentId,
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-07-31T12:00:00Z",
          entry_type: "watering",
          note: "Watered after checking dryback.",
        },
      ],
      diaryEntries: [
        {
          id: "watering-diary-companion-hidden-by-stage-filter",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-07-31T12:00:00Z",
          event_type: "watering",
          details: {
            linked_grow_event_id: parentId,
            watering_amount_ml: 700,
          },
        },
      ],
      growEvents: [
        {
          id: parentId,
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          occurred_at: "2026-07-31T12:00:00Z",
          event_type: "watering",
          source: "manual",
        },
      ],
      renderedDiaryEntryIds: new Set(),
    });
    const view = buildSymptomEvidenceChecklist({
      symptomEntry: {
        id: "symptom",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        entry_at: "2026-08-01T12:00:00Z",
        event_type: "observation",
        details: {
          subtype: "issue",
          observedSign: "spots",
          observation_stage: "flower",
        },
      },
      entries,
      historyComplete: true,
    })!;

    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-1"]}>
        <SymptomEvidenceChecklistCard view={view} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("symptom-evidence-checklist")).toBeVisible();
    expect(screen.getByText("Watered after checking dryback.")).toBeVisible();
    expect(screen.getByText("Volume: 700 mL")).toBeVisible();
    expect(screen.queryByRole("link", { name: "View entry" })).not.toBeInTheDocument();
  });

  it("derives linkable diary anchors from Timeline's filtered rows", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Timeline.tsx"), "utf8");

    expect(source).toMatch(
      /renderedDiaryEntryIds:\s*new Set\(filtered\.map\(\(entry\) => entry\.id\)\)/,
    );
  });
});
