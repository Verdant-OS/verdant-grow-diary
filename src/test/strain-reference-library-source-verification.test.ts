import { describe, expect, it } from "vitest";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  type CultivarSource,
  type VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";
import {
  classifySourceUrl,
  validateCultivarSourcesStructural,
} from "@/lib/strainSourceVerification";

describe("Automated Source Verification V0", () => {
  it("classifies the supported source families deterministically", () => {
    expect(classifySourceUrl("https://pubmed.ncbi.nlm.nih.gov/31849137/")).toBe("pubmed");
    expect(classifySourceUrl("https://www.nature.com/articles/s41477-021-01003-y")).toBe(
      "scholarly",
    );
    expect(classifySourceUrl("https://eu.mephistogenetics.com/products/sour-stomper")).toBe(
      "breeder",
    );
    expect(classifySourceUrl("https://www.leafly.com/strains/sour-diesel")).toBe(
      "community_profile",
    );
    expect(classifySourceUrl("https://example.com/reference")).toBe("generic_https");
    expect(classifySourceUrl("http://example.com/not-secure")).toBe("invalid");
    expect(classifySourceUrl("not-a-url")).toBe("invalid");
  });

  it("does not trust lookalike or suffix-spoofed hostnames", () => {
    expect(classifySourceUrl("https://pubmed.ncbi.nlm.nih.gov.evil.example/record")).toBe(
      "generic_https",
    );
    expect(classifySourceUrl("https://nature.com.evil.example/article")).toBe("generic_https");
    expect(classifySourceUrl("https://notnature.com/article")).toBe("generic_https");
    expect(classifySourceUrl("https://mephistogenetics.com.evil.example/product")).toBe(
      "generic_https",
    );
    expect(classifySourceUrl("https://leafly.com.evil.example/strain")).toBe("generic_https");
  });

  it("passes the current 14-source / 10-cultivar structural contract without mutation", () => {
    const sourceSnapshot = JSON.stringify(CULTIVAR_SOURCES);
    const cultivarSnapshot = JSON.stringify(VERDANT_CULTIVARS);

    const result = validateCultivarSourcesStructural(CULTIVAR_SOURCES, VERDANT_CULTIVARS);

    expect(result.ok).toBe(true);
    expect(result.sourceCount).toBe(14);
    expect(result.uniqueSourceKeys).toBe(14);
    expect(result.unresolvedSourceKeys).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.claimLinkCount).toBeGreaterThan(0);
    expect(result.byClassification).toEqual({
      pubmed: 2,
      scholarly: 2,
      breeder: 1,
      community_profile: 9,
      generic_https: 0,
      invalid: 0,
    });
    expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);

    expect(JSON.stringify(CULTIVAR_SOURCES)).toBe(sourceSnapshot);
    expect(JSON.stringify(VERDANT_CULTIVARS)).toBe(cultivarSnapshot);
    expect(VERDANT_CULTIVARS.every((cultivar) => cultivar.verificationStatus === "sample")).toBe(
      true,
    );
  });

  it("fails closed when a profile references a missing source key", () => {
    const first = VERDANT_CULTIVARS[0];
    const broken: VerdantCultivarProfile = {
      ...first,
      sourceKeys: [...first.sourceKeys, "missing-source-key"],
    };

    const result = validateCultivarSourcesStructural(CULTIVAR_SOURCES, [
      broken,
      ...VERDANT_CULTIVARS.slice(1),
    ]);

    expect(result.ok).toBe(false);
    expect(result.unresolvedSourceKeys).toEqual(["missing-source-key"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        sourceKey: "missing-source-key",
        code: "unresolved_source_key",
        severity: "error",
      }),
    );
  });

  it("reports malformed source metadata without changing the source object", () => {
    const valid = CULTIVAR_SOURCES[0];
    const malformed: CultivarSource = {
      ...valid,
      key: "malformed-source",
      url: "http://example.com/insecure",
      licenseNotes: "",
      retrievedAt: "not-a-date",
    };
    const snapshot = JSON.stringify(malformed);

    const result = validateCultivarSourcesStructural([malformed], []);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "url_not_https",
        "url_invalid",
        "missing_license_notes",
        "invalid_retrieved_at",
      ]),
    );
    expect(JSON.stringify(malformed)).toBe(snapshot);
  });
});
