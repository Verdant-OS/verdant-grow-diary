/**
 * #2118 Codex P1/P2: an Environment Check keeps its readings only in
 * details.environment_check, which the correction RPC does not write. The
 * dialog must not offer sensor fields whose save would change nothing.
 */
import { describe, expect, it } from "vitest";
import {
  correctionValuePropsFromDiaryDetails,
  correctionValuesForTimelineDiaryEntry,
} from "@/lib/quick-log/quickLogRevisionRules";

const environmentCheck = {
  event_type: "environment",
  environment_check: { temp_c: 24, humidity_pct: 55 },
};

describe("Environment Check envelope corrections", () => {
  it("offers no sensor fields when readings live only in environment_check", () => {
    expect(correctionValuePropsFromDiaryDetails(environmentCheck)).toBeNull();
    expect(
      correctionValuePropsFromDiaryDetails({
        ...environmentCheck,
        event_type: "environment_check",
      }),
    ).toBeNull();
    expect(
      correctionValuesForTimelineDiaryEntry({
        details: environmentCheck,
        plant_id: "plant-a",
        entry_at: "2026-10-20T02:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("still offers the stored sensor_snapshot values the RPC can write", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        ...environmentCheck,
        sensor_snapshot: { metrics: { temperature_c: 24, humidity_pct: 55 } },
      }),
    ).toEqual({ kind: "sensor", sensor: { temperature_c: 24, humidity_pct: 55 } });
  });
});
