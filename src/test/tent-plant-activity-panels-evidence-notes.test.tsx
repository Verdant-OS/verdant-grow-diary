import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TentPlantActivityPanels from "@/components/TentPlantActivityPanels";
import { buildTentPlantActivityPanelsViewModel } from "@/lib/tentPlantActivityPanelsViewModel";

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const PLANTS = [
  { id: "p1", name: "Blue Dream", strain: "Hybrid", stage: "veg", isArchived: false },
];
const ACTIVITY = {
  p1: {
    latestLogAt: "2026-06-10T12:00:00Z",
    latestLogSummary: "Watered 0.5L",
    hasRecentPhoto: true,
    harvestWatchPublicState: "watch_window",
  },
};

function vm(overrides: Partial<Parameters<typeof buildTentPlantActivityPanelsViewModel>[0]> = {}) {
  return buildTentPlantActivityPanelsViewModel({
    plants: PLANTS,
    activityByPlantId: ACTIVITY,
    includeArchived: false,
    selectedPlantId: null,
    tentId: "t1",
    tentName: "Tent A",
    growId: "g1",
    ...overrides,
  });
}

const TID = "tent-plant-activity-panel-p1";

function listen() {
  const received: Array<Record<string, unknown>> = [];
  const listener = (ev: Event) =>
    received.push((ev as CustomEvent).detail as Record<string, unknown>);
  window.addEventListener("verdant:open-quicklog", listener as EventListener);
  return {
    received,
    cleanup: () =>
      window.removeEventListener("verdant:open-quicklog", listener as EventListener),
  };
}

describe("TentPlantActivityPanels — Evidence notes draft section", () => {
  it("renders the Evidence notes label", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId(`${TID}-evidence-notes-label`)).toHaveTextContent(
      "Evidence notes",
    );
  });

  it("renders the helper copy exactly", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId(`${TID}-evidence-notes-helper`)).toHaveTextContent(
      "Draft manual inspection notes here. Nothing is saved until you add it to Quick Log.",
    );
  });

  it("renders the caution copy exactly", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    expect(screen.getByTestId(`${TID}-evidence-notes-caution`)).toHaveTextContent(
      "Harvest Watch is evidence-only. The grower decides.",
    );
  });

  it("uses the documented placeholder text", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    expect(ta.getAttribute("placeholder")).toBe(
      "Example: Checked trichomes under loupe, noted mostly cloudy with some clear…",
    );
  });

  it("textarea is local-state only and starts empty", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    expect(ta.value).toBe("");
    fireEvent.change(ta, { target: { value: "Trichomes 70% cloudy" } });
    expect(ta.value).toBe("Trichomes 70% cloudy");
  });

  it("disables Add note button when the draft is blank", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const btn = screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables Add note button for whitespace-only drafts", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "   \n\t  " } });
    const btn = screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Add note button when the draft has content", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Inspected pistils" } });
    const btn = screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("disables Add note button when prefill context is missing", () => {
    wrap(<TentPlantActivityPanels viewModel={vm({ tentId: null, growId: null })} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Has draft" } });
    const btn = screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("dispatches verdant:open-quicklog with trimmed note and full prefill", () => {
    const { received, cleanup } = listen();
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "   Trichomes mostly cloudy.  \n" } });
    (
      screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement
    ).click();
    cleanup();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      plantId: "p1",
      plantName: "Blue Dream",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
      eventType: "observation",
      suggestSnapshot: true,
      note: "Trichomes mostly cloudy.",
    });
  });

  it("does not dispatch when draft is blank", () => {
    const { received, cleanup } = listen();
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    (
      screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement
    ).click();
    cleanup();
    expect(received).toHaveLength(0);
  });

  it("Add note button accessible label includes plant name", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const btn = screen.getByTestId(`${TID}-evidence-notes-send`);
    expect(btn.getAttribute("aria-label")).toBe(
      "Add evidence note to Quick Log for Blue Dream",
    );
  });

  it("textarea is connected to label and helper/caution via aria attributes", () => {
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    const label = screen.getByTestId(`${TID}-evidence-notes-label`);
    const helper = screen.getByTestId(`${TID}-evidence-notes-helper`);
    const caution = screen.getByTestId(`${TID}-evidence-notes-caution`);
    expect(ta.getAttribute("aria-labelledby")).toBe(label.id);
    const describedBy = ta.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(/\s+/)).toEqual(
      expect.arrayContaining([helper.id, caution.id]),
    );
    expect(ta.getAttribute("id")).toBe(label.getAttribute("for"));
  });

  it("draft text is preserved after the Add note dispatch", () => {
    const { cleanup } = listen();
    wrap(<TentPlantActivityPanels viewModel={vm()} />);
    const ta = screen.getByTestId(`${TID}-evidence-notes-textarea`) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Pistils mostly amber" } });
    (
      screen.getByTestId(`${TID}-evidence-notes-send`) as HTMLButtonElement
    ).click();
    cleanup();
    expect(ta.value).toBe("Pistils mostly amber");
  });
});

describe("TentPlantActivityPanels — Evidence notes static safety", () => {
  const sources = [
    resolve(__dirname, "../components/TentPlantActivityPanels.tsx"),
    resolve(__dirname, "../lib/tentPlantActivityPanelsViewModel.ts"),
  ];
  for (const path of sources) {
    const raw = readFileSync(path, "utf8");
    const content = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const short = path.split("/").slice(-2).join("/");
    it(`no Supabase write imports in ${short}`, () => {
      expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(content).not.toMatch(/supabase\.from\(/);
    });
    it(`no AI/alerts/action-queue/device-control imports in ${short}`, () => {
      expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
      expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
      expect(content).not.toMatch(/actionQueue|action_queue/);
      expect(content).not.toMatch(/deviceControl|device_control/);
    });
    it(`no automation/device-control/localStorage writes from evidence notes in ${short}`, () => {
      expect(content).not.toMatch(/automation/i);
      expect(content).not.toMatch(/window\.localStorage/);
    });
  }
});
