/**
 * #2151 follow-up, hook and presenter half:
 * - usePlantDetailPhotoStripItems with enabled:false starts no diary read and
 *   hands no rows to private-photo signing.
 * - PlantPhoto renders the hero fallback as given. The fallback is an already
 *   validated diary display URL (diary references allow 4,096 characters), so
 *   the stricter 2,048-character profile-photo parser must not reject it.
 */
import { render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  diaryOptions: [] as Array<{ enabled?: boolean } | undefined>,
  displayRows: [] as unknown[][],
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
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
      isLoading: false,
      isPending: false,
      isError: false,
    };
  },
}));
vi.mock("@/hooks/useDiaryPhotoDisplayRows", () => ({
  useDiaryPhotoDisplayRows: (rows: unknown[]) => {
    probes.displayRows.push([...rows]);
    return {
      rows,
      isResolvingPrivatePhotos: false,
      isPrivatePhotoReadPaused: false,
      hasPrivatePhotoError: false,
      refetchPrivatePhotos: async () => {},
    };
  },
}));

import { usePlantDetailPhotoStripItems } from "@/hooks/usePlantDetailPhotoStripItems";
import PlantPhoto from "@/components/PlantPhoto";

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  probes.diaryOptions.length = 0;
  probes.displayRows.length = 0;
});

describe("usePlantDetailPhotoStripItems enabled gate", () => {
  it("disables the diary read and signs nothing when not enabled", () => {
    const { result } = renderHook(() => usePlantDetailPhotoStripItems("p1", { enabled: false }), {
      wrapper,
    });
    expect(probes.diaryOptions.length).toBeGreaterThan(0);
    expect(probes.diaryOptions.every((options) => options?.enabled === false)).toBe(true);
    expect(probes.displayRows.every((rows) => rows.length === 0)).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it("keeps the diary read enabled by default and scopes rows to the plant", () => {
    renderHook(() => usePlantDetailPhotoStripItems("p1"), { wrapper });
    expect(probes.diaryOptions.every((options) => options?.enabled !== false)).toBe(true);
    expect(probes.displayRows.some((rows) => rows.length === 1)).toBe(true);
  });
});

describe("PlantPhoto hero fallback", () => {
  it("renders a long, already-resolved diary display URL directly", () => {
    const longUrl = `https://example.com/${"a".repeat(3000)}.jpg`;
    const { container } = render(<PlantPhoto src="" fallbackSrc={longUrl} alt="Hero" />, {
      wrapper,
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(longUrl);
  });

  it("prefers a resolved profile photo over the fallback", () => {
    const { container } = render(
      <PlantPhoto
        src="https://example.com/profile.jpg"
        fallbackSrc="https://example.com/diary.jpg"
        alt="Hero"
      />,
      { wrapper },
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/profile.jpg",
    );
  });

  it("shows the placeholder when neither source is usable", () => {
    const { container } = render(<PlantPhoto src="" fallbackSrc="   " alt="Hero" />, {
      wrapper,
    });
    expect(container.querySelector("img")).toBeNull();
  });
});
