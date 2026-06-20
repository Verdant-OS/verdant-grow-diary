/**
 * TimelinePhotoLightbox — read-only modal viewer for Timeline photos.
 *
 * Presentational only. Navigation comes from the pre-built list passed
 * in by the parent (filtered Timeline rows). No DB writes, no fetches
 * beyond the browser loading the already-displayed image URL, no AI,
 * no Action Queue / alert / device / sensor side effects.
 */
import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  buildTimelinePhotoAltText,
  resolveTimelinePhotoNavigation,
  type TimelinePhotoLightboxItem,
} from "@/lib/timelinePhotoLightboxRules";

interface TimelinePhotoLightboxProps {
  items: ReadonlyArray<TimelinePhotoLightboxItem>;
  activeIndex: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}

export default function TimelinePhotoLightbox({
  items,
  activeIndex,
  onClose,
  onNavigate,
}: TimelinePhotoLightboxProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const nav = resolveTimelinePhotoNavigation(items, activeIndex);
  const active = nav.currentIndex >= 0 ? items[nav.currentIndex] : null;

  const handlePrev = useCallback(() => {
    if (nav.previousIndex !== null) onNavigate(nav.previousIndex);
  }, [nav.previousIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (nav.nextIndex !== null) onNavigate(nav.nextIndex);
  }, [nav.nextIndex, onNavigate]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, handlePrev, handleNext, onClose]);

  useEffect(() => {
    if (active && closeRef.current) closeRef.current.focus();
  }, [active]);

  if (!active) return null;

  const alt = buildTimelinePhotoAltText(active);
  const counter = `${nav.currentIndex + 1} of ${nav.total}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timeline photo viewer"
      data-testid="timeline-photo-lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span
          className="rounded-full bg-black/60 px-3 py-1 text-xs text-white"
          data-testid="timeline-photo-lightbox-counter"
          aria-live="polite"
        >
          {counter}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close photo viewer"
          data-testid="timeline-photo-lightbox-close"
          className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {nav.hasPrevious && (
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous photo"
          data-testid="timeline-photo-lightbox-prev"
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {nav.hasNext && (
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next photo"
          data-testid="timeline-photo-lightbox-next"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <figure className="flex max-h-full max-w-full flex-col items-center gap-3">
        <img
          src={active.photoUrl}
          alt={alt}
          data-testid="timeline-photo-lightbox-image"
          className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-xl"
        />
        {(active.plantName || active.entryAt || active.stage) && (
          <figcaption
            className="rounded-full bg-black/60 px-3 py-1 text-xs text-white"
            data-testid="timeline-photo-lightbox-caption"
          >
            {[active.plantName, active.stage, active.entryAt]
              .filter((v): v is string => !!v)
              .join(" · ")}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
