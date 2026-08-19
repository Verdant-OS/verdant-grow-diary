// Tranche B+ slice B2a — the one idempotency-key policy (D-B2).
//
// One key identifies one LOGICAL submission. The server returns the original
// row with reused=true when it sees a key again, so the policy decides
// exactly one thing: for the payload about to be sent, do we mint, reuse, or
// rotate? Getting it wrong in either direction is a data defect —
// over-rotating writes duplicate rows, over-reusing silently drops a save.
import { describe, expect, it } from "vitest";

import {
  buildQuickLogSaveSignature,
  resolveQuickLogSaveKey,
  type QuickLogSaveKeyState,
} from "@/lib/quickLogSaveKeyPolicy";

let n = 0;
const mint = () => `minted-${++n}`;
beforeEachReset();
function beforeEachReset() {
  n = 0;
}

describe("buildQuickLogSaveSignature", () => {
  it("is stable across key order — reordering fields is not an edit", () => {
    expect(buildQuickLogSaveSignature({ a: 1, b: 2 })).toBe(
      buildQuickLogSaveSignature({ b: 2, a: 1 }),
    );
  });

  it("changes when a meaningful value changes", () => {
    expect(buildQuickLogSaveSignature({ note: "dry" })).not.toBe(
      buildQuickLogSaveSignature({ note: "wet" }),
    );
  });

  it("normalizes occurred_at so a re-stamped retry is NOT an edit", () => {
    // The timestamp is regenerated per attempt. If it counted as an edit the
    // key would rotate on every retry and a lost response would duplicate.
    const a = buildQuickLogSaveSignature({ note: "dry", occurred_at: "2026-08-19T10:00:00.000Z" });
    const b = buildQuickLogSaveSignature({ note: "dry", occurred_at: "2026-08-19T10:00:07.500Z" });
    expect(a).toBe(b);
  });

  it("normalizes the p_-prefixed RPC spelling too", () => {
    const a = buildQuickLogSaveSignature({ p_note: "dry", p_occurred_at: "2026-08-19T10:00:00Z" });
    const b = buildQuickLogSaveSignature({ p_note: "dry", p_occurred_at: "2026-08-19T11:30:00Z" });
    expect(a).toBe(b);
  });

  it("still distinguishes payloads that differ only outside occurred_at", () => {
    const a = buildQuickLogSaveSignature({ note: "dry", occurred_at: "2026-08-19T10:00:00Z" });
    const b = buildQuickLogSaveSignature({ note: "damp", occurred_at: "2026-08-19T10:00:00Z" });
    expect(a).not.toBe(b);
  });

  it("never throws on null/undefined/non-object input", () => {
    for (const bad of [null, undefined, 42, "str", []]) {
      expect(typeof buildQuickLogSaveSignature(bad as never)).toBe("string");
    }
  });

  it("is deterministic", () => {
    const p = { note: "dry", sensors: { temp: 24 } };
    expect(buildQuickLogSaveSignature(p)).toBe(buildQuickLogSaveSignature(p));
  });
});

describe("resolveQuickLogSaveKey — mint / reuse / rotate", () => {
  it("MINTS and STORES when there is no state (the PlantQuickLog defect)", () => {
    beforeEachReset();
    const out = resolveQuickLogSaveKey({ current: null, signature: "sig-1", mint });
    expect(out.decision).toBe("mint");
    expect(out.state).toEqual({ key: "minted-1", signature: "sig-1" });
    // The whole point: the minted key is returned as STATE the caller stores,
    // so the next attempt can find it. Minting inline without storing is what
    // turns a lost-response retry into a duplicate row.
  });

  it("REUSES on an unedited retry", () => {
    beforeEachReset();
    const current: QuickLogSaveKeyState = { key: "k1", signature: "sig-1" };
    const out = resolveQuickLogSaveKey({ current, signature: "sig-1", mint });
    expect(out.decision).toBe("reuse");
    expect(out.state.key).toBe("k1");
    expect(n).toBe(0); // nothing minted
  });

  it("ROTATES on an edited retry", () => {
    beforeEachReset();
    const current: QuickLogSaveKeyState = { key: "k1", signature: "sig-1" };
    const out = resolveQuickLogSaveKey({ current, signature: "sig-2", mint });
    expect(out.decision).toBe("rotate");
    expect(out.state).toEqual({ key: "minted-1", signature: "sig-2" });
  });

  it("round-trips: retry the SAME edited payload twice reuses the rotated key", () => {
    beforeEachReset();
    const first = resolveQuickLogSaveKey({
      current: { key: "k1", signature: "sig-1" },
      signature: "sig-2",
      mint,
    });
    const second = resolveQuickLogSaveKey({
      current: first.state,
      signature: "sig-2",
      mint,
    });
    expect(second.decision).toBe("reuse");
    expect(second.state.key).toBe(first.state.key);
  });

  it("treats a state with a blank key as absent and mints", () => {
    beforeEachReset();
    for (const bad of [
      { key: "", signature: "s" },
      { key: "   ", signature: "s" },
    ]) {
      const out = resolveQuickLogSaveKey({ current: bad, signature: "s", mint });
      expect(out.decision).toBe("mint");
    }
  });

  it("never throws and always returns a usable key", () => {
    beforeEachReset();
    const out = resolveQuickLogSaveKey({
      current: undefined as never,
      signature: "",
      mint,
    });
    expect(out.state.key.length).toBeGreaterThan(0);
  });

  it("is deterministic for identical inputs", () => {
    const current: QuickLogSaveKeyState = { key: "k1", signature: "sig-1" };
    const a = resolveQuickLogSaveKey({ current, signature: "sig-1", mint });
    const b = resolveQuickLogSaveKey({ current, signature: "sig-1", mint });
    expect(a).toEqual(b);
  });
});
