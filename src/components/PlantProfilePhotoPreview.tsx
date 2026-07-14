/**
 * PlantProfilePhotoPreview — presenter only. Renders one of:
 *   - nothing (status: "none")
 *   - a normal object-URL <img> preview (status: "image" / "loading")
 *   - an accessible "Photo selected" fallback card (status: "fallback")
 *
 * No lifecycle, no upload, no storage, no I/O.
 */
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlantPhotoView from "@/components/PlantPhotoView";
import {
  PLANT_PROFILE_PHOTO_FALLBACK_COPY,
  PLANT_PROFILE_PHOTO_FALLBACK_HEADING,
  plantProfilePhotoFormatBadge,
  safePlantProfilePhotoFileName,
  type PlantProfilePhotoPreviewState,
} from "@/lib/plantProfilePhotoPreviewRules";

interface Props {
  state: PlantProfilePhotoPreviewState;
  altName: string;
  onReplace: () => void;
  onRemove: () => void;
  testId?: string;
}

export default function PlantProfilePhotoPreview({
  state,
  altName,
  onReplace,
  onRemove,
  testId = "edit-plant-photo-preview-card",
}: Props) {
  if (state.status === "none") return null;

  if (state.status === "image" || state.status === "loading") {
    const src = state.status === "image" ? state.objectUrl : null;
    return (
      <div className="h-full w-full">
        <PlantPhotoView
          src={src}
          alt={`Preview of new profile photo for ${altName}`}
          className="h-full w-full"
          iconClassName="h-4 w-4"
          caption=""
          ctaLabel={null}
          testId={testId}
        />
      </div>
    );
  }

  const badge = plantProfilePhotoFormatBadge(state.mimeType);
  const displayName = safePlantProfilePhotoFileName(
    state.fileName,
    state.mimeType,
  );
  const body = PLANT_PROFILE_PHOTO_FALLBACK_COPY[state.reason];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md bg-muted/50 p-2 text-center"
      data-testid={testId}
      data-preview-status="fallback"
      data-preview-reason={state.reason}
    >
      <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <div className="text-[11px] font-medium leading-tight">
        {PLANT_PROFILE_PHOTO_FALLBACK_HEADING}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="truncate max-w-[9rem]" title={displayName}>
          {displayName}
        </span>
        {badge && (
          <span
            className="rounded-sm border border-border/60 px-1 py-[1px] font-mono text-[9px] uppercase tracking-wide"
            data-testid={`${testId}-badge`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="sr-only">{body}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-[44px] px-2 text-[11px]"
          onClick={onReplace}
          data-testid={`${testId}-replace`}
        >
          Replace
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-[44px] gap-1 px-2 text-[11px]"
          onClick={onRemove}
          data-testid={`${testId}-remove`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
        </Button>
      </div>
    </div>
  );
}
