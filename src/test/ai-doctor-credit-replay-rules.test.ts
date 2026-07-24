import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_RESULT_PENDING_WINDOW_MS,
  AI_DOCTOR_SPEND_TIMESTAMP_FUTURE_SKEW_MS,
  classifyAiDoctorCreditSpend,
  isConfirmedAiDoctorCreditRefund,
  parseAiDoctorResultAttachment,
} from "@/lib/aiDoctorCreditReplayRules";

const SPEND_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-07-19T05:00:00.000Z");

describe("AI Doctor credit replay rules", () => {
  it("accepts a fresh spend only with a valid spend UUID", () => {
    expect(
      classifyAiDoctorCreditSpend({ ok: true, status: "spent", spend_id: SPEND_ID }, NOW),
    ).toEqual({ kind: "fresh", spendId: SPEND_ID });
    expect(
      classifyAiDoctorCreditSpend({ ok: true, status: "spent", spend_id: "not-a-uuid" }, NOW),
    ).toEqual({ kind: "invalid" });
  });

  it("passes a present cached value to the feature validator", () => {
    const result = { summary: "bounded" };
    expect(
      classifyAiDoctorCreditSpend(
        { ok: true, status: "replayed", spend_id: SPEND_ID, result },
        NOW,
      ),
    ).toEqual({ kind: "cached", spendId: SPEND_ID, result });
  });

  it("keeps a resultless replay pending strictly inside the 60-second window", () => {
    const response = (ageMs: number) => ({
      ok: true,
      status: "replayed",
      spend_id: SPEND_ID,
      result: null,
      spend_created_at: new Date(NOW - ageMs).toISOString(),
    });

    expect(classifyAiDoctorCreditSpend(response(0), NOW)).toEqual({
      kind: "pending",
      spendId: SPEND_ID,
    });
    expect(
      classifyAiDoctorCreditSpend(response(AI_DOCTOR_RESULT_PENDING_WINDOW_MS - 1), NOW),
    ).toEqual({ kind: "pending", spendId: SPEND_ID });
    expect(classifyAiDoctorCreditSpend(response(AI_DOCTOR_RESULT_PENDING_WINDOW_MS), NOW)).toEqual({
      kind: "stale",
      spendId: SPEND_ID,
    });
  });

  it("prefers the database-provided spend age over timestamp fallback", () => {
    const base = {
      ok: true,
      status: "replayed",
      spend_id: SPEND_ID,
      result: null,
    };
    expect(
      classifyAiDoctorCreditSpend(
        {
          ...base,
          spend_age_ms: AI_DOCTOR_RESULT_PENDING_WINDOW_MS - 1,
          spend_created_at: new Date(NOW - AI_DOCTOR_RESULT_PENDING_WINDOW_MS * 2).toISOString(),
        },
        NOW,
      ),
    ).toEqual({ kind: "pending", spendId: SPEND_ID });
    expect(
      classifyAiDoctorCreditSpend(
        {
          ...base,
          spend_age_ms: AI_DOCTOR_RESULT_PENDING_WINDOW_MS,
          spend_created_at: new Date(NOW - 1).toISOString(),
        },
        NOW,
      ),
    ).toEqual({ kind: "stale", spendId: SPEND_ID });
  });

  it("allows bounded timestamp future skew and fails larger skew closed to stale", () => {
    const response = (futureMs: number) => ({
      ok: true,
      status: "replayed",
      spend_id: SPEND_ID,
      result: null,
      spend_created_at: new Date(NOW + futureMs).toISOString(),
    });

    expect(
      classifyAiDoctorCreditSpend(response(AI_DOCTOR_SPEND_TIMESTAMP_FUTURE_SKEW_MS), NOW),
    ).toEqual({ kind: "pending", spendId: SPEND_ID });
    expect(
      classifyAiDoctorCreditSpend(response(AI_DOCTOR_SPEND_TIMESTAMP_FUTURE_SKEW_MS + 1), NOW),
    ).toEqual({ kind: "stale", spendId: SPEND_ID });
  });

  it("fails missing and malformed replay ages closed to stale", () => {
    for (const spend_created_at of [undefined, "bad-date"]) {
      expect(
        classifyAiDoctorCreditSpend(
          {
            ok: true,
            status: "replayed",
            spend_id: SPEND_ID,
            result: null,
            spend_created_at,
          },
          NOW,
        ),
      ).toEqual({ kind: "stale", spendId: SPEND_ID });
    }
  });

  it("rejects every replay without a valid spend UUID before cache or age handling", () => {
    for (const response of [
      { ok: true, status: "replayed", result: { summary: "cached" } },
      { ok: true, status: "replayed", result: null, spend_age_ms: 1 },
      {
        ok: true,
        status: "replayed",
        spend_id: "not-a-uuid",
        result: null,
        spend_age_ms: AI_DOCTOR_RESULT_PENDING_WINDOW_MS + 1,
      },
    ]) {
      expect(classifyAiDoctorCreditSpend(response, NOW)).toEqual({ kind: "invalid" });
    }
  });

  it("separates refunded, denied, conflicts, and other invalid responses", () => {
    expect(classifyAiDoctorCreditSpend({ ok: false, reason: "spend_refunded" }, NOW)).toEqual({
      kind: "refunded",
    });
    expect(
      classifyAiDoctorCreditSpend({ ok: true, status: "invalid", reason: "spend_refunded" }, NOW),
    ).toEqual({ kind: "refunded" });
    expect(
      classifyAiDoctorCreditSpend({ ok: false, status: "denied", reason: "limit" }, NOW),
    ).toEqual({
      kind: "denied",
    });
    expect(
      classifyAiDoctorCreditSpend(
        { ok: false, status: "invalid", reason: "idempotency_key_conflict" },
        NOW,
      ),
    ).toEqual({ kind: "conflict" });
    expect(classifyAiDoctorCreditSpend({ ok: false, reason: "limit" }, NOW)).toEqual({
      kind: "invalid",
    });
    expect(
      classifyAiDoctorCreditSpend({ ok: false, status: "invalid", reason: "database" }, NOW),
    ).toEqual({ kind: "invalid" });
    expect(classifyAiDoctorCreditSpend(null, NOW)).toEqual({ kind: "invalid" });
    expect(classifyAiDoctorCreditSpend({ ok: true, status: "mystery" }, NOW)).toEqual({
      kind: "invalid",
    });
  });

  it("is deterministic for the same response and injected clock", () => {
    const response = {
      ok: true,
      status: "replayed",
      spend_id: SPEND_ID,
      result: null,
      spend_created_at: new Date(NOW - 12_345).toISOString(),
    };
    expect(classifyAiDoctorCreditSpend(response, NOW)).toEqual(
      classifyAiDoctorCreditSpend(response, NOW),
    );
  });

  it("separates confirmed attachment, explicit rejection, and ambiguity", () => {
    expect(parseAiDoctorResultAttachment({ ok: true, status: "recorded" })).toBe("recorded");
    expect(parseAiDoctorResultAttachment({ ok: true, status: "replayed" })).toBe("replayed");
    expect(
      parseAiDoctorResultAttachment({
        ok: false,
        status: "invalid",
        reason: "result_conflict",
      }),
    ).toBe("rejected");
    expect(parseAiDoctorResultAttachment({ ok: false, status: "invalid" })).toBe("ambiguous");
    expect(parseAiDoctorResultAttachment({ status: "recorded" })).toBe("ambiguous");
    expect(parseAiDoctorResultAttachment({ ok: true, status: "unknown" })).toBe("ambiguous");
    expect(parseAiDoctorResultAttachment(null)).toBe("ambiguous");
    expect(parseAiDoctorResultAttachment({ ok: true, status: "recorded", result: {} })).toBe(
      "recorded",
    );
  });

  it("accepts only explicit refund confirmations", () => {
    expect(isConfirmedAiDoctorCreditRefund({ ok: true, status: "refunded" })).toBe(true);
    expect(isConfirmedAiDoctorCreditRefund({ ok: true, status: "replayed" })).toBe(true);
    expect(isConfirmedAiDoctorCreditRefund({ ok: false, status: "invalid" })).toBe(false);
    expect(isConfirmedAiDoctorCreditRefund(undefined)).toBe(false);
  });
});
