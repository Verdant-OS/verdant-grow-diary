/**
 * UX language pass — Tents/Plants emphasized in primary navigation,
 * "grow"-heavy copy softened, no user-facing grow_id leakage.
 *
 * Read-only static guardrails. No schema, RLS, Edge Function, pi-ingest,
 * automation, or device-control changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { more } from "@/components/MobileNav";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE = read("src/components/MobileNav.tsx");
const QUICKLOG = read("src/components/QuickLog.tsx");
const PLANTS = read("src/pages/Plants.tsx");
const TENTS = read("src/pages/Tents.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");

describe("Primary navigation: Tents and Plants are emphasized", () => {
  it("AppSidebar group is labeled 'Cultivation' (not 'Grow') and lists Tents before Plants", () => {
    expect(SIDEBAR).toContain('label: "Cultivation"');
    expect(SIDEBAR).not.toMatch(/label:\s*"Grow"/);
    const tentsIdx = SIDEBAR.indexOf('label: "Tents"');
    const plantsIdx = SIDEBAR.indexOf('label: "Plants"');
    expect(tentsIdx).toBeGreaterThan(-1);
    expect(plantsIdx).toBeGreaterThan(tentsIdx);
  });

  it("AppSidebar renames 'Grow Logs' to 'Timeline' (Slice 1+ cleanup)", () => {
    expect(SIDEBAR).not.toContain('"Grow Logs"');
    expect(SIDEBAR).toMatch(/label:\s*"Timeline"/);
  });

  it("Slice 3: grower nav uses canonical labels (Reports, Timeline) — no 'Grow Learning Hub' or 'Logs'", () => {
    // Sidebar
    expect(SIDEBAR).not.toContain("Grow Learning Hub");
    expect(SIDEBAR).toMatch(/label:\s*"Reports"/);
    expect(SIDEBAR).not.toMatch(/label:\s*"Logs"/);
    // Mobile
    expect(MOBILE).not.toContain("Grow Learning Hub");
    expect(MOBILE).not.toMatch(/label:\s*"Logs"/);
  });

  it("Slice 3: Timeline nav targets canonical /timeline route, not /logs", () => {
    const sidebarTimeline = SIDEBAR.match(/\{[^}]*label:\s*"Timeline"[^}]*\}/);
    expect(sidebarTimeline?.[0]).toMatch(/to:\s*"\/timeline"/);
    const mobileTimeline = MOBILE.match(/\{[^}]*label:\s*"Timeline"[^}]*\}/);
    expect(mobileTimeline?.[0]).toMatch(/to:\s*"\/timeline"/);
  });

  it("Slice 6: Dashboard Timeline links use timelinePath (canonical /timeline), not logsPath", () => {
    const DASHBOARD = read("src/pages/Dashboard.tsx");
    expect(DASHBOARD).not.toMatch(/logsPath\(/);
    expect(DASHBOARD).toMatch(/timelinePath\(scopedGrowId\)/);
    // Import must include timelinePath, not logsPath.
    expect(DASHBOARD).toMatch(/from\s+["']@\/lib\/routes["'][\s\S]{0,400}/);
    const importLine = DASHBOARD.match(/import\s*\{[^}]*\}\s*from\s*["']@\/lib\/routes["']/)?.[0] ?? "";
    expect(importLine).toContain("timelinePath");
    expect(importLine).not.toContain("logsPath");
  });

  it("AppSidebar moves 'Grows' index under Archive as 'Harvest Archive'", () => {
    expect(SIDEBAR).toContain('"Harvest Archive"');
    expect(SIDEBAR).not.toMatch(/label:\s*"Grows"/);
  });

  it("MobileNav primary tabs put Tents before Plants and rename Grows", () => {
    const tIdx = MOBILE.indexOf('label: "Tents"');
    const pIdx = MOBILE.indexOf('label: "Plants"');
    expect(tIdx).toBeGreaterThan(-1);
    expect(pIdx).toBeGreaterThan(tIdx);
    expect(MOBILE).not.toMatch(/label:\s*"Grows"/);
    expect(MOBILE).toContain('"Harvest Archive"');
  });
});

describe("MobileNav alert/action labels stay honest", () => {
  it("/alerts is labeled as alert review, not Action Queue", () => {
    const alertItems = [...MOBILE.matchAll(/\{\s*to:\s*"\/alerts"[\s\S]*?\}/g)].map(
      (match) => match[0],
    );

    expect(alertItems.length).toBeGreaterThan(0);
    for (const item of alertItems) {
      expect(item).not.toMatch(/label:\s*"Action Queue"/);
      expect(item).toMatch(/label:\s*"(Alerts|Review Alerts|Alerts & Recommendations)"/);
    }
  });

  it("More menu does not use /alerts as an Action Queue shortcut", () => {
    const moreMenu = MOBILE.match(/const more = \[([\s\S]*?)\];/)?.[1] ?? "";

    expect(moreMenu).not.toMatch(/to:\s*"\/alerts"[\s\S]*label:\s*"Action Queue"/);
    expect(moreMenu).not.toMatch(/label:\s*"Action Queue"[\s\S]*to:\s*"\/alerts"/);
  });

  it("More menu includes a real Action Queue route", () => {
    const actionItem = more.find((item) => item.to === "/actions");

    expect(actionItem).toBeDefined();
    expect(actionItem?.label).toMatch(/^(Actions|Action Queue)$/);
  });
});

describe("QuickLog reads plant/tent-first, not grow-first", () => {
  it("renames the grow selector label to 'Current Setup'", () => {
    expect(QUICKLOG).toMatch(/<Label[^>]*>Current Setup<\/Label>/);
    expect(QUICKLOG).not.toMatch(/<Label[^>]*>Workspace<\/Label>/);
    expect(QUICKLOG).not.toMatch(/<Label[^>]*>Grow<\/Label>/);
    // Guardrail: must not be renamed to "Strain".
    expect(QUICKLOG).not.toMatch(/<Label[^>]*>Strain<\/Label>/);
  });

  it("error toast no longer says 'Pick a grow first'", () => {
    expect(QUICKLOG).not.toContain("Pick a grow first");
    expect(QUICKLOG).toContain("Pick a workspace first");
  });

  it("still scopes the write with activeGrowId internally (grow_id preserved)", () => {
    expect(QUICKLOG).toMatch(/!activeGrowId/);
  });
});

describe("Empty states emphasize Plants and Tents as the primary unit", () => {
  it("Plants empty state guides growers to add and assign", () => {
    expect(PLANTS).toContain("No plants yet");
    expect(PLANTS).toContain("Add your first plant");
  });

  it("Tents empty state guides growers to set up a tent", () => {
    expect(TENTS).toContain("Set up your first tent");
    expect(TENTS).not.toContain("Every grow space, environment, and lighting status.");
  });

  it("Plant/Tent detail fallbacks avoid 'real grow data' phrasing", () => {
    expect(PLANT_DETAIL).not.toContain("real grow data");
    expect(TENT_DETAIL).not.toContain("real grow data");
  });

  it("PlantDetail link no longer says 'Open grow logs'", () => {
    expect(PLANT_DETAIL).not.toContain("Open grow logs");
    expect(PLANT_DETAIL).toContain("Open Logs");
  });
});

describe("No user-facing grow_id leakage in primary surfaces", () => {
  const FILES = [SIDEBAR, MOBILE, QUICKLOG, PLANTS, TENTS, PLANT_DETAIL, TENT_DETAIL];
  it("none of the audited primary UI files render the literal string 'grow_id' in JSX", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/>\s*grow_id\s*</);
      expect(src).not.toMatch(/"grow_id"\s*:\s*[a-zA-Z]/);
    }
  });
});

describe("Safety: UX pass introduces no risky surfaces", () => {
  const FORBIDDEN = [
    "service_role",
    "mqtt",
    "home_assistant",
    "pi_bridge",
    "actuator",
    "device_control",
  ];
  const FILES: Array<[string, string]> = [
    ["AppSidebar", SIDEBAR],
    ["MobileNav", MOBILE],
    ["QuickLog", QUICKLOG],
    ["Plants", PLANTS],
    ["Tents", TENTS],
    ["PlantDetail", PLANT_DETAIL],
    ["TentDetail", TENT_DETAIL],
  ];
  for (const [name, src] of FILES) {
    for (const needle of FORBIDDEN) {
      it(`${name} does not contain ${needle}`, () => {
        expect(src.toLowerCase()).not.toContain(needle);
      });
    }
  }

  it("no new migrations were created for this UX pass", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      entries = [];
    }
    expect(entries.every((f) => !f.includes("ux-language-pass"))).toBe(true);
  });
});
