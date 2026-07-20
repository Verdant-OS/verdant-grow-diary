import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("structured Water routing static fences", () => {
  it("mounts exactly one always-present QuickLogV2Sheet in AppShell", () => {
    const source = read("src/components/AppShell.tsx");
    expect(source.match(/<QuickLogV2Sheet\b/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/mobileQuickLogTarget\s*\?\s*\(\s*<QuickLogV2Sheet/);
    expect(source).toContain("isQuickLogV2OpenIntent");
  });

  it("removes manual_water from the canonical activity constants, rules, and save hook", () => {
    for (const path of [
      "src/constants/quickLogActivityTypes.ts",
      "src/lib/quickLogActivityRules.ts",
      "src/hooks/useQuickLogActivitySave.ts",
    ]) {
      expect(read(path), path).not.toContain("manual_water");
    }
  });

  it("hides ordinary legacy Water selection and guards ordinary watering before save", () => {
    expect(read("src/components/EventTypeSelector.tsx")).toContain(
      't.value !== "watering"',
    );
    const source = read("src/components/QuickLog.tsx");
    expect(source).toContain("isVerifiedPublicStarterWateringHandoff");
    expect(source).toContain("ORDINARY_LEGACY_WATERING_BLOCKED_COPY");
    expect(source).toContain("onBeforeStructuredWaterOpen");
  });

  it("removes every HyperLog Water affordance without adding a writer", () => {
    const modal = read("src/components/HyperLogModal.tsx");
    const global = read("src/components/GlobalFastAddButton.tsx");
    expect(modal).not.toMatch(/id:\s*["']water["']/);
    expect(global).not.toContain('"water", "feed"');
    expect(modal).not.toMatch(/quicklog_save_|writeQuickLogWatering|\.rpc\s*\(/);
  });

  it("does not intercept or strip the public starter rich prefill event", () => {
    const source = read("src/components/PublicQuickLogHandoffCard.tsx");
    expect(source).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(source).toContain("mapDraftToQuickLogPrefill");
    expect(source).not.toContain("QUICK_LOG_V2_OPEN_EVENT");
    for (const field of [
      "wateringVolumeMl",
      "note",
      "publicStarterDraftId",
      "publicStarterDraftUpdatedAt",
      "suppressPlantDefault",
    ]) {
      expect(read("src/lib/publicQuickLogHandoffRules.ts")).toContain(field);
    }
  });
});
