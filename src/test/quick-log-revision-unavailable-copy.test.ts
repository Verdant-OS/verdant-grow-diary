/**
 * QA 2026-09-24, BUG-021: production returned 404 PGRST202 for
 * quicklog_retract_entry / quicklog_correct_entry (the keyed overloads from
 * the unapplied 20260916111000 migration). The RPC never ran, so the copy
 * must say nothing changed — and must not invite a blind retry loop.
 */
import { describe, expect, it } from "vitest";
import { quickLogRevisionFailureCopy } from "@/lib/quick-log/quickLogRevisionRules";

describe("revision RPC unavailable copy", () => {
  it("tells the grower the entry is unchanged", () => {
    const copy = quickLogRevisionFailureCopy("rpc_unavailable");
    expect(copy).toMatch(/Nothing was changed/);
    expect(copy).toMatch(/Correcting or retracting entries/);
  });
});
