import { useState } from "react";
import { ImageOff, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Visual size of the placeholder icon. */
  iconClassName?: string;
  /** Optional caption (e.g. "Add photo"). */
  caption?: string;
  testId?: string;
}

/**
 * Renders a plant image, or a clean themed placeholder when the photo is
 * missing or fails to load. Replaces broken <img> icons on plant cards,
 * Plant Detail hero, and Tent Detail plant cards.
 *
 * Pure presenter. No I/O.
 */
export default function PlantPhoto({
  src,
  alt = "",
  className,
  iconClassName = "h-6 w-6",
  caption = "No plant photo yet",
  testId = "plant-photo",
}: Props) {
  const trimmed = typeof src === "string" ? src.trim() : "";
  const [errored, setErrored] = useState(false);
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
        <span className="text-[10px] uppercase tracking-wider">{caption}</span>
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
