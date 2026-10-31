import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDiaryPhotoDisplayReferenceFromRow } from "@/lib/diaryPhotoDisplayRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import {
  normalizeTimelineEntryDetailRow,
  type TimelineEntryDetailFetchState,
  type TimelineEntryDetailRecord,
} from "@/lib/timelineEntryDetailPermalinkRules";
import { isTimelineSensorDerivedDiaryId } from "@/lib/timelineManualSensorMeasurementRules";

const DIARY_PHOTO_BUCKET = "diary-photos";
const SIGNED_URL_TTL_SECONDS = 3600;

export interface TimelineEntryDetailFetch {
  fetchState: TimelineEntryDetailFetchState;
  entry: TimelineEntryDetailRecord | null;
}

async function displayPhotoUrl(
  photoUrl: string | null,
  details: Record<string, unknown>,
  viewerUserId: string | null,
): Promise<string | null> {
  const reference = parseDiaryPhotoDisplayReferenceFromRow(
    { photo_url: photoUrl, details },
    { viewerUserId },
  );
  if (reference.kind === "external") return reference.url;
  if (reference.kind !== "storage") return null;
  try {
    const signed = await supabase.storage
      .from(DIARY_PHOTO_BUCKET)
      .createSignedUrls([reference.path], SIGNED_URL_TTL_SECONDS);
    const url = signed.data?.[0]?.signedUrl;
    if (signed.error || typeof url !== "string" || url.length === 0) return null;
    return url;
  } catch {
    return null;
  }
}

async function loadTimelineEntryDetailRecord(
  requestedId: string,
  viewerUserId: string | null,
): Promise<TimelineEntryDetailFetch> {
  // No signed-in viewer means no row can be the viewer's own; never query.
  if (!viewerUserId) return { fetchState: "missing", entry: null };
  try {
    const result = await selectWithRetractionCompat((withRetractionFilter) => {
      let query = supabase
        .from("diary_entries")
        .select("id,note,photo_url,stage,details,entry_at,plant_id,tent_id,grow_id")
        .eq("id", requestedId)
        // Explicit viewer filter: RLS alone also admits operator-visible rows.
        .eq("user_id", viewerUserId)
        .limit(1);
      if (withRetractionFilter) query = query.is("retracted_at", null);
      return query;
    });
    if (result.error) return { fetchState: "error", entry: null };
    const rows = Array.isArray(result.data) ? result.data : [];
    const match = rows.find((row) => row.id === requestedId) ?? null;
    const normalized = normalizeTimelineEntryDetailRow(match, requestedId);
    if (!normalized) return { fetchState: "missing", entry: null };
    const photoUrl = await displayPhotoUrl(normalized.photo_url, normalized.details, viewerUserId);
    return { fetchState: "ready", entry: { ...normalized, photo_url: photoUrl } };
  } catch {
    return { fetchState: "error", entry: null };
  }
}

/**
 * Loads one diary row by id for a permalink that is not already on the
 * visible timeline page, filtered to `user_id = viewerUserId` in the query
 * (not only by RLS, which also lets operators read other users' rows). With
 * no viewer the read is skipped and the entry is reported missing. Sensor
 * receipts stay on the list projection.
 */
export function useTimelineEntryDetailRecord(
  requestedId: string | null,
  viewerUserId: string | null,
  enabled: boolean,
): TimelineEntryDetailFetch {
  const [snapshot, setSnapshot] = useState<TimelineEntryDetailFetch & { id: string | null }>({
    id: null,
    fetchState: "idle",
    entry: null,
  });

  useEffect(() => {
    if (!enabled || !requestedId || isTimelineSensorDerivedDiaryId(requestedId)) {
      setSnapshot({ id: requestedId, fetchState: "idle", entry: null });
      return;
    }
    let cancelled = false;
    setSnapshot({ id: requestedId, fetchState: "loading", entry: null });
    void loadTimelineEntryDetailRecord(requestedId, viewerUserId).then((result) => {
      if (cancelled) return;
      setSnapshot({ id: requestedId, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, requestedId, viewerUserId]);

  if (snapshot.id !== requestedId) {
    return { fetchState: enabled && requestedId ? "loading" : "idle", entry: null };
  }
  return { fetchState: snapshot.fetchState, entry: snapshot.entry };
}
