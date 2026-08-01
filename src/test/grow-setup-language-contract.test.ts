import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROW_SETUP_BANNED_UI_TOKENS,
  GROW_SETUP_FINISH_SETUP_HREF,
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
} from "@/constants/growSetupMessages";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
const MSG = readFileSync(resolve(ROOT, "src/constants/growSetupMessages.ts"), "utf8");
const DOCS = readFileSync(resolve(ROOT, "docs/product/grow-binding-language.md"), "utf8");

function collectGrowerFacingCopy(): string {
  return [
    growSetup.noSetup.title,
    growSetup.noSetup.body,
    growSetup.noSetup.ctaStart,
    growSetup.noSetup.ctaDismiss,
    growSetup.create.addingToHint,
    growSetup.create.loadingToast,
    growSetup.create.pickSetupToast("tent"),
    growSetup.create.pickSetupToast("plant"),
    growSetup.create.genericSetupLabel,
    growSetup.mismatch.differentTitle,
    growSetup.mismatch.differentBody,
    growSetup.mismatch.missingSetupTitle,
    growSetup.mismatch.missingSetupBody,
    growSetup.mismatch.finishSetup,
    GROW_SETUP_MESSAGES.hardStopTitle,
    GROW_SETUP_MESSAGES.hardStopBody,
    GROW_SETUP_MESSAGES.addingTo("Spring"),
    GROW_SETUP_MESSAGES.readErrorTitle,
    GROW_SETUP_MESSAGES.readErrorBody,
    GROW_SETUP_MESSAGES.tentPendingBody,
    GROW_SETUP_MESSAGES.tentUnavailableBody,
  ].join("\n");
}

describe("growSetup language contract", () => {
  it("exposes approved growSetup.noSetup.*, create.*, and mismatch.* keys", () => {
    expect(growSetup.noSetup.ctaStart).toBe("Start your room");
    expect(growSetup.noSetup.ctaDismiss).toBe("Not now");
    expect(growSetup.create.addingToHint).toMatch(/current setup/i);
    expect(growSetup.mismatch.finishSetup).toBe("Finish setup");
    expect(GROW_SETUP_START_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
    expect(GROW_SETUP_FINISH_SETUP_HREF).toBe("/grow-lineage");
    expect(MSG).toMatch(/noSetup:/);
    expect(MSG).toMatch(/create:/);
    expect(MSG).toMatch(/mismatch:/);
    expect(DOCS).toMatch(/growSetup\.noSetup/);
    expect(DOCS).toMatch(/\/grow-lineage/);
  });

  it("renders hard-stop / create / mismatch copy on each touched dialog state", () => {
    expect(TENT).toMatch(/showStartRoomHardStop/);
    expect(TENT).toMatch(/create-tent-start-room-cta/);
    expect(TENT).toMatch(/create-tent-hard-stop-dismiss/);
    expect(PLANT).toMatch(/showStartRoomHardStop/);
    expect(PLANT).toMatch(/create-plant-tent-mismatch/);
    expect(PLANT).toMatch(/create-plant-finish-setup-cta/);
    expect(PLANT).toMatch(/finishSetupHref/);
  });

  it("forbidden-term scan across grower-facing copy and dialog string literals", () => {
    const copy = collectGrowerFacingCopy();
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(copy.toLowerCase()).not.toContain(token.toLowerCase());
    }
    // Dialog sources still use internal kind/column identifiers (e.g. kind:"orphan",
    // grow_id) from the #645 state machine — those are not grower-facing copy.
    const quoted = [
      ...TENT.matchAll(/["'`]([^"'`\\]|\\.)*["'`]/g),
      ...PLANT.matchAll(/["'`]([^"'`\\]|\\.)*["'`]/g),
    ]
      .map((m) => m[0])
      .filter(
        (s) =>
          !/^["'`](grow_id|orphan|mismatch|pending|ready|unavailable|loading|error)["'`]$/.test(s),
      )
      .join("\n");
    for (const token of GROW_SETUP_BANNED_UI_TOKENS) {
      expect(quoted.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("exactly one primary action per blocked state", () => {
    expect((TENT.match(/create-tent-start-room-cta/g) ?? []).length).toBe(1);
    expect((PLANT.match(/create-plant-start-room-cta/g) ?? []).length).toBe(1);
    expect(TENT).toMatch(/create-tent-hard-stop-dismiss/);
    expect(PLANT).toMatch(/create-plant-hard-stop-dismiss/);
    expect((PLANT.match(/create-plant-finish-setup-cta/g) ?? []).length).toBe(1);
  });

  it("accessibility label present on the hard-stop banner", () => {
    expect(TENT).toMatch(/data-testid="create-tent-hard-stop"[\s\S]*?aria-label=\{/);
    expect(PLANT).toMatch(/data-testid="create-plant-hard-stop"[\s\S]*?aria-label=\{/);
    expect(TENT).toMatch(/role="alert"/);
    expect(PLANT).toMatch(/role="alert"/);
  });
});
