/**
 * Follow-up to #2270 (CodeRabbit r4328428986): the learning card must strip the
 * `[alert:<id>]` back-pointer from a completed action's reason, as every other
 * action-reason surface does, while still showing `Reading at` in local time.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PlantMemoryEpisodeCard } from "../components/PlantMemoryEpisodeCard";
import { buildPlantMemoryEpisode, type EpisodeActionInput } from "../lib/plantMemoryEpisodeRules";

const ISO_READING = "2026-10-15T15:54:26.221+00:00";

function episodeWithReason(reason: string) {
  const action: EpisodeActionInput = {
    id: "act-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: "humidity",
    suggested_change: "Lower RH a few points",
    reason,
    status: "completed",
    completed_at: "2026-07-01T12:00:00.000Z",
  };
  const ep = buildPlantMemoryEpisode({
    action,
    linkedRows: [],
    sensorEvidence: [],
    now: Date.parse("2026-07-02T18:00:00Z"),
  });
  if (!ep) throw new Error("expected episode");
  return ep;
}

describe("PlantMemoryEpisodeCard reason back-pointer", () => {
  it("strips [alert:...] and keeps Reading at local", () => {
    render(
      <MemoryRouter>
        <PlantMemoryEpisodeCard
          episode={episodeWithReason(
            `[alert:alert-1] Humidity is high. Reading at ${ISO_READING}.`,
          )}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("episode-section-action-trigger"));
    const reason = screen.getByText(/Humidity is high\. Reading at/);
    expect(reason.textContent).not.toContain("[alert:");
    expect(reason.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
