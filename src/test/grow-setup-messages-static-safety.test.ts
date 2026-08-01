import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROW_SETUP_MESSAGES,
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const MSG = readFileSync(resolve(ROOT, "src/constants/growSetupMessages.ts"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/createDialogGrowBindingRules.ts"), "utf8");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("grow setup messages static safety", () => {
  it("CTA uses one-tent activation on grows (not a new /start-room invent in this PR)", () => {
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
    expect(MSG).toMatch(/one_tent_activation/);
  });

  it("grower-facing strings avoid banned tokens", () => {
    const surfaces = [
      GROW_SETUP_MESSAGES.hardStopTitle,
      GROW_SETUP_MESSAGES.hardStopBody,
      GROW_SETUP_MESSAGES.hardStopCta,
      GROW_SETUP_MESSAGES.addingToHint,
      GROW_SETUP_MESSAGES.tentMismatchTitle,
      GROW_SETUP_MESSAGES.tentMismatchBody,
      GROW_SETUP_MESSAGES.tentOrphanBody,
      growSetup.noSetup.body,
      growSetup.mismatch.missingSetupBody,
    ].join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(surfaces.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("create dialogs import messages and do not hardcode grow_id in UI strings", () => {
    expect(TENT).toMatch(/GROW_SETUP_MESSAGES|growSetupMessages/);
    expect(PLANT).toMatch(/GROW_SETUP_MESSAGES|growSetupMessages/);
    // UI title/body should not show raw grow_id to growers
    expect(TENT).not.toMatch(/hardStopTitle.*grow_id|You need a grow_id/);
    expect(PLANT).not.toMatch(/Missing grow context/);
  });

  it("rules module stays pure (no React/Supabase)", () => {
    expect(RULES).not.toMatch(/from ["']react["']|from ["']@\/integrations\/supabase/);
  });
});
