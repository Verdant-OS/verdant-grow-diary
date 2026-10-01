import { describe, expect, it } from "vitest";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
} from "@/constants/strainReferenceLibrary";
import {
  CULTIVAR_DATABASE_READ_SURFACE,
  CULTIVAR_DATABASE_TABLES,
  mapCultivarDatabaseSnapshot,
  normalizeCultivarAliasForDatabase,
  type CultivarDatabaseSnapshot,
} from "@/lib/cultivarDatabaseReadModel";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";

type MutableSnapshot = Record<keyof CultivarDatabaseSnapshot, Record<string, unknown>[]>;
const freshSnapshot = (): MutableSnapshot =>
  structuredClone(
    cultivarSeedPayloadToSnapshot(
      buildCultivarDatabaseSeedPayload({
        profiles: VERDANT_CULTIVARS,
        sources: CULTIVAR_SOURCES,
        sectionsFor: getCultivarGuideSections,
      }),
    ),
  ) as MutableSnapshot;
const row = (snapshot: MutableSnapshot, slug: string) => {
  const found = snapshot.cultivars.find((item) => item.slug === slug);
  if (!found) throw new Error(slug);
  return found;
};
const section = (snapshot: MutableSnapshot, slug: string, key: string) => {
  const found = snapshot.cultivar_guide_sections.find(
    (item) => item.id === `section:${slug}:${key}`,
  );
  if (!found) throw new Error(`${slug}/${key}`);
  return found as { content: Record<string, unknown> };
};
const map = (snapshot: MutableSnapshot) =>
  mapCultivarDatabaseSnapshot(snapshot as unknown as CultivarDatabaseSnapshot);
const slugs = (snapshot: MutableSnapshot) =>
  map(snapshot).catalog.profiles.map((profile) => profile.slug);

describe("cultivar database read model — approved view model", () => {
  it("maps database rows to the exact approved public profiles, sections, and sources", () => {
    const result = map(freshSnapshot());
    expect(result.issues).toEqual([]);
    expect(result.catalog.profiles).toHaveLength(10);
    for (const bundled of VERDANT_CULTIVARS) {
      const mapped = result.catalog.profiles.find((profile) => profile.slug === bundled.slug);
      expect(mapped).toEqual({ ...bundled, guideOverlays: {} });
      expect(result.catalog.sectionsBySlug[bundled.slug]).toEqual(
        getCultivarGuideSections(bundled),
      );
      expect(result.catalog.sourcesBySlug[bundled.slug]).toEqual(getCultivarSources(bundled));
    }
  });

  it("keeps sample/reference labelling regardless of transport", () => {
    for (const profile of map(freshSnapshot()).catalog.profiles) {
      expect(profile.verificationStatus).toBe("sample");
      expect(profile.dataOrigin).toBe("sample");
    }
  });

  it("orders profiles deterministically by name, not by row order", () => {
    const forward = freshSnapshot();
    const reversed = freshSnapshot();
    for (const rows of Object.values(reversed)) rows.reverse();
    expect(map(reversed)).toEqual(map(forward));
    const names = map(forward).catalog.profiles.map((profile) => profile.name);
    expect(names).toEqual([...names].sort());
  });

  it("accepts PostgREST numeric strings and normalizes timestamps", () => {
    const snapshot = freshSnapshot();
    row(snapshot, "gg4").thc_pct_min = "27.00";
    row(snapshot, "gg4").last_verified_at = "2026-07-22T00:00:00+00:00";
    const profile = map(snapshot).catalog.profiles.find((item) => item.slug === "gg4");
    expect(profile?.thcPctMin).toBe(27);
    expect(profile?.lastVerifiedAt).toBe("2026-07-22T00:00:00.000Z");
  });

  it("selects only the columns the read model understands", () => {
    expect(CULTIVAR_DATABASE_TABLES).toEqual([
      "breeders",
      "cultivars",
      "cultivar_aliases",
      "cultivar_sources",
      "cultivar_profile_sources",
      "cultivar_claims",
      "cultivar_guides",
      "cultivar_guide_sections",
      "cultivar_guide_section_sources",
    ]);
    const columns = Object.values(CULTIVAR_DATABASE_READ_SURFACE).join(",");
    for (const forbidden of ["user_id", "created_by", "reviewed_by", "raw_payload", "*"]) {
      expect(columns.split(",")).not.toContain(forbidden);
    }
  });
});

describe("cultivar database read model — fails closed", () => {
  const cases: [string, (snapshot: MutableSnapshot) => void, string][] = [
    ["ai_draft origin", (s) => (row(s, "gg4").data_origin = "ai_draft"), "cultivars.data_origin"],
    ["community origin", (s) => (row(s, "gg4").data_origin = "community"), "cultivars.data_origin"],
    [
      "draft row",
      (s) => (row(s, "gg4").publication_status = "draft"),
      "cultivars.publication_status",
    ],
    [
      "archived verification",
      (s) => (row(s, "gg4").verification_status = "archived"),
      "cultivars.verification_status",
    ],
    ["unknown difficulty", (s) => (row(s, "gg4").difficulty = "unknown"), "cultivars.difficulty"],
    ["unknown life cycle", (s) => (row(s, "gg4").life_cycle = "unknown"), "cultivars.life_cycle"],
    [
      "unknown height",
      (s) => (row(s, "gg4").height_category = "unknown"),
      "cultivars.height_category",
    ],
    [
      "missing flower label",
      (s) => (row(s, "gg4").flowering_window_label = null),
      "cultivars.flowering_window_label",
    ],
    ["blank intro", (s) => (row(s, "gg4").description = "  "), "cultivars.description"],
    ["non-numeric THC", (s) => (row(s, "gg4").thc_pct_min = "lots"), "cultivars.thc_pct_min"],
    ["inverted THC range", (s) => (row(s, "gg4").thc_pct_min = 40), "cultivars.thc_pct_min"],
    ["bad slug", (s) => (row(s, "gg4").slug = "GG 4"), "cultivars.slug"],
    [
      "malformed sample phenos",
      (s) => (row(s, "gg4").sample_phenos = [{ label: "x" }]),
      "cultivars.sample_phenos",
    ],
    ["unreadable breeder", (s) => (row(s, "gg4").breeder_id = "nobody"), "cultivars.breeder_id"],
    [
      "sample flag dropped",
      (s) => (section(s, "gg4", "overview").content.sample_reference_data = false),
      "cultivar_guide_sections[overview].content",
    ],
    [
      "scoped guidance",
      (s) =>
        ((
          section(s, "gg4", "watering").content.guidance as Record<string, unknown>[]
        )[0].applies_when = { medium: ["soil"] }),
      "cultivar_guide_sections[watering].content",
    ],
    [
      "empty cautions",
      (s) => (section(s, "gg4", "harvest").content.cautions = []),
      "cultivar_guide_sections[harvest].content",
    ],
    [
      "unsupported risk",
      (s) =>
        ((section(s, "gg4", "harvest").content.guidance as Record<string, unknown>[])[0].risk =
          "none"),
      "cultivar_guide_sections[harvest].content",
    ],
    [
      "tendency without evidence",
      (s) =>
        ((
          section(s, "gg4", "overview").content.reported_tendencies as Record<string, unknown>[]
        )[0].evidence_keys = []),
      "cultivar_guide_sections[overview].content",
    ],
    [
      "unresolvable evidence",
      (s) =>
        ((
          section(s, "gg4", "overview").content.reported_tendencies as Record<string, unknown>[]
        )[0].evidence_keys = ["ghost-source"]),
      "cultivar_guide_sections[overview].content.reported_tendencies",
    ],
  ];

  it.each(cases)("excludes the profile for %s", (_label, mutate, path) => {
    const snapshot = freshSnapshot();
    mutate(snapshot);
    const result = map(snapshot);
    expect(result.issues).toContainEqual(expect.objectContaining({ path }));
    expect(result.catalog.profiles.map((profile) => profile.slug)).not.toContain("gg4");
    expect(result.catalog.profiles.map((profile) => profile.slug)).not.toContain("GG 4");
    expect(result.catalog.profiles).toHaveLength(9);
  });

  it("excludes a profile with a missing or out-of-order guide section", () => {
    const missing = freshSnapshot();
    missing.cultivar_guide_sections = missing.cultivar_guide_sections.filter(
      (item) => item.id !== "section:oreoz:training",
    );
    expect(slugs(missing)).not.toContain("oreoz");

    const reordered = freshSnapshot();
    (
      reordered.cultivar_guide_sections.find(
        (item) => item.id === "section:oreoz:overview",
      ) as Record<string, unknown>
    ).sort_order = 999;
    expect(slugs(reordered)).not.toContain("oreoz");
  });

  it("excludes a profile with no published guide or no readable profile source", () => {
    const noGuide = freshSnapshot();
    const id = row(noGuide, "blue-dream").id;
    for (const guide of noGuide.cultivar_guides.filter((item) => item.cultivar_id === id)) {
      guide.publication_status = "draft";
    }
    expect(slugs(noGuide)).not.toContain("blue-dream");

    const noSources = freshSnapshot();
    const bdId = row(noSources, "blue-dream").id;
    noSources.cultivar_profile_sources = noSources.cultivar_profile_sources.filter(
      (item) => item.cultivar_id !== bdId,
    );
    expect(slugs(noSources)).not.toContain("blue-dream");
  });

  it("refuses an ambiguous latest published guide", () => {
    const snapshot = freshSnapshot();
    const guide = snapshot.cultivar_guides.find(
      (item) => item.cultivar_id === row(snapshot, "oreoz").id,
    );
    snapshot.cultivar_guides.push({ ...guide, id: "second-guide-same-version" });
    const result = map(snapshot);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        slug: "oreoz",
        path: "cultivar_guides",
        message: expect.stringMatching(/ambiguous latest published guide/),
      }),
    );
    expect(result.catalog.profiles.map((profile) => profile.slug)).not.toContain("oreoz");
  });

  it("refuses a cited tendency whose section source link is missing", () => {
    const snapshot = freshSnapshot();
    snapshot.cultivar_guide_section_sources = snapshot.cultivar_guide_section_sources.filter(
      (item) => item.guide_section_id !== "section:blue-cookies:flowering",
    );
    const result = map(snapshot);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        slug: "blue-cookies",
        path: "cultivar_guide_section_sources[flowering]",
      }),
    );
    expect(result.catalog.profiles.map((profile) => profile.slug)).not.toContain("blue-cookies");
  });

  it("refuses duplicate cannabinoid summaries and gapped terpene ranks", () => {
    const duplicate = freshSnapshot();
    const thc = duplicate.cultivar_claims.find(
      (item) =>
        item.cultivar_id === row(duplicate, "og-kush").id && item.trait_key === "reported_thc_pct",
    );
    duplicate.cultivar_claims.push({ ...thc, id: "dup" });
    expect(slugs(duplicate)).not.toContain("og-kush");

    const gapped = freshSnapshot();
    const rank2 = gapped.cultivar_claims.find(
      (item) =>
        item.cultivar_id === row(gapped, "og-kush").id &&
        item.trait_key === "terpene" &&
        (item.value_jsonb as { rank: number }).rank === 2,
    );
    gapped.cultivar_claims = gapped.cultivar_claims.filter((item) => item !== rank2);
    expect(slugs(gapped)).not.toContain("og-kush");
  });

  it("refuses a cannabinoid claim stored in a non-percent unit", () => {
    for (const unit of ["mg/g", null]) {
      const snapshot = freshSnapshot();
      const thc = snapshot.cultivar_claims.find(
        (item) =>
          item.cultivar_id === row(snapshot, "jack-herer").id &&
          item.trait_key === "reported_thc_pct",
      );
      if (!thc) throw new Error("thc claim");
      thc.unit = unit;
      const result = map(snapshot);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ slug: "jack-herer", path: "cultivar_claims.unit" }),
      );
      expect(slugs(snapshot)).not.toContain("jack-herer");
    }
  });

  it("requires a percent unit on valued terpene claims and allows none on rank-only ones", () => {
    const valued = freshSnapshot();
    const terpene = valued.cultivar_claims.find(
      (item) => item.cultivar_id === row(valued, "jack-herer").id && item.trait_key === "terpene",
    );
    if (!terpene) throw new Error("terpene claim");
    terpene.value_min = 0.5;
    terpene.value_max = 1.2;
    terpene.unit = "mg/g";
    expect(slugs(valued)).not.toContain("jack-herer");
    terpene.unit = "%";
    expect(slugs(valued)).toContain("jack-herer");

    const rankOnly = freshSnapshot();
    const rankOnlyTerpene = rankOnly.cultivar_claims.find(
      (item) => item.cultivar_id === row(rankOnly, "jack-herer").id && item.trait_key === "terpene",
    );
    if (!rankOnlyTerpene) throw new Error("terpene claim");
    expect(rankOnlyTerpene.unit).toBeNull();
    expect(slugs(rankOnly)).toContain("jack-herer");
    rankOnlyTerpene.unit = "ppm";
    expect(slugs(rankOnly)).not.toContain("jack-herer");
  });

  it("refuses claims citing an unreadable source", () => {
    const snapshot = freshSnapshot();
    const claim = snapshot.cultivar_claims.find(
      (item) => item.cultivar_id === row(snapshot, "jack-herer").id && item.trait_key === "terpene",
    );
    if (!claim) throw new Error("claim");
    claim.source_id = "not-readable";
    expect(slugs(snapshot)).not.toContain("jack-herer");
  });

  it("refuses a non-https source and missing tables without throwing", () => {
    const insecure = freshSnapshot();
    insecure.cultivar_sources[0].url = "http://example.com";
    expect(map(insecure).issues).toContainEqual(
      expect.objectContaining({ path: "cultivar_sources.url" }),
    );

    const empty = mapCultivarDatabaseSnapshot({} as CultivarDatabaseSnapshot);
    expect(empty.catalog.profiles).toEqual([]);
    expect(empty.issues).toHaveLength(CULTIVAR_DATABASE_TABLES.length);
  });

  it("treats null and absent optional values as null, never as invented content", () => {
    const snapshot = freshSnapshot();
    delete row(snapshot, "oreoz").cbd_pct_min;
    const oreoz = map(snapshot).catalog.profiles.find((item) => item.slug === "oreoz");
    expect(oreoz?.cbdPctMin).toBeNull();
    expect(oreoz?.thcPctMin).toBeNull();
    expect(oreoz?.cannabinoidClaims).toEqual([]);
    expect(oreoz?.floweringDaysMin).toBeNull();
  });
});

describe("normalizeCultivarAliasForDatabase", () => {
  it("mirrors the V1 SQL normalization", () => {
    expect(normalizeCultivarAliasForDatabase("Gorilla Glue #4")).toBe("gorilla glue 4");
    expect(normalizeCultivarAliasForDatabase("  Sour D  ")).toBe("sour d");
    expect(normalizeCultivarAliasForDatabase("Do-Si-Dos!")).toBe("do si dos ");
    expect(normalizeCultivarAliasForDatabase("LCG")).toBe("lcg");
  });
});
