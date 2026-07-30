import { describe, expect, it } from "vitest";
import {
  OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH,
  readGuidePhenoQuickLogPrefill,
} from "@/lib/guidePhenoQuickLogHandoffRules";
import { OREOZ_GELONADE_PHENO_NOTE_PROMPT } from "@/constants/oreozGelonadeExperience";
import { consumeQuickLogStartIntent } from "@/lib/startScreenPreferences";

describe("Oreoz/Gelonade guide-to-diary Quick Log handoff", () => {
  it("builds a closed, context-free authenticated handoff", () => {
    expect(OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH).toBe(
      "/dashboard?open=quick-log&type=observation&prompt=oreoz-vs-gelonade",
    );
    expect(
      readGuidePhenoQuickLogPrefill(OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH.split("?")[1]),
    ).toEqual({
      eventType: "observation",
      note: OREOZ_GELONADE_PHENO_NOTE_PROMPT,
      source: "oreoz-vs-gelonade-guide",
      suppressPlantDefault: true,
    });
  });

  it.each([
    "",
    "?prompt=oreoz-vs-gelonade",
    "?open=quick-log&type=feeding&prompt=oreoz-vs-gelonade",
    "?open=quick-log&type=observation&prompt=unknown",
    "?open=dashboard&type=observation&prompt=oreoz-vs-gelonade",
  ])("fails closed for malformed or incomplete input: %s", (search) => {
    expect(readGuidePhenoQuickLogPrefill(search)).toBeNull();
  });

  it("consumes all owned markers while preserving unrelated query state", () => {
    expect(
      consumeQuickLogStartIntent(
        "?growId=grow-1&open=quick-log&type=observation&prompt=oreoz-vs-gelonade&utm=guide",
      ),
    ).toBe("?growId=grow-1&utm=guide");
    expect(consumeQuickLogStartIntent("?prompt=oreoz-vs-gelonade")).toBeNull();
  });

  it("never puts grower text or private identifiers into the handoff URL", () => {
    expect(OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH).not.toMatch(
      /plantId|growId|tentId|note=|share|token/i,
    );
  });
});
