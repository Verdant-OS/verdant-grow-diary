/**
 * Tests for entry-source-aware Daily Check CTAs and entry-event detail.
 *
 * Covers:
 *  - Dashboard panel rules emit `from=dashboard` in the CTA href
 *  - Plant Detail consistency card + history card + page button emit
 *    `from=plant-detail` in their hrefs
 *  - QuickLog still dispatches `verdant:entry-created` and now carries
 *    a `createdAt` ISO string in the event detail
 *  - Dashboard panel reacts to the success event via the shared refresh
 *    helper (covered functionally in `daily-check-refresh.test.tsx`)
 *  - Static safety: no new persistence / RPC / automation / device control
 *    / action_queue / service_role surface
 *
 * No QuickLog write payload is re-tested here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDailyCheckPostSubmitActions,
  parseDailyCheckEntrySource,
} from "@/lib/dailyCheckPostSubmitRules";
import {
  buildDashboardDailyGrowCheckPanel,
} from "@/lib/dashboardDailyGrowCheckPanelRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DASH_RULES = read("src/lib/dashboardDailyGrowCheckPanelRules.ts");
const PLANT_CARD = read("src/components/PlantDailyGrowCheckConsistencyCard.tsx");
const PLANT_HISTORY = read("src/components/PlantDailyGrowCheckHistoryCard.tsx");
const PLANT_PAGE = read("src/pages/PlantDetail.tsx");
const QUICKLOG = read("src/components/QuickLog.tsx");
const DAILY_CHECK = read("src/pages/DailyCheck.tsx");
const POST_RULES = read("src/lib/dailyCheckPostSubmitRules.ts");

describe("Entry-source-aware CTAs · href contract", () => {
  it("Dashboard panel CTA href carries from=dashboard", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: new Date("2026-05-24T12:00:00Z"),
      scopedGrowId: null,
      plants: [
        { id: "p-a", name: "A", tentId: "t1", growId: null, isArchived: false },
      ],
      tents: [{ id: "t1", name: "Tent" }],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(panel.rows[0].ctaHref).toBe("/daily-check?plantId=p-a&from=dashboard");
  });

  it("Plant Detail consistency card href carries from=plant-detail", () => {
    expect(PLANT_CARD).toMatch(
      /\/daily-check\?plantId=\$\{plantId\}&from=plant-detail/,
    );
  });

  it("Plant Detail history card href carries from=plant-detail", () => {
    expect(PLANT_HISTORY).toMatch(
      /\/daily-check\?plantId=\$\{plantId\}&from=plant-detail/,
    );
  });

  it("Plant Detail page top-of-card button carries from=plant-detail", () => {
    expect(PLANT_PAGE).toMatch(
      /\/daily-check\?plantId=\$\{plant\.id\}&from=plant-detail/,
    );
  });

  it("source parser is the single source of truth for valid `from` values", () => {
    expect(parseDailyCheckEntrySource("dashboard")).toBe("dashboard");
    expect(parseDailyCheckEntrySource("plant-detail")).toBe("plant-detail");
    expect(parseDailyCheckEntrySource("nope")).toBeNull();
  });
});

describe("Source-aware post-submit primary CTA selection", () => {
  it("from=dashboard ⇒ Dashboard primary", () => {
    const a = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "dashboard",
    });
    const primary = a.find((x) => x.primary)!;
    expect(primary.key).toBe("dashboard");
  });

  it("from=plant-detail with plantId ⇒ Plant primary, label 'Back to Plant'", () => {
    const a = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "plant-detail",
    });
    expect(a[0].key).toBe("plant");
    expect(a[0].label).toBe("Back to Plant");
    expect(a[0].primary).toBe(true);
  });

  it("missing/unknown source ⇒ Dashboard primary (safe default)", () => {
    expect(
      buildDailyCheckPostSubmitActions({ plantId: "p-1" }).find((x) => x.primary)!
        .key,
    ).toBe("dashboard");
    expect(
      buildDailyCheckPostSubmitActions({ plantId: "p-1", source: null }).find(
        (x) => x.primary,
      )!.key,
    ).toBe("dashboard");
  });
});

describe("QuickLog success event carries createdAt", () => {
  it("dispatches verdant:entry-created with a createdAt detail field", () => {
    expect(QUICKLOG).toMatch(/verdant:entry-created/);
    // The dispatch wraps detail with createdAt.
    expect(QUICKLOG).toMatch(/createdAt:/);
    // Event detail is built only after a successful insert path.
    // (`insErr` early-returns above the dispatch site.)
    expect(QUICKLOG).toMatch(/if\s*\(\s*insErr\s*\)/);
  });

  it("DailyCheck reads createdAt from event detail when forming Logged-at", () => {
    expect(DAILY_CHECK).toMatch(/detail\?\.createdAt|detail\.createdAt/);
    expect(DAILY_CHECK).toMatch(/formatDailyCheckLoggedAt/);
    expect(DAILY_CHECK).toMatch(/daily-grow-check-post-submit-logged-at/);
  });
});

describe("Dashboard refresh wiring after Daily Check submit", () => {
  it("Dashboard panel listens for verdant:entry-created and uses the shared refresh helper", () => {
    const dashPanel = read("src/components/DashboardDailyGrowCheckPanel.tsx");
    expect(dashPanel).toMatch(/ENTRY_CREATED_EVENT/);
    expect(dashPanel).toMatch(/refreshDailyCheckQueries/);
  });

  it("does not introduce a fake local checked-state shortcut", () => {
    const dashPanel = read("src/components/DashboardDailyGrowCheckPanel.tsx");
    expect(dashPanel).not.toMatch(/setChecked|fakeChecked|optimisticChecked/i);
    // Still derives checked-today from real rules helper.
    expect(dashPanel).toMatch(/buildDashboardDailyGrowCheckPanel/);
  });
});

describe("Static safety · no forbidden wording or write/control surface", () => {
  // Strip comments so docstring negative-assertions ("never automation",
  // "no action_queue") do not register as real surfaces.
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  }
  const FILES: Record<string, string> = {
    POST_RULES: stripComments(POST_RULES),
    DAILY_CHECK: stripComments(DAILY_CHECK),
    DASH_RULES: stripComments(DASH_RULES),
    PLANT_CARD: stripComments(PLANT_CARD),
    PLANT_HISTORY: stripComments(PLANT_HISTORY),
  };

  it("post-submit user-visible copy constants avoid forbidden wording", () => {
    // Scope to the actual rendered copy + action labels, not the whole module.
    const userCopy = [
      ...POST_RULES.match(/"[^"\n]+"/g) ?? [],
    ]
      .join(" ")
      .toLowerCase();
    expect(userCopy).not.toMatch(/\bperfect\b/);
    expect(userCopy).not.toMatch(/\bcompleted\b/);
    expect(userCopy).not.toMatch(/guaranteed healthy/);
  });

  it("no new persistence, RPC, ingestion, action queue, automation, device control, or service_role surface", () => {
    const forbidden = [
      /service_role/i,
      /mqtt/i,
      /home[_-]?assistant/i,
      /pi[_-]?bridge/i,
      /pi[_-]?ingest/i,
      /action[_-]?queue/i,
      /\bautomation\b/i,
      /device_command/i,
      /\brelay\b/i,
      /\.rpc\(/,
    ];
    for (const [name, src] of Object.entries(FILES)) {
      for (const re of forbidden) {
        expect(src, `${name} should not match ${re}`).not.toMatch(re);
      }
    }
  });

  it("post-submit rules module is I/O-free", () => {
    expect(POST_RULES).not.toMatch(/@\/integrations\/supabase/);
    expect(POST_RULES).not.toMatch(/from\s+["']react["']/);
    expect(POST_RULES).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});
