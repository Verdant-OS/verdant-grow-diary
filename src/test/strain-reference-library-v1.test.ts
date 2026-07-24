import { describe, expect, it } from "vitest";
import {
  CULTIVAR_GUIDE_SECTION_KEYS,
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
} from "@/constants/verdantCultivars";

describe("Strain Reference Library V1 data contract", () => {
  it("ships ten labeled sample/reference profiles including the required discovery set", () => {
    expect(VERDANT_CULTIVARS).toHaveLength(10);
    const names = VERDANT_CULTIVARS.map((profile) => profile.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Sour Diesel",
        "OG Kush",
        "Blue Dream",
        "Original Glue (GG4)",
        "Lemon Cherry Gelato",
      ]),
    );
    expect(VERDANT_CULTIVARS.every((profile) => profile.dataOrigin === "sample")).toBe(true);
    expect(VERDANT_CULTIVARS.every((profile) => profile.verificationStatus === "sample")).toBe(true);
    expect(VERDANT_CULTIVARS.every((profile) => profile.guideVersion === 1)).toBe(true);
    expect(VERDANT_CULTIVARS.every((profile) => profile.contentSchemaVersion === 1)).toBe(true);
  });

  it("uses unique slugs while allowing aliases and disputed/common names", () => {
    const slugs = VERDANT_CULTIVARS.map((profile) => profile.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const gg4 = VERDANT_CULTIVARS.find((profile) => profile.slug === "gg4");
    expect(gg4?.aliases).toEqual(
      expect.arrayContaining(["GG4", "Gorilla Glue #4", "Original Glue"]),
    );
    expect(gg4?.breeder).toBe("GG Strains LLC");
    expect(gg4?.seedExpression).toBe("clone_only");
    expect(gg4?.thcPctMin).toBe(27);
    expect(gg4?.thcPctMax).toBe(30);
  });

  it("renders every guide from a complete 14-section template plus cultivar overlays", () => {
    for (const cultivar of VERDANT_CULTIVARS) {
      const sections = getCultivarGuideSections(cultivar);
      expect(sections.map((section) => section.key)).toEqual(CULTIVAR_GUIDE_SECTION_KEYS);
      for (const section of sections) {
        expect(section.summary.trim()).not.toBe("");
        expect(section.guidance.length).toBeGreaterThan(0);
        expect(section.cautions.length).toBeGreaterThan(0);
        expect(section.missingInformation.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps an autoflower base template and conservative training posture", () => {
    const sourStomper = VERDANT_CULTIVARS.find((profile) => profile.slug === "sour-stomper");
    expect(sourStomper?.lifeCycle).toBe("autoflower");
    const training = getCultivarGuideSections(sourStomper!).find(
      (section) => section.key === "training",
    );
    expect(training?.cautions.join(" ")).toMatch(/avoid high-stress training/i);
    expect(training?.guidance.map((item) => item.text).join(" ")).not.toMatch(/aggressive/i);
  });

  it("keeps direct summary ranges aligned with the cited Wave 1 records", () => {
    const bySlug = new Map(VERDANT_CULTIVARS.map((profile) => [profile.slug, profile]));
    expect(bySlug.get("sour-diesel")?.floweringDaysMin).toBe(77);
    expect(bySlug.get("og-kush")?.floweringDaysMax).toBe(56);
    expect(bySlug.get("blue-dream")?.thcPctMin).toBe(21);
    expect(bySlug.get("sour-stomper")?.floweringDaysMin).toBe(65);
    expect(bySlug.get("oreoz")?.floweringDaysMin).toBeNull();
  });

  it("resolves explicit sources for every profile", () => {
    expect(CULTIVAR_SOURCES.length).toBeGreaterThanOrEqual(11);
    for (const cultivar of VERDANT_CULTIVARS) {
      const sources = getCultivarSources(cultivar);
      expect(sources.length).toBeGreaterThanOrEqual(2);
      expect(sources.every((source) => source.url.startsWith("https://"))).toBe(true);
      expect(sources.every((source) => source.licenseNotes.trim().length > 0)).toBe(true);
      const allowedEvidence = new Set(cultivar.sourceKeys);
      for (const section of getCultivarGuideSections(cultivar)) {
        for (const tendency of section.reportedTendencies) {
          expect(tendency.evidenceKeys.every((key) => allowedEvidence.has(key))).toBe(true);
        }
      }
    }
  });

  it("does not encode universal recipe or certainty copy", () => {
    const serialized = JSON.stringify(
      VERDANT_CULTIVARS.map((cultivar) => ({
        intro: cultivar.intro,
        sections: getCultivarGuideSections(cultivar),
      })),
    );
    expect(serialized).not.toMatch(/this strain needs/i);
    expect(serialized).not.toMatch(/always feed/i);
    expect(serialized).not.toMatch(/harvest exactly/i);
    expect(serialized).not.toMatch(/guaranteed yield/i);
  });
});
