/**
 * ActionFollowUpExistingPhotoSelector — presenter for optionally
 * associating an existing owned diary photo with a follow-up.
 *
 * Presenter-only. No queries, no uploads, no file inputs, no camera.
 * Emits the exact durable `storage://…` reference back to the parent
 * (or `null` for "No photo"). Thumbnails resolve through the approved
 * private-photo signed-URL hook; the signed URL never leaves this
 * component.
 */
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePlantProfilePhotoSource } from "@/hooks/usePlantProfilePhotoSource";
import type { ExistingPhotoCandidate } from "@/lib/actionFollowUpExistingPhotoRules";

export type ExistingPhotoLoadState =
  | { status: "loading" }
  | { status: "loaded"; candidates: ExistingPhotoCandidate[] }
  | { status: "failed" };

export interface ActionFollowUpExistingPhotoSelectorProps {
  state: ExistingPhotoLoadState;
  value: string | null;
  onChange: (durableReference: string | null) => void;
  disabled?: boolean;
}

function formatCaptured(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function CandidateThumb({ reference }: { reference: string }) {
  const src = usePlantProfilePhotoSource(reference);
  if (src.isLoading) {
    return (
      <div
        className="h-12 w-12 rounded-md bg-secondary/40 animate-pulse"
        aria-hidden="true"
      />
    );
  }
  if (!src.displayUrl) {
    return (
      <div
        className="h-12 w-12 rounded-md bg-secondary/40 flex items-center justify-center text-[9px] text-muted-foreground"
        aria-hidden="true"
      >
        n/a
      </div>
    );
  }
  return (
    <img
      src={src.displayUrl}
      alt=""
      className="h-12 w-12 rounded-md object-cover"
      loading="lazy"
    />
  );
}

export default function ActionFollowUpExistingPhotoSelector({
  state,
  value,
  onChange,
  disabled,
}: ActionFollowUpExistingPhotoSelectorProps) {
  return (
    <fieldset
      className="space-y-2"
      data-testid="action-followup-photo-selector"
      aria-busy={state.status === "loading"}
    >
      <legend className="text-sm font-medium">
        Attach an existing photo
        <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
      </legend>

      {state.status === "loading" && (
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="action-followup-photo-loading"
        >
          Loading photos…
        </p>
      )}

      {state.status === "failed" && (
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="action-followup-photo-error"
        >
          Existing photos are unavailable right now. You can still record the follow-up without one.
        </p>
      )}

      {state.status === "loaded" && state.candidates.length === 0 && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="action-followup-photo-empty"
        >
          No eligible existing photos are available for this action.
        </p>
      )}

      {(state.status === "loaded" || state.status === "loading") && (
        <div
          role="radiogroup"
          aria-label="Attach an existing photo"
          className="grid gap-2"
        >
          <label
            htmlFor="action-followup-photo-none"
            className={cn(
              "flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer min-h-[44px] transition",
              value === null
                ? "border-primary bg-primary/10"
                : "border-border/40 hover:bg-secondary/30",
            )}
          >
            <input
              id="action-followup-photo-none"
              type="radio"
              name="action-followup-photo"
              value=""
              checked={value === null}
              onChange={() => onChange(null)}
              disabled={disabled}
              data-testid="action-followup-photo-none"
            />
            <span>No photo</span>
          </label>

          {state.status === "loaded" &&
            state.candidates.map((c) => {
              const id = `action-followup-photo-${c.id}`;
              const checked = value === c.durableReference;
              return (
                <label
                  key={c.id}
                  htmlFor={id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2 text-sm cursor-pointer min-h-[44px] transition",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-border/40 hover:bg-secondary/30",
                  )}
                  data-testid={`action-followup-photo-option-${c.id}`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="action-followup-photo"
                    value={c.durableReference}
                    checked={checked}
                    onChange={() => onChange(c.durableReference)}
                    disabled={disabled}
                  />
                  <CandidateThumb reference={c.durableReference} />
                  <div className="flex flex-col text-xs">
                    <span>{c.label ?? "Diary photo"}</span>
                    <span className="text-muted-foreground">
                      {formatCaptured(c.capturedAt)}
                    </span>
                  </div>
                </label>
              );
            })}
        </div>
      )}
      {/* label element for a11y coverage */}
      <Label htmlFor="action-followup-photo-none" className="sr-only">
        No photo
      </Label>
    </fieldset>
  );
}
