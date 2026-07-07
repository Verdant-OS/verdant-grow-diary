/**
 * TimelineVideoCard — presenter for a diary entry that carries a video
 * attachment (`details.video.path`).
 *
 * Renders native controls only. No AI inference. No auto-play. Falls
 * back to a text label if the video cannot load. Never implies that
 * anything analyzed the video.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TimelineVideoSlot } from "@/lib/timelineVideoEntryRules";

interface Props {
  video: TimelineVideoSlot;
  note?: string | null;
  /** Optional signed URL override (used by tests). */
  srcOverride?: string | null;
}

function useSignedVideoUrl(path: string, override: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(override ?? null);
  const [failed, setFailed] = useState(false);
  if (override !== undefined && override !== null && url !== override) {
    setUrl(override);
  }
  const load = async () => {
    if (url || failed) return;
    try {
      const { data, error } = await supabase.storage
        .from("diary-videos")
        .createSignedUrl(path, 60 * 10);
      if (error || !data?.signedUrl) {
        setFailed(true);
        return;
      }
      setUrl(data.signedUrl);
    } catch {
      setFailed(true);
    }
  };
  return { url, failed, load };
}

export default function TimelineVideoCard({ video, note, srcOverride }: Props) {
  const { url, failed, load } = useSignedVideoUrl(video.path, srcOverride);
  const [playbackError, setPlaybackError] = useState(false);
  const showFallback = failed || playbackError;

  return (
    <div
      className="rounded-md border border-border p-3"
      data-testid="timeline-video-card"
      role="group"
      aria-label="Diary video attachment"
    >
      {showFallback ? (
        <p className="text-sm text-muted-foreground" data-testid="timeline-video-fallback">
          Video attached
        </p>
      ) : (
        <video
          controls
          preload="metadata"
          playsInline
          src={url ?? undefined}
          onFocus={load}
          onPlay={load}
          onError={() => setPlaybackError(true)}
          className="aspect-video w-full rounded-md bg-black"
          data-testid="timeline-video-element"
          aria-label="Play diary video"
        >
          Video attached
        </video>
      )}
      {!url && !failed && (
        <button
          type="button"
          onClick={load}
          className="mt-2 text-sm underline text-muted-foreground"
          data-testid="timeline-video-load"
          aria-label="Load diary video"
        >
          Load video
        </button>
      )}
      {note ? (
        <p className="mt-2 text-sm text-foreground" data-testid="timeline-video-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
