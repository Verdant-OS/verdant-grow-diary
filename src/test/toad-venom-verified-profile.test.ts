import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findCultivarBySlug, getCultivarSources } from "@/constants/verdantCultivars";
import { buildCultivarFaqItems, cultivarDetailRobots } from "@/lib/cultivarDetailSeo";
import { staticRouteHead } from "@/lib/build/staticRouteHead";

const SITEMAP = readFileSync(resolve(__dirname, "../../public/sitemap.xml"), "utf8");

describe("Toad Venom verified cultivar profile", () => {
  const toad = findCultivarBySlug("toad-venom");

  it("carries per-entry verified status, editorial origin, and the 2026-11-01 check date", () => {
    expect(toad).toBeDefined();
    expect(toad?.verificationStatus).toBe("verified");
    expect(toad?.dataOrigin).toBe("editorial");
    expect(toad?.lastVerifiedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(toad?.difficulty).toBeNull();
    expect(toad?.samplePhenos).toEqual([]);
    expect(toad?.thcPctMin).toBeNull();
    expect(toad?.yieldIndoorGPerM2Min).toBeNull();
    expect(toad?.sameNameLines).toHaveLength(6);
    expect(toad?.metaDescription?.length).toBeLessThanOrEqual(155);
  });

  it("marks seed-shop citations nofollow and leaves How High Hub unlinked", () => {
    const sources = getCultivarSources(toad!);
    const seedShop = sources.find((source) => source.key === "toad-venom-roots");
    const howHigh = sources.find((source) => source.key === "toad-venom-howhigh");
    expect(seedShop?.linkPolicy).toBe("nofollow");
    expect(howHigh?.linkPolicy).toBe("unlinked");
    expect(sources.every((source) => source.retrievedAt.startsWith("2026-11-01"))).toBe(false);
    expect(
      sources
        .filter((source) => source.key.startsWith("toad-venom-"))
        .every((source) => source.retrievedAt.startsWith("2026-11-01")),
    ).toBe(true);
  });

  it("uses the editorial FAQ and skips the unsourced beginner question", () => {
    const faq = buildCultivarFaqItems(toad!);
    expect(faq.some((item) => item.answer.startsWith("No."))).toBe(true);
    expect(faq.some((item) => /5-MeO-DMT/i.test(item.answer))).toBe(true);
    expect(faq.some((item) => /suitable for beginners/i.test(item.question))).toBe(false);
  });

  it("indexes only the verified profile in the sitemap and static head", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/cultivars/toad-venom");
    expect(SITEMAP).not.toContain("https://verdantgrowdiary.com/cultivars/sour-diesel");
    expect(cultivarDetailRobots("verified")).toBe("index, follow");
    const head = staticRouteHead("/cultivars/toad-venom");
    const robots = head.meta?.find((item) => "name" in item && item.name === "robots");
    expect(robots && "content" in robots ? robots.content : null).toBe("index, follow");
  });
});
