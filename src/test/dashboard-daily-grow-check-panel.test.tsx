/**
 * Tests for the Dashboard "Today's Grow Checks" panel.
 *
 * Covers pure rules + component wiring/safety. Reuses the existing
 * Daily Grow Check consistency basis — does not re-test that calculation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDashboardDailyGrowCheckPanel,
  type PanelPlantInput,
} from "@/lib/dashboardDailyGrowCheckPanelRules";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
const NOW = new Date("2026-05-24T14:00:00.000Z");
const TODAY_ISO = NOW.toISOString();
const YESTERDAY_ISO = new Date("2026-05-23T14:00:00.000Z").toISOString();

const plant = (over: Partial<PanelPlantInput> & { id: string }): PanelPlantInput => ({
  name: `Plant ${over.id}`,
  tentId: "t1",
  growId: "g1",
  isArchived: false,
  lastNote: "",
  ...over,
});

describe("buildDashboardDailyGrowCheckPanel · pure rules", () => {
  it("derives checked vs unchecked plants from existing diary entries", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [
        plant({ id: "p1", name: "Sour D" }),
        plant({ id: "p2", name: "Blue Dream" }),
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" },
      ],
    });

    expect(panel.total).toBe(2);
    expect(panel.checked).toBe(1);
    expect(panel.summaryText).toMatch(/checked 1 of 2 plants today/i);
    const p1 = panel.rows.find((r) => r.plantId === "p1")!;
    const p2 = panel.rows.find((r) => r.plantId === "p2")!;
    expect(p1.checkedToday).toBe(true);
    expect(p1.showCta).toBe(false);
    expect(p2.checkedToday).toBe(false);
    expect(p2.showCta).toBe(true);
    expect(p2.ctaHref).toBe("/daily-check?plantId=p2&from=dashboard");
    expect(p1.tentName).toBe("Tent A");
  });

  it("unchecked plants are sorted before checked plants", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [
        plant({ id: "p1", name: "Alpha" }),
        plant({ id: "p2", name: "Bravo" }),
        plant({ id: "p3", name: "Charlie" }),
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" },
      ],
    });
    expect(panel.rows.map((r) => r.plantId)).toEqual(["p2", "p3", "p1"]);
  });

  it("all-checked state produces positive confirmation without forbidden wording", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant({ id: "p1" }), plant({ id: "p2" })],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" },
        { entry_at: TODAY_ISO, id: "d2", plant_id: "p2", tent_id: "t1" },
      ],
    });
    expect(panel.allChecked).toBe(true);
    expect(panel.positiveConfirmation).toBeTruthy();
    const txt = (panel.positiveConfirmation ?? "").toLowerCase();
    expect(txt).not.toMatch(/perfect/);
    expect(txt).not.toMatch(/\bcompleted\b/);
    expect(txt).not.toMatch(/guaranteed/);
    expect(txt).not.toMatch(/\bhealthy\b/);
  });

  it("excludes archived and merged plants", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [
        plant({ id: "p1", name: "Active" }),
        plant({ id: "p2", name: "Archived", isArchived: true }),
        plant({
          id: "p3",
          name: "Merged",
          isArchived: true,
          lastNote: "Merged into 11111111-1111-1111-1111-111111111111",
        }),
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(panel.total).toBe(1);
    expect(panel.rows[0].plantId).toBe("p1");
  });

  it("empty state when no active plants exist for the scoped grow", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(panel.isEmpty).toBe(true);
    expect(panel.emptyMessage).toMatch(/add a plant/i);
    expect(panel.emptyCtaHref).toBe("/plants");
    expect(panel.rows).toHaveLength(0);
  });

  it("scopes to scopedGrowId but keeps legacy null-grow_id plants visible", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [
        plant({ id: "pA", name: "In grow", growId: "g1" }),
        plant({ id: "pB", name: "Legacy", growId: null }),
        plant({ id: "pC", name: "Other grow", growId: "g2" }),
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [],
    });
    const ids = panel.rows.map((r) => r.plantId).sort();
    expect(ids).toEqual(["pA", "pB"]);
  });

  it("returns single CTA href format /daily-check?plantId=<id>", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [plant({ id: "p1", growId: null })],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(panel.rows[0].ctaHref).toBe("/daily-check?plantId=p1&from=dashboard");
  });

  it("manual sensor snapshots in plant's tent today count as a check", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant({ id: "p1", tentId: "t1" })],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [{ ts: TODAY_ISO, id: "r1", tent_id: "t1" }],
      diaryEntries: [],
    });
    expect(panel.rows[0].checkedToday).toBe(true);
  });

  it("yesterday-only activity does NOT mark today as checked", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant({ id: "p1", tentId: "t1" })],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [{ ts: YESTERDAY_ISO, id: "r1", tent_id: "t1" }],
      diaryEntries: [
        { entry_at: YESTERDAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" },
      ],
    });
    expect(panel.rows[0].checkedToday).toBe(false);
  });

  it("is deterministic for identical input", () => {
    const args = {
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant({ id: "p1" }), plant({ id: "p2" })],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY_ISO, id: "d1", plant_id: "p1", tent_id: "t1" },
      ],
    };
    const a = buildDashboardDailyGrowCheckPanel(args);
    const b = buildDashboardDailyGrowCheckPanel(args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// -----------------------------------------------------------------------
// Component render tests (mocked hooks)
// -----------------------------------------------------------------------
import { vi } from "vitest";

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
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

function renderPanel(scopedGrowId: string | null = "g1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardDailyGrowCheckPanel scopedGrowId={scopedGrowId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardDailyGrowCheckPanel · component", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("renders checked and unchecked rows and summary", () => {
    renderPanel();
    const panel = screen.getByTestId("dashboard-daily-grow-check-panel");
    expect(within(panel).getByTestId("dashboard-daily-grow-check-panel-title"))
      .toHaveTextContent(/today's grow checks/i);
    expect(within(panel).getByTestId("dashboard-daily-grow-check-panel-summary"))
      .toHaveTextContent(/checked 1 of 2 plants today/i);
    const rows = within(panel).getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(2);
    // Unchecked row shows quick-action buttons, checked row does not
    expect(within(panel).getAllByTestId("dashboard-daily-grow-check-panel-row-actions")).toHaveLength(1);
  });

  it("unchecked plant Add note action links to /daily-check?plantId=<id>&from=dashboard&method=note", () => {
    renderPanel();
    const action = screen.getByTestId("dashboard-daily-grow-check-panel-row-action-note");
    const link = (action.tagName === "A" ? action : action.querySelector("a")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/daily-check?plantId=p2&from=dashboard&method=note");
  });
});


// -----------------------------------------------------------------------
// Static safety audit
// -----------------------------------------------------------------------
describe("Dashboard Daily Grow Check panel · static safety", () => {
  const root = resolve(__dirname, "../..");
  const rules = readFileSync(
    resolve(root, "src/lib/dashboardDailyGrowCheckPanelRules.ts"),
    "utf8",
  );
  const card = readFileSync(
    resolve(root, "src/components/DashboardDailyGrowCheckPanel.tsx"),
    "utf8",
  );

  it("rules module is I/O-free (no supabase / React imports)", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
  });

  it("no forbidden user copy in rules or component", () => {
    for (const src of [rules, card]) {
      const s = src.toLowerCase();
      expect(s).not.toMatch(/perfect/);
      expect(s).not.toMatch(/\bcompleted\b/);
      expect(s).not.toMatch(/guaranteed/);
    }
    // 'healthy' is forbidden in user-facing copy only (avoid health claims)
    expect(rules.toLowerCase()).not.toMatch(/healthy/);
  });

  it("no new persistence, RPC, ingestion, action queue, automation, or service_role", () => {
    for (const src of [rules, card]) {
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
