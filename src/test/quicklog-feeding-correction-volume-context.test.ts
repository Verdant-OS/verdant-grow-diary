import { describe, expect, it } from "vitest";

import {
  correctionValuePropsFromDiaryDetails,
  correctionValuesForTimelineAction,
} from "@/lib/quick-log/quickLogRevisionRules";

describe("feeding correction volume in generic contexts", () => {
  it("returns the flat watering_amount_ml beside the dose", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "feeding",
        watering_amount_ml: 750,
        feeding: { products: [{ name: "Grow", amount: 3, unit: "ml" }] },
      }),
    ).toEqual({ kind: "feeding", doseAmount: 3, volumeMl: 750 });
  });

  it("returns the structured feeding volume beside the dose for a timeline action", () => {
    expect(
      correctionValuesForTimelineAction({
        kind: "feed",
        aiDoctorPhase1Evidence: {
          details: {
            event_type: "feeding",
            feeding: {
              volume_ml: 400,
              products: [{ name: "Grow", amount: 2, unit: "ml" }],
            },
          },
        },
      }),
    ).toEqual({ kind: "feeding", doseAmount: 2, volumeMl: 400 });
  });
});
