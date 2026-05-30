/**
 * Regression scan: simple `/plants` and `/tents` list-route literals in
 * `src/pages` and `src/components` should use the shared `plantsPath` /
 * `tentsPath` helpers from `@/lib/routes`.
 *
 * Also confirms the helpers return their canonical base paths when called
 * with no arguments and that migrated files contain no unsafe write or
 * automation/device-control surface markers.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { plantsPath, tentsPath } from "@/lib/routes";

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

describe("Plant/tent list route helper migration", () => {
  it("plantsPath() returns the canonical /plants base path", () => {
    expect(plantsPath()).toBe("/plants");
  });

  it("tentsPath() returns the canonical /tents base path", () => {
    expect(tentsPath()).toBe("/tents");
  });

  it("no simple `to=\"/plants\"` literals remain in src/pages or src/components", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (/to="\/plants"/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("no simple `to=\"/tents\"` literals remain in src/pages or src/components", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (/to="\/tents"/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("files using plantsPath/tentsPath import them from @/lib/routes", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      const usesPlants = /\bplantsPath\(/.test(src);
      const usesTents = /\btentsPath\(/.test(src);
      if ((usesPlants || usesTents) && !/from\s+["']@\/lib\/routes["']/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("migrated files contain no unsafe write/automation surface markers", () => {
    const touched = [
      "src/pages/GrowRoomMode.tsx",
      "src/pages/Dashboard.tsx",
      "src/pages/TentDetail.tsx",
      "src/pages/DailyCheck.tsx",
      "src/pages/PlantDetail.tsx",
      "src/components/PlantMergeDialog.tsx",
    ];
    for (const rel of touched) {
      const src = readFileSync(resolve(ROOT, rel), "utf8").toLowerCase();
      expect(src, rel).not.toContain("service_role");
      expect(src, rel).not.toContain("functions.invoke");
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
