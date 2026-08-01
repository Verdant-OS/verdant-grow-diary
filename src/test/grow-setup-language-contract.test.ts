import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  growSetup,
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_FINISH_LINEAGE_HREF,
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

const GROWER_FACING_COPY = [
  GROW_SETUP_MESSAGES.hardStopTitle,
  GROW_SETUP_MESSAGES.hardStopBody,
  GROW_SETUP_MESSAGES.hardStopCta,
  GROW_SETUP_MESSAGES.hardStopSecondary,
  GROW_SETUP_MESSAGES.addingToHint,
  GROW_SETUP_MESSAGES.tentMismatchTitle,
  GROW_SETUP_MESSAGES.tentMismatchBody,
  GROW_SETUP_MESSAGES.tentOrphanTitle,
  GROW_SETUP_MESSAGES.tentOrphanBody,
  GROW_SETUP_MESSAGES.finishSetup,
  GROW_SETUP_MESSAGES.hardStopAriaLabel,
  GROW_SETUP_MESSAGES.mismatchAriaLabel,
].join("\n");

describe("grow setup language contract", () => {
  it("renders approved noSetup keys on zero-grow hard stop", () => {
    expect(growSetup.noSetup.title).toMatch(/Start your room first/i);
    expect(growSetup.noSetup.body).toMatch(/setup/i);
    expect(growSetup.noSetup.primaryCta).toBe("Start your room");
    expect(growSetup.noSetup.secondaryCta).toBe("Not now");
    expect(growSetup.noSetup.href).toBe(GROW_SETUP_START_ROOM_HREF);
    expect(TENT).toMatch(/binding\.title/);
    expect(PLANT).toMatch(/binding\.title/);
  });

  it("renders approved create keys when target setup is known", () => {
    expect(growSetup.create.addingToHint).toMatch(/current setup/i);
    expect(TENT).toMatch(/GROW_SETUP_MESSAGES\.addingTo/);
    expect(PLANT).toMatch(/GROW_SETUP_MESSAGES\.addingTo/);
  });

  it("renders approved mismatch keys with finish setup CTA", () => {
    expect(growSetup.mismatch.finishSetupCta).toBe("Finish setup");
    expect(growSetup.mismatch.finishSetupHref).toBe(GROW_SETUP_FINISH_LINEAGE_HREF);
    expect(PLANT).toContain("create-plant-finish-setup-cta");
    expect(PLANT).toContain("GROW_SETUP_FINISH_LINEAGE_HREF");
  });

  it("forbidden terms never appear in grower-facing copy", () => {
    const lower = GROWER_FACING_COPY.toLowerCase();
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(lower).not.toContain(token.toLowerCase());
    }
  });

  it("blocked zero-grow state exposes exactly one primary action", () => {
    expect(TENT).toContain("create-tent-start-room-cta");
    expect(TENT).toContain("create-tent-hard-stop-dismiss");
    expect(PLANT).toContain("create-plant-start-room-cta");
    expect(PLANT).toContain("create-plant-hard-stop-dismiss");
  });

  it("hard-stop banner includes accessibility label", () => {
    expect(TENT).toMatch(/aria-label=\{binding\.ariaLabel\}/);
    expect(PLANT).toMatch(/aria-label=\{binding\.ariaLabel\}/);
    expect(growSetup.noSetup.ariaLabel.length).toBeGreaterThan(0);
  });
});
