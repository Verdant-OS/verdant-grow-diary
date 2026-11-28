/**
 * indexable-meta-description-length.test
 *
 * Search engines cut a meta description at roughly 155–160 characters.
 * A longer one shows up truncated in results, so the grower sees a
 * sentence that stops mid-thought. This fence keeps every indexable
 * public page and every SEO guide at 160 characters or fewer.
 *
 * Scope: STATIC_PUBLIC_SEO_DOCUMENTS (the indexable prerendered pages)
 * and VERDANT_SEO_GUIDES (the guide copy those documents are built from).
 * Alias, noindex and cultivar documents live in separate registries and
 * are intentionally not covered here.
 *
 * Pure data check: no render, no network.
 */
import { describe, expect, it } from "vitest";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";

const MAX_DESCRIPTION_LENGTH = 160;

function overLimit(entries: ReadonlyArray<{ id: string; description: string }>) {
  return entries
    .filter((entry) => entry.description.length > MAX_DESCRIPTION_LENGTH)
    .map((entry) => `${entry.id} (${entry.description.length})`);
}

describe("indexable meta description length", () => {
  it("has indexable documents and guides to check", () => {
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.length).toBeGreaterThan(0);
    expect(VERDANT_SEO_GUIDES.length).toBeGreaterThan(0);
  });

  it("keeps every indexable static document description at 160 characters or fewer", () => {
    const entries = STATIC_PUBLIC_SEO_DOCUMENTS.map((doc) => ({
      id: doc.path,
      description: doc.metadata.description ?? "",
    }));
    expect(overLimit(entries)).toEqual([]);
  });

  it("keeps every SEO guide description at 160 characters or fewer", () => {
    const entries = VERDANT_SEO_GUIDES.map((guide) => ({
      id: guide.slug,
      description: guide.description,
    }));
    expect(overLimit(entries)).toEqual([]);
  });

  it("counts characters, so a 161-character description is reported", () => {
    const sample = [{ id: "sample", description: "x".repeat(161) }];
    expect(overLimit(sample)).toEqual(["sample (161)"]);
    expect(overLimit([{ id: "ok", description: "x".repeat(160) }])).toEqual([]);
  });
});
