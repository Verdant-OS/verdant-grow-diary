import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildCultivarBreadcrumbItems,
  buildCultivarFaqItems,
} from "@/lib/cultivarDetailSeo";

const withBreeder = VERDANT_CULTIVARS.find((c) => c.slug === "gg4")!;
const withoutBreeder = VERDANT_CULTIVARS.find((c) => c.slug === "sour-diesel")!;

// Effect/medical/outcome claims that a sample reference must never assert.
// (Note: the imperative verb "treat this as…" is a caution, not a medical
// claim, so the medical pattern targets "treats <condition>" specifically.)
const FORBIDDEN =
  /\b(euphoric|couch-?lock|relaxing high|medical benefit|cures?\b|treats (anxiety|pain|insomnia|nausea|stress)|guarantees|best strain)\b/i;

describe("buildCultivarFaqItems", () => {
  it("is deterministic and non-empty", () => {
    const a = buildCultivarFaqItems(withBreeder);
    const b = buildCultivarFaqItems(withBreeder);
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(a).toEqual(b);
  });

  it("covers flowering, lineage, and an authoritative-source disclaimer", () => {
    const items = buildCultivarFaqItems(withoutBreeder);
    expect(items.some((i) => /flower/i.test(i.question))).toBe(true);
    expect(items.some((i) => /lineage/i.test(i.question))).toBe(true);
    const disclaimer = items.find((i) => /predict|turns out/i.test(i.question));
    expect(disclaimer).toBeDefined();
    expect(disclaimer!.answer).toMatch(/^No\./);
    expect(disclaimer!.answer).toMatch(/authoritative/i);
  });

  it("frames reported ranges as variable, never fixed", () => {
    const flower = buildCultivarFaqItems(withoutBreeder).find((i) =>
      /flower/i.test(i.question),
    )!;
    expect(flower.answer).toMatch(/reported range/i);
    expect(flower.answer).toMatch(/not a fixed/i);
  });

  it("includes a breeder question only when a breeder is recorded", () => {
    expect(
      buildCultivarFaqItems(withBreeder).some((i) => /breeder or source/i.test(i.question)),
    ).toBe(true);
    expect(
      buildCultivarFaqItems(withoutBreeder).some((i) => /breeder or source/i.test(i.question)),
    ).toBe(false);
  });

  it("never asserts effects, medical, or guaranteed-outcome claims", () => {
    for (const c of VERDANT_CULTIVARS) {
      for (const item of buildCultivarFaqItems(c)) {
        expect(item.question).not.toMatch(FORBIDDEN);
        expect(item.answer).not.toMatch(FORBIDDEN);
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("buildCultivarBreadcrumbItems", () => {
  it("returns Home → Library → cultivar with absolute https URLs", () => {
    const items = buildCultivarBreadcrumbItems(withBreeder, "https://verdantgrowdiary.com");
    expect(items).toHaveLength(3);
    for (const it of items) expect(it.url).toMatch(/^https:\/\//);
    expect(items[2].name).toBe(withBreeder.name);
    expect(items[2].url).toBe("https://verdantgrowdiary.com/cultivars/gg4");
  });

  it("tolerates a trailing slash on the origin", () => {
    const items = buildCultivarBreadcrumbItems(withBreeder, "https://verdantgrowdiary.com/");
    expect(items[1].url).toBe("https://verdantgrowdiary.com/cultivars");
  });
});
