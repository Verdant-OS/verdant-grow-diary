/**
 * Regression scan: simple `/alerts`, `/actions`, `/logs`, `/timeline`,
 * `/dashboard` list-route literals in `src/pages` and `src/components`
 * should use the shared route helpers from `@/lib/routes`.
 *
 * Confirms helpers return their canonical base paths and that migrated
 * files contain no unsafe write or automation/device-control markers.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  actionsPath,
  alertsPath,
  dashboardPath,
  logsPath,
  timelinePath,
} from "@/lib/routes";

const ROOT = resolve(__dirname, "../..");
const DIRS = ["src/pages", "src/components"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = DIRS.flatMap((d) => walk(resolve(ROOT, d)));

describe("Core list route helper migration", () => {
  it("helpers return canonical base paths", () => {
    expect(alertsPath()).toBe("/alerts");
    expect(actionsPath()).toBe("/actions");
    expect(logsPath()).toBe("/logs");
    expect(timelinePath()).toBe("/timeline");
    expect(dashboardPath()).toBe("/dashboard");
  });

  for (const route of ["alerts", "actions", "logs", "timeline", "dashboard"] as const) {
    it(`no simple to="/${route}" literals remain in src/pages or src/components`, () => {
      const offenders: string[] = [];
      const re = new RegExp(`to="/${route}"`);
      for (const f of FILES) {
        const src = readFileSync(f, "utf8");
        if (re.test(src)) offenders.push(f);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("files using core list helpers import them from @/lib/routes", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      const uses =
        /\b(alertsPath|actionsPath|logsPath|timelinePath|dashboardPath)\(/.test(src);
      if (uses && !/from\s+["']@\/lib\/routes["']/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("migrated files contain no unsafe write/automation markers", () => {
    const touched = [
      "src/components/PlantRecentActivityPanel.tsx",
      "src/components/PlantAssignedTentActionsPanel.tsx",
      "src/components/PlantAssignedTentAlertsPanel.tsx",
      "src/pages/PlantDetail.tsx",
      "src/pages/GrowRoomMode.tsx",
      "src/pages/Dashboard.tsx",
      "src/pages/Coach.tsx",
    ];
    for (const rel of touched) {
      const src = readFileSync(resolve(ROOT, rel), "utf8").toLowerCase();
      expect(src, rel).not.toContain("service_role");
      for (const tok of [
        "mqtt",
        "auto-execute",
        "actuate",
        "device.command",
        "relay.on",
        "relay.off",
        "home-assistant",
        "home_assistant",
        "smart plug",
      ]) {
        expect(src, `${rel} contains ${tok}`).not.toContain(tok);
      }
    }
  });
});
