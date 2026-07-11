/**
 * Smoke/accessibility tests for PlantMemoryEpisodeCard and NextRunPlaybook —
 * renders without crashing, exposes accessible section triggers, shows the
 * mandatory uncertainty note, and never uses causal language.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlantMemoryEpisodeCard } from "../components/PlantMemoryEpisodeCard";
import { NextRunPlaybook } from "../components/NextRunPlaybook";
import { buildNextRunPlaybook } from "../lib/nextRunPlaybookRules";
import {
  buildPlantMemoryEpisode,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function episode(outcome?: string, decision?: string) {
  const action: EpisodeActionInput = {
    id: "act-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: "humidity",
    suggested_change: "Lower RH a few points",
    reason: "RH high",
    status: "completed",
    completed_at: iso(0),
  };
  const rows: EpisodeDiaryRowInput[] = [];
  if (outcome) {
    rows.push({
      id: "out-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: "Looked better after 24h",
      entry_at: iso(25 * HOUR),
      details: {
        event_type: "action_outcome",
        action_queue_id: "act-1",
        outcome_status: outcome,
        recorded_by: "grower",
        recorded_at: iso(25 * HOUR),
      },
    });
  }
  if (decision) {
    rows.push({
      id: "dec-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(26 * HOUR),
      details: {
        event_type: "run_learning_decision",
        action_queue_id: "act-1",
        decision,
        rationale: "seemed consistent",
        recorded_by: "grower",
        recorded_at: iso(26 * HOUR),
      },
    });
  }
  const ep = buildPlantMemoryEpisode({
    action,
    linkedRows: rows,
    sensorEvidence: [
      {
        snapshotId: "s1",
        capturedAt: iso(-HOUR),
        tentId: "tent-1",
        plantId: "plant-1",
        source: "live",
        status: "usable",
        confidence: null,
        window: "before",
        usable: true,
      },
      {
        snapshotId: "s2",
        capturedAt: iso(HOUR),
        tentId: "tent-1",
        plantId: "plant-1",
        source: "demo",
        status: "needs_review",
        confidence: null,
        window: "after",
        usable: false,
      },
    ],
    now: T0 + 30 * HOUR,
  });
  if (!ep) throw new Error("expected episode");
  return ep;
}

const CAUSAL = /\b(caused|fixed the plant|proved effective|guaranteed|cures?|autopilot|controls your grow|definitely worked)\b/i;

describe("PlantMemoryEpisodeCard", () => {
  it("renders without crashing for a decision-pending episode", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode("improved")} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plant-memory-episode-act-1")).toBeInTheDocument();
  });

  it("exposes accessible, real-button section triggers (Radix Collapsible)", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode("improved")} />
      </MemoryRouter>,
    );
    const trigger = screen.getByTestId("episode-section-action-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded");
  });

  it("always shows the uncertainty note", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode()} />
      </MemoryRouter>,
    );
    const note = screen.getByTestId("episode-uncertainty-note");
    expect(note).toHaveAttribute("role", "note");
    expect(note.textContent ?? "").toMatch(
      /limited|other factors|grower-recorded|review|follow-up is incomplete/i,
    );
  });

  it("honestly labels demo evidence — never presented as usable/live", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode("improved")} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/demo data/i)).toBeInTheDocument();
  });

  it("shows the CTA to choose a decision once an outcome exists", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode("worsened")} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /choose next-run decision/i })).toBeInTheDocument();
  });

  it("never renders causal or effectiveness language", () => {
    const { container } = render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard episode={episode("improved", "repeat")} />
      </MemoryRouter>,
    );
    expect(container.textContent ?? "").not.toMatch(CAUSAL);
    expect(container.textContent ?? "").not.toMatch(/%\s*(confidence|effective)/i);
  });
});

describe("NextRunPlaybook", () => {
  it("renders an empty state with no episodes", () => {
    render(
      <MemoryRouter>
        <NextRunPlaybook playbook={buildNextRunPlaybook([])} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no grower-confirmed lessons yet/i)).toBeInTheDocument();
  });

  it("renders decided items under the grower's actual decision, never inferred", () => {
    const worsenedAdjust = episode("worsened", "adjust");
    render(
      <MemoryRouter>
        <NextRunPlaybook playbook={buildNextRunPlaybook([worsenedAdjust])} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/adjust next run \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/avoid next run \(1\)/i)).not.toBeInTheDocument();
  });

  it("never renders causal language anywhere in the playbook", () => {
    const { container } = render(
      <MemoryRouter>
        <NextRunPlaybook playbook={buildNextRunPlaybook([episode("improved", "repeat")])} />
      </MemoryRouter>,
    );
    expect(container.textContent ?? "").not.toMatch(CAUSAL);
  });
});
