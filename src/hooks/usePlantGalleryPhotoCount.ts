/**
 * usePlantGalleryPhotoCount — read-only hook returning the number of
 * gallery-quality photo thumbnails that Recent Photos would render for
 * the given plant, using the exact same pipeline as
 * `PlantDetailPhotoStrip`. Used by neighbouring surfaces (Harvest
 * Watch) so photo evidence counts can be reconciled against Recent
 * Photos without contradicting each other.
 *
 * No writes. No mutations. No AI calls. No alerts. No Action Queue.
 */
import { useMemo } from "react";

import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";
import {
  buildPlantPhotoStripItems,
  PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
} from "@/lib/plantPhotoPreviewStrip";

export function usePlantGalleryPhotoCount(
  plantId: string | null | undefined,
): number {
  const { data: rawDiary } = useDiaryEntries();

  return useMemo(() => {
    if (!plantId || !rawDiary || rawDiary.length === 0) return 0;
    const lifted = rawDiary.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.entry_type || r.entryType || r.event_type || r.eventType) return r;
      const det = (r.details ?? null) as Record<string, unknown> | null;
      const liftedType =
        det && typeof det === "object" ? det.event_type : undefined;
      return typeof liftedType === "string" && liftedType.length > 0
        ? { ...r, entry_type: liftedType }
        : r;
    });
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    const photoRows = buildPhotoHistory(normalized);
    return buildPlantPhotoStripItems({
      plantId,
      rows: photoRows,
      limit: PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
    }).length;
  }, [plantId, rawDiary]);
}
