import { useMemo } from "react";

import { useDiaryEntries } from "@/hooks/use-diary-entries";
import {
  useDiaryPhotoDisplayRows,
  type DiaryPhotoDisplayRow,
} from "@/hooks/useDiaryPhotoDisplayRows";
import { normalizeDiaryEntries, normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";
import { liftDiaryEventType } from "@/lib/plantListPhotoFallbackRules";
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

export type PlantDetailPhotoStripLookup = ReturnType<typeof usePlantDetailPhotoStripItems>;

/**
 * Newest-first photo strip items for one plant. Shared by the strip and the hero fallback.
 * With `enabled: false` it starts no diary read and hands no rows to private-photo signing,
 * so Plant Detail can keep the lookup off until the active plant view renders.
 */
export function usePlantDetailPhotoStripItems(
  plantId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const diary = useDiaryEntries({ enabled });
  const hasPlantContext = !!plantId?.trim();
  const scopedDiary = useMemo(
    () =>
      enabled && hasPlantContext && Array.isArray(diary.data)
        ? diary.data.filter((row) => normalizeDiaryEntry(row)?.plantId === plantId?.trim())
        : [],
    [diary.data, enabled, hasPlantContext, plantId],
  );
  const display = useDiaryPhotoDisplayRows(scopedDiary as ReadonlyArray<DiaryPhotoDisplayRow>);
  const latestReviewsByPhotoId = useMemo(
    () => projectLatestPhotoDiagnosisReviewsByPhoto(enabled ? diary.data : []),
    [diary.data, enabled],
  );
  const items = useMemo(() => {
    if (!plantId || display.rows.length === 0) return [] as PlantDetailPhotoStripItem[];
    const lifted = display.rows.map(liftDiaryEventType);
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
