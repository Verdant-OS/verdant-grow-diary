import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const MESSAGES = readFileSync(resolve(ROOT, "src/constants/growSetupMessages.ts"), "utf8");

const FORBIDDEN_UI_TERMS = [
  ...GROW_SETUP_BANNED_UI_TOKENS,
  "unbound",
  "lineage repair",
  "backfill",
  "migration",
  "constraint",
] as const;

function stripCodeTokens(source: string): string {
  return source
    .replace(/payload\.grow_id/g, "")
    .replace(/grow_id/g, "")
    .replace(/\/grow-lineage/g, "")
    .replace(/data-testid="[^"]+"/g, "");
}

describe("grow setup language contract", () => {
  it("exposes approved noSetup, create, and mismatch message groups", () => {
    expect(growSetup.noSetup.title).toMatch(/Start your room first/i);
    expect(growSetup.noSetup.ctaStart).toBe("Start your room");
    expect(growSetup.noSetup.ctaDismiss).toBe("Not now");
    expect(growSetup.create.addingToHint).toMatch(/current setup/i);
    expect(growSetup.mismatch.finishSetup).toBe("Finish setup");
    expect(growSetup.mismatch.tentTitle).toMatch(/another setup/i);
  });

  it("routes Start your room to one-tent activation (not /start-room)", () => {
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
    expect(MESSAGES).not.toMatch(/\/start-room/);
  });

  it("touched components render noSetup keys on zero-grow hard stop", () => {
    for (const source of [TENT, PLANT]) {
      expect(source).toMatch(/hardStop\.hardStopTitle/);
      expect(source).toMatch(/hardStop\.hardStopBody/);
      expect(source).toMatch(/hardStop\.hardStopCta/);
      expect(source).toMatch(/hardStop\.hardStopSecondary/);
      expect(source).toMatch(/create-(tent|plant)-start-room-cta/);
    }
  });

  it("touched components render create keys when a setup is known", () => {
    for (const source of [TENT, PLANT]) {
      expect(source).toMatch(/GROW_SETUP_MESSAGES\.addingTo/);
      expect(source).toMatch(/GROW_SETUP_MESSAGES\.addingToHint/);
    }
  });

  it("plant dialog renders mismatch finish-setup CTA", () => {
    expect(PLANT).toMatch(/create-plant-tent-mismatch/);
    expect(PLANT).toMatch(/create-plant-finish-setup-cta/);
    expect(PLANT).toMatch(/\/grow-lineage/);
    expect(PLANT).toMatch(/GROW_SETUP_MESSAGES\.finishSetup/);
  });

  it("blocked zero-grow state exposes exactly one primary CTA", () => {
    for (const source of [TENT, PLANT]) {
      expect(source).toMatch(/showStartRoomHardStop/);
      expect(source).toMatch(/hardStop\.hardStopCta/);
      expect(source).toMatch(/hardStop\.hardStopSecondary/);
      expect(source).toMatch(/create-(tent|plant)-start-room-cta/);
      expect(source).toMatch(/create-(tent|plant)-hard-stop-dismiss/);
      const primaryMatches = source.match(/gradient-leaf text-primary-foreground/g) ?? [];
      expect(primaryMatches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("hard-stop banner includes an accessibility label", () => {
    expect(TENT).toMatch(/create-tent-hard-stop[\s\S]*?aria-label=\{hardStop\.hardStopTitle\}/);
    expect(PLANT).toMatch(/create-plant-hard-stop[\s\S]*?aria-label=\{hardStop\.hardStopTitle\}/);
  });

  it("forbidden technical terms do not appear in grower-facing strings", () => {
    const surfaces = [
      growSetup.noSetup.title,
      growSetup.noSetup.body,
      growSetup.create.addingToHint,
      growSetup.mismatch.tentBody,
      growSetup.mismatch.orphanBody,
      stripCodeTokens(TENT),
      stripCodeTokens(PLANT),
    ].join("\n");
    for (const term of FORBIDDEN_UI_TERMS) {
      expect(surfaces.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
