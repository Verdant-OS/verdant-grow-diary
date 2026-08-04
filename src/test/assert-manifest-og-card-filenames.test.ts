/**
 * Unit tests for scripts/assert-manifest-og-card-filenames.mjs.
 *
 * Locks the contract that every OG card referenced by dist/seo-manifest.json is
 * present under dist/client/og with the exact expected filename — including
 * byte-for-byte case, which a case-insensitive local filesystem would hide.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REQUIRED_STANDALONE_CARDS,
  expectedCardFileName,
  readOgCardDirectory,
  referencedOgCardFileName,
  validateManifestOgCardFileNames,
} from "../../scripts/assert-manifest-og-card-filenames.mjs";

const ORIGIN = "https://verdantgrowdiary.com";

type Doc = { path: string; url: string; image?: string };

function makeDist(documents: Doc[], cardFiles: string[], options: { manifest?: unknown } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "og-filenames-"));
  mkdirSync(join(dir, "client/og"), { recursive: true });
  for (const file of cardFiles) {
    writeFileSync(join(dir, "client/og", file), Buffer.alloc(64, 1));
  }
  const manifest =
    options.manifest ??
    {
      origin: ORIGIN,
      documents: documents.map((doc) => ({
        path: doc.path,
        fileName: `${doc.path}.html`,
        metadata: { url: doc.url, image: doc.image ?? `${ORIGIN}/brand/verdant-logo-512.png` },
      })),
    };
  writeFileSync(join(dir, "seo-manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

describe("expectedCardFileName", () => {
  it("maps the site root to home.png", () => {
    expect(expectedCardFileName(`${ORIGIN}/`)).toEqual({ ok: true, fileName: "home.png" });
  });

  it("flattens nested paths with a double dash", () => {
    expect(expectedCardFileName(`${ORIGIN}/guides/bud-rot`)).toEqual({
      ok: true,
      fileName: "guides--bud-rot.png",
    });
  });

  it("lowercases mixed-case canonical paths", () => {
    expect(expectedCardFileName(`${ORIGIN}/Guides/Bud-Rot`)).toEqual({
      ok: true,
      fileName: "guides--bud-rot.png",
    });
  });

  it("rejects a relative canonical URL", () => {
    const result = expectedCardFileName("/guides/bud-rot");
    expect(result.ok).toBe(false);
    expect(String((result as { reason: string }).reason)).toContain("not absolute");
  });

  it("rejects a missing canonical URL", () => {
    expect(expectedCardFileName(undefined).ok).toBe(false);
  });
});

describe("referencedOgCardFileName", () => {
  it("extracts the basename of an absolute og card URL", () => {
    expect(referencedOgCardFileName(`${ORIGIN}/og/pricing.png`)).toBe("pricing.png");
  });

  it("extracts the basename of a relative og card URL", () => {
    expect(referencedOgCardFileName("/og/guides--bud-rot.png")).toBe("guides--bud-rot.png");
  });

  it("returns null for a non-card image such as the brand logo", () => {
    expect(referencedOgCardFileName(`${ORIGIN}/brand/verdant-logo-512.png`)).toBeNull();
  });

  it("returns null for an absent image", () => {
    expect(referencedOgCardFileName(undefined)).toBeNull();
    expect(referencedOgCardFileName("")).toBeNull();
  });
});

describe("readOgCardDirectory", () => {
  it("reports the real listing", () => {
    const dist = makeDist([{ path: "/pricing", url: `${ORIGIN}/pricing` }], [
      "home.png",
      "pricing.png",
    ]);
    try {
      const listing = readOgCardDirectory(dist);
      expect(listing.ok).toBe(true);
      expect([...(listing as { files: Set<string> }).files].sort()).toEqual([
        "home.png",
        "pricing.png",
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when dist/client/og does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "og-filenames-empty-"));
    try {
      const listing = readOgCardDirectory(dir);
      expect(listing.ok).toBe(false);
      expect(String((listing as { reason: string }).reason)).toContain("never emitted");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validateManifestOgCardFileNames", () => {
  it("passes when every referenced card exists with the exact filename", () => {
    const dist = makeDist(
      [
        { path: "/pricing", url: `${ORIGIN}/pricing`, image: `${ORIGIN}/og/pricing.png` },
        {
          path: "/guides/bud-rot",
          url: `${ORIGIN}/guides/bud-rot`,
          image: `${ORIGIN}/og/guides--bud-rot.png`,
        },
      ],
      ["home.png", "pricing.png", "guides--bud-rot.png"],
    );
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(2);
      expect(result.total).toBe(3);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when a referenced card is missing entirely", () => {
    const dist = makeDist(
      [{ path: "/pricing", url: `${ORIGIN}/pricing` }],
      ["home.png"],
    );
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain('expected OG card "og/pricing.png" is not present');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails on a case-only filename mismatch and names the near miss", () => {
    const dist = makeDist(
      [{ path: "/guides/bud-rot", url: `${ORIGIN}/guides/bud-rot` }],
      ["home.png", "Guides--Bud-Rot.png"],
    );
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("Guides--Bud-Rot.png");
      expect(result.problems.join("\n")).toContain("case must match exactly");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when metadata.image points at a different card than the canonical path", () => {
    const dist = makeDist(
      [{ path: "/pricing", url: `${ORIGIN}/pricing`, image: `${ORIGIN}/og/home.png` }],
      ["home.png", "pricing.png"],
    );
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain('references "og/home.png"');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("allows a document that references the brand logo instead of a card", () => {
    const dist = makeDist(
      [
        {
          path: "/pricing",
          url: `${ORIGIN}/pricing`,
          image: `${ORIGIN}/brand/verdant-logo-512.png`,
        },
      ],
      ["home.png", "pricing.png"],
    );
    try {
      expect(validateManifestOgCardFileNames(dist).ok).toBe(true);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when the standalone homepage card is missing", () => {
    const dist = makeDist([{ path: "/pricing", url: `${ORIGIN}/pricing` }], ["pricing.png"]);
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain('standalone OG card "og/home.png"');
      expect(REQUIRED_STANDALONE_CARDS).toContain("home.png");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when the manifest lists no documents rather than passing vacuously", () => {
    const dist = makeDist([], ["home.png"], { manifest: { origin: ORIGIN, documents: [] } });
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("vacuously");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("fails when the manifest is missing or unparseable", () => {
    const missing = mkdtempSync(join(tmpdir(), "og-filenames-nomanifest-"));
    const broken = makeDist([{ path: "/x", url: `${ORIGIN}/x` }], ["home.png"]);
    try {
      expect(validateManifestOgCardFileNames(missing).ok).toBe(false);
      writeFileSync(join(broken, "seo-manifest.json"), "{ not json");
      const result = validateManifestOgCardFileNames(broken);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("not valid JSON");
    } finally {
      rmSync(missing, { recursive: true, force: true });
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it("fails when a document's canonical URL is not absolute", () => {
    const dist = makeDist([{ path: "/pricing", url: "/pricing" }], ["home.png", "pricing.png"]);
    try {
      const result = validateManifestOgCardFileNames(dist);
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("not absolute");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
