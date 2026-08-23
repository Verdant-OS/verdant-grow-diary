/**
 * Timeline page One-Tent Loop card wiring — presenter-only test.
 * No data fetching, no Supabase, no AI calls.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch should not be called by the next-step card");
}) as never);

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Timeline One-Tent Loop next-step card wiring", () => {
  it("renders with current step Timeline", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1" }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    const card = screen.getByTestId("timeline-one-tent-loop-next-step-card");
    expect(card.getAttribute("data-current-step")).toBe("timeline");
    expect(card.getAttribute("data-next-step")).toBe("sensor-snapshot");
  });

  it("shows the Review sensor snapshot CTA", () => {
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1" }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card-cta")).toHaveTextContent(
      /Review sensor snapshot/i,
    );
  });

  it("carries a selected Timeline tent to Sensors without exposing it as copy", () => {
    const tentId = "00000000-0000-4000-8000-00000000000a";
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1", tentId }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );

    const cta = screen.getByTestId("timeline-one-tent-loop-next-step-card-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(`/sensors?tentId=${tentId}`);
    expect(
      screen.getByTestId("timeline-one-tent-loop-next-step-card").textContent ?? "",
    ).not.toContain(tentId);
  });

  it("carries a selected Timeline plant UUID into the Sensors href without showing it", () => {
    const tentId = "00000000-0000-4000-8000-00000000000a";
    const plantId = "00000000-0000-4000-8000-00000000000b";
    renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: "g1", tentId, plantId }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );

    const cta = screen.getByTestId("timeline-one-tent-loop-next-step-card-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(
      `/sensors?tentId=${tentId}&tentIntent=required&plantId=${plantId}`,
    );
    const text = screen.getByTestId("timeline-one-tent-loop-next-step-card").textContent ?? "";
    expect(text).not.toContain(plantId);
    expect(text).not.toContain(tentId);
  });

  it("renders the Sensor Snapshot helper copy", () => {
    renderCard(
      <OneTentLoopNextStepCard current="timeline" testId="timeline-one-tent-loop-next-step-card" />,
    );
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card-helper")).toHaveTextContent(
      /Open Sensor Snapshot from Timeline to cross-check telemetry and proceed\./,
    );
  });

  it("does not call fetch", () => {
    renderCard(
      <OneTentLoopNextStepCard current="timeline" testId="timeline-one-tent-loop-next-step-card" />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not introduce device-control or automation wording", () => {
    renderCard(
      <OneTentLoopNextStepCard current="timeline" testId="timeline-one-tent-loop-next-step-card" />,
    );
    const text = (
      screen.getByTestId("timeline-one-tent-loop-next-step-card").textContent ?? ""
    ).toLowerCase();
    expect(text).not.toMatch(/relay|actuator|switchbot|auto[- ]?run|auto[- ]?execute/);
  });

  it("does not render UUID-looking ids in visible text", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { container } = renderCard(
      <OneTentLoopNextStepCard
        current="timeline"
        ids={{ growId: uuid }}
        testId="timeline-one-tent-loop-next-step-card"
      />,
    );
    expect(container.textContent ?? "").not.toContain(uuid);
  });

  it("Timeline source imports the card and renders it near the top", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Timeline.tsx", "utf8");
    expect(src).toContain(
      'import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard"',
    );
    expect(src).toContain(
      'import { resolveTimelineSensorHandoffIds } from "@/lib/oneTentLoopNavigationRules"',
    );
    expect(src).toContain('current="timeline"');
    expect(src).toContain("plantTentIdsById,");
    expect(src).toContain("tentId: timelineSensorHandoffIds.tentId");
    expect(src).toContain("plantId: timelineSensorHandoffIds.plantId");
    expect(src).toContain('testId="timeline-one-tent-loop-next-step-card"');

    const cardStart = src.indexOf('<OneTentLoopNextStepCard\n          current="timeline"');
    const cardEnd = src.indexOf("/>", cardStart);
    expect(cardStart).toBeGreaterThanOrEqual(0);
    expect(cardEnd).toBeGreaterThan(cardStart);
    const cardSource = src.slice(cardStart, cardEnd);
    // Never regress this handoff to independently forwarding a plant with no
    // proven tent. The Timeline fast-add context is intentionally separate.
    expect(cardSource).not.toContain("plantId: plantFilter || null");
  });

  it("Timeline owner directory selects plant tent relationships in the existing read", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/hooks/useTimelineNameDirectory.ts", "utf8");

    expect(src).toContain('.select("id,name,tent_id").eq("user_id", userId)');
    expect(src).toContain("buildTimelinePlantTentLookup(plantsResult?.data, tentsResult?.data)");
  });
});
