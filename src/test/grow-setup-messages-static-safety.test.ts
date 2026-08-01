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

describe("grow setup messages static safety", () => {
  it("CTA uses one-tent activation on grows", () => {
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
    expect(MSG).toMatch(/one_tent_activation/);
  });

  it("grower-facing strings avoid banned tokens", () => {
    const surfaces = Object.values(GROW_SETUP_MESSAGES)
      .map((v) => (typeof v === "function" ? v("plant") : v))
      .join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(surfaces.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("rules distinguish read_error from no_setup and forbid explicit fallback", () => {
    expect(RULES).toMatch(/read_error/);
    expect(RULES).toMatch(/requested_setup_unavailable/);
    expect(RULES).toMatch(/never fall back|NEVER falls back|Never fall back/i);
  });
});
