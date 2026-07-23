import { describe, expect, it } from "vitest";
import { matchCultivarForStrain } from "@/lib/plantCultivarHint";

describe("matchCultivarForStrain", () => {
  it("matches an exact strain name (case/space/punct-insensitive)", () => {
    expect(matchCultivarForStrain("Blue Dream")?.slug).toBe("blue-dream");
    expect(matchCultivarForStrain("  blue dream ")?.slug).toBe("blue-dream");
  });

  it("resolves compact aliases like GG4 / GG-4 to Original Glue", () => {
    expect(matchCultivarForStrain("GG4")?.slug).toBe("gg4");
    expect(matchCultivarForStrain("gg-4")?.slug).toBe("gg4");
    expect(matchCultivarForStrain("Original Glue")?.slug).toBe("gg4");
  });

  it("does NOT suggest on weak partial text (no false auto-linking)", () => {
    expect(matchCultivarForStrain("Blue")).toBeNull();
    expect(matchCultivarForStrain("OG")).not.toBeNull(); // "OG" is a real OG Kush alias
    expect(matchCultivarForStrain("Diesel")).toBeNull(); // "Sour Diesel" needs the full name
    expect(matchCultivarForStrain("my mystery bagseed")).toBeNull();
  });

  it("returns null for empty / too-short input", () => {
    expect(matchCultivarForStrain("")).toBeNull();
    expect(matchCultivarForStrain(null)).toBeNull();
    expect(matchCultivarForStrain("a")).toBeNull();
  });

  it("ignores unpublished cultivars", () => {
    const draft = [
      {
        slug: "secret",
        name: "Secret Cut",
        searchAlias: "secret",
        aliases: [] as readonly string[],
        publicationStatus: "draft",
      },
    ] as never;
    expect(matchCultivarForStrain("Secret Cut", draft)).toBeNull();
  });
});
