/**
 * Component tests for OutcomeFollowUpQueue — empty/loading/unavailable
 * states, category headings, accessible status labels, uncertainty copy,
 * and the absence of causal language.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OutcomeFollowUpQueue } from "../components/OutcomeFollowUpQueue";
import { buildOutcomeFollowUpQueue } from "../lib/outcomeFollowUpQueueViewModel";
import {
  buildPlantMemoryEpisode,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function episode(id: string, outcome?: string, decision?: string): PlantMemoryEpisode {
  const action: EpisodeActionInput = {
    id,
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
      id: `${id}-out`,
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(25 * HOUR),
      details: {
        event_type: "action_outcome",
        action_queue_id: id,
        outcome_status: outcome,
        recorded_by: "grower",
        recorded_at: iso(25 * HOUR),
      },
    });
  }
  if (decision) {
    rows.push({
      id: `${id}-dec`,
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(26 * HOUR),
      details: {
        event_type: "run_learning_decision",
        action_queue_id: id,
        decision,
        recorded_by: "grower",
        recorded_at: iso(26 * HOUR),
      },
    });
  }
  const ep = buildPlantMemoryEpisode({ action, linkedRows: rows, now: T0 + 30 * HOUR });
  if (!ep) throw new Error("expected episode");
  return ep;
}

function renderQueue(
  episodes: PlantMemoryEpisode[],
  status: "loading" | "ok" | "unavailable" = "ok",
) {
  const onAction = vi.fn();
  render(
    <MemoryRouter>
      <OutcomeFollowUpQueue
        viewModel={buildOutcomeFollowUpQueue(episodes)}
        status={status}
        onAction={onAction}
      />
    </MemoryRouter>,
  );
  return { onAction };
}

describe("OutcomeFollowUpQueue", () => {
  it("shows a loading state", () => {
    renderQueue([], "loading");
    expect(screen.getByText(/loading review queue/i)).toBeInTheDocument();
  });

  it("shows a sanitized unavailable state (no provider error)", () => {
    renderQueue([], "unavailable");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/unavailable right now/i);
    expect(status.textContent ?? "").not.toMatch(/supabase|postgres|jwt|500/i);
  });

  it("shows an empty state with no completed actions", () => {
    renderQueue([]);
    expect(screen.getByText(/no completed actions are awaiting a follow-up/i)).toBeInTheDocument();
  });

  it("renders category headings and accessible status badges", () => {
    renderQueue([episode("a", "improved"), episode("b")]);
    // The category heading (h3) carries a count suffix.
    expect(
      screen.getByRole("heading", { name: /outcome recorded — decision pending \(1\)/i }),
    ).toBeInTheDocument();
    // Badges expose accessible status labels, not color alone.
    expect(screen.getAllByLabelText(/status:/i).length).toBeGreaterThan(0);
  });

  it("shows an uncertainty line and never causal language", () => {
    renderQueue([episode("a", "improved"), episode("b", "worsened")]);
    const region = screen.getByRole("region", { name: /follow-up review/i });
    const text = region.textContent ?? "";
    expect(text).toMatch(/grower-recorded|Other factors may have contributed|More follow-up is needed/);
    expect(text).not.toMatch(/caused|fixed the plant|proved effective|guaranteed|best intervention/i);
    // The footer keeps the "nothing is automatic" boundary visible.
    expect(text).toMatch(/nothing is automatic/i);
  });

  it("exposes the safe decision CTA for decision-pending episodes", () => {
    renderQueue([episode("a", "improved")]);
    expect(
      screen.getByRole("button", { name: /choose next-run decision/i }),
    ).toBeInTheDocument();
  });
});
