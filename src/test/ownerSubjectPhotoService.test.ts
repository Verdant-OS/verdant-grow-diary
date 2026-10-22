import { describe, expect, it, vi } from "vitest";
import { uploadOwnerSubjectPhoto } from "@/lib/ownerSubjectPhotoService";

function makeStorage(
  uploadImpl?: (path: string, body: unknown, opts: unknown) => Promise<{ error: unknown }>,
) {
  const upload = vi.fn(uploadImpl ?? (async () => ({ error: null })));
  return {
    storage: {
      from: (bucket: string) => ({
        __bucket: bucket,
        upload: (path: string, body: unknown, opts: unknown) => upload(path, body, opts),
      }),
    } as any,
    upload,
  };
}

const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

describe("uploadOwnerSubjectPhoto", () => {
  it("uploads tent photos to diary-photos with owner-scoped path", async () => {
    const s = makeStorage();
    const result = await uploadOwnerSubjectPhoto({
      file,
      mime: "image/jpeg",
      userId: "user-1",
      kind: "tent",
      subjectId: "tent-3",
      storage: s.storage,
    });
    expect(result.path).toMatch(/^user-1\/tents\/tent-3\/[^/]+\.jpg$/);
    expect(result.reference).toBe(`storage://diary-photos/${result.path}`);
    expect(s.upload).toHaveBeenCalledWith(result.path, file, {
      contentType: "image/jpeg",
      upsert: false,
    });
  });

  it("uploads harvest photos under harvests folder", async () => {
    const s = makeStorage();
    const result = await uploadOwnerSubjectPhoto({
      file,
      mime: "image/png",
      userId: "user-2",
      kind: "harvest",
      subjectId: "harvest-7",
      storage: s.storage,
    });
    expect(result.path).toMatch(/^user-2\/harvests\/harvest-7\/[^/]+\.png$/);
    expect(result.reference.startsWith("storage://diary-photos/")).toBe(true);
  });

  it("throws a sanitized error and never leaks raw provider text", async () => {
    const s = makeStorage(async () => ({
      error: { message: "internal-raw-provider-detail" },
    }));
    await expect(
      uploadOwnerSubjectPhoto({
        file,
        mime: "image/jpeg",
        userId: "u",
        kind: "tent",
        subjectId: "t",
        storage: s.storage,
      }),
    ).rejects.toThrow("owner-subject-photo-upload-failed");
  });
});
