/**
 * Part B (B0) — breeding reproduction rules.
 *
 * Locks the pure reversal / selfing / feminized-cross domain logic:
 *  - a keeper's reversed state derives from append-only records,
 *  - classifyCross picks the right CrossType and validates impossible combos,
 *  - offspring feminization derives from cross type (never disagrees),
 *  - labels are stable ("F1" / "Fem F1" / "S1").
 *
 * Pure — no React, no Supabase, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  classifyCross,
  deriveOffspringFeminization,
  isKeeperReversed,
  lineageLabel,
  reversalMethodLabel,
  isCrossType,
  isReversalMethod,
  isChannel,
  channelLabel,
  isFeminizedChannel,
  feminizationFromChannel,
  crossTypeDisplay,
  crossTypeName,
  isFeminizedCrossType,
  requiresRecurrentParent,
  requiresGeneration,
  validateBreedingCross,
  CROSS_TYPES,
  CHANNELS,
  REVERSAL_METHODS,
  type CrossParticipants,
  type CrossClassification,
  type BreedingCrossInput,
} from "@/lib/genetics/breedingReproductionRules";

const reversed = (id: string) => [{ keeperId: id }];

/** Assertion helper: narrows to the rejection branch so tests can read `reason`. */
function assertRejected(
  r: CrossClassification,
): asserts r is Extract<CrossClassification, { ok: false }> {
  if (r.ok) throw new Error("expected classifyCross to reject this combination");
}

describe("isKeeperReversed", () => {
  it("is true iff a reversal record exists for the keeper", () => {
    expect(isKeeperReversed(reversed("k1"), "k1")).toBe(true);
    expect(isKeeperReversed(reversed("k1"), "k2")).toBe(false);
    expect(isKeeperReversed([], "k1")).toBe(false);
    expect(isKeeperReversed(reversed("k1"), "")).toBe(false);
  });

  it("handles multiple records and duplicates", () => {
    const recs = [{ keeperId: "a" }, { keeperId: "b" }, { keeperId: "a" }];
    expect(isKeeperReversed(recs, "a")).toBe(true);
    expect(isKeeperReversed(recs, "b")).toBe(true);
    expect(isKeeperReversed(recs, "c")).toBe(false);
  });
});

describe("deriveOffspringFeminization", () => {
  it("feminized for selfing and feminized crosses, regular for standard", () => {
    expect(deriveOffspringFeminization("selfing_s1")).toBe("feminized");
    expect(deriveOffspringFeminization("feminized_cross")).toBe("feminized");
    expect(deriveOffspringFeminization("standard_f1")).toBe("regular");
  });
});

describe("lineageLabel", () => {
  it("maps each cross type to a stable short label", () => {
    expect(lineageLabel("standard_f1")).toBe("F1");
    expect(lineageLabel("feminized_cross")).toBe("Fem F1");
    expect(lineageLabel("selfing_s1")).toBe("S1");
  });
});

describe("classifyCross — selfing (S1)", () => {
  it("classifies a reversed keeper pollinating itself (null pollen) as S1", () => {
    const r = classifyCross({
      femaleKeeperId: "k1",
      pollenKeeperId: null,
      femaleReversed: true,
      pollenReversed: false,
    });
    expect(r).toEqual({
      ok: true,
      crossType: "selfing_s1",
      offspring: "feminized",
      label: "S1",
      isSelf: true,
    });
  });

  it("treats pollen === mother as selfing too (same keeper id)", () => {
    const r = classifyCross({
      femaleKeeperId: "k1",
      pollenKeeperId: "k1",
      femaleReversed: true,
      pollenReversed: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.crossType).toBe("selfing_s1");
  });

  it("rejects a blank/whitespace pollen donor as incomplete — NOT selfing", () => {
    // Mother is reversed, so the OLD behavior would have mis-read a blank
    // donor as a valid S1. It must instead reject the missing donor and NOT
    // return the "reverse first" message (that would misdescribe the problem).
    for (const blank of ["", "   ", "\t"]) {
      const r = classifyCross({
        femaleKeeperId: "mom",
        pollenKeeperId: blank,
        femaleReversed: true,
        pollenReversed: false,
      });
      assertRejected(r);
      expect(r.reason).toMatch(/pollen donor/i);
      expect(r.reason).not.toMatch(/reverse this keeper first/i);
    }
  });

  it("REJECTS selfing when the mother has not been reversed", () => {
    const r = classifyCross({
      femaleKeeperId: "k1",
      pollenKeeperId: null,
      femaleReversed: false,
      pollenReversed: false,
    });
    assertRejected(r);
    expect(r.reason).toMatch(/reverse/i);
  });
});

describe("classifyCross — feminized cross", () => {
  it("classifies reversed-female pollen onto a different female as a feminized cross", () => {
    const r = classifyCross({
      femaleKeeperId: "mom",
      pollenKeeperId: "dad-reversed-female",
      femaleReversed: false,
      pollenReversed: true,
    });
    expect(r).toEqual({
      ok: true,
      crossType: "feminized_cross",
      offspring: "feminized",
      label: "Fem F1",
      isSelf: false,
    });
  });
});

describe("classifyCross — standard F1", () => {
  it("classifies a real (non-reversed) male donor as a standard F1", () => {
    const r = classifyCross({
      femaleKeeperId: "mom",
      pollenKeeperId: "male",
      femaleReversed: false,
      pollenReversed: false,
    });
    expect(r).toEqual({
      ok: true,
      crossType: "standard_f1",
      offspring: "regular",
      label: "F1",
      isSelf: false,
    });
  });

  it("mother's own reversal state is irrelevant to a two-parent cross", () => {
    const r = classifyCross({
      femaleKeeperId: "mom",
      pollenKeeperId: "male",
      femaleReversed: true, // mother happens to be reversed, but is the seed parent here
      pollenReversed: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.crossType).toBe("standard_f1");
  });
});

describe("classifyCross — validation", () => {
  it("rejects a missing/blank mother keeper", () => {
    const base: CrossParticipants = {
      femaleKeeperId: "",
      pollenKeeperId: "x",
      femaleReversed: false,
      pollenReversed: false,
    };
    const r = classifyCross(base);
    assertRejected(r);
    expect(r.reason).toMatch(/mother|seed/i);
  });

  it("offspring feminization always agrees with the classified cross type", () => {
    const cases: CrossParticipants[] = [
      { femaleKeeperId: "a", pollenKeeperId: null, femaleReversed: true, pollenReversed: false },
      { femaleKeeperId: "a", pollenKeeperId: "b", femaleReversed: false, pollenReversed: true },
      { femaleKeeperId: "a", pollenKeeperId: "b", femaleReversed: false, pollenReversed: false },
    ];
    for (const c of cases) {
      const r = classifyCross(c);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.offspring).toBe(deriveOffspringFeminization(r.crossType));
    }
  });
});

describe("type guards + label helpers", () => {
  it("isCrossType / isReversalMethod accept canonical values and reject junk", () => {
    for (const t of CROSS_TYPES) expect(isCrossType(t)).toBe(true);
    for (const m of REVERSAL_METHODS) expect(isReversalMethod(m)).toBe(true);
    expect(isCrossType("f2")).toBe(false);
    expect(isCrossType(null)).toBe(false);
    expect(isReversalMethod("bleach")).toBe(false);
  });

  it("reversalMethodLabel is safe for unknown/legacy values", () => {
    expect(reversalMethodLabel("sts")).toMatch(/STS/);
    expect(reversalMethodLabel("colloidal_silver")).toMatch(/Colloidal/);
    expect(reversalMethodLabel("mystery")).toBe("Reversal");
    expect(reversalMethodLabel(null)).toBe("Reversal");
  });
});

describe("channels", () => {
  it("isChannel accepts canonical channels and rejects junk", () => {
    for (const c of CHANNELS) expect(isChannel(c)).toBe(true);
    expect(isChannel("magic")).toBe(false);
    expect(isChannel(null)).toBe(false);
  });

  it("channelLabel is safe for unknown values", () => {
    expect(channelLabel("sts")).toMatch(/STS/);
    expect(channelLabel("natural_male")).toMatch(/male/i);
    expect(channelLabel("mystery")).toBe("Pollen");
  });

  it("only reversal channels are feminized (natural male + open are not)", () => {
    expect(isFeminizedChannel("colloidal_silver")).toBe(true);
    expect(isFeminizedChannel("sts")).toBe(true);
    expect(isFeminizedChannel("ga3")).toBe(true);
    expect(isFeminizedChannel("rodelization")).toBe(true);
    expect(isFeminizedChannel("natural_male")).toBe(false);
    expect(isFeminizedChannel("open_pollination")).toBe(false);
  });
});

describe("feminizationFromChannel", () => {
  it("derives feminization from the channel", () => {
    expect(feminizationFromChannel("sts")).toBe("feminized");
    expect(feminizationFromChannel("natural_male")).toBe("regular");
    expect(feminizationFromChannel("open_pollination")).toBe("regular");
  });

  it("an inherently-feminized way is feminized even if the channel is omitted", () => {
    expect(feminizationFromChannel(null, "selfing_s1")).toBe("feminized");
    expect(feminizationFromChannel("natural_male", "feminized_cross")).toBe("feminized");
  });

  it("a filial or backcross made with reversal pollen is feminized", () => {
    expect(feminizationFromChannel("sts", "filial")).toBe("feminized");
    expect(feminizationFromChannel("natural_male", "filial")).toBe("regular");
  });
});

describe("crossTypeDisplay + metadata helpers", () => {
  it("applies the generation to F#/S#/BX# ways and leaves others alone", () => {
    expect(crossTypeDisplay("standard_f1")).toBe("F1");
    expect(crossTypeDisplay("filial", 3)).toBe("F3");
    expect(crossTypeDisplay("filial", null)).toBe("F2"); // min for filial
    expect(crossTypeDisplay("selfing_sn", 2)).toBe("S2");
    expect(crossTypeDisplay("backcross", 2)).toBe("BX2");
    expect(crossTypeDisplay("backcross", null)).toBe("BX1"); // min for BX
    expect(crossTypeDisplay("feminized_bx", 1)).toBe("Fem BX1");
    expect(crossTypeDisplay("sib_cross")).toBe("Sib");
  });

  it("crossTypeName is safe for unknown values", () => {
    expect(crossTypeName("backcross")).toMatch(/Backcross/);
    expect(crossTypeName("nonsense")).toBe("Cross");
  });

  it("flags feminized ways, recurrent-parent ways, and generation-carrying ways", () => {
    expect(isFeminizedCrossType("selfing_s1")).toBe(true);
    expect(isFeminizedCrossType("feminized_bx")).toBe(true);
    expect(isFeminizedCrossType("standard_f1")).toBe(false);
    expect(requiresRecurrentParent("backcross")).toBe(true);
    expect(requiresRecurrentParent("feminized_bx")).toBe(true);
    expect(requiresRecurrentParent("standard_f1")).toBe(false);
    expect(requiresGeneration("filial")).toBe(true);
    expect(requiresGeneration("backcross")).toBe(true);
    expect(requiresGeneration("standard_f1")).toBe(false);
  });
});

describe("validateBreedingCross", () => {
  const base: BreedingCrossInput = {
    crossType: "standard_f1",
    channel: "natural_male",
    isSelf: false,
    femaleReversed: false,
    pollenReversed: false,
    hasRecurrentParent: false,
    generation: null,
  };
  const v = (over: Partial<BreedingCrossInput>) => validateBreedingCross({ ...base, ...over });

  it("accepts a standard F1 with a natural male", () => {
    expect(v({})).toEqual({ ok: true, offspring: "regular", label: "F1" });
  });

  it("rejects a standard/sib/outcross ridden on a reversal channel (that would be feminized)", () => {
    for (const crossType of ["standard_f1", "sib_cross", "outcross", "line_cross"] as const) {
      const r = v({ crossType, channel: "sts" });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.reason).toMatch(/feminized|reversal/i);
    }
  });

  it("selfing: requires self + reversed mother + a reversal channel", () => {
    expect(
      v({ crossType: "selfing_s1", channel: "sts", isSelf: true, femaleReversed: true }),
    ).toEqual({
      ok: true,
      offspring: "feminized",
      label: "S1",
    });
    expect(
      v({ crossType: "selfing_s1", channel: "sts", isSelf: false, femaleReversed: true }).ok,
    ).toBe(false);
    expect(
      v({ crossType: "selfing_s1", channel: "sts", isSelf: true, femaleReversed: false }).ok,
    ).toBe(false);
    expect(
      v({ crossType: "selfing_s1", channel: "natural_male", isSelf: true, femaleReversed: true })
        .ok,
    ).toBe(false);
  });

  it("S2+ selfing needs a generation of 2 or more", () => {
    expect(
      v({
        crossType: "selfing_sn",
        channel: "sts",
        isSelf: true,
        femaleReversed: true,
        generation: 1,
      }).ok,
    ).toBe(false);
    expect(
      v({
        crossType: "selfing_sn",
        channel: "sts",
        isSelf: true,
        femaleReversed: true,
        generation: 2,
      }),
    ).toEqual({ ok: true, offspring: "feminized", label: "S2" });
  });

  it("feminized cross: different female + reversal channel", () => {
    expect(v({ crossType: "feminized_cross", channel: "colloidal_silver" })).toEqual({
      ok: true,
      offspring: "feminized",
      label: "Fem F1",
    });
    expect(v({ crossType: "feminized_cross", channel: "colloidal_silver", isSelf: true }).ok).toBe(
      false,
    );
    expect(v({ crossType: "feminized_cross", channel: "natural_male" }).ok).toBe(false);
  });

  it("backcross: needs a recurrent parent and a BX generation", () => {
    expect(v({ crossType: "backcross", hasRecurrentParent: false, generation: 1 }).ok).toBe(false);
    expect(v({ crossType: "backcross", hasRecurrentParent: true, generation: null }).ok).toBe(
      false,
    );
    expect(v({ crossType: "backcross", hasRecurrentParent: true, generation: 2 })).toEqual({
      ok: true,
      offspring: "regular",
      label: "BX2",
    });
  });

  it("feminized backcross: reversal channel + recurrent parent", () => {
    expect(
      v({ crossType: "feminized_bx", channel: "sts", hasRecurrentParent: true, generation: 1 }),
    ).toEqual({ ok: true, offspring: "feminized", label: "Fem BX1" });
    expect(
      v({ crossType: "feminized_bx", channel: "sts", hasRecurrentParent: false, generation: 1 }).ok,
    ).toBe(false);
  });

  it("filial (F2+) needs a generation of 2 or more; a reversal channel makes it feminized", () => {
    expect(v({ crossType: "filial", generation: 1 }).ok).toBe(false);
    expect(v({ crossType: "filial", generation: 2 })).toEqual({
      ok: true,
      offspring: "regular",
      label: "F2",
    });
    expect(v({ crossType: "filial", channel: "sts", generation: 2 })).toEqual({
      ok: true,
      offspring: "feminized",
      label: "F2",
    });
  });
});
