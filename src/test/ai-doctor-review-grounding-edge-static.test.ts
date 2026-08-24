import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => stripSourceComments(readFileSync(resolve(ROOT, path), "utf8"));

const EDGE = read("supabase/functions/ai-doctor-review/index.ts");
const GROUNDING = read("src/lib/aiDoctorReviewGroundingRules.ts");

describe("AI Doctor review grounding — Edge integration", () => {
  it("uses the generated shared grounding shim, not a direct browser source import", () => {
    expect(EDGE).toContain('from "../_shared/aiDoctorReviewGroundingRules.ts"');
    expect(EDGE).not.toMatch(/from\s+["'][^"']*src\/lib\/aiDoctorReviewGroundingRules/);
  });

  it("replays a structurally valid cache without grounding or refunding it against a changed packet", () => {
    const replayStart = EDGE.indexOf('if (spendDecision.kind === "cached")');
    const replayEnd = EDGE.indexOf("const spendId = spendDecision.spendId", replayStart);
    const replay = EDGE.slice(replayStart, replayEnd);
    const structural = replay.indexOf("validateAiDoctorReviewResult(spendDecision.result)");
    const safeReplay = replay.indexOf("return safeOk(cached.result");

    expect(replayStart).toBeGreaterThanOrEqual(0);
    expect(replayEnd).toBeGreaterThan(replayStart);
    expect(structural).toBeGreaterThanOrEqual(0);
    expect(safeReplay).toBeGreaterThan(structural);
    expect(replay).toContain('"ai-doctor-review status=cached_result_invalid"');
    expect(replay).toContain('return calmFailure("invalid")');
    // A same-key request can carry a newer valid packet. The replay must use
    // neither that packet nor a refund path, or it could self-credit the
    // immutable original spend because the idempotency key is packet-unbound.
    expect(replay).not.toContain("validatedPacket");
    expect(replay).not.toContain("evidenceReceipt");
    expect(replay).not.toContain("promptHmac");
    expect(replay).not.toContain("validateAiDoctorReviewGrounding");
    expect(replay).not.toContain("failureAfterRefund");
    expect(replay).not.toContain("ai_credit_refund");
    expect(replay).not.toContain("creditSupabase.rpc");
    expect(replay).not.toContain("fetch(");
  });

  it("grounds a fresh structural result before finalization and uses the existing refund semantics", () => {
    const structural = EDGE.indexOf("const v = validateAiDoctorReviewResult(candidate)");
    const grounding = EDGE.indexOf(
      "const grounding = validateAiDoctorReviewGrounding(v.result, validatedPacket)",
      structural,
    );
    const finalization = EDGE.indexOf('creditSupabase.rpc("ai_doctor_finalize_review"', grounding);
    const boundary = EDGE.slice(grounding, finalization);

    expect(structural).toBeGreaterThanOrEqual(0);
    expect(grounding).toBeGreaterThan(structural);
    expect(finalization).toBeGreaterThan(grounding);
    expect(boundary).toContain("if (grounding.ok === false)");
    expect(boundary).toContain('"ai-doctor-review status=grounding_invalid"');
    expect(boundary).toContain("return failureAfterRefund(spendId");
    expect(boundary).not.toContain("p_result: v.result");
  });

  it("keeps the grounding helper pure and its Edge logs limited to fixed status codes", () => {
    for (const forbidden of [
      "fetch(",
      "createClient",
      "Deno.",
      "console.",
      "raw_payload",
      "service_role",
      "SUPABASE_",
    ]) {
      expect(GROUNDING).not.toContain(forbidden);
    }
    expect(EDGE).toContain('console.log("ai-doctor-review status=grounding_invalid")');
    expect(EDGE).toContain('console.log("ai-doctor-review status=cached_result_invalid")');
  });

  it("keeps the production grounding source free of Action Queue scanner tokens", () => {
    // The pure rules test separately proves this lexical form is still
    // rejected as unsafe model output; production source must not look like an
    // executable Action Queue path to the repository-wide static scanner.
    expect(GROUNDING).not.toMatch(/\bauto(?:pilot)\b/i);
  });
});
