import { useState, useEffect } from "react";
import { ImageOff, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
  caption?: string;
  ctaLabel?: string | null;
  testId?: string;
}

/**
 * Pure presenter for a plant photo. Renders the given display URL or
 * the themed placeholder when the URL is missing / errors. Contains
 * no data-access logic. Callers (see `PlantPhoto`) are responsible
 * for resolving durable references to display URLs.
 */
export default function PlantPhotoView({
  src,
  alt = "",
  className,
  iconClassName = "h-6 w-6",
  caption = "No plant photo yet",
  ctaLabel = "Add photo",
  testId = "plant-photo",
}: Props) {
  const trimmed = typeof src === "string" ? src.trim() : "";
  const [errored, setErrored] = useState(false);
  // Reset the error latch when the resolved src changes (e.g. after
  // a fresh upload replaces the previous photo).
  useEffect(() => {
    setErrored(false);
  }, [trimmed]);
  const showPlaceholder = !trimmed || errored;

  if (showPlaceholder) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 bg-secondary/40 text-muted-foreground",
          className,
        )}
        data-testid={`${testId}-placeholder`}
        aria-label={caption}
        role="img"
      >
        <div className="flex items-center gap-1.5 opacity-70">
          <Sprout className={iconClassName} />
          <ImageOff className="h-3.5 w-3.5" />
        </div>
        <span
          className="text-[10px] uppercase tracking-wider"
          data-testid={`${testId}-placeholder-caption`}
        >
          {caption}
        </span>
        {ctaLabel && (
          <span
            className="text-[10px] uppercase tracking-wider text-primary/80"
            data-testid={`${testId}-placeholder-cta`}
          >
            {ctaLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      onError={() => setErrored(true)}
      className={cn("w-full h-full object-cover", className)}
      data-testid={testId}
      loading="lazy"
    />
  );
}
