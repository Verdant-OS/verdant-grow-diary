import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GROW_WALK_ATTENTION_BANDS,
  GROW_WALK_CONTEXT_VERSION,
  GROW_WALK_CONTRADICTION_CODES,
  GROW_WALK_MISSING_EVIDENCE_CODES,
  GROW_WALK_REASON_CODES,
} from "@/lib/growWalkContracts";

describe("Grow Walk contract", () => {
  it("keeps version, priority bands, and code vocabularies closed", () => {
    expect(GROW_WALK_CONTEXT_VERSION).toBe("grow-walk-v0.1");
    expect(GROW_WALK_ATTENTION_BANDS).toEqual([
      "immediate_physical_verification",
      "watch_today",
      "routine_observation",
      "insufficient_evidence",
    ]);
    for (const codes of [
      GROW_WALK_REASON_CODES,
      GROW_WALK_MISSING_EVIDENCE_CODES,
      GROW_WALK_CONTRADICTION_CODES,
    ]) {
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("does not declare secret, write, or device-control fields", () => {
    const source = readFileSync("src/lib/growWalkContracts.ts", "utf8");
    expect(source).not.toMatch(
      /\buser_id\b|\braw_payload\b|signed[_ -]?url|storage[_ -]?path|access[_ -]?token|refresh[_ -]?token|target[_ -]?device|device[_ -]?command/i,
    );
  });
});
