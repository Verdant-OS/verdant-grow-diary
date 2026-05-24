/**
 * Tests for Daily Check route handoff hardening.
 *
 * Covers:
 *   - resolveDailyCheckPlantSelection pure rules
 *   - DailyCheck route wiring (prefill / rejection banner / what-counts)
 *   - Dashboard + Plant Detail CTA hrefs still point at
 *     /daily-check?plantId=<id>
 *   - Static safety audit (no new persistence / RPC / ingestion / etc.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  DAILY_CHECK_WHAT_COUNTS_HINT,
  resolveDailyCheckPlantSelection,
} from "@/lib/dailyCheckPlantSelectionRules";

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------
describe("resolveDailyCheckPlantSelection · pure rules", () => {
  const active = [
    { id: "p1", name: "Sour D", grow_id: "g1", tent_id: "t1" },
    { id: "p2", name: "Blue Dream", grow_id: "g1", tent_id: "t1" },
    { id: "p3", name: "Legacy", grow_id: null, tent_id: "t2" },
    { id: "p4", name: "Other grow", grow_id: "g2", tent_id: "t3" },
  ];

  it("returns missing when no plantId provided", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: null,
      plants: active,
      activeGrowId: null,
    });
    expect(r.status).toBe("missing");
    expect(r.plant).toBeNull();
    expect(r.message).toBeNull();
  });

  it("trims whitespace and treats empty string as missing", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "   ",
      plants: active,
      activeGrowId: null,
    });
    expect(r.status).toBe("missing");
  });

  it("returns valid when plant exists and no grow scope", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "p1",
      plants: active,
      activeGrowId: null,
    });
    expect(r.status).toBe("valid");
    expect(r.plant?.id).toBe("p1");
    expect(r.message).toBeNull();
  });

  it("returns unknown when plantId is not in the active list and refuses to pick a different plant", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "p-missing",
      plants: active,
      activeGrowId: null,
    });
    expect(r.status).toBe("unknown");
    expect(r.plant).toBeNull();
    expect(r.requestedPlantId).toBe("p-missing");
    expect(r.message).toMatch(/archived, merged, or removed/i);
  });

  it("treats archived/merged plants the same as unknown (they are not in the active list)", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "p-archived",
      plants: active,
      activeGrowId: "g1",
    });
    expect(r.status).toBe("unknown");
    expect(r.plant).toBeNull();
  });

  it("returns out-of-scope when plant belongs to a different grow", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "p4",
      plants: active,
      activeGrowId: "g1",
    });
    expect(r.status).toBe("out-of-scope");
    expect(r.plant).toBeNull();
    expect(r.message).toMatch(/different grow/i);
  });

  it("legacy null-grow_id plants are allowed through under any scope", () => {
    const r = resolveDailyCheckPlantSelection({
      plantIdParam: "p3",
      plants: active,
      activeGrowId: "g1",
    });
    expect(r.status).toBe("valid");
    expect(r.plant?.id).toBe("p3");
  });

  it("is deterministic", () => {
    const args = {
      plantIdParam: "p1",
      plants: active,
      activeGrowId: "g1",
    } as const;
    const a = resolveDailyCheckPlantSelection(args);
    const b = resolveDailyCheckPlantSelection(args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("what-counts hint mentions both quick note and manual sensor snapshot", () => {
    const s = DAILY_CHECK_WHAT_COUNTS_HINT.toLowerCase();
    expect(s).toMatch(/quick.*note/);
    expect(s).toMatch(/manual sensor snapshot/);
  });
});

// ---------------------------------------------------------------------------
// DailyCheck page integration (mocked hooks)
// ---------------------------------------------------------------------------
const mockPlants = [
  {
    id: "p1",
    name: "Sour D",
    strain: "Sour Diesel",
    grow_id: "g1",
    tent_id: "t1",
    is_archived: false,
  },
  {
    id: "p2",
    name: "Other Grow Plant",
    strain: "Blue Dream",
    grow_id: "g2",
    tent_id: "t2",
    is_archived: false,
  },
];
const mockTents = [
  { id: "t1", name: "Tent A" },
  { id: "t2", name: "Tent B" },
];

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
  default: ({ prefill }: { prefill?: { plantId: string | null } }) => (
    <div data-testid="mock-quicklog" data-prefill-plant-id={prefill?.plantId ?? ""} />
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

let mockUrlGrowId: string | null = null;
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: mockUrlGrowId,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

import DailyCheck from "@/pages/DailyCheck";

function renderRoute(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DailyCheck route handoff", () => {
  beforeEach(() => {
    mockUrlGrowId = null;
  });

  it("renders the 'what counts' helper copy", () => {
    renderRoute("/daily-check");
    const hint = screen.getByTestId("daily-grow-check-what-counts");
    expect(hint).toHaveTextContent(/quick plant note/i);
    expect(hint).toHaveTextContent(/manual sensor snapshot/i);
  });

  it("valid plantId prefills QuickLog with that plant", async () => {
    renderRoute("/daily-check?plantId=p1");
    expect(
      screen.queryByTestId("daily-grow-check-plant-rejected"),
    ).not.toBeInTheDocument();
    const ql = await screen.findByTestId("mock-quicklog");
    expect(ql.getAttribute("data-prefill-plant-id")).toBe("p1");
  });

  it("missing plantId renders the chooser with no rejection banner", () => {
    renderRoute("/daily-check");
    expect(screen.getByTestId("daily-grow-check-plant-select")).toBeInTheDocument();
    expect(
      screen.queryByTestId("daily-grow-check-plant-rejected"),
    ).not.toBeInTheDocument();
  });

  it("invalid plantId shows a safe rejection banner and does not auto-pick another plant", () => {
    renderRoute("/daily-check?plantId=p-does-not-exist");
    const banner = screen.getByTestId("daily-grow-check-plant-rejected");
    expect(banner).toHaveAttribute("data-rejection-status", "unknown");
    expect(banner).toHaveTextContent(/archived, merged, or removed/i);
    const ql = screen.getByTestId("mock-quicklog");
    expect(ql.getAttribute("data-prefill-plant-id")).toBe("");
  });

  it("plant outside current grow scope is rejected with out-of-scope status", () => {
    mockUrlGrowId = "g1";
    renderRoute("/daily-check?plantId=p2&growId=g1");
    const banner = screen.getByTestId("daily-grow-check-plant-rejected");
    expect(banner).toHaveAttribute("data-rejection-status", "out-of-scope");
    const ql = screen.getByTestId("mock-quicklog");
    expect(ql.getAttribute("data-prefill-plant-id")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// CTA href contract + static safety
// ---------------------------------------------------------------------------
describe("Daily Check CTA contract + safety", () => {
  const root = resolve(__dirname, "../..");
  const rules = readFileSync(
    resolve(root, "src/lib/dailyCheckPlantSelectionRules.ts"),
    "utf8",
  );
  const page = readFileSync(resolve(root, "src/pages/DailyCheck.tsx"), "utf8");
  const dashboardPanel = readFileSync(
    resolve(root, "src/components/DashboardDailyGrowCheckPanel.tsx"),
    "utf8",
  );
  const plantDetailCard = readFileSync(
    resolve(root, "src/components/PlantDailyGrowCheckConsistencyCard.tsx"),
    "utf8",
  );

  it("Dashboard panel CTA still routes to /daily-check?plantId=<id>", () => {
    const dashboardRules = readFileSync(
      resolve(root, "src/lib/dashboardDailyGrowCheckPanelRules.ts"),
      "utf8",
    );
    expect(dashboardRules).toMatch(/\/daily-check\?plantId=\$\{plant\.id\}/);
    expect(dashboardPanel).toMatch(/buildDailyCheckEntryHref/);
    expect(dashboardPanel).toMatch(/source:\s*"dashboard"/);

  });

  it("Plant Detail consistency card CTA still routes to /daily-check?plantId=<id>", () => {
    expect(plantDetailCard).toMatch(/\/daily-check\?plantId=\$\{plantId\}/);
  });

  it("DailyCheck page wires the resolver instead of silently picking from URL", () => {
    expect(page).toMatch(/resolveDailyCheckPlantSelection/);
    expect(page).toMatch(/plant-rejected/);
    expect(page).toMatch(/DAILY_CHECK_WHAT_COUNTS_HINT/);
  });

  it("rules module is I/O-free (no supabase / React)", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
  });

  it("no forbidden wording in rules or visible page copy", () => {
    for (const src of [rules, page, dashboardPanel, plantDetailCard]) {
      const s = src.toLowerCase();
      expect(s).not.toMatch(/perfect grow/);
      expect(s).not.toMatch(/guaranteed healthy/);
    }
  });

  it("no new persistence / RPC / ingestion / action queue / automation / service_role surfaces in new modules", () => {
    for (const src of [rules]) {
      for (const re of [
        /service_role/i,
        /mqtt/i,
        /home[_-]?assistant/i,
        /pi[_-]?bridge/i,
        /pi[_-]?ingest/i,
        /action[_-]?queue/i,
        /automation/i,
        /\.insert\(/,
        /\.update\(/,
        /\.delete\(/,
        /\.upsert\(/,
        /\.rpc\(/,
      ]) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
