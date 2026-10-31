import { describe, expect, it, vi } from "vitest";
import {
  beginQuickLogSubmit,
  buildQuickLogSheetSubmissionSnapshot,
  createQuickLogSubmitGuard,
  createQuickLogSubmitGuardState,
  decideQuickLogSubmit,
  fingerprintQuickLogSubmission,
  finishQuickLogSubmit,
  isQuickLogSaveBusy,
} from "@/lib/quickLogDuplicateSubmitGuard";

describe("fingerprintQuickLogSubmission", () => {
  it("treats null and undefined as the same empty submission", () => {
    expect(fingerprintQuickLogSubmission(null)).toBe(fingerprintQuickLogSubmission(undefined));
    expect(fingerprintQuickLogSubmission(null)).toBe(fingerprintQuickLogSubmission(null));
  });

  it("ignores a restamped idempotency key and occurrence time", () => {
    const first = fingerprintQuickLogSubmission({
      p_action: "note",
      p_note: "Leaves look pale",
      p_target_id: "plant-1",
      p_idempotency_key: "quicklog-v2-aaaaaaaa",
      p_occurred_at: "2026-10-31T04:00:00.000Z",
    });
    const minuteLater = fingerprintQuickLogSubmission({
      p_note: "Leaves look pale",
      p_action: "note",
      p_target_id: "plant-1",
      p_idempotency_key: "quicklog-v2-bbbbbbbb",
      p_occurred_at: "2026-10-31T04:01:00.000Z",
    });
    expect(minuteLater).toBe(first);
  });

  it("changes when the note or target changes", () => {
    const base = { p_action: "note", p_note: "Leaves look pale", p_target_id: "plant-1" };
    expect(fingerprintQuickLogSubmission(base)).not.toBe(
      fingerprintQuickLogSubmission({ ...base, p_note: "Leaves look fine" }),
    );
    expect(fingerprintQuickLogSubmission(base)).not.toBe(
      fingerprintQuickLogSubmission({ ...base, p_target_id: "plant-2" }),
    );
  });

  it("does not mutate the payload it fingerprints", () => {
    const payload = { p_note: "kept", p_idempotency_key: "quicklog-v2-cccccccc" };
    fingerprintQuickLogSubmission(payload);
    expect(payload.p_idempotency_key).toBe("quicklog-v2-cccccccc");
  });
});

describe("decideQuickLogSubmit", () => {
  const note = { p_action: "note", p_note: "same" };

  it("begins from an empty or null guard", () => {
    expect(decideQuickLogSubmit(null, note).kind).toBe("begin");
    expect(decideQuickLogSubmit(createQuickLogSubmitGuardState(), undefined).kind).toBe("begin");
  });

  it("joins an in-flight save and returns a completed duplicate", () => {
    const fingerprint = fingerprintQuickLogSubmission(note);
    const inFlight = beginQuickLogSubmit(createQuickLogSubmitGuardState<string>(), fingerprint);
    expect(decideQuickLogSubmit(inFlight, { ...note, p_occurred_at: "later" }).kind).toBe(
      "in_flight",
    );
    const completed = finishQuickLogSubmit(inFlight, fingerprint, "saved-row", true);
    const decision = decideQuickLogSubmit(completed, note);
    expect(decision.kind).toBe("duplicate");
    if (decision.kind === "duplicate") expect(decision.result).toBe("saved-row");
  });

  it("forgets a failed attempt so the same payload can retry", () => {
    const fingerprint = fingerprintQuickLogSubmission(note);
    const inFlight = beginQuickLogSubmit(createQuickLogSubmitGuardState<string>(), fingerprint);
    const failed = finishQuickLogSubmit(inFlight, fingerprint, null, false);
    expect(failed.phase).toBe("idle");
    expect(decideQuickLogSubmit(failed, note).kind).toBe("begin");
  });
});

describe("createQuickLogSubmitGuard", () => {
  it("sends one network call for two taps of the same note, including a minute later", async () => {
    const guard = createQuickLogSubmitGuard<{ ok: boolean; reused?: boolean; id: string }>(() => ({
      ok: false,
      id: "blocked",
    }));
    let release: (value: { ok: true; id: string }) => void = () => {};
    const execute = vi.fn(
      () =>
        new Promise<{ ok: true; id: string }>((resolve) => {
          release = resolve;
        }),
    );
    const payload = {
      p_action: "note",
      p_note: "QA note",
      p_idempotency_key: "quicklog-v2-first-key",
      p_occurred_at: "2026-10-31T04:00:00.000Z",
    };

    const first = guard.run(payload, execute);
    const second = guard.run(
      {
        ...payload,
        p_idempotency_key: "quicklog-v2-second-key",
        p_occurred_at: "2026-10-31T04:01:00.000Z",
      },
      execute,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    release({ ok: true, id: "row-1" });
    await expect(first).resolves.toEqual({ ok: true, id: "row-1" });
    await expect(second).resolves.toEqual({ ok: true, id: "row-1" });

    const third = await guard.run(
      {
        ...payload,
        p_idempotency_key: "quicklog-v2-third-key",
        p_occurred_at: "2026-10-31T04:02:00.000Z",
      },
      execute,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(third).toEqual({ ok: true, reused: true, id: "row-1" });
  });

  it("allows a different note and a retry after failure", async () => {
    const guard = createQuickLogSubmitGuard<{ ok: boolean; reused?: boolean }>(() => ({
      ok: false,
    }));
    const execute = vi
      .fn<() => Promise<{ ok: boolean }>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await guard.run({ p_note: "first" }, execute);
    await guard.run({ p_note: "first" }, execute);
    await guard.run({ p_note: "second" }, execute);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not call execute when the blocked fallback is used without a flight", async () => {
    const guard = createQuickLogSubmitGuard<{ ok: boolean }>(() => ({ ok: false }));
    const state = beginQuickLogSubmit(createQuickLogSubmitGuardState<{ ok: boolean }>(), "stale");
    expect(state.phase).toBe("in_flight");
    const decision = decideQuickLogSubmit(state, { p_note: "other" });
    expect(decision.kind).toBe("in_flight");
    expect(guard.state.phase).toBe("idle");
  });
});

describe("sheet snapshot and save busy", () => {
  it("builds a null-safe snapshot and ignores a missing photo", () => {
    expect(buildQuickLogSheetSubmissionSnapshot(null)).toMatchObject({
      action: null,
      note: null,
      photo: null,
      video: null,
    });
    const withPhoto = buildQuickLogSheetSubmissionSnapshot({
      action: "note",
      note: "pale",
      photo: { name: "leaf.jpg", size: 10, type: "image/jpeg", lastModified: 1 },
    });
    const withoutPhoto = buildQuickLogSheetSubmissionSnapshot({ action: "note", note: "pale" });
    expect(fingerprintQuickLogSubmission(withPhoto)).not.toBe(
      fingerprintQuickLogSubmission(withoutPhoto),
    );
  });

  it("is busy while a save attempt is locked, and idle for null", () => {
    expect(isQuickLogSaveBusy(null)).toBe(false);
    expect(isQuickLogSaveBusy({})).toBe(false);
    expect(isQuickLogSaveBusy({ attemptLocked: true })).toBe(true);
    expect(isQuickLogSaveBusy({ saving: true, attemptLocked: false })).toBe(true);
  });
});
