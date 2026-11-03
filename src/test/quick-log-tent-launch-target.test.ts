import { describe, expect, it } from "vitest";
import { QuickLogTentLaunchTarget } from "@/lib/quickLogRouteTargetRules";
import { QuickLogLaunchTarget } from "@/lib/quickLogV2Rules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { resolveQuickLogV2Target } from "@/lib/quickLogV2Rules";
import { applyResponseCheck } from "@/lib/tenSecondQuickCheckRules";

const TENT = "55555555-5555-4555-8555-555555555555";
const PLANT = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

describe("QuickLogTentLaunchTarget", () => {
  it.each(["loading", "failed", "stale"] as const)(
    "keeps Whole tent while the roster is %s",
    (roster) => {
      expect(
        QuickLogTentLaunchTarget.resolve({
          tentId: TENT,
          roster,
          activePlantIds: [PLANT],
        }),
      ).toBe(`tent:${TENT}`);
    },
  );

  it("defaults a confirmed one-plant tent to that plant, including one archived sibling", () => {
    expect(
      QuickLogTentLaunchTarget.resolve({
        tentId: TENT,
        roster: "ready",
        activePlantIds: [PLANT],
      }),
    ).toBe(`plant:${PLANT}`);
  });

  it("keeps Whole tent for several plants and for an empty or only-archived tent", () => {
    expect(
      QuickLogTentLaunchTarget.resolve({
        tentId: TENT,
        roster: "ready",
        activePlantIds: [PLANT, OTHER],
      }),
    ).toBe(`tent:${TENT}`);
    expect(
      QuickLogTentLaunchTarget.resolve({ tentId: TENT, roster: "ready", activePlantIds: [] }),
    ).toBe(`tent:${TENT}`);
  });

  it("resolves the same plant after a reload", () => {
    const first = QuickLogTentLaunchTarget.resolve({
      tentId: TENT,
      roster: "ready",
      activePlantIds: [PLANT],
    });
    const second = QuickLogTentLaunchTarget.resolve({
      tentId: TENT,
      roster: "ready",
      activePlantIds: [PLANT],
    });
    expect(second).toBe(first);
    expect(second).toBe(`plant:${PLANT}`);
  });
});

describe("one-plant save columns", () => {
  it("writes the plant once, keeps readings, and does not copy them onto another plant", () => {
    const options = [
      {
        type: "plant" as const,
        id: PLANT,
        label: "Only",
        tentId: TENT,
        growId: "11111111-1111-4111-8111-111111111111",
      },
      {
        type: "plant" as const,
        id: OTHER,
        label: "Elsewhere",
        tentId: "66666666-6666-4666-8666-666666666666",
        growId: "22222222-2222-4222-8222-222222222222",
      },
    ];
    const resolved = resolveQuickLogV2Target(options, `plant:${PLANT}`);
    const built = buildQuickLogV2SavePayload({
      resolved,
      action: "note",
      volumeMl: "",
      note: applyResponseCheck("", "Better"),
      temperatureC: "24",
      humidityPct: "55",
      vpdKpa: "1.1",
      occurredAt: "2026-11-03T12:00:00.000Z",
      stage: null,
      idempotencyKey: "idem-one-plant-save",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toMatchObject({
      p_target_type: "plant",
      p_target_id: PLANT,
      p_action: "note",
      p_temperature_c: 24,
      p_humidity_pct: 55,
      p_vpd_kpa: 1.1,
      p_occurred_at: "2026-11-03T12:00:00.000Z",
      p_idempotency_key: "idem-one-plant-save",
    });
    expect(built.payload.p_note).toContain("Response check: Better.");
    expect(resolved.ok && resolved.tentId).toBe(TENT);
    expect(resolved.ok && resolved.plantId).toBe(PLANT);
    expect(JSON.stringify(built.payload)).not.toContain(OTHER);
  });
});

describe("last-used plant", () => {
  it("skips a remembered plant that is missing or archived", () => {
    const active = new Set([PLANT]);
    expect(QuickLogLaunchTarget.retainActivePlant(`plant:${PLANT}`, active)).toBe(`plant:${PLANT}`);
    expect(QuickLogLaunchTarget.retainActivePlant(`plant:${OTHER}`, active)).toBeNull();
    expect(QuickLogLaunchTarget.retainActivePlant(null, active)).toBeNull();
  });
});
