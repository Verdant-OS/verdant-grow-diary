import { describe, expect, it } from "vitest";

import { DETERMINISTIC_AI_DOCTOR_RESPONSE } from "../../e2e/helpers/oneTentAiDoctorResponse";
import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

describe("authenticated One-Tent AI Doctor boundary response", () => {
  it("stays inside the same fail-closed contract used by the product", () => {
    expect(validateAiDoctorReviewResult(DETERMINISTIC_AI_DOCTOR_RESPONSE)).toEqual({
      ok: true,
      result: DETERMINISTIC_AI_DOCTOR_RESPONSE,
    });
  });
});
