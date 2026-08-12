/**
 * PlantDetailPhotoStrip — presentation-only recent-photo preview strip
 * for Plant Detail.
 *
 * Read-only. Uses the existing `useDiaryEntries` read hook and the pure
 * `photoHistoryRules` + `plantPhotoPreviewStrip` view-models to render up
 * to 5 latest photos for the current plant. Mobile-friendly horizontal
 * strip. No uploads or writes.
 */
import { Link } from "react-router-dom";
import { Image as ImageIcon, Upload, AlertCircle } from "lucide-react";

import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";
import {
  buildPlantPhotoStripItems,
  PLANT_PHOTO_STRIP_DEFAULT_LIMIT,
} from "@/lib/plantPhotoPreviewStrip";
import {
  collectUnsignedDiaryPhotoPaths,
  withSignedDiaryPhotoUrls,
} from "@/lib/diaryPhotoPathResolution";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { logsPath } from "@/lib/routes";
import { useEffect, useMemo, useState } from "react";

interface PlantDetailPhotoStripProps {
  plantId: string | null | undefined;
  growId?: string | null;
  /**
   * Optional handler invoked when the grower taps "Add photo log".
   * When provided, the CTA stays on Plant Detail and opens the
   * plant-scoped Quick Log (which owns the actual photo upload).
   * When omitted, the CTA falls back to the generic logs route as
   * a last resort (preserves the selected grow context).
   */
  onUploadPhoto?: () => void;
}

const HEADING_ID = "plant-detail-photo-strip-heading";

export default function PlantDetailPhotoStrip({
  plantId,
  growId,
  onUploadPhoto,
}: PlantDetailPhotoStripProps) {
  const { data: rawDiary, isLoading, isError, refetch } = useDiaryEntries();

  // quicklog_save_event's diary companion row never sets the top-level
  // photo_url column -- it only stores the raw storage path inside
  // details.photo_url. useDiaryEntries() is a shared, cached read with no
  // signing step of its own (unlike Timeline.tsx, which does its own
  // separate fetch and signs there), so resolve + sign those paths here.
  // Signed URLs are kept in local state and merged in below rather than
  // written back onto `rawDiary` itself, since that array is the shared
  // React Query cache other components also read.
  const [signedUrlByPath, setSignedUrlByPath] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const paths = collectUnsignedDiaryPhotoPaths(
      (rawDiary ?? []) as Array<{ photo_url?: unknown; details?: unknown }>,
    );
    if (paths.length === 0) {
      setSignedUrlByPath((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("diary-photos")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (cancelled) return;
        setSignedUrlByPath(
          new Map((data ?? []).map((s) => [s.path as string, s.signedUrl])),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rawDiary]);

  const items = useMemo(() => {
    if (!plantId || !rawDiary || rawDiary.length === 0) return [];
    const signed = withSignedDiaryPhotoUrls(
      rawDiary as Array<{ photo_url?: unknown; details?: unknown }>,
      signedUrlByPath,
    );
    // Lift details.event_type for normalization parity with PhotoHistoryPanel.
    const lifted = signed.map((raw) => {
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
    });
  }, [plantId, rawDiary, signedUrlByPath]);

  const hasPlantContext = !!(plantId && plantId.trim());
  const uploadHref = logsPath(growId ?? null);

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="plant-detail-photo-strip"
      className="glass rounded-2xl p-4 my-3"
    >
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2
          id={HEADING_ID}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          Recent photos
        </h2>
        {hasPlantContext ? (
          onUploadPhoto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={onUploadPhoto}
              data-testid="plant-detail-photo-strip-upload"
              aria-label="Add photo log for this plant"
            >
              <Upload className="h-3.5 w-3.5" /> Add photo log
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              data-testid="plant-detail-photo-strip-upload"
            >
              <Link to={uploadHref} aria-label="Add photo log for this plant">
                <Upload className="h-3.5 w-3.5" /> Add photo log
              </Link>
            </Button>
          )
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            aria-disabled
            className="h-7 gap-1"
            data-testid="plant-detail-photo-strip-upload-disabled"
            title="Plant context is not loaded yet."
          >
            <Upload className="h-3.5 w-3.5" /> Add photo log
          </Button>
        )}
      </header>

      {isLoading ? (
        <div
          data-testid="plant-detail-photo-strip-loading"
          role="status"
          aria-live="polite"
          className="flex gap-2 overflow-hidden"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 w-20 shrink-0 rounded-lg bg-secondary/40 animate-pulse"
              aria-hidden
            />
          ))}
          <span className="sr-only">Loading recent photos…</span>
        </div>
      ) : isError ? (
        <div
          data-testid="plant-detail-photo-strip-error"
          className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-3 text-sm text-muted-foreground flex items-center justify-between gap-3"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />
            Recent photos are unavailable right now.
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              void refetch();
            }}
            data-testid="plant-detail-photo-strip-retry"
          >
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div
          data-testid="plant-detail-photo-strip-empty"
          className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center"
        >
          <p className="text-sm text-muted-foreground">No photos yet.</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Add a photo to start building visual plant memory.
          </p>
        </div>
      ) : (
        <ul
          data-testid="plant-detail-photo-strip-list"
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x"
        >
          {items.map((item) => (
            <li
              key={item.key}
              data-testid="plant-detail-photo-strip-item"
              className="shrink-0 w-24 sm:w-28 snap-start rounded-lg overflow-hidden border border-border/40 bg-card/40"
            >
              <div className="relative aspect-square bg-secondary/30">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.altText}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5 opacity-50" />
                  </div>
                )}
              </div>
              <div className="px-1.5 py-1">
                {item.dateLabel && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {item.dateLabel}
                  </div>
                )}
                {item.categoryLabel && (
                  <div className="text-[10px] text-foreground/70 truncate">
                    {item.categoryLabel}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
