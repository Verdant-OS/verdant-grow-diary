import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  filterCultivarReferenceProfiles,
  normalizeCultivarSearchText,
} from "@/lib/cultivarReferenceSearchRules";

describe("cultivarReferenceSearchRules", () => {
  it("matches exact names and aliases before broader text matches", () => {
    expect(filterCultivarReferenceProfiles(VERDANT_CULTIVARS, { query: "GG4" })[0]?.slug).toBe(
      "gg4",
    );
    expect(
      filterCultivarReferenceProfiles(VERDANT_CULTIVARS, { query: "Gorilla Glue #4" })[0]?.slug,
    ).toBe("gg4");
    expect(
      filterCultivarReferenceProfiles(VERDANT_CULTIVARS, { query: "Sour Deez" })[0]?.slug,
    ).toBe("sour-diesel");
  });

  it("searches breeder and lineage text", () => {
    expect(
      filterCultivarReferenceProfiles(VERDANT_CULTIVARS, { query: "Mephisto Genetics" }).map(
        (profile) => profile.slug,
      ),
    ).toContain("sour-stomper");
    expect(
      filterCultivarReferenceProfiles(VERDANT_CULTIVARS, { query: "Face Off OG" }).map(
        (profile) => profile.slug,
      ),
    ).toContain("do-si-dos");
  });

  it("combines lifecycle and difficulty filters deterministically", () => {
    const first = filterCultivarReferenceProfiles(VERDANT_CULTIVARS, {
      lifeCycle: "autoflower",
      difficulty: "Beginner-friendly",
    });
    const second = filterCultivarReferenceProfiles(VERDANT_CULTIVARS, {
      lifeCycle: "autoflower",
      difficulty: "Beginner-friendly",
    });
    expect(first).toEqual(second);
    expect(first.map((profile) => profile.slug)).toEqual(["sour-stomper"]);
  });

  it("normalizes punctuation and accents without randomness", () => {
    expect(normalizeCultivarSearchText("  Do-Si-Dos #4  ")).toBe("do si dos 4");
  });
});
