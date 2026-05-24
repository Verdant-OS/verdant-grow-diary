/**
 * Daily Check quick method actions.
 *
 * UX/routing only:
 *  - Dashboard unchecked rows expose two small actions (Add note,
 *    Add sensor snapshot) linking to /daily-check with ?method=…
 *  - Daily Check parses ?method= and visually focuses (or jumps to)
 *    the matching step. method=sensor without a tent falls back to
 *    the existing safe no-tent message.
 *
 * Read-only UI/routing. No persistence. No writes. No new RPC, ingestion,
 * alerts, action_queue, automation, device control, or service_role.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDailyCheckEntryHref,
  parseDailyCheckMethodHint,
} from "@/lib/dailyCheckPostSubmitRules";

// --- Pure rules ------------------------------------------------------------
describe("parseDailyCheckMethodHint", () => {
  it("parses 'note' and 'sensor' (case-insensitive)", () => {
    expect(parseDailyCheckMethodHint("note")).toBe("note");
    expect(parseDailyCheckMethodHint("Sensor")).toBe("sensor");
    expect(parseDailyCheckMethodHint("  NOTE ")).toBe("note");
  });
  it("returns null for unknown, empty, or missing values", () => {
    expect(parseDailyCheckMethodHint(null)).toBeNull();
    expect(parseDailyCheckMethodHint(undefined)).toBeNull();
    expect(parseDailyCheckMethodHint("")).toBeNull();
    expect(parseDailyCheckMethodHint("photo")).toBeNull();
    expect(parseDailyCheckMethodHint("both")).toBeNull();
  });
});

describe("buildDailyCheckEntryHref", () => {
  it("remains backward-compatible without method/source", () => {
    expect(buildDailyCheckEntryHref({ plantId: "p1" })).toBe(
      "/daily-check?plantId=p1",
    );
  });
  it("appends from and method when provided", () => {
    expect(
      buildDailyCheckEntryHref({
        plantId: "p1",
        source: "dashboard",
        method: "note",
      }),
    ).toBe("/daily-check?plantId=p1&from=dashboard&method=note");
    expect(
      buildDailyCheckEntryHref({
        plantId: "p1",
        source: "dashboard",
        method: "sensor",
      }),
    ).toBe("/daily-check?plantId=p1&from=dashboard&method=sensor");
  });
});

// --- Dashboard panel: quick method actions on unchecked rows ---------------
const TODAY_ISO = new Date().toISOString();

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    // p1 checked today (note), p2 unchecked
    data: [{ entry_at: TODAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" }],
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: [
      { id: "p1", name: "Sour D", tentId: "t1", growId: "g1", isArchived: false, lastNote: "" },
      { id: "p2", name: "Blue Dream", tentId: "t1", growId: "g1", isArchived: false, lastNote: "" },
    ],
  }),
  useGrowTents: () => ({ data: [{ id: "t1", name: "Tent A" }] }),
}));

import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardDailyGrowCheckPanel scopedGrowId="g1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard panel · quick method actions", () => {
  it("unchecked row exposes both Add note and Add sensor snapshot actions", () => {
    renderPanel();
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    const unchecked = rows.find((r) => r.getAttribute("data-plant-id") === "p2")!;
    const actions = within(unchecked).getByTestId(
      "dashboard-daily-grow-check-panel-row-actions",
    );
    expect(
      within(actions).getByTestId("dashboard-daily-grow-check-panel-row-action-note"),
    ).toBeTruthy();
    expect(
      within(actions).getByTestId("dashboard-daily-grow-check-panel-row-action-sensor"),
    ).toBeTruthy();
  });

  it("Add note href carries method=note", () => {
    renderPanel();
    const a = screen.getByTestId("dashboard-daily-grow-check-panel-row-action-note");
    const link = (a.tagName === "A" ? a : a.querySelector("a")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/daily-check?plantId=p2&from=dashboard&method=note",
    );
  });

  it("Add sensor snapshot href carries method=sensor", () => {
    renderPanel();
    const a = screen.getByTestId("dashboard-daily-grow-check-panel-row-action-sensor");
    const link = (a.tagName === "A" ? a : a.querySelector("a")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/daily-check?plantId=p2&from=dashboard&method=sensor",
    );
  });

  it("checked rows do not render quick-action buttons", () => {
    renderPanel();
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    const checked = rows.find((r) => r.getAttribute("data-plant-id") === "p1")!;
    expect(
      within(checked).queryByTestId("dashboard-daily-grow-check-panel-row-actions"),
    ).toBeNull();
  });
});

// --- Daily Check page: parses ?method= -------------------------------------
const mockPlants = [
  { id: "p1", name: "Sour D", strain: "Sour Diesel", grow_id: "g1", tent_id: "t1", is_archived: false },
  { id: "pNoTent", name: "Untented", strain: null, grow_id: "g1", tent_id: null, is_archived: false },
];
const mockTents = [{ id: "t1", name: "Tent A" }];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div data-testid="mock-manual-card" />,
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({ open }: { open?: boolean }) => (
    <div data-testid="mock-quicklog" data-open={open ? "1" : "0"} />
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div data-testid="mock-status-strip" />,
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

import DailyCheck from "@/pages/DailyCheck";

function renderRoute(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DailyCheck · ?method= handling", () => {
  beforeEach(() => {
    // ensure no leftover step state across renders (RTL renders new tree)
  });

  it("method=note focuses the QuickLog choose option and opens the QuickLog dialog", async () => {
    renderRoute("/daily-check?plantId=p1&from=dashboard&method=note");
    const choose = await screen.findByTestId("daily-grow-check-choose");
    expect(choose.getAttribute("data-method-hint")).toBe("note");
    const noteBtn = within(choose).getByTestId("daily-grow-check-choose-quicklog");
    expect(noteBtn.getAttribute("data-method-focused")).toBe("1");
    const ql = await screen.findByTestId("mock-quicklog");
    expect(ql.getAttribute("data-open")).toBe("1");
  });

  it("method=sensor focuses the sensor snapshot option when the plant has a tent", async () => {
    renderRoute("/daily-check?plantId=p1&from=dashboard&method=sensor");
    const choose = await screen.findByTestId("daily-grow-check-choose");
    expect(choose.getAttribute("data-method-hint")).toBe("sensor");
    const sensorBtn = within(choose).getByTestId("daily-grow-check-choose-snapshot");
    expect(sensorBtn.getAttribute("data-method-focused")).toBe("1");
    expect(sensorBtn.hasAttribute("disabled")).toBe(false);
    // QuickLog dialog stays closed for sensor focus
    const ql = screen.getByTestId("mock-quicklog");
    expect(ql.getAttribute("data-open")).toBe("0");
  });

  it("invalid/missing method falls back safely (no focus, no dialog)", async () => {
    renderRoute("/daily-check?plantId=p1&from=dashboard&method=photo");
    const choose = await screen.findByTestId("daily-grow-check-choose");
    expect(choose.getAttribute("data-method-hint")).toBe("");
    expect(
      within(choose).getByTestId("daily-grow-check-choose-quicklog").getAttribute(
        "data-method-focused",
      ),
    ).toBe("0");
    expect(
      within(choose).getByTestId("daily-grow-check-choose-snapshot").getAttribute(
        "data-method-focused",
      ),
    ).toBe("0");
    const ql = screen.getByTestId("mock-quicklog");
    expect(ql.getAttribute("data-open")).toBe("0");
  });

  it("method=sensor with no tent shows the existing safe no-tent message and does not focus sensor", async () => {
    renderRoute("/daily-check?plantId=pNoTent&from=dashboard&method=sensor");
    // Existing guarded message:
    expect(await screen.findByTestId("daily-grow-check-needs-tent")).toBeTruthy();
    const choose = screen.getByTestId("daily-grow-check-choose");
    const sensorBtn = within(choose).getByTestId("daily-grow-check-choose-snapshot");
    expect(sensorBtn.hasAttribute("disabled")).toBe(true);
    expect(sensorBtn.getAttribute("data-method-focused")).toBe("0");
    // QuickLog stays closed
    const ql = screen.getByTestId("mock-quicklog");
    expect(ql.getAttribute("data-open")).toBe("0");
  });

  it("generic Start check route (no method, no from) still renders normally", async () => {
    renderRoute("/daily-check?plantId=p1");
    const choose = await screen.findByTestId("daily-grow-check-choose");
    expect(choose.getAttribute("data-method-hint")).toBe("");
    expect(
      screen.queryByTestId("daily-grow-check-plant-rejected"),
    ).not.toBeInTheDocument();
  });
});

// --- Static safety scans ---------------------------------------------------
function readSrc(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

describe("safety scans", () => {
  const files = [
    "lib/dailyCheckPostSubmitRules.ts",
    "components/DashboardDailyGrowCheckPanel.tsx",
    "pages/DailyCheck.tsx",
  ].map(readSrc);

  it("no forbidden wording in new wiring", () => {
    const panel = readSrc("components/DashboardDailyGrowCheckPanel.tsx");
    for (const src of [panel]) {
      expect(src).not.toMatch(/\bperfect\b/i);
      expect(src).not.toMatch(/guaranteed healthy/i);
      expect(src).not.toMatch(/check\s+completed/i);
    }
  });

  it("no new persistence, RPC, sensor ingestion, or service_role in new wiring", () => {
    const panel = readSrc("components/DashboardDailyGrowCheckPanel.tsx");
    const helper = readSrc("lib/dailyCheckPostSubmitRules.ts");
    for (const src of [panel, helper]) {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/sensor_ingest/i);
    }
  });


  it("DailyCheck never auto-submits based on method hint", () => {
    const page = readSrc("pages/DailyCheck.tsx");
    // The hint may open QuickLog dialog but must not directly call insert
    // or dispatch a fake success event.
    expect(page).not.toMatch(/methodHint[\s\S]{0,200}\.insert\(/);
    expect(page).not.toMatch(/methodHint[\s\S]{0,200}dispatchEvent/);
    expect(page).not.toMatch(/setLastSubmittedAt\(.*methodHint/);
  });

  it("Dashboard does not fabricate a local 'checked today' state", () => {
    const panel = readSrc("components/DashboardDailyGrowCheckPanel.tsx");
    expect(panel).not.toMatch(/useState<\s*boolean\s*>\(\s*true\s*\)/);
    expect(panel).not.toMatch(/setChecked|optimisticChecked|fakeChecked/i);
  });
});
