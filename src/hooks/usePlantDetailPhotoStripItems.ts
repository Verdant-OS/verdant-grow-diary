import { useMemo } from "react";

import { useDiaryEntries } from "@/hooks/use-diary-entries";
import {
  useDiaryPhotoDisplayRows,
  type DiaryPhotoDisplayRow,
} from "@/hooks/useDiaryPhotoDisplayRows";
import { normalizeDiaryEntries, normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";
import {
  buildPlantPhotoStripItemsWithSource,
  PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
  type PlantPhotoStripSourceItem,
} from "@/lib/plantPhotoPreviewStrip";
import {
  projectLatestPhotoDiagnosisReviewsByPhoto,
  type PhotoDiagnosisLatestReview,
} from "@/lib/photoDiagnosisNoteRules";

export interface PlantDetailPhotoStripItem extends PlantPhotoStripSourceItem {
  latestReview: PhotoDiagnosisLatestReview | null;
}

/** Newest-first photo strip items for one plant. Shared by the strip and the hero fallback. */
export function usePlantDetailPhotoStripItems(plantId: string | null | undefined) {
  const diary = useDiaryEntries();
  const hasPlantContext = !!plantId?.trim();
  const scopedDiary = useMemo(
    () =>
      hasPlantContext && Array.isArray(diary.data)
        ? diary.data.filter((row) => normalizeDiaryEntry(row)?.plantId === plantId?.trim())
        : [],
    [diary.data, hasPlantContext, plantId],
  );
  const display = useDiaryPhotoDisplayRows(scopedDiary as ReadonlyArray<DiaryPhotoDisplayRow>);
  const latestReviewsByPhotoId = useMemo(
    () => projectLatestPhotoDiagnosisReviewsByPhoto(diary.data),
    [diary.data],
  );
  const items = useMemo(() => {
    if (!plantId || display.rows.length === 0) return [] as PlantDetailPhotoStripItem[];
    const lifted = display.rows.map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      if (row.entry_type || row.entryType || row.event_type || row.eventType) return row;
      const details = (row.details ?? null) as Record<string, unknown> | null;
      const liftedType = details && typeof details === "object" ? details.event_type : undefined;
      return typeof liftedType === "string" && liftedType.length > 0
        ? { ...row, entry_type: liftedType }
        : row;
    });
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    const photoRows = buildPhotoHistory(normalized);
    return buildPlantPhotoStripItemsWithSource({
      plantId,
      rows: photoRows,
      limit: PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
    }).map((item) => ({
      ...item,
      latestReview: latestReviewsByPhotoId.get(item.sourcePhotoId) ?? null,
    }));
  }, [display.rows, latestReviewsByPhotoId, plantId]);

  return { diary, display, items, hasPlantContext };
}
