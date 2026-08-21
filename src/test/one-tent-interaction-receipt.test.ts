// Tranche B+ PR-B0a — determinism contract for the One-Tent interaction
// counter (e2e/helpers/interactionCounter.ts).
//
// The counter is the measurement layer behind the efficiency baseline
// (docs/one-tent-loop-efficiency-baseline.md): every count it emits must be
// pure, deterministic, and serialization-stable, or before/after comparisons
// are meaningless. No clocks, no randomness, no I/O.
import { describe, expect, it } from "vitest";

import {
  INTERACTION_RECEIPT_PREFIX,
  createInteractionCounter,
  serializeInteractionCountReceipt,
} from "../../e2e/helpers/interactionCounter";

describe("one-tent interaction counter receipt", () => {
  it("pins the receipt prefix so CI logs stay greppable", () => {
    expect(INTERACTION_RECEIPT_PREFIX).toBe("ONE_TENT_INTERACTION_COUNT_JSON=");
  });

  it("counts every interaction kind exactly once per record call", () => {
    const counter = createInteractionCounter("s1a-plant-status");
    counter.recordClick();
    counter.recordClick();
    counter.recordClick();
    counter.recordFill();
    counter.recordKeypress();
    counter.recordReselection();
    counter.recordRouteTransition();
    counter.recordRpc("quicklog_save_manual");
    counter.recordRestWrite("POST");
    counter.recordRestWrite("PATCH");
    counter.recordRestWrite("DELETE");
    counter.recordPaidAiRequest();

    const receipt = counter.snapshot();
    expect(receipt).toEqual({
      schema_version: "1",
      scenario: "s1a-plant-status",
      status: "measured",
      clicks: 3,
      fills: 1,
      keypresses: 1,
      target_reselections: 1,
      route_transitions: 1,
      supabase_writes: {
        rest_post: 1,
        rest_patch: 1,
        rest_delete: 1,
        rpc: { quicklog_save_manual: 1 },
      },
      paid_ai_requests: 1,
    });
  });

  it("starts every scenario at zero", () => {
    const receipt = createInteractionCounter("empty").snapshot();
    expect(receipt.clicks).toBe(0);
    expect(receipt.fills).toBe(0);
    expect(receipt.keypresses).toBe(0);
    expect(receipt.target_reselections).toBe(0);
    expect(receipt.route_transitions).toBe(0);
    expect(receipt.supabase_writes).toEqual({
      rest_post: 0,
      rest_patch: 0,
      rest_delete: 0,
      rpc: {},
    });
    expect(receipt.paid_ai_requests).toBe(0);
  });

  it("serializes identically regardless of rpc recording order", () => {
    const first = createInteractionCounter("order");
    first.recordRpc("b_rpc");
    first.recordRpc("a_rpc");
    const second = createInteractionCounter("order");
    second.recordRpc("a_rpc");
    second.recordRpc("b_rpc");

    const a = serializeInteractionCountReceipt(first.snapshot());
    const b = serializeInteractionCountReceipt(second.snapshot());
    expect(a).toBe(b);
    expect(a.startsWith(INTERACTION_RECEIPT_PREFIX)).toBe(true);
  });

  it("emits a single line with no timestamps, ids, or tokens", () => {
    const counter = createInteractionCounter("single-line");
    counter.recordClick();
    const line = serializeInteractionCountReceipt(counter.snapshot());
    expect(line).not.toContain("\n");
    // Deterministic by construction: serializing twice is byte-identical.
    expect(serializeInteractionCountReceipt(counter.snapshot())).toBe(line);
    // No clock fields can exist — the receipt shape has none.
    expect(line).not.toMatch(/timestamp|created_at|now|token/i);
  });

  it("snapshots are detached copies — mutating one never corrupts the counter", () => {
    const counter = createInteractionCounter("detached");
    counter.recordRpc("quicklog_save_manual");
    const receipt = counter.snapshot();
    receipt.clicks = 99;
    receipt.supabase_writes.rpc["quicklog_save_manual"] = 99;
    const fresh = counter.snapshot();
    expect(fresh.clicks).toBe(0);
    expect(fresh.supabase_writes.rpc["quicklog_save_manual"]).toBe(1);
  });

  it("rejects a blank scenario name instead of measuring nothing", () => {
    expect(() => createInteractionCounter("")).toThrow();
    expect(() => createInteractionCounter("   ")).toThrow();
  });

  it("rejects unknown REST write verbs instead of miscounting them", () => {
    const counter = createInteractionCounter("verbs");
    expect(() => counter.recordRestWrite("GET" as never)).toThrow();
  });
});
