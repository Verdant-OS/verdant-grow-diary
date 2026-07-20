import { describe, it, expect } from "vitest";
import { evaluateRelease } from "@/lib/genetics/quarantineRules";

const episode = {
  subjectType: "plant",
  subjectId: "plant-1",
  target: "HLVd",
  status: "open",
  openedAt: "2026-07-10T14:00:00Z",
  reopenedAt: null,
};

const negForSubject = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  subjectType: "plant",
  subjectId: "plant-1",
  target: "HLVd",
  result: "negative",
  collectedDate: "2026-07-12",
  ...over,
});

describe("quarantine clearance preview (advisory mirror of the RPC)", () => {
  it("refuses when the episode is not open", () => {
    const r = evaluateRelease({ ...episode, status: "released" }, [negForSubject()]);
    expect(r).toEqual({ ok: false, reason: "illegal_transition" });
  });

  it("requires a qualifying negative", () => {
    const r = evaluateRelease(episode, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_qualifying_negative");
  });

  it("will not clear from another subject's certificate", () => {
    const r = evaluateRelease(episode, [negForSubject({ subjectId: "plant-OTHER" })]);
    expect(r.ok).toBe(false);
  });

  it("will not clear from a negative collected before the open", () => {
    const r = evaluateRelease(episode, [negForSubject({ collectedDate: "2026-07-01" })]);
    expect(r.ok).toBe(false);
  });

  it("allows a same-day negative (>= effective open, UTC)", () => {
    const r = evaluateRelease(episode, [negForSubject({ collectedDate: "2026-07-10" })]);
    expect(r.ok).toBe(true);
  });

  it("will not clear from a superseded negative", () => {
    const r = evaluateRelease(episode, [
      negForSubject({ id: "s1" }),
      { id: "s2", subjectType: "plant", subjectId: "plant-1", target: "HLVd", result: "positive", collectedDate: "2026-07-13", supersedesId: "s1" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("is blocked by newer/equal contradicting evidence", () => {
    const r = evaluateRelease(episode, [
      negForSubject({ id: "s1", collectedDate: "2026-07-12" }),
      { id: "s3", subjectType: "plant", subjectId: "plant-1", target: "HLVd", result: "inconclusive", collectedDate: "2026-07-14" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("contradicting_or_newer_evidence");
  });

  it("clears with a current, matching, uncontradicted negative", () => {
    const r = evaluateRelease(episode, [negForSubject()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.screeningId).toBe("s1");
  });

  it("requires clearance evidence after a reopen", () => {
    const reopened = { ...episode, reopenedAt: "2026-07-20T09:00:00Z" };
    // The old negative (2026-07-12) predates the reopen → cannot clear.
    const stale = evaluateRelease(reopened, [negForSubject({ collectedDate: "2026-07-12" })]);
    expect(stale.ok).toBe(false);
    const fresh = evaluateRelease(reopened, [negForSubject({ id: "s9", collectedDate: "2026-07-21" })]);
    expect(fresh.ok).toBe(true);
  });
});
