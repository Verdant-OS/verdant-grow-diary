/**
 * PhotoDiagnosisReviewDialog — manual grower observation for one existing
 * plant photo. This is not an AI diagnosis and it cannot create an Action
 * Queue item, reminder, or device action.
 */
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PHOTO_DIAGNOSIS_NOTE_LABEL,
  PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY,
  type PhotoDiagnosisLatestReview,
  type PhotoDiagnosisPhotoInput,
  type PhotoDiagnosisReviewStatus,
} from "@/lib/photoDiagnosisNoteRules";
import { useSavePhotoDiagnosisReview } from "@/hooks/useSavePhotoDiagnosisReview";

const REVIEW_STATUS_OPTIONS: ReadonlyArray<{
  value: PhotoDiagnosisReviewStatus;
  label: string;
  description: string;
}> = [
  {
    value: "reviewed",
    label: "Reviewed",
    description: "You looked at the photo and recorded what you noticed.",
  },
  {
    value: "needs_follow_up",
    label: "Needs follow-up",
    description: "You want another visual check before drawing conclusions.",
  },
  {
    value: "cleared",
    label: "Cleared",
    description: "Your follow-up observation did not show a current concern.",
  },
];

function labelForStatus(status: PhotoDiagnosisReviewStatus): string {
  return REVIEW_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Reviewed";
}

export interface PhotoDiagnosisReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: PhotoDiagnosisPhotoInput | null;
  photoDateLabel?: string;
  existingReview?: PhotoDiagnosisLatestReview | null;
}

export default function PhotoDiagnosisReviewDialog({
  open,
  onOpenChange,
  photo,
  photoDateLabel,
  existingReview,
}: PhotoDiagnosisReviewDialogProps) {
  const observationId = useId();
  const statusId = useId();
  const [observation, setObservation] = useState("");
  const [reviewStatus, setReviewStatus] = useState<PhotoDiagnosisReviewStatus>("reviewed");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { save, isSaving } = useSavePhotoDiagnosisReview();

  useEffect(() => {
    if (!open) return;
    setObservation("");
    setReviewStatus(existingReview?.reviewStatus ?? "reviewed");
    setSubmitError(null);
  }, [existingReview?.photoId, existingReview?.reviewStatus, open, photo?.photo_id]);

  const selectedStatus = REVIEW_STATUS_OPTIONS.find((option) => option.value === reviewStatus);

  const handleSave = async () => {
    if (!photo) {
      setSubmitError("Choose a photo before saving a review.");
      return;
    }
    const result = await save({ photo, observation, reviewStatus });
    if (!result.ok) {
      setSubmitError(
        result.reason === "missing_observation"
          ? "Add a short observation before saving."
          : "Your review could not be saved. Please try again.",
      );
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"
        data-testid="photo-diagnosis-review-dialog"
      >
        <DialogHeader>
          <DialogTitle>{PHOTO_DIAGNOSIS_NOTE_LABEL}</DialogTitle>
          <DialogDescription>
            {photoDateLabel
              ? `Record what you noticed in this photo from ${photoDateLabel}.`
              : "Record what you noticed in this photo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {existingReview ? (
            <div
              className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
              data-testid="photo-diagnosis-review-existing"
            >
              <p className="font-medium">
                Current status: {labelForStatus(existingReview.reviewStatus)}
              </p>
              <p className="mt-1 text-muted-foreground">
                Add a new observation to keep the photo history clear over time.
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              data-testid="photo-diagnosis-review-empty"
            >
              No grower review has been recorded for this photo yet.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={observationId}>What did you notice?</Label>
            <Textarea
              id={observationId}
              value={observation}
              onChange={(event) => {
                setObservation(event.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="Example: New growth looks even; lower leaves are a little lighter than yesterday."
              maxLength={1000}
              disabled={isSaving}
              data-testid="photo-diagnosis-review-observation"
            />
            <p className="text-xs text-muted-foreground">
              Describe what you can see. Avoid treating a single photo as proof of a cause.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={statusId}>Grower review status</Label>
            <Select
              value={reviewStatus}
              onValueChange={(value) => {
                setReviewStatus(value as PhotoDiagnosisReviewStatus);
                if (submitError) setSubmitError(null);
              }}
              disabled={isSaving}
            >
              <SelectTrigger id={statusId} data-testid="photo-diagnosis-review-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedStatus?.description}</p>
          </div>

          {submitError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="photo-diagnosis-review-error"
            >
              {submitError}
            </p>
          ) : null}

          <p className="rounded-lg bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
            {PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY} This does not create an AI diagnosis, Action Queue
            item, or automated change.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving || !photo}
            data-testid="photo-diagnosis-review-save"
          >
            {isSaving ? "Saving…" : "Save grower review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
