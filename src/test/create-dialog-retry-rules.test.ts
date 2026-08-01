import { describe, it, expect } from "vitest";
import {
  CREATE_BINDING_RETRY_COOLDOWN_MS,
  evaluateCreateBindingRetryGate,
  recordCreateBindingRetryAttempt,
  shouldStartCreateBindingRetry,
} from "@/lib/createDialogRetryRules";

describe("createDialogRetryRules", () => {
  it("allows first attempt with no prior click", () => {
    const g = evaluateCreateBindingRetryGate({
      lastAttemptAtMs: null,
      nowMs: 10_000,
    });
    expect(g.allowed).toBe(true);
    expect(g.disabled).toBe(false);
    expect(g.reason).toBe("ok");
    expect(g.remainingMs).toBe(0);
  });

  it("blocks while in flight even if cooldown elapsed", () => {
    const g = evaluateCreateBindingRetryGate({
      lastAttemptAtMs: 0,
      nowMs: 50_000,
      inFlight: true,
    });
    expect(g.allowed).toBe(false);
    expect(g.disabled).toBe(true);
    expect(g.reason).toBe("in_flight");
  });

  it("enforces cooldown after a recorded attempt", () => {
    const t0 = 1_000_000;
    const recorded = recordCreateBindingRetryAttempt(t0);
    const mid = evaluateCreateBindingRetryGate({
      lastAttemptAtMs: recorded,
      nowMs: t0 + CREATE_BINDING_RETRY_COOLDOWN_MS - 1,
    });
    expect(mid.allowed).toBe(false);
    expect(mid.reason).toBe("cooldown");
    expect(mid.remainingMs).toBe(1);
    expect(shouldStartCreateBindingRetry({ lastAttemptAtMs: recorded, nowMs: t0 + 100 })).toBe(
      false,
    );

    const after = evaluateCreateBindingRetryGate({
      lastAttemptAtMs: recorded,
      nowMs: t0 + CREATE_BINDING_RETRY_COOLDOWN_MS,
    });
    expect(after.allowed).toBe(true);
    expect(after.remainingMs).toBe(0);
    expect(
      shouldStartCreateBindingRetry({
        lastAttemptAtMs: recorded,
        nowMs: t0 + CREATE_BINDING_RETRY_COOLDOWN_MS,
      }),
    ).toBe(true);
  });

  it("respects custom cooldownMs", () => {
    const g = evaluateCreateBindingRetryGate({
      lastAttemptAtMs: 100,
      nowMs: 250,
      cooldownMs: 200,
    });
    expect(g.allowed).toBe(false);
    expect(g.remainingMs).toBe(50);
  });
});
