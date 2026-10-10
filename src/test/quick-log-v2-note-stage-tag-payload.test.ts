import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const resolved = {
  ok: true as const,
  targetType: "plant" as const,
  targetId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
  plantId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
  tentId: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
  growId: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3",
};
const base = {
  resolved,
  action: "note" as const,
  volumeMl: "",
  note: "Synthetic V2 note fixture",
  temperatureC: "",
  humidityPct: "",
  vpdKpa: "",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
};

describe("repro: Quick Log V2 note saved with stage=null (V2 Note stage tag)", () => {
  it("builder forwards p_stage when the sheet supplies the target stage", () => {
    const built = buildQuickLogV2SavePayload({ ...base, stage: "seedling" });
    expect(built.ok).toBe(true);
    if (built.ok)
      expect((built as { payload: { p_stage?: string } }).payload.p_stage).toBe("seedling");
  });

  it("builder omits p_stage when the sheet supplies nothing (what production did)", () => {
    const built = buildQuickLogV2SavePayload({ ...base });
    expect(built.ok).toBe(true);
    if (built.ok)
      expect((built as { payload: { p_stage?: string } }).payload.p_stage).toBeUndefined();
  });

  it("QuickLogV2Sheet passes the resolved target stage into the builder (regression pin)", () => {
    const src = readFileSync("src/components/QuickLogV2Sheet.tsx", "utf8");
    const call = src.slice(src.indexOf("const built = buildQuickLogV2SavePayload({"));
    const body = call.slice(0, call.indexOf("});") + 3);
    expect(body).toMatch(/\bstage:\s*targetStage\b/);
  });
});
