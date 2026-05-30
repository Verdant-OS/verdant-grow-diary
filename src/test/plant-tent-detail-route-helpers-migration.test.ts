/**
 * Regression scan: ensure plant/tent detail routes are built via shared
 * helpers (plantDetailPath / tentDetailPath) instead of hard-coded
 * template literals in src/pages and src/components.
 *
 * Also confirms helper encoding behavior and that the scan files do not
 * contain unsafe write surface markers.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { plantDetailPath, tentDetailPath } from "@/lib/routes";

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

describe("Plant/tent detail route helper migration", () => {
  it("no hard-coded `/plants/${...}` template literals remain in src/pages or src/components", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (/`\/plants\/\$\{/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("no hard-coded `/tents/${...}` template literals remain in src/pages or src/components", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (/`\/tents\/\$\{/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("plantDetailPath/tentDetailPath are imported wherever helpers are used", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      const usesPlant = /\bplantDetailPath\(/.test(src);
      const usesTent = /\btentDetailPath\(/.test(src);
      if (usesPlant && !/from\s+["']@\/lib\/routes["']/.test(src)) offenders.push(`${f} (plant)`);
      if (usesTent && !/from\s+["']@\/lib\/routes["']/.test(src)) offenders.push(`${f} (tent)`);
    }
    expect(offenders).toEqual([]);
  });

  it("helpers encode ids deterministically", () => {
    expect(plantDetailPath("abc")).toBe("/plants/abc");
    expect(tentDetailPath("abc")).toBe("/tents/abc");
    expect(plantDetailPath("a b/c")).toBe("/plants/a%20b%2Fc");
    expect(tentDetailPath("a b/c")).toBe("/tents/a%20b%2Fc");
  });

  it("migrated files contain no unsafe write/automation surface markers", () => {
    const touched = [
      "src/pages/Tents.tsx",
      "src/pages/TentDetail.tsx",
      "src/pages/Plants.tsx",
      "src/pages/PlantDetail.tsx",
      "src/components/PlantMergeDialog.tsx",
      "src/pages/GrowRoomMode.tsx",
      "src/components/PlantTentEnvironmentPanel.tsx",
      "src/components/PlantStatusStrip.tsx",
      "src/pages/Dashboard.tsx",
      "src/components/PlantRecentMoveCard.tsx",
      "src/pages/DailyCheck.tsx",
      "src/components/PlantRecentActivityPanel.tsx",
      "src/pages/AlertDetail.tsx",
      "src/components/PlantCardActionsMenu.tsx",
      "src/pages/ActionDetail.tsx",
      "src/components/TentCardActionsMenu.tsx",
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
