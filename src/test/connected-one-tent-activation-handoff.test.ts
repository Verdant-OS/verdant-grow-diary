import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => stripSourceComments(readFileSync(resolve(ROOT, path), "utf8"));

const GROWS = read("src/pages/Grows.tsx");
const TENTS = read("src/pages/Tents.tsx");
const PLANTS = read("src/pages/Plants.tsx");
const TENT_DIALOG = read("src/components/CreateTentDialog.tsx");
const PLANT_DIALOG = read("src/components/CreatePlantDialog.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");

describe("connected One-Tent activation handoff", () => {
  it("carries the guided intent from Grow creation into a grow-scoped Tent", () => {
    expect(GROWS).toMatch(/isOneTentActivationIntent/);
    expect(GROWS).toMatch(/buildConnectedActivationRoutes/);
    expect(GROWS).toMatch(/navigate\([\s\S]*\.addTent/);
    expect(TENTS).toMatch(/defaultGrowId=\{validGrowId\}/);
    expect(TENTS).toMatch(/onCreated=/);
    expect(TENTS).toMatch(/\.addPlant/);
  });

  it("validates the requested Tent against RLS-loaded grow data before prefill", () => {
    expect(PLANTS).toMatch(/tent\.id\s*===\s*requestedActivationTentId/);
    expect(PLANTS).toMatch(/tent\.growId\s*===\s*validGrowId/);
    expect(PLANTS).toMatch(/defaultTentId=\{activationTent\?\.id\}/);
    expect(PLANTS).toMatch(/requireTent=\{activationIntent\}/);
  });

  it("remounts guided dialogs when asynchronous scope validation completes", () => {
    expect(TENTS).toMatch(/key=\{activationIntent \? "one-tent-activation" : "standard-create"\}/);
    expect(PLANTS).toMatch(/key=\{activationIntent \? "one-tent-activation" : "standard-create"\}/);
  });

  it("opens Quick Log with the exact created Grow, Tent, and Plant context", () => {
    expect(PLANTS).toMatch(/buildPlantQuickLogPrefill/);
    expect(PLANTS).toMatch(/plantId:\s*plant\.id/);
    expect(PLANTS).toMatch(/growId:\s*validGrowId/);
    expect(PLANTS).toMatch(/tentId:\s*activationTent\.id/);
    expect(PLANTS).toMatch(/new CustomEvent\(PLANT_QUICKLOG_PREFILL_EVENT/);
  });

  it("keeps general-purpose creation nullable outside guided activation", () => {
    expect(TENT_DIALOG).toMatch(/initiallyOpen\s*=\s*false/);
    expect(PLANT_DIALOG).toMatch(/requireTent\s*=\s*false/);
    expect(PLANT_DIALOG).toMatch(/!requireTent\s*&&\s*<SelectItem value="none"/);
  });

  it("uses one relationship-aware Dashboard checklist and removes the duplicate", () => {
    expect(DASHBOARD).toMatch(/selectConnectedOneTentGraph/);
    expect(DASHBOARD).toMatch(/useOneTentActivationEvidence/);
    expect(DASHBOARD).toMatch(/<OnboardingChecklistCard\s+vm=\{onboardingVm\}/);
    expect(DASHBOARD).not.toMatch(/<FirstRunChecklist/);
  });
});

describe("activation handoff safety fence", () => {
  it("does not introduce Edge calls, elevated keys, or device control", () => {
    const all = [GROWS, TENTS, PLANTS, TENT_DIALOG, PLANT_DIALOG].join("\n");
    expect(all).not.toMatch(/functions\.invoke/);
    expect(all).not.toMatch(/service_role/i);
    expect(all).not.toMatch(/device[-_ ]command/i);
  });
});
