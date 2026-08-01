import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  growSetup,
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_MESSAGES,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("grow setup language contract", () => {
  it("exposes approved growSetup.noSetup, create, and mismatch keys", () => {
    expect(growSetup.noSetup.title).toMatch(/Start your room first/i);
    expect(growSetup.noSetup.ctaStart).toBe("Start your room");
    expect(growSetup.noSetup.ctaDismiss).toBe("Not now");
    expect(growSetup.create.addingTo("Spring")).toBe("Adding to Spring");
    expect(growSetup.mismatch.title).toMatch(/another setup/i);
    expect(growSetup.mismatch.ctaFinish).toBe("Finish setup");
  });

  it("forbids technical tokens in grower-facing strings only", () => {
    const growerCopy = [
      growSetup.noSetup.title,
      growSetup.noSetup.body,
      growSetup.create.hint,
      growSetup.mismatch.title,
      growSetup.mismatch.body,
      growSetup.mismatch.orphanTitle,
      growSetup.mismatch.orphanBody,
      GROW_SETUP_MESSAGES.hardStopTitle,
      GROW_SETUP_MESSAGES.tentOrphanBody,
      GROW_SETUP_MESSAGES.tentMismatchTitle,
    ].join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(growerCopy.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("renders exactly one primary action per blocked zero-grow state", () => {
    for (const source of [TENT, PLANT]) {
      const primaryMatches = source.match(/gradient-leaf text-primary-foreground/g) ?? [];
      expect(primaryMatches.length).toBeGreaterThanOrEqual(1);
      expect(source).toMatch(/hardStopSecondary|ctaDismiss|Not now/);
    }
  });

  it("includes an accessibility label on hard-stop banners", () => {
    expect(TENT).toMatch(/create-tent-hard-stop[\s\S]*aria-label=\{hardStop\.hardStopTitle\}/);
    expect(PLANT).toMatch(/create-plant-hard-stop[\s\S]*aria-label=\{hardStop\.hardStopTitle\}/);
  });
});
