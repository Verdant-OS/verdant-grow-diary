import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateStaticDocumentJsonLd } from "../../scripts/validate-static-document-jsonld.mts";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const VALID_ORG_LD = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Verdant",
  url: "https://verdantgrowdiary.com",
})}</script>`;

const INVALID_ORG_LD = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  // missing required "name"
})}</script>`;

const shell = (extraHead = "") =>
  `<!doctype html><html><head>${VALID_ORG_LD}${extraHead}</head><body></body></html>`;

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "static-jsonld-"));
});
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function writeDocs(dir: string, overrides: Record<string, string> = {}) {
  for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
    const full = join(dir, doc.fileName);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, overrides[doc.fileName] ?? shell());
  }
}

describe("validateStaticDocumentJsonLd", () => {
  it("passes when every registered document ships valid JSON-LD", () => {
    const root = mkdtempSync(join(tmpdir(), "static-jsonld-ok-"));
    try {
      writeDocs(root);
      const { documents, issues } = validateStaticDocumentJsonLd(root);
      expect(documents).toBe(STATIC_PUBLIC_SEO_DOCUMENTS.length);
      expect(issues).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a registered document whose file is missing from dist", () => {
    const root = mkdtempSync(join(tmpdir(), "static-jsonld-missing-"));
    try {
      writeDocs(root);
      // remove the first doc
      const victim = STATIC_PUBLIC_SEO_DOCUMENTS[0];
      rmSync(join(root, victim.fileName));
      const { issues } = validateStaticDocumentJsonLd(root);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.some((i) => i.fileName === victim.fileName && /not found/.test(i.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a document that ships no JSON-LD blocks", () => {
    const root = mkdtempSync(join(tmpdir(), "static-jsonld-empty-"));
    try {
      const victim = STATIC_PUBLIC_SEO_DOCUMENTS[0];
      writeDocs(root, {
        [victim.fileName]: `<!doctype html><html><head><title>x</title></head><body></body></html>`,
      });
      const { issues } = validateStaticDocumentJsonLd(root);
      expect(
        issues.some(
          (i) => i.fileName === victim.fileName && /no <script[^>]*ld\+json/.test(i.message),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a document whose JSON-LD is missing required fields for its @type", () => {
    const root = mkdtempSync(join(tmpdir(), "static-jsonld-invalid-"));
    try {
      const victim = STATIC_PUBLIC_SEO_DOCUMENTS[0];
      writeDocs(root, {
        [victim.fileName]: `<!doctype html><html><head>${INVALID_ORG_LD}</head><body></body></html>`,
      });
      const { issues } = validateStaticDocumentJsonLd(root);
      expect(
        issues.some(
          (i) =>
            i.fileName === victim.fileName &&
            /missing required field "name"/.test(i.message),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes against the real project dist/ when present", () => {
    const distDir = resolve(process.cwd(), "dist");
    if (!existsSync(distDir)) return;
    const { documents, issues } = validateStaticDocumentJsonLd(distDir);
    expect(documents).toBe(STATIC_PUBLIC_SEO_DOCUMENTS.length);
    expect(issues).toEqual([]);
  });
});
