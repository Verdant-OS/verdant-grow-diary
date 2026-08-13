/**
 * diaryPhotoPathResolution — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDiaryPhotoPath,
  collectUnsignedDiaryPhotoPaths,
  withSignedDiaryPhotoUrls,
} from "@/lib/diaryPhotoPathResolution";

describe("resolveDiaryPhotoPath", () => {
  it("prefers the top-level photo_url when present", () => {
    expect(
      resolveDiaryPhotoPath({
        photo_url: "https://example.com/top.jpg",
        details: { photo_url: "u1/g1/1.jpg" },
      }),
    ).toBe("https://example.com/top.jpg");
  });

  it("falls back to details.photo_url when top-level is absent", () => {
    expect(
      resolveDiaryPhotoPath({ photo_url: null, details: { photo_url: "u1/g1/1.jpg" } }),
    ).toBe("u1/g1/1.jpg");
  });

  it("returns null when neither is present", () => {
    expect(resolveDiaryPhotoPath({ photo_url: null, details: null })).toBeNull();
    expect(resolveDiaryPhotoPath({ photo_url: "", details: { photo_url: "" } })).toBeNull();
  });

  it("ignores non-object details", () => {
    expect(resolveDiaryPhotoPath({ photo_url: null, details: "not-an-object" })).toBeNull();
  });
});

describe("collectUnsignedDiaryPhotoPaths", () => {
  it("collects raw storage paths, skipping already-http(s) values", () => {
    const rows = [
      { photo_url: "https://example.com/a.jpg" },
      { photo_url: null, details: { photo_url: "u1/g1/1.jpg" } },
      { photo_url: "u2/g2/2.jpg" },
    ];
    expect(collectUnsignedDiaryPhotoPaths(rows)).toEqual(["u1/g1/1.jpg", "u2/g2/2.jpg"]);
  });

  it("de-duplicates identical raw paths", () => {
    const rows = [
      { photo_url: null, details: { photo_url: "same/path.jpg" } },
      { photo_url: "same/path.jpg" },
    ];
    expect(collectUnsignedDiaryPhotoPaths(rows)).toEqual(["same/path.jpg"]);
  });

  it("returns an empty array for null/undefined/empty input", () => {
    expect(collectUnsignedDiaryPhotoPaths(null)).toEqual([]);
    expect(collectUnsignedDiaryPhotoPaths(undefined)).toEqual([]);
    expect(collectUnsignedDiaryPhotoPaths([])).toEqual([]);
  });
});

describe("withSignedDiaryPhotoUrls", () => {
  it("resolves photo_url to the signed URL for a matching raw path", () => {
    const rows = [{ id: "a", photo_url: null, details: { photo_url: "u1/g1/1.jpg" } }];
    const map = new Map([["u1/g1/1.jpg", "https://signed.example.com/1.jpg?token=x"]]);
    const out = withSignedDiaryPhotoUrls(rows, map);
    expect(out[0].photo_url).toBe("https://signed.example.com/1.jpg?token=x");
  });

  it("leaves rows unchanged when there is no matching signed URL", () => {
    const rows = [{ id: "a", photo_url: null, details: { photo_url: "u1/g1/1.jpg" } }];
    const out = withSignedDiaryPhotoUrls(rows, new Map());
    expect(out[0].photo_url).toBeNull();
  });

  it("does not mutate the input rows or the input array", () => {
    const rows = [{ id: "a", photo_url: null, details: { photo_url: "u1/g1/1.jpg" } }];
    const original = rows[0];
    const map = new Map([["u1/g1/1.jpg", "https://signed.example.com/1.jpg"]]);
    const out = withSignedDiaryPhotoUrls(rows, map);
    expect(rows[0]).toBe(original);
    expect(rows[0].photo_url).toBeNull();
    expect(out[0]).not.toBe(original);
  });

  it("passes through already-http(s) photo_url untouched", () => {
    const rows = [{ id: "a", photo_url: "https://example.com/a.jpg" }];
    const out = withSignedDiaryPhotoUrls(rows, new Map());
    expect(out[0].photo_url).toBe("https://example.com/a.jpg");
  });
});
