import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TentPlantRosterPanel from "@/components/TentPlantRosterPanel";
import { buildTentPlantRosterViewModel } from "@/lib/tentPlantRosterViewModel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TentPlantRosterPanel", () => {
  it("renders multiple plants in one tent and excludes others", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1", strain: "Blue", stage: "veg" },
        { id: "p2", name: "Beta", tentId: "other" },
        { id: "p3", name: "Gamma", tentId: "t1" },
      ],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(screen.getByTestId("tent-plant-roster-list")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-roster-row-p1")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-roster-row-p3")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-plant-roster-row-p2")).toBeNull();
  });

  it("renders empty state copy when no plants in tent", () => {
    const vm = buildTentPlantRosterViewModel({ tentId: "t1", plants: [] });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(screen.getByTestId("tent-plant-roster-empty")).toHaveTextContent(
      "No plants assigned to this tent yet.",
    );
  });

  it("renders unknown relationship state", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [],
      relationshipKnown: false,
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.getByTestId("tent-plant-roster-unknown-relationship"),
    ).toHaveTextContent("Plant-to-tent relationship is unavailable.");
  });

  it("renders shared environment copy and labels tent-level sensor context", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
      tentSensorContextLabel: "Live",
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.getByTestId("tent-plant-roster-shared-environment-copy"),
    ).toHaveTextContent("Tent environment is shared.");
    const ctx = screen.getByTestId("tent-plant-roster-tent-sensor-context");
    expect(ctx).toHaveTextContent("Tent-level sensor context");
    expect(ctx).toHaveTextContent("Live");
  });

  it("renders Harvest Watch fallback when no public state present", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-harvest-watch"),
    ).toHaveTextContent("Harvest Watch available on Plant Detail");
  });

  it("renders plant name/strain/stage and Plant Detail link", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        {
          id: "p1",
          name: "Alpha",
          strain: "Blue Dream",
          stage: "flower",
          tentId: "t1",
          latestLogAt: "2026-06-01T00:00:00.000Z",
          hasRecentPhoto: true,
        },
      ],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-name"),
    ).toHaveTextContent("Alpha");
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-strain"),
    ).toHaveTextContent("Blue Dream");
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-stage"),
    ).toHaveTextContent("flower");
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-latest-log"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-recent-photo"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tent-plant-roster-row-p1-link"),
    ).toHaveAttribute("href");
  });
});

describe("TentPlantRosterPanel static safety", () => {
  const sources = [
    resolve(__dirname, "../lib/tentPlantRosterViewModel.ts"),
    resolve(__dirname, "../components/TentPlantRosterPanel.tsx"),
  ];

  for (const path of sources) {
    const content = readFileSync(path, "utf8");

    it(`does not import Supabase clients in ${path.split("/").slice(-2).join("/")}`, () => {
      expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(content).not.toMatch(/supabase\.from\(/);
    });
    it(`does not import AI/model/alerts/action-queue/device-control surfaces in ${path.split("/").slice(-2).join("/")}`, () => {
      expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
      expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
      expect(content).not.toMatch(/actionQueue|action_queue/);
      expect(content).not.toMatch(/deviceControl|device_control/);
    });
  }
});
