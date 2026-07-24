import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DIARY_PHOTO_BUCKET,
  MAX_DIARY_PHOTO_STORAGE_SEGMENTS,
  parseDiaryPhotoDisplayReference,
  parseDiaryPhotoDisplayReferenceFromRow,
} from "@/lib/diaryPhotoDisplayRules";

describe("parseDiaryPhotoDisplayReference", () => {
  const owner = "viewer-1";
  const barePath = "viewer-1/grow-2/1700000000000-leaf.jpg";

  it("keeps existing http(s) photo URLs display-only", () => {
    expect(parseDiaryPhotoDisplayReference("https://cdn.example.com/leaf.jpg")).toEqual({
      kind: "external",
      url: "https://cdn.example.com/leaf.jpg",
    });
    expect(
      parseDiaryPhotoDisplayReference("HTTP://cdn.example.com/leaf.jpg?token=abc#photo"),
    ).toEqual({
      kind: "external",
      url: "HTTP://cdn.example.com/leaf.jpg?token=abc#photo",
    });
  });

  it("accepts exact-owner legacy bare paths and canonical storage references", () => {
    expect(parseDiaryPhotoDisplayReference(barePath, { viewerUserId: owner })).toEqual({
      kind: "storage",
      path: barePath,
    });
    expect(
      parseDiaryPhotoDisplayReference(`storage://${DIARY_PHOTO_BUCKET}/${barePath}`, {
        viewerUserId: owner,
      }),
    ).toEqual({ kind: "storage", path: barePath });
  });

  it("requires a nonblank exact owner before accepting a private path", () => {
    expect(parseDiaryPhotoDisplayReference(barePath)).toEqual({
      kind: "invalid",
      reason: "missing-viewer",
    });
    expect(parseDiaryPhotoDisplayReference(barePath, { viewerUserId: "   " })).toEqual({
      kind: "invalid",
      reason: "missing-viewer",
    });
    expect(parseDiaryPhotoDisplayReference(barePath, { viewerUserId: "viewer-2" })).toEqual({
      kind: "invalid",
      reason: "wrong-owner",
    });
  });

  it("rejects malformed, traversal-like, and unsafe private paths", () => {
    const cases = [
      "/viewer-1/grow-2/leaf.jpg",
      "viewer-1/grow-2/../leaf.jpg",
      "viewer-1/grow-2/./leaf.jpg",
      "viewer-1/grow-2\\leaf.jpg",
      "viewer-1/grow-2/leaf.jpg?token=1",
      "viewer-1/grow-2/leaf.jpg#fragment",
      "viewer-1/grow-2/leaf\u0000.jpg",
      "storage://other-bucket/viewer-1/grow-2/leaf.jpg",
      "storage://diary-photos//viewer-1/grow-2/leaf.jpg",
      "storage://diary-photos/viewer-1/grow-2",
    ];

    for (const raw of cases) {
      expect(parseDiaryPhotoDisplayReference(raw, { viewerUserId: owner }).kind).toBe("invalid");
    }
  });

  it("rejects unsupported schemes and untrusted display protocols", () => {
    for (const raw of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "blob:https://example.com/preview",
      "ftp://example.com/leaf.jpg",
      "storage://not-diary-photos/viewer-1/grow-2/leaf.jpg",
    ]) {
      expect(parseDiaryPhotoDisplayReference(raw, { viewerUserId: owner }).kind).toBe("invalid");
    }
  });

  it("enforces bounded storage-path lengths and segment counts", () => {
    const tooMany = Array.from({ length: MAX_DIARY_PHOTO_STORAGE_SEGMENTS + 1 }, (_, index) =>
      index === 0 ? owner : `part-${index}`,
    ).join("/");
    expect(parseDiaryPhotoDisplayReference(tooMany, { viewerUserId: owner })).toEqual({
      kind: "invalid",
      reason: "too-many-segments",
    });
    expect(
      parseDiaryPhotoDisplayReference(`${owner}/grow-2/${"x".repeat(256)}.jpg`, {
        viewerUserId: owner,
      }),
    ).toEqual({ kind: "invalid", reason: "segment-too-long" });
  });

  it("is deterministic and does not mutate row inputs", () => {
    const row = Object.freeze({
      photo_url: "not-a-photo-reference",
      details: Object.freeze({ photo_url: barePath }),
    });
    const options = Object.freeze({ viewerUserId: owner });
    const first = parseDiaryPhotoDisplayReferenceFromRow(row, options);
    const second = parseDiaryPhotoDisplayReferenceFromRow(row, options);
    expect(first).toEqual({ kind: "storage", path: barePath });
    expect(second).toEqual(first);
    expect(row.details).toEqual({ photo_url: barePath });
  });
});

describe("parseDiaryPhotoDisplayReferenceFromRow", () => {
  const options = { viewerUserId: "viewer-1" };

  it("uses a valid top-level photo_url before details.photo_url", () => {
    expect(
      parseDiaryPhotoDisplayReferenceFromRow(
        {
          photo_url: "https://cdn.example.com/top.jpg",
          details: { photo_url: "viewer-1/grow-2/fallback.jpg" },
        },
        options,
      ),
    ).toEqual({ kind: "external", url: "https://cdn.example.com/top.jpg" });
  });

  it("uses details.photo_url only when the top-level value is unusable", () => {
    expect(
      parseDiaryPhotoDisplayReferenceFromRow(
        {
          photo_url: "javascript:alert(1)",
          details: { photo_url: "viewer-1/grow-2/fallback.jpg" },
        },
        options,
      ),
    ).toEqual({ kind: "storage", path: "viewer-1/grow-2/fallback.jpg" });
  });

  it("clears a missing row and ignores non-object details", () => {
    expect(parseDiaryPhotoDisplayReferenceFromRow(undefined, options)).toEqual({
      kind: "clear",
    });
    expect(
      parseDiaryPhotoDisplayReferenceFromRow(
        { photo_url: null, details: ["viewer-1/grow-2/photo.jpg"] },
        options,
      ),
    ).toEqual({ kind: "clear" });
  });
});

describe("diaryPhotoDisplayRules safety boundary", () => {
  it("stays pure: no React, Supabase, or network calls", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/diaryPhotoDisplayRules.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*(?:react|supabase)[^"']*["']/i);
    expect(source).not.toMatch(/\b(?:fetch|createSignedUrl|createSignedUrls)\s*\(/);
  });
});
