import { describe, it, expect } from "vitest";
import {
  parsePlantProfilePhotoReference,
  buildPlantProfilePhotoObjectPath,
  formatPlantProfilePhotoStorageReference,
} from "@/lib/plantProfilePhotoStorageRules";

describe("parsePlantProfilePhotoReference", () => {
  it("clears blank/nullish/whitespace", () => {
    expect(parsePlantProfilePhotoReference(null)).toEqual({ kind: "clear" });
    expect(parsePlantProfilePhotoReference(undefined)).toEqual({ kind: "clear" });
    expect(parsePlantProfilePhotoReference("")).toEqual({ kind: "clear" });
    expect(parsePlantProfilePhotoReference("   ")).toEqual({ kind: "clear" });
  });

  it("accepts a valid storage reference", () => {
    const ref = parsePlantProfilePhotoReference(
      "storage://diary-photos/user-1/grow-2/plant-profiles/plant-3/abc.jpg",
    );
    expect(ref).toEqual({
      kind: "storage",
      bucket: "diary-photos",
      path: "user-1/grow-2/plant-profiles/plant-3/abc.jpg",
    });
  });

  it("returns wrong-owner when viewer id does not match", () => {
    const ref = parsePlantProfilePhotoReference(
      "storage://diary-photos/user-1/g/plant-profiles/p/abc.jpg",
      { viewerUserId: "user-2" },
    );
    expect(ref).toEqual({ kind: "invalid", reason: "wrong-owner" });
  });

  it("rejects unknown buckets", () => {
    expect(
      parsePlantProfilePhotoReference("storage://public-bucket/x/y.jpg"),
    ).toEqual({ kind: "invalid", reason: "unknown-bucket" });
  });

  it("rejects traversal, leading slash, backslash, query, fragment", () => {
    for (const p of [
      "storage://diary-photos//u/plant-profiles/p/x.jpg",
      "storage://diary-photos/u/..\\p/x.jpg",
      "storage://diary-photos/u/../etc/x.jpg",
      "storage://diary-photos/u/g/plant-profiles/p/x.jpg?token=1",
      "storage://diary-photos/u/g/plant-profiles/p/x.jpg#frag",
    ]) {
      expect(parsePlantProfilePhotoReference(p).kind).toBe("invalid");
    }
  });

  it("keeps legacy https and data:image URLs renderable", () => {
    expect(parsePlantProfilePhotoReference("https://x/y.jpg")).toMatchObject({
      kind: "external",
    });
    expect(
      parsePlantProfilePhotoReference("data:image/png;base64,AAAA"),
    ).toMatchObject({ kind: "data" });
  });

  it("marks blob: as preview only", () => {
    expect(parsePlantProfilePhotoReference("blob:https://x/1")).toMatchObject({
      kind: "preview",
    });
  });

  it("rejects unsupported protocols and malformed URLs", () => {
    expect(parsePlantProfilePhotoReference("javascript:alert(1)")).toEqual({
      kind: "invalid",
      reason: "unsupported-protocol",
    });
    expect(parsePlantProfilePhotoReference("not a url")).toMatchObject({
      kind: "invalid",
    });
  });
});

describe("buildPlantProfilePhotoObjectPath", () => {
  const randomId = () => "fixed-id-123";

  it("places the authenticated user id as the first segment", () => {
    const path = buildPlantProfilePhotoObjectPath({
      userId: "user-1",
      growId: "grow-2",
      plantId: "plant-3",
      extension: "jpg",
      randomId,
    });
    expect(path).toBe("user-1/grow-2/plant-profiles/plant-3/fixed-id-123.jpg");
  });

  it("uses 'unassigned' when growId is missing", () => {
    const path = buildPlantProfilePhotoObjectPath({
      userId: "user-1",
      growId: null,
      plantId: "plant-3",
      extension: "png",
      randomId,
    });
    expect(path).toContain("user-1/unassigned/plant-profiles/plant-3/");
  });

  it("never uses the original filename (only ext + random id)", () => {
    const path = buildPlantProfilePhotoObjectPath({
      userId: "u",
      growId: "g",
      plantId: "p",
      extension: "webp",
      randomId,
    });
    expect(path.endsWith("/fixed-id-123.webp")).toBe(true);
    expect(path).not.toMatch(/my-secret-photo/);
  });

  it("rejects invalid inputs", () => {
    expect(() =>
      buildPlantProfilePhotoObjectPath({
        userId: "",
        growId: "g",
        plantId: "p",
        extension: "jpg",
        randomId,
      }),
    ).toThrow();
    expect(() =>
      buildPlantProfilePhotoObjectPath({
        userId: "u",
        growId: "g",
        plantId: "p",
        extension: "exe",
        randomId,
      }),
    ).toThrow();
    expect(() =>
      buildPlantProfilePhotoObjectPath({
        userId: "u/../",
        growId: "g",
        plantId: "p",
        extension: "jpg",
        randomId,
      }),
    ).toThrow();
  });
});

describe("formatPlantProfilePhotoStorageReference", () => {
  it("emits the canonical scheme", () => {
    expect(formatPlantProfilePhotoStorageReference("diary-photos", "u/g/p/x.jpg")).toBe(
      "storage://diary-photos/u/g/p/x.jpg",
    );
  });
});
