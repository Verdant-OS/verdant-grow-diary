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

  it("renders provided Harvest Watch public state when safe", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        {
          id: "p1",
          name: "Alpha",
          tentId: "t1",
          harvestWatchPublicState: "watch_window",
        },
      ],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    const node = screen.getByTestId("tent-plant-roster-row-p1-harvest-watch");
    expect(node).toHaveTextContent("watch_window");
  });

  it("never renders forbidden harvest-instruction copy", () => {
    const states = [
      "not_enough_evidence",
      "too_early_to_call",
      "watch_window",
      "ready_for_manual_review",
      "past_expected_window",
      "unknown",
    ];
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: states.map((s, i) => ({
        id: `p${i}`,
        name: `Plant ${i}`,
        tentId: "t1",
        harvestWatchPublicState: s,
      })),
    });
    const { container } = wrap(<TentPlantRosterPanel viewModel={vm} />);
    const text = container.textContent ?? "";
    for (const forbidden of [
      "harvest now",
      "ready to harvest",
      "optimal",
      "guaranteed",
      "chop",
      "flush",
      "dark period",
      "fix immediately",
      "plant is unhealthy",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("does not show recent-photo badge when hasRecentPhoto is false", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.queryByTestId("tent-plant-roster-row-p1-recent-photo"),
    ).toBeNull();
  });

  it("does not render archived toggle when no handler is provided", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} />);
    expect(
      screen.queryByTestId("tent-plant-roster-show-archived-toggle"),
    ).toBeNull();
  });

  it("renders archived toggle when handler is provided and excludes archived by default", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1" },
        { id: "p2", name: "Beta", tentId: "t1", isArchived: true },
      ],
    });
    wrap(
      <TentPlantRosterPanel
        viewModel={vm}
        onToggleIncludeArchived={() => {}}
      />,
    );
    const toggle = screen.getByTestId(
      "tent-plant-roster-show-archived-toggle",
    ) as HTMLInputElement;
    expect(toggle).toBeInTheDocument();
    expect(toggle.checked).toBe(false);
    expect(screen.getByTestId("tent-plant-roster-row-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-plant-roster-row-p2")).toBeNull();
  });

  it("calls handler with true when archived toggle is clicked", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    const calls: boolean[] = [];
    wrap(
      <TentPlantRosterPanel
        viewModel={vm}
        onToggleIncludeArchived={(v) => calls.push(v)}
      />,
    );
    const toggle = screen.getByTestId(
      "tent-plant-roster-show-archived-toggle",
    );
    (toggle as HTMLInputElement).click();
    expect(calls).toEqual([true]);
  });

  it("shows archived plants and Archived label when includeArchived is true", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      includeArchived: true,
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1" },
        { id: "p2", name: "Beta", tentId: "t1", isArchived: true },
      ],
    });
    wrap(
      <TentPlantRosterPanel
        viewModel={vm}
        onToggleIncludeArchived={() => {}}
      />,
    );
    expect(screen.getByTestId("tent-plant-roster-row-p2")).toBeInTheDocument();
    expect(
      screen.getByTestId("tent-plant-roster-row-p2-archived"),
    ).toHaveTextContent("Archived");
    expect(
      screen.queryByTestId("tent-plant-roster-row-p1-archived"),
    ).toBeNull();
    // Plant Detail link still present on archived row.
    expect(
      screen.getByTestId("tent-plant-roster-row-p2-link"),
    ).toHaveAttribute("href");
  });

  it("renders empty archived hint when active is empty but archived exist", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1", isArchived: true },
      ],
    });
    wrap(
      <TentPlantRosterPanel
        viewModel={vm}
        onToggleIncludeArchived={() => {}}
      />,
    );
    expect(screen.getByTestId("tent-plant-roster-empty")).toHaveTextContent(
      "No plants assigned to this tent yet.",
    );
    expect(
      screen.getByTestId("tent-plant-roster-empty-archived-hint"),
    ).toHaveTextContent("Archived plants");
  });

  it("does not render empty archived hint when no archived plants exist", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [],
    });
    wrap(
      <TentPlantRosterPanel
        viewModel={vm}
        onToggleIncludeArchived={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("tent-plant-roster-empty-archived-hint"),
    ).toBeNull();
  });

  it("renders header counts that exclude other tents and stay stable when archived hidden", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1" },
        { id: "p2", name: "Beta", tentId: "t1", isArchived: true },
        { id: "p3", name: "Gamma", tentId: "other" },
        { id: "p4", name: "Delta", tentId: "other", isArchived: true },
      ],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} onToggleIncludeArchived={() => {}} />);
    expect(screen.getByTestId("tent-plant-roster-header-counts")).toHaveTextContent(
      "Active plants: 1 · Archived plants: 1",
    );
  });

  it("header counts remain stable when archived plants are shown", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      includeArchived: true,
      plants: [
        { id: "p1", name: "Alpha", tentId: "t1" },
        { id: "p2", name: "Beta", tentId: "t1", isArchived: true },
      ],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} onToggleIncludeArchived={() => {}} />);
    expect(screen.getByTestId("tent-plant-roster-header-counts")).toHaveTextContent(
      "Active plants: 1 · Archived plants: 1",
    );
  });

  it("toggle has accessible label, help text via aria-describedby, and focus-visible styling", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} onToggleIncludeArchived={() => {}} />);
    const toggle = screen.getByTestId(
      "tent-plant-roster-show-archived-toggle",
    ) as HTMLInputElement;
    expect(toggle.type).toBe("checkbox");
    expect(toggle.getAttribute("aria-label")).toBe(
      "Show archived plants in this tent roster",
    );
    expect(toggle.getAttribute("aria-describedby")).toBe(
      "tent-plant-roster-show-archived-help",
    );
    expect(toggle.className).toMatch(/focus-visible:ring/);
    const help = screen.getByTestId("tent-plant-roster-show-archived-help");
    expect(help.id).toBe("tent-plant-roster-show-archived-help");
    expect(help).toHaveTextContent(
      "Archived plants are hidden by default.",
    );
  });

  it("toggle reflects checked state from the view-model", () => {
    const vmOff = buildTentPlantRosterViewModel({
      tentId: "t1",
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    const { rerender } = wrap(
      <TentPlantRosterPanel viewModel={vmOff} onToggleIncludeArchived={() => {}} />,
    );
    expect(
      (screen.getByTestId("tent-plant-roster-show-archived-toggle") as HTMLInputElement).checked,
    ).toBe(false);
    const vmOn = buildTentPlantRosterViewModel({
      tentId: "t1",
      includeArchived: true,
      plants: [{ id: "p1", name: "Alpha", tentId: "t1" }],
    });
    rerender(
      <MemoryRouter>
        <TentPlantRosterPanel viewModel={vmOn} onToggleIncludeArchived={() => {}} />
      </MemoryRouter>,
    );
    expect(
      (screen.getByTestId("tent-plant-roster-show-archived-toggle") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("archived badge exposes accessible help copy and is not focusable", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: "t1",
      includeArchived: true,
      plants: [{ id: "p1", name: "Alpha", tentId: "t1", isArchived: true }],
    });
    wrap(<TentPlantRosterPanel viewModel={vm} onToggleIncludeArchived={() => {}} />);
    const badge = screen.getByTestId("tent-plant-roster-row-p1-archived");
    expect(badge.getAttribute("aria-label")).toContain(
      "Archived plants are completed or inactive plants",
    );
    expect(badge.getAttribute("title")).toContain(
      "Archived plants are completed or inactive plants",
    );
    expect(badge.tagName.toLowerCase()).toBe("span");
    expect(badge.hasAttribute("tabindex")).toBe(false);
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
