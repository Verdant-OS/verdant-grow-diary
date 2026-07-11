/**
 * ActionFollowUpExistingPhotoEvidence — read-only presenter for the
 * associated existing photo on a saved follow-up card.
 *
 *  - Re-validates the durable reference through the shared parser +
 *    viewer-owner guard. Rejects http(s), signed URLs, blob:, data:.
 *  - Resolves the private display URL through the approved hook.
 *  - Renders "unavailable" copy (safe fallback) on any resolution
 *    failure. Never surfaces raw storage paths or signed URL text.
 *  - Read-only. No write, no edit controls, no upload path.
 */
import { useAuth } from "@/store/auth";
import { usePlantProfilePhotoSource } from "@/hooks/usePlantProfilePhotoSource";
import { isAcceptedActionFollowUpPhotoReference } from "@/lib/actionFollowUpExistingPhotoRules";

export interface ActionFollowUpExistingPhotoEvidenceProps {
  reference: string | null;
}

const HEADING = "Associated photo evidence";
const UNAVAILABLE_COPY = "Associated photo evidence is unavailable.";

export default function ActionFollowUpExistingPhotoEvidence({
  reference,
}: ActionFollowUpExistingPhotoEvidenceProps) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const accepted = isAcceptedActionFollowUpPhotoReference(reference, viewerId);
  const src = usePlantProfilePhotoSource(accepted ? reference : null);

  if (!reference) return null;

  return (
    <section
      className="rounded-lg border border-border/40 bg-secondary/10 p-2 space-y-1"
      data-testid="action-followup-photo-evidence"
      aria-label={HEADING}
    >
      <h3 className="text-xs font-medium text-muted-foreground">{HEADING}</h3>
      {!accepted && (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="action-followup-photo-evidence-unavailable"
        >
          {UNAVAILABLE_COPY}
        </p>
      )}
      {accepted && src.isLoading && (
        <div
          className="h-32 w-full rounded-md bg-secondary/40 animate-pulse"
          role="status"
          aria-live="polite"
          aria-label="Loading photo…"
          data-testid="action-followup-photo-evidence-loading"
        />
      )}
      {accepted && !src.isLoading && !src.displayUrl && (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="action-followup-photo-evidence-unavailable"
        >
          {UNAVAILABLE_COPY}
        </p>
      )}
      {accepted && src.displayUrl && (
        <img
          src={src.displayUrl}
          alt="Grower-associated follow-up photo"
          className="w-full max-h-64 object-cover rounded-md"
          loading="lazy"
          data-testid="action-followup-photo-evidence-image"
        />
      )}
    </section>
  );
}
