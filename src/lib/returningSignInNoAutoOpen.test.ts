import { describe, expect, it } from "vitest";
import { OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH } from "@/constants/oreozGelonadeExperience";
import { readQuickLogStartEventType } from "@/lib/globalSearchQuickLogFallbackRules";
import { readGuidePhenoQuickLogPrefill } from "@/lib/guidePhenoQuickLogHandoffRules";
import {
  resolveReturningQuickLogStartTarget,
  resolveReturningSignInRoute,
} from "@/lib/quickLogStartScreenTargetRules";
import { consumeQuickLogStartIntent } from "@/lib/startScreenPreferences";
import { plantDetailQuickLogHref } from "@/lib/startYourRoomRules";

const PLANT = "11111111-1111-4111-8111-111111111111";
const TENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const room = {
  plants: [
    {
      id: PLANT,
      tent_id: TENT,
      grow_id: GROW,
      is_archived: false,
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  ],
  tents: [{ id: TENT, grow_id: GROW, is_archived: false }],
  grows: [{ id: GROW, is_archived: false }],
};

describe("ordinary sign-in does not auto-open Quick Log", () => {
  it("lands on the active plant without an open marker", () => {
    const target = resolveReturningQuickLogStartTarget(room);
    const route = resolveReturningSignInRoute({ savedChoice: "quickLog", ...room });

    expect(route).toBe(`/plants/${PLANT}`);
    expect(route).not.toContain("open=quick-log");
    expect(target.opensQuickLog).toBe(false);
    expect(target.growId).toBe(GROW);
    expect(consumeQuickLogStartIntent(route.split("?")[1] ?? "")).toBeNull();
  });

  it("still treats explicit Watering, guide, and Symptom Check links as open intents", () => {
    const symptom = plantDetailQuickLogHref(PLANT);
    const watering = "/dashboard?open=quick-log&type=watering";
    const guide = OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH;

    expect(symptom).toBe(`/plants/${PLANT}?open=quick-log`);
    expect(consumeQuickLogStartIntent(symptom.split("?")[1] ?? "")).toBe("");
    expect(readQuickLogStartEventType(watering.split("?")[1])).toBe("watering");
    expect(consumeQuickLogStartIntent(watering.split("?")[1] ?? "")).toBe("");
    expect(readGuidePhenoQuickLogPrefill(guide.split("?")[1])).toMatchObject({
      eventType: "observation",
      source: "oreoz-vs-gelonade-guide",
    });
    expect(consumeQuickLogStartIntent(guide.split("?")[1] ?? "")).toBe("");
  });
});
