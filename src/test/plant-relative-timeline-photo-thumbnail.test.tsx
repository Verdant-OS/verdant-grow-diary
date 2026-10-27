/**
 * A Photo-only Quick Log row on the Plant Detail Relative Timeline must show
 * its photo, not just its note (prod report 2026-10-27, Hashato #1: header
 * counted the photo, Recent photos showed it, the timeline row did not).
 *
 * Private paths are signed through the existing owner-guarded display hook;
 * the row's "Photo" source badge comes from the raw row and must not change
 * while signing is pending or after it fails.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const OWNER = "a0000000-0000-0000-0000-000000000001";
const PLANT = "10000000-0000-0000-0000-000000000001";

const fixture = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  signCalls: [] as string[][],
  signError: false,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "a0000000-0000-0000-0000-000000000001" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        or: () => query,
        order: () => query,
        limit: () => query,
        abortSignal: () => query,
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({
            data: fixture.rows,
            error: null,
            count: fixture.rows.length,
          }).then(resolve),
      };
      return query;
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("diary-photos");
        return {
          createSignedUrls: async (paths: string[]) => {
            fixture.signCalls.push([...paths]);
            if (fixture.signError) return { data: null, error: new Error("sign failed") };
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://signed.example/${path}?token=t`,
              })),
              error: null,
            };
          },
        };
      },
    },
  },
}));

import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

const photoRow = (id: string, photo_url: string, note = "Leaves praying this morning") => ({
  id,
  plant_id: PLANT,
  entry_at: "2026-10-27T20:55:00.000Z",
  note,
  entry_type: "photo",
  photo_url,
});
const ID_PHOTO = "00000000-0000-0000-0000-000000000001";
const ID_NOTE = "00000000-0000-0000-0000-000000000002";
const OWNED_PATH = `${OWNER}/${PLANT}/${ID_PHOTO}.jpg`;

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantRelativeTimelineSection
          plantId={PLANT}
          plantStartedAt="2026-09-01T00:00:00.000Z"
          currentStage="vegetation"
          plantName="Hashato #1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findRow(id: string) {
  return waitFor(() => {
    const row = screen
      .getAllByTestId("relative-timeline-item")
      .find((el) => el.getAttribute("data-item-id") === id);
    expect(row).toBeTruthy();
    return row as HTMLElement;
  });
}

beforeEach(() => {
  fixture.rows = [];
  fixture.signCalls = [];
  fixture.signError = false;
});
afterEach(cleanup);

describe("Plant Relative Timeline photo thumbnail", () => {
  it("renders the signed photo for an owned Photo-only row and opens it full size", async () => {
    fixture.rows = [photoRow(ID_PHOTO, OWNED_PATH)];
    renderSection();
    const row = await findRow(ID_PHOTO);
    const img = await waitFor(() => within(row).getByTestId("relative-timeline-photo"));
    expect(img.getAttribute("src")).toBe(`https://signed.example/${OWNED_PATH}?token=t`);
    expect(within(row).getByTestId("relative-timeline-title").textContent).toBe(
      "Leaves praying this morning",
    );
    expect(fixture.signCalls).toEqual([[OWNED_PATH]]);

    fireEvent.click(within(row).getByTestId("relative-timeline-photo-open"));
    const lightbox = screen.getByTestId("timeline-photo-lightbox");
    // Portaled to body so a `.glass` (backdrop-filter) ancestor cannot clip it.
    expect(lightbox.parentElement).toBe(document.body);
    expect(within(lightbox).getByTestId("timeline-photo-lightbox-image").getAttribute("src")).toBe(
      `https://signed.example/${OWNED_PATH}?token=t`,
    );
  });

  it("keeps legacy http(s) photo rows working without a signing request", async () => {
    fixture.rows = [photoRow(ID_PHOTO, "https://cdn.example/legacy.jpg")];
    renderSection();
    const row = await findRow(ID_PHOTO);
    const img = await waitFor(() => within(row).getByTestId("relative-timeline-photo"));
    expect(img.getAttribute("src")).toBe("https://cdn.example/legacy.jpg");
    expect(fixture.signCalls).toEqual([]);
  });

  it("renders no thumbnail for a note row", async () => {
    fixture.rows = [{ ...photoRow(ID_NOTE, ""), entry_type: "note", photo_url: null }];
    renderSection();
    const row = await findRow(ID_NOTE);
    expect(within(row).queryByTestId("relative-timeline-photo")).toBeNull();
  });

  it("never signs or shows another owner's path, and keeps the Photo badge", async () => {
    const foreign = `b0000000-0000-0000-0000-000000000009/${PLANT}/x.jpg`;
    fixture.rows = [photoRow(ID_PHOTO, foreign)];
    renderSection();
    const row = await findRow(ID_PHOTO);
    expect(within(row).queryByTestId("relative-timeline-photo")).toBeNull();
    expect(
      within(row).getByTestId("relative-timeline-source-badge").getAttribute("data-source-label"),
    ).toBe("Photo");
    expect(fixture.signCalls).toEqual([]);
  });

  it("shows no broken image when signing fails, and keeps the Photo badge", async () => {
    fixture.signError = true;
    fixture.rows = [photoRow(ID_PHOTO, OWNED_PATH)];
    renderSection();
    const row = await findRow(ID_PHOTO);
    await waitFor(() => expect(fixture.signCalls.length).toBeGreaterThan(0));
    expect(within(row).queryByTestId("relative-timeline-photo")).toBeNull();
    expect(
      within(row).getByTestId("relative-timeline-source-badge").getAttribute("data-source-label"),
    ).toBe("Photo");
  });
});
