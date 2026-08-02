import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_SEO_GUIDES,
} from "@/constants/verdantSeoContent";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { buildGuideQuickLogStarterHref } from "@/lib/quickLogStarterLinks";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";

const ROOT = resolve(process.cwd());
const INDEX_HTML = readFileSync(resolve(ROOT, "index.html"), "utf8");

function documentAt(path: string) {
  const document = STATIC_PUBLIC_SEO_DOCUMENTS.find((candidate) => candidate.path === path);
  if (!document) throw new Error(`Missing static public document for ${path}`);
  return document;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

describe("static guide body fallback", () => {
  it("gives every public guide semantic no-JavaScript content derived from its canonical registry", () => {
    for (const guide of VERDANT_SEO_GUIDES) {
      const fallback = documentAt(`/guides/${guide.slug}`).metadata.bodyFallbackHtml;
      expect(fallback).toContain(`data-guide-slug="${guide.slug}"`);
      expect(fallback).toContain(`<h1>${escapeHtml(guide.h1)}`);
      expect(fallback).toContain('href="/guides"');
      expect(fallback).toContain("Frequently asked questions");
      expect(fallback).not.toContain("<script");
    }
  });

  it("keeps the guide directory and complete grow-stage reference available without JavaScript", () => {
    const hub = documentAt("/guides").metadata.bodyFallbackHtml ?? "";
    expect(hub).toContain("<h1>The Verdant grower guide</h1>");
    expect(hub).toContain('href="/guides/grow-stage-care-guide"');
    for (const guide of VERDANT_SEO_GUIDES) {
      expect(hub).toContain(`href="/guides/${guide.slug}"`);
    }
    for (const entry of VERDANT_GROWER_GUIDE_FAQ) {
      expect(hub).toContain(escapeHtml(entry.question));
      expect(hub).toContain(escapeHtml(entry.answer));
    }

    const stageGuide = documentAt("/guides/grow-stage-care-guide").metadata.bodyFallbackHtml ?? "";
    expect(stageGuide).toContain("<h1>Grow-stage care guide</h1>");
    expect(stageGuide).toContain("<h2>Seedling</h2>");
    expect(stageGuide).toContain("<h2>Vegetative</h2>");
    expect(stageGuide).toContain("<h2>Flower</h2>");
    expect(stageGuide).toContain("Common questions");
    expect(stageGuide).toContain('href="/welcome"');
    expect(stageGuide).toContain('href="/pricing"');
    expect(stageGuide).toContain("Explore the public demo");
    expect(stageGuide).not.toContain("<script");

    expect(hub).toContain('href="/tools/vpd-calculator"');
    expect(hub).toContain("Nothing is uploaded, saved, or treated as live telemetry.");
  });

  it("keeps the symptom cluster discoverable from static HTML", () => {
    const hub = documentAt("/guides/cannabis-leaf-symptoms").metadata.bodyFallbackHtml ?? "";
    expect(hub).toContain('href="/guides/cannabis-leaves-turning-yellow"');
    expect(hub).toContain('href="/guides/cannabis-leaf-spots-lesions"');
    expect(hub).toContain('href="/guides/cannabis-burnt-crispy-leaf-tips"');

    for (const path of [
      "/guides/cannabis-leaves-turning-yellow",
      "/guides/cannabis-leaf-spots-lesions",
      "/guides/cannabis-burnt-crispy-leaf-tips",
    ]) {
      expect(documentAt(path).metadata.bodyFallbackHtml).toContain(
        'href="/guides/cannabis-leaf-symptoms"',
      );
    }
  });

  it("preserves optional evidence, reference, source, and internal CTA content", () => {
    for (const guide of VERDANT_SEO_GUIDES) {
      const fallback = documentAt(`/guides/${guide.slug}`).metadata.bodyFallbackHtml ?? "";
      if (guide.referenceTable) {
        expect(fallback).toContain(`<h2>${escapeHtml(guide.referenceTable.caption)}</h2>`);
        for (const row of guide.referenceTable.rows) {
          expect(fallback).toContain(escapeHtml(row.visibleSign));
          expect(fallback).toContain(escapeHtml(row.doNotAssume));
        }
      }
      if (guide.evidenceTable) {
        expect(fallback).toContain(`<h2>${escapeHtml(guide.evidenceTable.heading)}</h2>`);
        for (const row of guide.evidenceTable.rows) {
          expect(fallback).toContain(escapeHtml(row.evidence));
          expect(fallback).toContain(escapeHtml(row.untrusted));
        }
      }
      for (const source of guide.sources ?? []) {
        expect(fallback).toContain(`href="${escapeHtml(source.href)}"`);
        expect(fallback).toContain(escapeHtml(source.note));
      }
      if (guide.cta) {
        expect(fallback).toContain(`href="${escapeHtml(guide.cta.to)}"`);
        expect(fallback).toContain(escapeHtml(guide.cta.label));
      }
    }
  });

  it("keeps the public bud-rot checklist available from its owning guide", () => {
    const fallback = documentAt("/guides/bud-rot-prevention-identification").metadata
      .bodyFallbackHtml;
    expect(fallback).toContain("Download the Bud Rot prevention checklist (PDF)");
    expect(fallback).toContain('href="/verdant-bud-rot-prevention-checklist.pdf"');
    expect(fallback).toContain("Nothing on this checklist triggers automation.");
  });

  it("preserves the remaining guide-specific and standard public calls to action", () => {
    const vpd = documentAt("/guides/grow-room-vpd-tracker").metadata.bodyFallbackHtml ?? "";
    expect(vpd).toContain('href="/tools/vpd-calculator"');
    expect(vpd).toContain("no upload, no diagnosis, and no device control");

    const comparison = documentAt("/guides/oreoz-vs-gelonade-comparison").metadata
      .bodyFallbackHtml ?? "";
    expect(comparison).toContain('href="/customer/guide/oreoz-vs-gelonade-comparison"');
    expect(comparison).toContain("does not load Operator grows, plants, diary entries, sensors");

    for (const guide of VERDANT_SEO_GUIDES) {
      const fallback = documentAt(`/guides/${guide.slug}`).metadata.bodyFallbackHtml ?? "";
      expect(fallback).toContain('href="/guides"');
      expect(fallback).toContain('href="/welcome"');
      expect(fallback).toContain('href="/pricing"');
      expect(fallback).toContain(
        `href="${escapeHtml(buildGuideQuickLogStarterHref(guide.slug))}"`,
      );
    }
  });

  it("preserves editorial dates as semantic time elements when the registry provides them", () => {
    for (const guide of VERDANT_SEO_GUIDES) {
      const fallback = documentAt(`/guides/${guide.slug}`).metadata.bodyFallbackHtml ?? "";

      if (guide.publishedOn) {
        expect(fallback).toContain(
          `Published <time datetime="${escapeHtml(guide.publishedOn)}">${escapeHtml(guide.publishedOn)}</time>`,
        );
      }
      if (guide.modifiedOn) {
        expect(fallback).toContain(
          `Reviewed <time datetime="${escapeHtml(guide.modifiedOn)}">${escapeHtml(guide.modifiedOn)}</time>`,
        );
      }
    }
  });

  it("emits exactly one marked fallback in the Vite shell and preserves the app root", () => {
    const guide = VERDANT_SEO_GUIDES.find(
      (candidate) => candidate.slug === "cannabis-leaf-symptoms",
    );
    if (!guide) throw new Error("Missing cannabis symptom hub guide");
    const document = documentAt("/guides/cannabis-leaf-symptoms");
    const once = buildStaticSocialRouteHtml(INDEX_HTML, document.metadata);
    const twice = buildStaticSocialRouteHtml(once, document.metadata);

    expect((twice.match(/data-static-route-fallback/g) ?? []).length).toBe(1);
    expect(twice).toContain(`<h1>${guide.h1}</h1>`);
    expect(twice).toContain('<div id="root"></div>');
    expect(twice).toContain('data-static-route-ldjson="true"');
  });
});
