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

  // Scope to this plant's rows before doing anything else -- useDiaryEntries()
  // returns the grower's whole unfiltered diary, and requesting/evaluating
  // signed URLs for other plants' photos would let an unrelated plant's
  // signing failure (or slow response) block or blank out this plant's
  // otherwise-fine gallery.
  const plantRawRows = useMemo(() => {
    if (!plantId || !rawDiary) return [];
    return (rawDiary as Array<Record<string, unknown>>).filter((r) => {
      const rowPlantId =
        typeof r.plant_id === "string"
          ? r.plant_id
          : typeof r.plantId === "string"
            ? r.plantId
            : null;
      return rowPlantId === plantId;
    });
  }, [plantId, rawDiary]);

  // quicklog_save_event's diary companion row never sets the top-level
  // photo_url column -- it only stores the raw storage path inside
  // details.photo_url. useDiaryEntries() is a shared, cached read with no
  // signing step of its own (unlike Timeline.tsx, which does its own
  // separate fetch and signs there), so resolve + sign those paths here.
  // Signed URLs are kept in local state and merged in below rather than
  // written back onto `rawDiary` itself, since that array is the shared
  // React Query cache other components also read.
  const [signedUrlByPath, setSignedUrlByPath] = useState<Map<string, string>>(new Map());
  // Distinct from the diary fetch's own isError: a failed/rejected signing
  // call must not read as "no photos" -- unsigned companion paths would
  // otherwise just get filtered out by buildPlantPhotoStripItems and the
  // strip would silently render its empty state instead of surfacing the
  // failure. retryNonce lets the shared Retry button force a fresh signing
  // attempt independent of whether useDiaryEntries() actually refetches.
  const [signingError, setSigningError] = useState(false);
  const [signingRetryNonce, setSigningRetryNonce] = useState(0);

  // Computed synchronously during render, from plain plantRawRows (already
  // available on the very first render, cache or not) rather than an
  // effect-set state flag -- an effect only runs after that first render
  // (and can run after the browser paints), so a companion-only photo on
  // an already-cached diary query would flash "No photos yet" for one
  // frame before an effect-driven flag caught up. A stale signingError
  // from a previous attempt takes precedence over "pending" until the
  // retry's own effect run resolves; that's fine, since the error banner
  // (not the empty state) is what's shown in that window either way.
  const pendingSignPaths = useMemo(
    () =>
      collectUnsignedDiaryPhotoPaths(
        plantRawRows as Array<{ photo_url?: unknown; details?: unknown }>,
      ),
    [plantRawRows],
  );
  const signingInProgress =
    pendingSignPaths.length > 0 &&
    !signingError &&
    pendingSignPaths.some((p) => !signedUrlByPath.has(p));

  useEffect(() => {
    if (pendingSignPaths.length === 0) {
      setSigningError(false);
      setSignedUrlByPath((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("diary-photos")
      .createSignedUrls(pendingSignPaths, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setSigningError(true);
          return;
        }
        // The Supabase contract allows an overall-successful response whose
        // individual entries still failed (e.g. a missing storage object) --
        // each carries its own `error`, and either the path or the
        // signedUrl (or both) may come back null on that entry. Rather than
        // branching on each item's failure shape (a null path with an error
        // set was previously skipped before its error was ever inspected),
        // only accept fully-formed successes into the map, then verify
        // every path we actually requested made it in. Anything missing --
        // whatever shape its failure took, including a result item dropped
        // entirely -- is a failure.
        const map = new Map<string, string>();
        for (const item of data as Array<{
          path?: string | null;
          signedUrl?: string | null;
          error?: string | null;
        }>) {
          const path = typeof item?.path === "string" ? item.path : null;
          const signedUrl =
            typeof item?.signedUrl === "string" && item.signedUrl.length > 0
              ? item.signedUrl
              : null;
          if (path && signedUrl && !item?.error) {
            map.set(path, signedUrl);
          }
        }
        const anyFailed = pendingSignPaths.some((p) => !map.has(p));
        setSigningError(anyFailed);
        setSignedUrlByPath(map);
      })
      .catch(() => {
        if (cancelled) return;
        setSigningError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingSignPaths, signingRetryNonce]);

  const handleRetry = () => {
    setSigningRetryNonce((n) => n + 1);
    void refetch();
  };

  const items = useMemo(() => {
    if (!plantId || plantRawRows.length === 0) return [];
    const signed = withSignedDiaryPhotoUrls(
      plantRawRows as Array<{ photo_url?: unknown; details?: unknown }>,
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
  }, [plantId, plantRawRows, signedUrlByPath]);

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

      {isLoading || signingInProgress ? (
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
      ) : isError || signingError ? (
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
            onClick={handleRetry}
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
