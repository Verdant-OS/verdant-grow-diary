/**
 * Grow setup language contract — keys, forbidden terms, CTA counts, a11y.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  growSetup,
  GROW_SETUP_MESSAGES,
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_START_ROOM_HREF,
  GROW_SETUP_FINISH_SETUP_HREF,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [];
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe("grow setup language contract", () => {
  it("growSetup.noSetup keys are defined and grower-safe", () => {
    expect(growSetup.noSetup.title).toMatch(/Start your room first/i);
    expect(growSetup.noSetup.ctaStart).toBe("Start your room");
    expect(growSetup.noSetup.ctaDismiss).toBe("Not now");
    expect(growSetup.noSetup.body.length).toBeGreaterThan(10);
  });

  it("growSetup.create keys cover adding-to and loading copy", () => {
    expect(growSetup.create.addingToHint).toMatch(/current setup/i);
    expect(growSetup.create.addingTo("Test")).toBe("Adding to Test");
    expect(growSetup.create.pickSetupToast("tent")).toMatch(/tent/i);
  });

  it("growSetup.mismatch keys cover tent conflict states", () => {
    expect(growSetup.mismatch.differentSetupTitle).toMatch(/another setup/i);
    expect(growSetup.mismatch.missingSetupTitle).toBe("Finish setup");
    expect(growSetup.mismatch.finishSetupCta).toBe("Finish setup");
  });

  it("flat GROW_SETUP_MESSAGES mirrors nested growSetup copy", () => {
    expect(GROW_SETUP_MESSAGES.hardStopTitle).toBe(growSetup.noSetup.title);
    expect(GROW_SETUP_MESSAGES.finishSetup).toBe(growSetup.mismatch.finishSetupCta);
  });

  it("activation and finish-setup hrefs use existing routes only", () => {
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
    expect(GROW_SETUP_FINISH_SETUP_HREF).toBe("/grow-lineage");
    expect(GROW_SETUP_START_ROOM_HREF).not.toMatch(/start-room/);
  });

  it("forbidden-term scan across message constants", () => {
    const surfaces = collectStrings(growSetup).join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(surfaces.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("forbidden-term scan across create dialog grower-facing strings", () => {
    const messageSurfaces = [
      GROW_SETUP_MESSAGES.hardStopTitle,
      GROW_SETUP_MESSAGES.hardStopBody,
      GROW_SETUP_MESSAGES.tentMismatchTitle,
      GROW_SETUP_MESSAGES.tentMismatchBody,
      GROW_SETUP_MESSAGES.tentOrphanTitle,
      GROW_SETUP_MESSAGES.tentOrphanBody,
      GROW_SETUP_MESSAGES.finishSetup,
    ].join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(messageSurfaces.toLowerCase()).not.toContain(token.toLowerCase());
    }
    expect(TENT).not.toMatch(/You need a grow_id/);
  });

  it("hard-stop banners expose accessibility labels", () => {
    expect(TENT).toMatch(/aria-label=\{hardStop\.hardStopAriaLabel\}/);
    expect(PLANT).toMatch(/aria-label=\{hardStop\.hardStopAriaLabel\}/);
  });

  it("zero-grow hard-stop has exactly one primary CTA in each dialog", () => {
    const tentPrimary = (TENT.match(/create-tent-start-room-cta/g) ?? []).length;
    const plantPrimary = (PLANT.match(/create-plant-start-room-cta/g) ?? []).length;
    expect(tentPrimary).toBe(1);
    expect(plantPrimary).toBe(1);
  });

  it("mismatch state exposes Finish setup link to grow-lineage", () => {
    expect(PLANT).toMatch(/create-plant-finish-setup-cta/);
    expect(PLANT).toMatch(/GROW_SETUP_FINISH_SETUP_HREF|\/grow-lineage/);
  });
});
