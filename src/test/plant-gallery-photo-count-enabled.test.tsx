/**
 * #2244 follow-up: usePlantGalleryPhotoCount with enabled:false starts no
 * diary_entries read and counts nothing; the default stays enabled.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  diaryOptions: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: (options?: { enabled?: boolean }) => {
    probes.diaryOptions.push(options);
    return {
      data: [
        {
          id: "d1",
          plant_id: "p1",
          entry_type: "photo",
          entry_at: "2026-10-01T10:00:00.000Z",
          photo_url: "https://example.com/a.jpg",
        },
      ],
    };
  },
}));

import { usePlantGalleryPhotoCount } from "@/hooks/usePlantGalleryPhotoCount";

beforeEach(() => {
  probes.diaryOptions.length = 0;
});

describe("usePlantGalleryPhotoCount enabled gate", () => {
  it("disables the diary read and counts nothing when not enabled", () => {
    const { result } = renderHook(() => usePlantGalleryPhotoCount("p1", { enabled: false }));
    expect(probes.diaryOptions.length).toBeGreaterThan(0);
    expect(probes.diaryOptions.every((options) => options?.enabled === false)).toBe(true);
    expect(result.current).toBe(0);
  });

  it("keeps the diary read enabled by default and counts the plant's photo", () => {
    const { result } = renderHook(() => usePlantGalleryPhotoCount("p1"));
    expect(probes.diaryOptions.every((options) => options?.enabled !== false)).toBe(true);
    expect(result.current).toBe(1);
  });
});
