import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAddingToSetup, formatMismatchBody, growSetup } from "@/constants/growSetupMessages";
import { buildHardStopView, START_YOUR_ROOM_HREF } from "@/lib/createDialogGrowBindingRules";

const ROOT = resolve(__dirname, "../..");
const FORBIDDEN = /\b(?:grow_id|orphan|unbound|lineage repair|backfill|migration|constraint)\b/i;

const TOUCHED = [
  "src/constants/growSetupMessages.ts",
  "src/lib/createDialogGrowBindingRules.ts",
  "src/components/CreateTentDialog.tsx",
  "src/components/CreatePlantDialog.tsx",
  "docs/product/grow-binding-language.md",
] as const;

describe("grow setup language contract", () => {
  it("exposes approved growSetup.noSetup.*, create.*, and mismatch.* keys", () => {
    expect(growSetup.noSetup.title).toBeTruthy();
    expect(growSetup.noSetup.body).toBeTruthy();
    expect(growSetup.noSetup.ctaStart).toBe("Start your room");
    expect(growSetup.noSetup.ctaDismiss).toBe("Not now");
    expect(growSetup.noSetup.bannerAriaLabel).toBeTruthy();

    expect(growSetup.create.loadingTitle).toBeTruthy();
    expect(growSetup.create.loadingBody).toBeTruthy();
    expect(growSetup.create.knownBody).toBeTruthy();
    expect(growSetup.create.fallbackName).toBe("Current setup");

    expect(growSetup.mismatch.title).toBeTruthy();
    expect(growSetup.mismatch.ctaFinish).toBe("Finish setup");
    expect(growSetup.mismatch.finishHref).toBe("/grow-lineage");
    expect(growSetup.mismatch.bannerAriaLabel).toBeTruthy();
  });

  it("renders approved copy on each blocked create state", () => {
    const zero = buildHardStopView({
      targetGrow: null,
      growCount: 0,
      growsLoading: false,
    });
    expect(zero.title).toBe(growSetup.noSetup.title);
    expect(zero.primaryLabel).toBe(growSetup.noSetup.ctaStart);
    expect(zero.secondaryLabel).toBe(growSetup.noSetup.ctaDismiss);
    expect(zero.startRoomHref).toBe(START_YOUR_ROOM_HREF);
    expect(zero.ariaLabel).toBe(growSetup.noSetup.bannerAriaLabel);

    const loading = buildHardStopView({
      targetGrow: null,
      growCount: 0,
      growsLoading: true,
    });
    expect(loading.title).toBe(growSetup.create.loadingTitle);
    expect(loading.ariaLabel).toBe(growSetup.create.loadingAriaLabel);

    const choose = buildHardStopView({
      targetGrow: null,
      growCount: 2,
      growsLoading: false,
    });
    expect(choose.title).toBe(growSetup.create.chooseTitle);
    expect(choose.ariaLabel).toBe(growSetup.create.chooseAriaLabel);

    expect(formatAddingToSetup("Spring Veg")).toContain("Spring Veg");
    expect(formatMismatchBody("Spring Veg")).toContain("Spring Veg");
  });

  it("enforces exactly one primary action per blocked state", () => {
    const zero = buildHardStopView({
      targetGrow: null,
      growCount: 0,
      growsLoading: false,
    });
    expect(zero.primaryLabel).toBe(growSetup.noSetup.ctaStart);
    expect(zero.secondaryLabel).toBe(growSetup.noSetup.ctaDismiss);

    expect(growSetup.mismatch.ctaFinish).toBe("Finish setup");
    expect(Object.keys(growSetup.mismatch).filter((k) => k.startsWith("cta"))).toEqual([
      "ctaFinish",
    ]);
  });

  it("keeps hard-stop accessibility labels present", () => {
    for (const view of [
      buildHardStopView({ targetGrow: null, growCount: 0, growsLoading: true }),
      buildHardStopView({ targetGrow: null, growCount: 0, growsLoading: false }),
      buildHardStopView({ targetGrow: null, growCount: 1, growsLoading: false }),
    ]) {
      expect(view.ariaLabel.trim().length).toBeGreaterThan(0);
    }
    expect(growSetup.mismatch.bannerAriaLabel.trim().length).toBeGreaterThan(0);
  });

  it("scans grower-facing sources for forbidden implementation terms", () => {
    const messagesBlob = [
      JSON.stringify(growSetup),
      formatAddingToSetup("Spring Veg"),
      formatMismatchBody("Spring Veg"),
    ].join("\n");
    expect(messagesBlob).not.toMatch(FORBIDDEN);

    for (const relative of TOUCHED) {
      const source = readFileSync(resolve(ROOT, relative), "utf8");
      // Strip code identifiers that are allowed in implementation files, then
      // scan string literals / markdown prose for grower-facing leakage.
      const stringLiterals = [...source.matchAll(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g)].map(
        (match) => match[0],
      );
      const prose =
        relative.endsWith(".md") || relative.endsWith("growSetupMessages.ts")
          ? source
          : stringLiterals.join("\n");

      // grow_id is an insert-field identifier in components; ignore bare
      // identifier-only occurrences there by only scanning quoted grower copy
      // for components, and full message/docs files above.
      if (relative.endsWith("growSetupMessages.ts") || relative.endsWith(".md")) {
        // Docs may mention forbidden terms in the "Forbidden" section — exclude
        // that list by checking grower-facing constant values only for messages.
        if (relative.endsWith("growSetupMessages.ts")) {
          expect(prose).not.toMatch(FORBIDDEN);
        }
      } else {
        const growerQuoted = stringLiterals
          .filter((literal) => !/payload\.grow_id|grow_id:|grow_id\s*=/.test(literal))
          .filter((literal) => !/^\s*["'`]grow_id["'`]\s*$/.test(literal))
          .join("\n");
        expect(growerQuoted).not.toMatch(
          /["'`][^"'`]*(?:orphan|unbound|lineage repair|backfill|migration|constraint)[^"'`]*["'`]/i,
        );
      }
    }

    const tent = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
    const plant = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
    expect(tent).toContain("aria-label={hardStop.ariaLabel}");
    expect(plant).toContain("aria-label={hardStop.ariaLabel}");
    expect(plant).toContain("aria-label={growSetup.mismatch.bannerAriaLabel}");
  });
});
