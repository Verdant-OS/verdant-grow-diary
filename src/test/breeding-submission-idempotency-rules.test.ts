import { describe, expect, it, vi } from "vitest";
import {
  buildBreedingSubmissionFingerprint,
  resolveBreedingSubmissionAttempt,
  type BreedingSubmissionIdentity,
} from "@/lib/genetics/breedingSubmissionIdempotencyRules";

const baseInput: BreedingSubmissionIdentity = {
  growId: "grow-1",
  plantId: "plant-1",
  eventType: "pollination",
  tentId: "tent-1",
  method: null,
  intensity: null,
  details: {},
};

describe("breeding submission idempotency rules", () => {
  it("reuses one key for an unchanged logical submission", () => {
    const randomUuid = vi.fn(() => "uuid-1");
    const first = resolveBreedingSubmissionAttempt(null, baseInput, randomUuid);
    const retry = resolveBreedingSubmissionAttempt(first, { ...baseInput }, randomUuid);

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe("breeding-event-uuid-1");
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("mints a new key when any persisted field changes", () => {
    const randomUuid = vi.fn().mockReturnValueOnce("uuid-1").mockReturnValueOnce("uuid-2");
    const first = resolveBreedingSubmissionAttempt(null, baseInput, randomUuid);
    const changed = resolveBreedingSubmissionAttempt(
      first,
      {
        ...baseInput,
        eventType: "pollen_shed_observed",
        intensity: "heavy",
        details: { intensity: "heavy" },
      },
      randomUuid,
    );

    expect(changed.idempotencyKey).toBe("breeding-event-uuid-2");
    expect(changed.fingerprint).not.toBe(first.fingerprint);
  });

  it("is deterministic when detail insertion order differs", () => {
    const left = buildBreedingSubmissionFingerprint({
      ...baseInput,
      details: { method: "sts_spray", intensity: "light" },
    });
    const right = buildBreedingSubmissionFingerprint({
      ...baseInput,
      details: { intensity: "light", method: "sts_spray" },
    });

    expect(left).toBe(right);
  });
});
