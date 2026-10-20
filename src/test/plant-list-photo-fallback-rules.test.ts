/**
 * #2257 (VER-221, option A): a /plants card with no profile photo falls back
 * to that plant's newest diary photo, matching the Plant Detail hero.
 */
import { describe, expect, it } from "vitest";
import {
  PLANT_LIST_PHOTO_FALLBACK_LIMIT,
  plantListPhotoFallbackUrls,
  selectPlantListPhotoFallbackRows,
} from "@/lib/plantListPhotoFallbackRules";

const VIEWER = "user-1";
const row = (id: string, plantId: string, entryAt: string, photo: string | null) => ({
  id,
  plant_id: plantId,
  entry_at: entryAt,
  entry_type: "photo",
  photo_url: photo,
});

describe("selectPlantListPhotoFallbackRows", () => {
  it("picks the newest photo row per visible plant that has no profile photo", () => {
    const rows = [
      row("a-old", "A", "2026-10-01T00:00:00Z", `${VIEWER}/diary/a-old.jpg`),
      row("a-new", "A", "2026-10-10T00:00:00Z", `${VIEWER}/diary/a-new.jpg`),
      row("b-1", "B", "2026-10-05T00:00:00Z", `${VIEWER}/diary/b-1.jpg`),
      row("c-1", "C", "2026-10-05T00:00:00Z", `${VIEWER}/diary/c-1.jpg`),
    ];
    const picked = selectPlantListPhotoFallbackRows({
      plants: [
        { id: "A", photo: null },
        { id: "B", photo: "https://cdn.example/profile.jpg" },
        { id: "C", photo: "  " },
      ],
      diaryRows: rows,
      viewerUserId: VIEWER,
    });
    expect(picked.map((r) => r.id)).toEqual(["a-new", "c-1"]);
  });

  it("skips rows without a usable photo reference and other owners' paths", () => {
    const picked = selectPlantListPhotoFallbackRows({
      plants: [{ id: "A", photo: null }],
      diaryRows: [
        row("no-photo", "A", "2026-10-12T00:00:00Z", null),
        row("other-owner", "A", "2026-10-11T00:00:00Z", "someone-else/diary/x.jpg"),
        row("ok", "A", "2026-10-01T00:00:00Z", `${VIEWER}/diary/ok.jpg`),
      ],
      viewerUserId: VIEWER,
    });
    expect(picked.map((r) => r.id)).toEqual(["ok"]);
  });

  it("breaks timestamp ties by id so the choice is deterministic", () => {
    const at = "2026-10-10T00:00:00Z";
    const rows = [
      row("z", "A", at, `${VIEWER}/diary/z.jpg`),
      row("m", "A", at, `${VIEWER}/diary/m.jpg`),
    ];
    const pick = () =>
      selectPlantListPhotoFallbackRows({
        plants: [{ id: "A", photo: null }],
        diaryRows: rows,
        viewerUserId: VIEWER,
      }).map((r) => r.id);
    expect(pick()).toEqual(["m"]);
    expect(pick()).toEqual(pick());
  });

  it("caps the batch to the visible-page limit", () => {
    const plants = Array.from({ length: PLANT_LIST_PHOTO_FALLBACK_LIMIT + 5 }, (_, i) => ({
      id: `p${i}`,
      photo: null,
    }));
    const diaryRows = plants.map((p) =>
      row(`r-${p.id}`, p.id, "2026-10-10T00:00:00Z", `${VIEWER}/diary/${p.id}.jpg`),
    );
    const picked = selectPlantListPhotoFallbackRows({ plants, diaryRows, viewerUserId: VIEWER });
    expect(picked).toHaveLength(PLANT_LIST_PHOTO_FALLBACK_LIMIT);
    expect(picked[0].id).toBe("r-p0");
  });

  it("spends the cap on photos found, not on plants without one (review)", () => {
    const plants = Array.from({ length: PLANT_LIST_PHOTO_FALLBACK_LIMIT + 1 }, (_, i) => ({
      id: `p${i}`,
      photo: null,
    }));
    const last = plants[plants.length - 1].id;
    const picked = selectPlantListPhotoFallbackRows({
      plants,
      diaryRows: [row("only", last, "2026-10-10T00:00:00Z", `${VIEWER}/diary/only.jpg`)],
      viewerUserId: VIEWER,
    });
    expect(picked.map((r) => r.id)).toEqual(["only"]);
  });

  it("falls back for a profile photo PlantPhoto cannot show (review)", () => {
    const rows = ["A", "B", "C"].map((id) =>
      row(`r-${id}`, id, "2026-10-10T00:00:00Z", `${VIEWER}/diary/${id}.jpg`),
    );
    const picked = selectPlantListPhotoFallbackRows({
      plants: [
        { id: "A", photo: "storage://diary-photos/other-user/plant/a.jpg" },
        { id: "B", photo: "storage://unknown-bucket/x.jpg" },
        { id: "C", photo: `storage://diary-photos/${VIEWER}/plant/c.jpg` },
      ],
      diaryRows: rows,
      viewerUserId: VIEWER,
    });
    // A (other owner) and B (unknown bucket) resolve to nothing; C's own photo shows.
    expect(picked.map((r) => r.id)).toEqual(["r-A", "r-B"]);
  });

  it("returns nothing without a signed-in viewer or diary rows", () => {
    expect(
      selectPlantListPhotoFallbackRows({
        plants: [{ id: "A", photo: null }],
        diaryRows: [row("x", "A", "2026-10-10T00:00:00Z", `${VIEWER}/diary/x.jpg`)],
        viewerUserId: null,
      }),
    ).toEqual([]);
    expect(
      selectPlantListPhotoFallbackRows({
        plants: [{ id: "A", photo: null }],
        diaryRows: undefined,
        viewerUserId: VIEWER,
      }),
    ).toEqual([]);
  });
});

describe("plantListPhotoFallbackUrls", () => {
  it("maps each plant to its signed display URL", () => {
    const urls = plantListPhotoFallbackUrls([
      row("a-new", "A", "2026-10-10T00:00:00Z", "https://signed.example/a-new"),
      row("c-1", "C", "2026-10-05T00:00:00Z", "https://signed.example/c-1"),
    ]);
    expect(Object.fromEntries(urls)).toEqual({
      A: "https://signed.example/a-new",
      C: "https://signed.example/c-1",
    });
  });

  it("leaves a plant out when its photo could not be signed", () => {
    const urls = plantListPhotoFallbackUrls([row("a", "A", "2026-10-10T00:00:00Z", null)]);
    expect(urls.has("A")).toBe(false);
  });
});
