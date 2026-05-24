import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/daily-grow-check-operating-loop.md");

const DAILY_CHECK_FILES = [
  "src/pages/DailyCheck.tsx",
  "src/components/QuickLog.tsx",
  "src/components/DashboardDailyGrowCheckPanel.tsx",
  "src/components/PlantDailyGrowCheckConsistencyCard.tsx",
  "src/lib/dailyCheckPostSubmitRules.ts",
  "src/lib/dailyCheckPlantSelectionRules.ts",
  "src/lib/dailyCheckRefreshRules.ts",
  "src/lib/dashboardDailyGrowCheckPanelRules.ts",
];

function readDoc() {
  return readFileSync(DOC_PATH, "utf8");
}

function readFile(rel: string) {
  return readFileSync(resolve(__dirname, "../../", rel), "utf8");
}

describe("daily grow check operating loop doc", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it.each([
    "Today's Grow Checks",
    "/daily-check?plantId=",
    "from=dashboard",
    "from=plant-detail",
    "QuickLog prefill",
    "verdant:entry-created",
    "detail.createdAt",
    "Logged at",
    "React Query invalidation",
    "Daily Grow Check Consistency",
    "manual sensor snapshot",
    "fake local",
  ])("references %s", (needle) => {
    expect(readDoc()).toContain(needle);
  });

  it("documents forbidden outcomes", () => {
    const doc = readDoc();
    expect(doc).toMatch(/no.*streak/i);
    expect(doc).toMatch(/action_queue/);
    expect(doc).toMatch(/sensor ingestion/i);
    expect(doc).toMatch(/automation/i);
    expect(doc).toMatch(/device control/i);
    expect(doc).toMatch(/service_role/);
  });
});

describe("daily grow check files static safety", () => {
  const FORBIDDEN_WORDING = [
    /\bperfect grow\b/i,
    /\bguaranteed healthy\b/i,
    /\bgrow completed\b/i,
  ];
  const FORBIDDEN_TOKENS = [
    /service_role/,
    /\baction_queue\b/,
    /\.rpc\(/,
    /sensor_ingest/i,
    /device[_ ]control/i,
    /automation\.run/i,
  ];

  it.each(DAILY_CHECK_FILES)("%s has no forbidden tokens or wording", (rel) => {
    const src = readFile(rel);
    for (const re of FORBIDDEN_WORDING) {
      expect(src, `${rel} contains forbidden wording ${re}`).not.toMatch(re);
    }
    for (const re of FORBIDDEN_TOKENS) {
      expect(src, `${rel} contains forbidden token ${re}`).not.toMatch(re);
    }
  });

  it("does not introduce a streak persistence table", () => {
    for (const rel of DAILY_CHECK_FILES) {
      const src = readFile(rel);
      expect(src).not.toMatch(/from\(\s*["']streak/i);
      expect(src).not.toMatch(/create table[^;]*streak/i);
    }
  });
});
