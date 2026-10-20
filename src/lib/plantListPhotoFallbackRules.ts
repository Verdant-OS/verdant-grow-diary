/**
 * /plants card photo fallback (#2257, VER-221 option A).
 *
 * A card whose plant has no profile photo shows that plant's newest diary
 * photo, the same image the Plant Detail hero falls back to. Pure: the page
 * passes the diary rows it already loads and the signed-in viewer id, then
 * signs the selected rows in one batch and maps them back here.
 */
import { normalizeDiaryEntries, normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import {
  parseDiaryPhotoDisplayReferenceFromRow,
  type DiaryPhotoReferenceRowLike,
} from "@/lib/diaryPhotoDisplayRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";

/** Most cards one /plants render signs; the grid is one unpaginated page. */
export const PLANT_LIST_PHOTO_FALLBACK_LIMIT = 48;

export interface PlantListPhotoFallbackPlant {
  readonly id: string;
  readonly photo?: string | null;
}

type DiaryRow = DiaryPhotoReferenceRowLike & Record<string, unknown>;

/**
 * Diary rows saved by Quick Log keep their event type in `details.event_type`.
 * Shared with the Plant Detail photo strip so both read rows the same way.
 */
export function liftDiaryEventType(raw: unknown): Record<string, unknown> {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (row.entry_type || row.entryType || row.event_type || row.eventType) return row;
  const details = (row.details ?? null) as Record<string, unknown> | null;
  const liftedType = details && typeof details === "object" ? details.event_type : undefined;
  return typeof liftedType === "string" && liftedType.length > 0
    ? { ...row, entry_type: liftedType }
    : row;
}

function hasProfilePhoto(plant: PlantListPhotoFallbackPlant): boolean {
  return typeof plant.photo === "string" && plant.photo.trim().length > 0;
}

function isNewer(
  candidate: { at: number | null; id: string },
  current: { at: number | null; id: string },
): boolean {
  if (candidate.at !== null && current.at !== null) {
    if (candidate.at !== current.at) return candidate.at > current.at;
    return candidate.id < current.id;
  }
  if (candidate.at !== null) return true;
  if (current.at !== null) return false;
  return candidate.id < current.id;
}

/**
 * The newest photo-bearing diary row for each visible plant without a profile
 * photo, in plant order, capped at `limit`. Rows whose photo is not owned by
 * the viewer or not displayable are skipped, so an older usable photo still wins.
 */
export function selectPlantListPhotoFallbackRows(input: {
  plants: ReadonlyArray<PlantListPhotoFallbackPlant>;
  diaryRows: ReadonlyArray<unknown> | null | undefined;
  viewerUserId: string | null | undefined;
  limit?: number;
}): DiaryRow[] {
  const viewerUserId = input.viewerUserId ?? null;
  if (!viewerUserId || !Array.isArray(input.diaryRows)) return [];
  const limit = input.limit ?? PLANT_LIST_PHOTO_FALLBACK_LIMIT;
  const wanted = input.plants
    .filter((plant) => !hasProfilePhoto(plant))
    .slice(0, Math.max(0, limit))
    .map((plant) => plant.id);
  if (wanted.length === 0) return [];
  const wantedSet = new Set(wanted);

  const best = new Map<string, { row: DiaryRow; at: number | null; id: string }>();
  for (const raw of input.diaryRows) {
    const entry = normalizeDiaryEntry(raw);
    const plantId = entry?.plantId;
    if (!entry || !plantId || !wantedSet.has(plantId)) continue;
    const reference = parseDiaryPhotoDisplayReferenceFromRow(raw as DiaryRow, { viewerUserId });
    if (reference.kind !== "storage" && reference.kind !== "external") continue;
    const parsed = entry.createdAt ? Date.parse(entry.createdAt) : Number.NaN;
    const candidate = {
      row: raw as DiaryRow,
      at: Number.isFinite(parsed) ? parsed : null,
      id: entry.id,
    };
    const current = best.get(plantId);
    if (!current || isNewer(candidate, current)) best.set(plantId, candidate);
  }

  return wanted.flatMap((plantId) => {
    const hit = best.get(plantId);
    return hit ? [hit.row] : [];
  });
}

/**
 * Plant id → display URL, from rows after private photos were signed. Uses the
 * same photo-history projection as the Plant Detail strip and hero.
 */
export function plantListPhotoFallbackUrls(
  displayRows: ReadonlyArray<unknown>,
): Map<string, string> {
  const history = buildPhotoHistory(
    normalizeDiaryEntries({ rawEntries: displayRows.map(liftDiaryEventType) }),
  );
  const urls = new Map<string, string>();
  for (const photo of history) {
    if (!photo.plantId || !photo.photoUrl || urls.has(photo.plantId)) continue;
    urls.set(photo.plantId, photo.photoUrl);
  }
  return urls;
}
