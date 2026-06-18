import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TentPlantTabs from "@/components/TentPlantTabs";
import { buildTentPlantTabsViewModel } from "@/lib/tentPlantTabsViewModel";

const ACTIVE = [
  { id: "p1", name: "Blue Dream", isArchived: false },
  { id: "p2", name: "Plant B", isArchived: false },
];

describe("TentPlantTabs", () => {
  it("renders a tablist with All plants + one tab per visible plant", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: null,
    });
    render(<TentPlantTabs viewModel={vm} onSelect={() => {}} />);
    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-label")).toBe("Tent plant tabs");
    expect(screen.getByTestId("tent-plant-tabs-tab-all")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-tabs-tab-p1")).toBeInTheDocument();
    expect(screen.getByTestId("tent-plant-tabs-tab-p2")).toBeInTheDocument();
  });

  it("marks the selected tab with aria-selected and tabIndex=0", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "p1",
    });
    render(<TentPlantTabs viewModel={vm} onSelect={() => {}} />);
    const selected = screen.getByTestId("tent-plant-tabs-tab-p1");
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.getAttribute("tabindex")).toBe("0");
    const unselected = screen.getByTestId("tent-plant-tabs-tab-all");
    expect(unselected.getAttribute("aria-selected")).toBe("false");
    expect(unselected.getAttribute("tabindex")).toBe("-1");
  });

  it("invokes onSelect with the plant id when a tab is clicked", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: null,
    });
    const onSelect = vi.fn();
    render(<TentPlantTabs viewModel={vm} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("tent-plant-tabs-tab-p2"));
    expect(onSelect).toHaveBeenCalledWith("p2");
    fireEvent.click(screen.getByTestId("tent-plant-tabs-tab-all"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("arrow-key navigation moves focus across tabs", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: null,
    });
    render(<TentPlantTabs viewModel={vm} onSelect={() => {}} />);
    const all = screen.getByTestId("tent-plant-tabs-tab-all") as HTMLButtonElement;
    const p1 = screen.getByTestId("tent-plant-tabs-tab-p1") as HTMLButtonElement;
    const p2 = screen.getByTestId("tent-plant-tabs-tab-p2") as HTMLButtonElement;
    all.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(p1);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(document.activeElement).toBe(p2);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(document.activeElement).toBe(all);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(p2);
  });

  it("auto-syncs caller selection when view-model reset it", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: ACTIVE,
      includeArchived: false,
      selectedPlantId: "ghost",
    });
    const onSelect = vi.fn();
    render(<TentPlantTabs viewModel={vm} onSelect={onSelect} />);
    expect(vm.selectionWasReset).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renders an archived label inside archived plant tabs", () => {
    const vm = buildTentPlantTabsViewModel({
      plants: [
        ...ACTIVE,
        { id: "p3", name: "Gelato Auto", isArchived: true },
      ],
      includeArchived: true,
      selectedPlantId: null,
    });
    render(<TentPlantTabs viewModel={vm} onSelect={() => {}} />);
    const arc = screen.getByTestId("tent-plant-tabs-tab-p3");
    expect(arc.getAttribute("data-archived")).toBe("true");
    expect(arc.getAttribute("aria-label")).toBe("Gelato Auto (archived)");
  });
});

describe("TentPlantTabs static safety", () => {
  const sources = [
    resolve(__dirname, "../lib/tentPlantTabsViewModel.ts"),
    resolve(__dirname, "../components/TentPlantTabs.tsx"),
  ];
  for (const path of sources) {
    const raw = readFileSync(path, "utf8");
    const content = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    it(`no Supabase write imports in ${path.split("/").slice(-2).join("/")}`, () => {
      expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(content).not.toMatch(/supabase\.from\(/);
    });
    it(`no AI/alerts/action-queue/device-control imports in ${path.split("/").slice(-2).join("/")}`, () => {
      expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
      expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
      expect(content).not.toMatch(/actionQueue|action_queue/);
      expect(content).not.toMatch(/deviceControl|device_control/);
    });
  }
});
