import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import {
  formatVerificationStatus,
  VERDANT_CULTIVARS,
  type VerdantCultivarProfile,
} from "@/constants/verdantCultivars";
import { STATIC_PUBLIC_OUTPUT_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { buildCultivarCollectionJsonLd, safeJsonLdStringify } from "@/lib/seoStructuredData";
import CultivarPage from "@/pages/CultivarPage";

// Ahrefs project 10225273, 2026-10-14 crawl; reproduced on live c0ce65cb3.
const AFFECTED_SLUGS = [
  "blue-cookies",
  "sour-stomper",
  "lemon-cherry-gelato",
  "sour-diesel",
  "do-si-dos",
  "gg4",
  "blue-dream",
  "jack-herer",
  "oreoz",
  "og-kush",
] as const;
const ORIGIN = "https://verdantgrowdiary.com";

function profile(slug: string): VerdantCultivarProfile {
  const cultivar = VERDANT_CULTIVARS.find((entry) => entry.slug === slug);
  if (!cultivar) throw new Error(`Missing regression fixture: ${slug}`);
  return cultivar;
}

function expectReferenceTopics(document: unknown, cultivar: VerdantCultivarProfile) {
  const page = document as Record<string, unknown>;
  expect(page).toMatchObject({
    "@type": "CollectionPage",
    url: `${ORIGIN}/cultivars/${cultivar.slug}`,
  });
  const subjects = (Array.isArray(page.about) ? page.about : [page.about]) as Array<
    Record<string, unknown>
  >;
  // schema.org/additionalProperty excludes bare Thing from its domain.
  // CollectionPage.about accepts Thing, including its PropertyValue subtype.
  expect(subjects.find((subject) => subject["@type"] === "Thing")).not.toHaveProperty(
    "additionalProperty",
  );
  expect(subjects[0]).toEqual({
    "@type": "Thing",
    name: `${cultivar.name} source-backed grow reference`,
    alternateName: [cultivar.searchAlias, ...cultivar.aliases].join(", "),
  });
  expect(subjects.slice(1)).toEqual(
    [
      ["Lineage", cultivar.lineage],
      ["Life cycle", cultivar.lifeCycle],
      ["Reported flower window", cultivar.flowerWeeks],
      ["Difficulty", cultivar.difficulty],
      ["Evidence state", formatVerificationStatus(cultivar.verificationStatus)],
    ].map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
  );
  expect(JSON.stringify(page)).not.toMatch(
    /"(?:@type)":"(?:Product|Offer|AggregateOffer|Review|AggregateRating)"/,
  );
}

afterEach(cleanup);

describe("cultivar schema.org property domains", () => {
  it.each(AFFECTED_SLUGS)(
    "emits valid static reference topics for %s and keeps its hold",
    (slug) => {
      const route = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find(
        (entry) => entry.path === `/cultivars/${slug}`,
      );
      expect(route?.metadata.robots).toBe("noindex, follow");
      expect(route?.metadata.url).toBe(`${ORIGIN}/cultivars/${slug}`);
      const collection = route?.metadata.jsonLd?.find(
        (node) => (node as Record<string, unknown>)["@type"] === "CollectionPage",
      );
      expectReferenceTopics(collection, profile(slug));
    },
  );

  it.each(AFFECTED_SLUGS)("emits the same valid hydrated reference topics for %s", (slug) => {
    const view = render(
      <MemoryRouter initialEntries={[`/cultivars/${slug}`]}>
        <Routes>
          <Route path="/cultivars/:slug" element={<CultivarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/cultivars/${slug}`,
    );
    const selector = `script[data-page-ldjson="cultivar-${slug}-collection"]`;
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(selector);
    expect(scripts).toHaveLength(1);
    const hydrated = JSON.parse(scripts[0].text);
    expectReferenceTopics(hydrated, profile(slug));
    const route = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find(
      (entry) => entry.path === `/cultivars/${slug}`,
    )!;
    expect(hydrated).toEqual(
      route.metadata.jsonLd!.find(
        (node) => (node as Record<string, unknown>)["@type"] === "CollectionPage",
      ),
    );
    view.unmount();
    expect(document.head.querySelector(selector)).toBeNull();
  });

  const input = {
    name: "Reported cultivar reference",
    description: "Reported context; the grower's own observations remain authoritative.",
    url: `${ORIGIN}/cultivars/og-kush`,
  };

  it("filters blank traits without dropping or rewriting valid reported evidence", () => {
    const document = buildCultivarCollectionJsonLd({
      ...input,
      properties: [
        { name: "Reported window", value: "8–10 weeks, variable" },
        { name: " ", value: "Unknown" },
        { name: "Unreported", value: " " },
        { name: "Confidence", value: "  sample, unverified  " },
      ],
    });
    expect(document.about).toEqual([
      { "@type": "Thing", name: input.name },
      { "@type": "PropertyValue", name: "Reported window", value: "8–10 weeks, variable" },
      { "@type": "PropertyValue", name: "Confidence", value: "  sample, unverified  " },
    ]);
  });

  it("keeps the cultivar identity when no traits or aliases are available", () => {
    const document = buildCultivarCollectionJsonLd({ ...input, properties: [] });
    expect(document.about).toEqual([{ "@type": "Thing", name: input.name }]);
  });

  it("is deterministic and safely serializes reported names and trait values", () => {
    const values = {
      ...input,
      alternateName: "A & B <reported>",
      properties: [{ name: "Source note", value: "</script><script>reported & variable</script>" }],
    };
    const document = buildCultivarCollectionJsonLd(values);
    expect(buildCultivarCollectionJsonLd(values)).toEqual(document);
    const serialized = safeJsonLdStringify(document);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized)).toEqual(document);
    expect(document.about).toEqual([
      { "@type": "Thing", name: input.name, alternateName: values.alternateName },
      { "@type": "PropertyValue", ...values.properties[0] },
    ]);
  });
});
