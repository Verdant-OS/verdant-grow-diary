/**
 * Sample and community cultivar profiles are weak records. Search engines must
 * not index them. Reviewed and verified profiles stay indexable, and the
 * sitemap advertises only the indexable set.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import CultivarPage from "@/pages/CultivarPage";
import { VERDANT_CULTIVARS, type CultivarVerificationStatus } from "@/constants/verdantCultivars";
import {
  buildStaticCultivarDocument,
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import {
  cultivarDetailRobots,
  cultivarVerificationIsSearchIndexable,
} from "@/lib/cultivarDetailSeo";

const SITEMAP = readFileSync(resolve(__dirname, "../../public/sitemap.xml"), "utf8");

function robotsContent(path: string): string | undefined {
  return staticRouteHead(path).meta.find((entry) => entry.name === "robots")?.content;
}

afterEach(cleanup);

describe("cultivar verification search index gate", () => {
  it("noindexes sample and community profiles and keeps reviewed and verified profiles indexable", () => {
    const cases: Array<[CultivarVerificationStatus, boolean, string]> = [
      ["sample", false, "noindex, follow"],
      ["community", false, "noindex, follow"],
      ["reviewed", true, "index, follow"],
      ["verified", true, "index, follow"],
    ];
    for (const [status, indexable, robots] of cases) {
      expect(cultivarVerificationIsSearchIndexable(status)).toBe(indexable);
      expect(cultivarDetailRobots(status)).toBe(robots);
    }
  });

  it("fails closed to noindex for an unknown verification status", () => {
    for (const raw of ["pending", "", "REVIEWED"]) {
      const status = raw as unknown as CultivarVerificationStatus;
      expect(cultivarVerificationIsSearchIndexable(status)).toBe(false);
      expect(cultivarDetailRobots(status)).toBe("noindex, follow");
    }
  });

  it("applies that gate to every published cultivar static head and sitemap entry", () => {
    const samples = VERDANT_CULTIVARS.filter(
      (cultivar) => cultivar.verificationStatus === "sample",
    );
    expect(samples.length).toBeGreaterThan(0);

    for (const cultivar of VERDANT_CULTIVARS) {
      const path = `/cultivars/${cultivar.slug}`;
      const indexable = cultivarVerificationIsSearchIndexable(cultivar.verificationStatus);
      expect(robotsContent(path)).toBe(cultivarDetailRobots(cultivar.verificationStatus));
      expect(STATIC_PUBLIC_OUTPUT_DOCUMENTS.some((document) => document.path === path)).toBe(true);
      expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((document) => document.path === path)).toBe(
        indexable,
      );
      expect(SITEMAP.includes(`${VERDANT_SITE_ORIGIN}${path}</loc>`)).toBe(indexable);
    }

    expect(SITEMAP.includes(`${VERDANT_SITE_ORIGIN}/cultivars</loc>`)).toBe(true);
    expect(robotsContent("/cultivars")).toBe("index, follow");
  });

  it("keeps a verified profile's static document indexable when the live library is still sample", () => {
    const base = VERDANT_CULTIVARS[0];
    expect(base.verificationStatus).toBe("sample");
    expect(buildStaticCultivarDocument(base).metadata.robots).toBe("noindex, follow");
    expect(
      buildStaticCultivarDocument({ ...base, verificationStatus: "verified" }).metadata.robots,
    ).toBe("index, follow");
    expect(
      buildStaticCultivarDocument({ ...base, verificationStatus: "reviewed" }).metadata.robots,
    ).toBe("index, follow");
    expect(
      buildStaticCultivarDocument({ ...base, verificationStatus: "community" }).metadata.robots,
    ).toBe("noindex, follow");
  });

  it("emits noindex, follow in the client head for a sample profile", () => {
    const sample = VERDANT_CULTIVARS.find((cultivar) => cultivar.verificationStatus === "sample");
    expect(sample).toBeDefined();
    render(
      <MemoryRouter initialEntries={[`/cultivars/${sample!.slug}`]}>
        <Routes>
          <Route path="/cultivars/:slug" element={<CultivarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, follow",
    );
  });
});
