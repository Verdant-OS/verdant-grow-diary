import { describe, it, expect, vi } from "vitest";
import { uploadPlantProfilePhoto } from "@/lib/plantProfilePhotoUploadService";

function makeStorage(uploadImpl?: (path: string, body: unknown, opts: unknown) => Promise<{ error: unknown }>) {
  const upload = vi.fn(uploadImpl ?? (async () => ({ error: null })));
  return {
    storage: {
      from: (bucket: string) => ({
        __bucket: bucket,
        upload: (path: string, body: unknown, opts: unknown) =>
          upload(path, body, opts),
      }),
    } as any,
    upload,
  };
}

const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

describe("uploadPlantProfilePhoto", () => {
  it("uploads to diary-photos with owner-scoped path and returns storage reference", async () => {
    const s = makeStorage();
    const result = await uploadPlantProfilePhoto({
      file,
      mime: "image/jpeg",
      userId: "user-1",
      plantId: "plant-3",
      growId: "grow-2",
      storage: s.storage,
      buildPath: () => "user-1/grow-2/plant-profiles/plant-3/fixed.jpg",
    });
    expect(result.bucket).toBe("diary-photos");
    expect(result.path).toBe("user-1/grow-2/plant-profiles/plant-3/fixed.jpg");
    expect(result.reference).toBe(
      "storage://diary-photos/user-1/grow-2/plant-profiles/plant-3/fixed.jpg",
    );
    expect(s.upload).toHaveBeenCalledWith(
      "user-1/grow-2/plant-profiles/plant-3/fixed.jpg",
      file,
      { contentType: "image/jpeg", upsert: false },
    );
  });

  it("throws a sanitized error and never leaks raw provider text", async () => {
    const s = makeStorage(async () => ({
      error: { message: "internal-raw-provider-detail" },
    }));
    await expect(
      uploadPlantProfilePhoto({
        file,
        mime: "image/jpeg",
        userId: "u",
        plantId: "p",
        growId: null,
        storage: s.storage,
        buildPath: () => "u/unassigned/plant-profiles/p/x.jpg",
      }),
    ).rejects.toThrow("plant-profile-photo-upload-failed");
  });

  it("never persists a signed URL (only a storage:// reference)", async () => {
    const s = makeStorage();
    const result = await uploadPlantProfilePhoto({
      file,
      mime: "image/png",
      userId: "u",
      plantId: "p",
      growId: null,
      storage: s.storage,
      buildPath: () => "u/unassigned/plant-profiles/p/y.png",
    });
    expect(result.reference.startsWith("storage://")).toBe(true);
    expect(result.reference).not.toMatch(/https?:/);
    expect(result.reference).not.toMatch(/token/);
  });
});
