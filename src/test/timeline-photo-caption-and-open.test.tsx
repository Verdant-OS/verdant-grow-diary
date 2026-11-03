/**
 * #2804: viewer caption uses the entry note or the timeline local-time
 * formatter, and photo tiles open that same viewer from the keyboard.
 */
import { describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimelinePhotoLightbox from "@/components/TimelinePhotoLightbox";
import PhotoHistoryPanel from "@/components/PhotoHistoryPanel";
import PlantDetailPhotoStrip from "@/components/PlantDetailPhotoStrip";
import PlantPhotoView from "@/components/PlantPhotoView";
import { formatTimelineEntryTimestamp } from "@/lib/timelineEntryTimestampFormat";
import { TimelinePhotoLightboxCaption } from "@/lib/timelinePhotoLightboxRules";
import type { TimelinePhotoLightboxItem } from "@/lib/timelinePhotoLightboxRules";
import type { PlantDetailPhotoStripLookup } from "@/hooks/usePlantDetailPhotoStripItems";

const ISO = "2026-11-03T03:35:38.177+00:00";
const NOTE = "QA-SYNTH H7 repro photo";

const WITH_NOTE: TimelinePhotoLightboxItem = {
  id: "photo-1",
  photoUrl: "https://example.com/seedling.jpg",
  entryAt: ISO,
  note: NOTE,
  stage: "seedling",
  plantName: null,
};

const NO_NOTE: TimelinePhotoLightboxItem = {
  ...WITH_NOTE,
  id: "photo-2",
  note: "   ",
};

vi.mock("@/hooks/usePlantDetailPhotoStripItems", () => ({
  usePlantDetailPhotoStripItems: () => ({
    diary: {
      isLoading: false,
      isPending: false,
      isFetching: false,
      fetchStatus: "idle",
      isError: false,
      refetch: () => undefined,
      data: [],
    },
    display: {
      isResolvingPrivatePhotos: false,
      hasPrivatePhotoError: false,
      isPrivatePhotoReadPaused: false,
      refetchPrivatePhotos: async () => undefined,
    },
    items: [],
    hasPlantContext: false,
  }),
}));

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "unavailable",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));

describe("TimelinePhotoLightboxCaption", () => {
  it("shows the entry note and never the raw UTC timestamp", () => {
    const caption = TimelinePhotoLightboxCaption.fromItem(WITH_NOTE);
    expect(caption).toBe(NOTE);
    expect(caption).not.toContain("2026-11-03T");
    expect(caption).not.toContain("+00:00");
  });

  it("falls back to the timeline entry local-time formatter when the note is blank", () => {
    const caption = TimelinePhotoLightboxCaption.fromItem(NO_NOTE);
    expect(caption).toBe(formatTimelineEntryTimestamp(ISO));
    expect(caption).not.toContain("2026-11-03T");
  });
});

function ViewerHarness({ item }: { item: TimelinePhotoLightboxItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="tile" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <TimelinePhotoLightbox
          items={[item]}
          activeIndex={0}
          onClose={() => setOpen(false)}
          onNavigate={() => {}}
        />
      ) : null}
    </>
  );
}

describe("Timeline photo viewer caption and focus", () => {
  it("renders the note, and Escape returns focus to the tile", async () => {
    const user = userEvent.setup();
    render(<ViewerHarness item={WITH_NOTE} />);
    const tile = screen.getByTestId("tile");
    tile.focus();
    await user.click(tile);
    const caption = screen.getByTestId("timeline-photo-lightbox-caption");
    expect(caption.textContent).toBe(NOTE);
    expect(caption.textContent).not.toContain("2026-11-03T");
    expect(screen.getByTestId("timeline-photo-lightbox-close")).toHaveAccessibleName(
      "Close photo viewer",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("timeline-photo-lightbox")).toBeNull();
    expect(tile).toHaveFocus();
  });

  it("renders the local-time fallback when the note is blank", () => {
    render(
      <TimelinePhotoLightbox
        items={[NO_NOTE]}
        activeIndex={0}
        onClose={() => {}}
        onNavigate={() => {}}
      />,
    );
    const caption = screen.getByTestId("timeline-photo-lightbox-caption");
    expect(caption.textContent).toBe(formatTimelineEntryTimestamp(ISO));
    expect(caption.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("photo tiles open the viewer", () => {
  it("opens Photo history from click, Enter, and Space on the focused thumbnail", async () => {
    const user = userEvent.setup();
    const onOpenPhoto = vi.fn();
    render(
      <PhotoHistoryPanel
        rawEntries={[
          {
            id: "entry-9",
            entry_at: ISO,
            entry_type: "photo",
            note: NOTE,
            photo_url: "https://example.com/history.jpg",
            stage: "seedling",
          },
        ]}
        onOpenPhoto={onOpenPhoto}
      />,
    );
    const thumb = screen.getByTestId("photo-history-open");
    expect(thumb.tagName).toBe("BUTTON");
    thumb.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(thumb);
    expect(onOpenPhoto).toHaveBeenCalledWith("entry-9");
    expect(onOpenPhoto.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("opens a Recent Photos tile from Enter and Space on the right photo", async () => {
    const user = userEvent.setup();
    const onOpenPhoto = vi.fn();
    const photoStrip = {
      diary: {
        isLoading: false,
        isPending: false,
        isFetching: false,
        fetchStatus: "idle",
        isError: false,
        refetch: vi.fn(),
        data: [],
      },
      display: {
        isResolvingPrivatePhotos: false,
        hasPrivatePhotoError: false,
        isPrivatePhotoReadPaused: false,
        refetchPrivatePhotos: vi.fn(),
      },
      items: [
        {
          key: "k1",
          thumbnailUrl: "https://example.com/recent.jpg",
          dateLabel: "Nov 2, 2026",
          categoryLabel: "",
          altText: "Plant photo from Nov 2, 2026",
          sourcePhotoId: "entry-9",
          latestReview: null,
        },
      ],
      hasPlantContext: true,
    } as unknown as PlantDetailPhotoStripLookup;
    render(
      <PlantDetailPhotoStrip
        plantId="p1"
        photoStrip={photoStrip}
        onOpenPhoto={onOpenPhoto}
        onUploadPhoto={() => undefined}
      />,
    );
    const tile = screen.getByTestId("plant-detail-photo-strip-open");
    expect(tile.tagName).toBe("BUTTON");
    tile.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpenPhoto).toHaveBeenCalledWith("entry-9");
  });

  it("opens the hero image from Enter on a focusable control", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<PlantPhotoView src="https://example.com/hero.jpg" alt="Blue Dream" onOpen={onOpen} />);
    const hero = screen.getByTestId("plant-photo-open");
    expect(hero.tagName).toBe("BUTTON");
    hero.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalled();
  });
});
