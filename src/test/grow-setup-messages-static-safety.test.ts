import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROW_SETUP_MESSAGES,
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_START_ROOM_HREF,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const MSG = readFileSync(resolve(ROOT, "src/constants/growSetupMessages.ts"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/createDialogGrowBindingRules.ts"), "utf8");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("grow setup messages static safety", () => {
  it("CTA routes to guided Start your room", () => {
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/start-room");
    expect(MSG).toMatch(/start-room/);
  });

  it("grower-facing strings avoid banned tokens", () => {
    const surfaces = Object.values(GROW_SETUP_MESSAGES)
      .map((v) => (typeof v === "function" ? v("plant") : v))
      .join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(surfaces.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("read-error copy exists and dialogs wire retry", () => {
    expect(GROW_SETUP_MESSAGES.readErrorTitle).toMatch(/unavailable/i);
    expect(GROW_SETUP_MESSAGES.readErrorBody).toMatch(/Nothing has been created/i);
    expect(TENT).toMatch(/create-tent-retry/);
    expect(PLANT).toMatch(/create-plant-retry/);
  });

  it("rules module stays pure", () => {
    expect(RULES).not.toMatch(/from ["']react["']|from ["']@\/integrations\/supabase/);
  });
});
