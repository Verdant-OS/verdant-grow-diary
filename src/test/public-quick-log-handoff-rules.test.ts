/**
 * publicQuickLogHandoffRules — pure-rule coverage for the authenticated
 * consume-once handoff of the public Quick Log Starter draft.
 *
 * Covers the draft gate (fresh / missing / malformed / expired / unknown
 * version — all fail closed), plant matching (unique, multiple, none,
 * nickname, ambiguous-never-chooses), the prefill mapping (only supported
 * fields, nothing invented, no URLs, no grower content outside the
 * in-memory prefill), and determinism.
 */
import { describe, it, expect } from "vitest";
import {
  listEligibleHandoffPlants,
  mapDraftToQuickLogPrefill,
  matchHandoffPlant,
  normalizeHandoffNickname,
  resolvePublicQuickLogHandoffDraft,
  type HandoffPlantLike,
} from "@/lib/publicQuickLogHandoffRules";
import {
  PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS,
  parsePublicQuickLogStarterDraft,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";

const NOW = new Date("2026-07-15T12:00:00.000Z");

function draft(
  overrides: Partial<PublicQuickLogStarterDraft> = {},
): PublicQuickLogStarterDraft {
  return {
    v: 1,
    id: "draft-1",
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    plantNickname: "Blue Dream #1",
    stage: "veg",
    logType: "observation",
    note: "First true leaves look healthy.",
    wateringVolumeMl: null,
    attribution: { utm_source: "organic_guide" },
    ...overrides,
  };
}

describe("resolvePublicQuickLogHandoffDraft — fail-closed gate", () => {
  it("fresh valid draft resolves ready with the draft attached", () => {
    const res = resolvePublicQuickLogHandoffDraft({ draft: draft(), now: NOW });
    expect(res.status).toBe("ready");
    expect(res.draft?.id).toBe("draft-1");
  });

  it("missing draft (null) resolves missing", () => {
    const res = resolvePublicQuickLogHandoffDraft({ draft: null, now: NOW });
    expect(res).toEqual({ status: "missing", draft: null });
  });

  it("a draft exactly at the 24h freshness cap is still ready; 1ms past is stale", () => {
    const atCap = draft({
      updatedAt: new Date(
        NOW.getTime() - PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS,
      ).toISOString(),
    });
    expect(resolvePublicQuickLogHandoffDraft({ draft: atCap, now: NOW }).status).toBe(
      "ready",
    );
    const past = draft({
      updatedAt: new Date(
        NOW.getTime() - PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS - 1,
      ).toISOString(),
    });
    const res = resolvePublicQuickLogHandoffDraft({ draft: past, now: NOW });
    expect(res.status).toBe("stale");
    expect(res.draft).toBeNull();
  });

  it("a clock-skewed future draft is treated as stale (never auto-prefilled)", () => {
    const future = draft({
      updatedAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    expect(
      resolvePublicQuickLogHandoffDraft({ draft: future, now: NOW }).status,
    ).toBe("stale");
  });

  it("malformed storage payloads fail closed at the parser → missing here", () => {
    for (const raw of ["not json", "{}", '{"v":1}', '"just a string"', ""]) {
      const parsed = parsePublicQuickLogStarterDraft(raw);
      expect(parsed, `parser must reject: ${raw}`).toBeNull();
      expect(
        resolvePublicQuickLogHandoffDraft({ draft: parsed, now: NOW }).status,
      ).toBe("missing");
    }
  });

  it("an unknown FUTURE draft version fails closed at the parser → missing here", () => {
    const v2 = JSON.stringify({
      ...JSON.parse(serializePublicQuickLogStarterDraft(draft())),
      v: 2,
    });
    const parsed = parsePublicQuickLogStarterDraft(v2);
    expect(parsed).toBeNull();
    expect(
      resolvePublicQuickLogHandoffDraft({ draft: parsed, now: NOW }).status,
    ).toBe("missing");
  });
});

function plant(overrides: Partial<Record<string, unknown>> = {}): HandoffPlantLike {
  return {
    id: "p1",
    name: "Blue Dream #1",
    tent_id: "t1",
    grow_id: "g1",
    is_archived: false,
    last_note: null,
    ...overrides,
  };
}

describe("listEligibleHandoffPlants", () => {
  it("keeps only active plants (archived and merged are excluded)", () => {
    const eligible = listEligibleHandoffPlants(
      [
        plant(),
        plant({ id: "p2", name: "Archived", is_archived: true }),
        plant({
          id: "p3",
          name: "Merged",
          is_archived: true,
          last_note: "Merged into 123e4567-e89b-12d3-a456-426614174000",
        }),
      ],
      [],
    );
    expect(eligible.map((p) => p.id)).toEqual(["p1"]);
  });

  it("accepts camelCase app-domain plants too", () => {
    const eligible = listEligibleHandoffPlants(
      [{ id: "p9", name: "Camel", tentId: "t1", growId: "g1", isArchived: false }],
      [],
    );
    expect(eligible).toEqual([
      { id: "p9", name: "Camel", tentId: "t1", growId: "g1" },
    ]);
  });

  it("falls back to the owning tent's grow when the plant row has no grow id", () => {
    const eligible = listEligibleHandoffPlants(
      [plant({ grow_id: null })],
      [{ id: "t1", grow_id: "g-from-tent" }],
    );
    expect(eligible[0]?.growId).toBe("g-from-tent");
  });

  it("orders deterministically by name (case-insensitive) then id", () => {
    const eligible = listEligibleHandoffPlants(
      [
        plant({ id: "pB", name: "zeta" }),
        plant({ id: "pC", name: "Alpha" }),
        plant({ id: "pA", name: "alpha" }),
      ],
      [],
    );
    expect(eligible.map((p) => p.id)).toEqual(["pA", "pC", "pB"]);
  });

  it("drops rows without a usable id or name and tolerates junk", () => {
    const eligible = listEligibleHandoffPlants(
      [plant({ id: "" }), plant({ id: "ok", name: "  " }), null as never, 42 as never],
      null,
    );
    expect(eligible).toEqual([]);
  });
});

describe("matchHandoffPlant", () => {
  const eligible = (defs: Array<[string, string]>) =>
    listEligibleHandoffPlants(
      defs.map(([id, name]) => plant({ id, name })),
      [],
    );

  it("zero eligible plants → none (setup path, draft retained)", () => {
    const match = matchHandoffPlant("Blue Dream #1", []);
    expect(match).toEqual({ kind: "none", plant: null, eligibleCount: 0 });
  });

  it("exactly one eligible plant → suggested even without a nickname match", () => {
    const match = matchHandoffPlant("Some Other Name", eligible([["p1", "GG #1"]]));
    expect(match.kind).toBe("only-plant");
    expect(match.plant?.id).toBe("p1");
  });

  it("several plants with no nickname match → ambiguous, never silently chooses", () => {
    const match = matchHandoffPlant(
      "Nothing Matches",
      eligible([
        ["p1", "GG #1"],
        ["p2", "ZK #1"],
      ]),
    );
    expect(match.kind).toBe("ambiguous");
    expect(match.plant).toBeNull();
    expect(match.eligibleCount).toBe(2);
  });

  it("unique normalized nickname match wins over plant count", () => {
    const match = matchHandoffPlant(
      "  blue   DREAM #1 ",
      eligible([
        ["p1", "GG #1"],
        ["p2", "Blue Dream #1"],
        ["p3", "ZK #1"],
      ]),
    );
    expect(match.kind).toBe("nickname");
    expect(match.plant?.id).toBe("p2");
  });

  it("an AMBIGUOUS nickname (two plants share the name) must not silently choose", () => {
    const match = matchHandoffPlant(
      "Blue Dream #1",
      eligible([
        ["p1", "Blue Dream #1"],
        ["p2", "blue dream #1"],
      ]),
    );
    expect(match.kind).toBe("ambiguous");
    expect(match.plant).toBeNull();
  });

  it("normalization collapses case and inner whitespace only", () => {
    expect(normalizeHandoffNickname("  Blue   Dream  #1 ")).toBe("blue dream #1");
    expect(normalizeHandoffNickname("BLUE DREAM #1")).toBe("blue dream #1");
    expect(normalizeHandoffNickname("Blue-Dream")).toBe("blue-dream");
  });

  it("is deterministic: identical inputs give deeply equal results", () => {
    const plants = eligible([
      ["p2", "Blue Dream #1"],
      ["p1", "GG #1"],
    ]);
    expect(matchHandoffPlant("Blue Dream #1", plants)).toEqual(
      matchHandoffPlant("Blue Dream #1", plants),
    );
  });
});

describe("mapDraftToQuickLogPrefill — supported fields only, nothing invented", () => {
  const uniqueMatch = matchHandoffPlant(
    "Blue Dream #1",
    listEligibleHandoffPlants([plant()], []),
  );

  it("maps the supported fields 1:1 with plant identity from the MATCH", () => {
    const prefill = mapDraftToQuickLogPrefill({ draft: draft(), match: uniqueMatch });
    expect(prefill).toEqual({
      plantId: "p1",
      plantName: "Blue Dream #1",
      growId: "g1",
      tentId: "t1",
      eventType: "observation",
      note: "First true leaves look healthy.",
      wateringVolumeMl: null,
      suggestSnapshot: false,
      source: "public-starter",
      publicStarterDraftId: "draft-1",
      suppressPlantDefault: false,
    });
  });

  it("watering drafts carry the volume; the truthful eventType passes through", () => {
    const prefill = mapDraftToQuickLogPrefill({
      draft: draft({ logType: "watering", note: "", wateringVolumeMl: 500 }),
      match: uniqueMatch,
    });
    expect(prefill.eventType).toBe("watering");
    expect(prefill.wateringVolumeMl).toBe(500);
    expect(prefill.note).toBeNull();
  });

  it("does NOT invent data for unsupported fields", () => {
    const prefill = mapDraftToQuickLogPrefill({
      draft: draft({ stage: "flower", logType: "feeding" }),
      match: uniqueMatch,
    });
    // Stage is deliberately unmapped: an anonymous draft never mutates an
    // existing plant's stage; the form derives stage from the plant itself.
    expect("stage" in prefill).toBe(false);
    // Feeding passes through truthfully — the existing form owns the
    // "Coming soon" honesty; we never silently re-type the entry.
    expect(prefill.eventType).toBe("feeding");
    // A volume must never appear on a non-watering draft.
    expect(prefill.wateringVolumeMl).toBeNull();
    // Attribution/UTM payloads never enter the prefill.
    expect("attribution" in prefill).toBe(false);
    expect(JSON.stringify(prefill)).not.toContain("utm_");
  });

  it("ambiguous/none matches emit NO plant identity (grower chooses in the form)", () => {
    const ambiguous = matchHandoffPlant(
      "Blue Dream #1",
      listEligibleHandoffPlants(
        [plant(), plant({ id: "p2", name: "Blue Dream #1" })],
        [],
      ),
    );
    const prefill = mapDraftToQuickLogPrefill({ draft: draft(), match: ambiguous });
    expect(prefill.plantId).toBeNull();
    expect(prefill.plantName).toBeNull();
    expect(prefill.growId).toBeNull();
    expect(prefill.tentId).toBeNull();
    // ...and the dialog's own auto-defaulting is suppressed, so nothing
    // quietly pre-selects a plant the grower was told THEY would pick
    // (last-target / only-plant-in-active-grow fallbacks included).
    expect(prefill.suppressPlantDefault).toBe(true);
    // The nickname is the grower's word, not a database key — it must not
    // masquerade as a resolved plant name.
    expect(JSON.stringify(prefill)).not.toContain("Blue Dream");
  });

  it("suggestion-less matches always carry suppressPlantDefault; suggestions never do", () => {
    const none = matchHandoffPlant("Anything", []);
    expect(
      mapDraftToQuickLogPrefill({ draft: draft(), match: none }).suppressPlantDefault,
    ).toBe(true);
    const only = matchHandoffPlant("No Match", listEligibleHandoffPlants([plant()], []));
    expect(
      mapDraftToQuickLogPrefill({ draft: draft(), match: only }).suppressPlantDefault,
    ).toBe(false);
  });

  it("never emits URLs or query strings (grower content stays in memory)", () => {
    const serialized = JSON.stringify(
      mapDraftToQuickLogPrefill({
        draft: draft({ note: "pH was 6.2 today & stable ?ok" }),
        match: uniqueMatch,
      }),
    );
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/[?&]note=|[?&]nickname=|redirectTo/);
  });

  it("suggestSnapshot is always false — the handoff never pushes sensor capture", () => {
    const prefill = mapDraftToQuickLogPrefill({ draft: draft(), match: uniqueMatch });
    expect(prefill.suggestSnapshot).toBe(false);
  });
});
