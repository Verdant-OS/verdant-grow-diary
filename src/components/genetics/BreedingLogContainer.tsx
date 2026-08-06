import { useRef, useState } from "react";
import { BreedingEventForm } from "./BreedingEventForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";
import { emitBreedingAuditEvent } from "@/lib/genetics/breedingAuditLog";
import {
  callBreedingLogSaveEvent,
  describeBreedingLogSaveEventReason,
  BREEDING_LOG_SAVE_EVENT_RPC_NAME,
} from "@/lib/genetics/breedingLogSaveEventRpc";
import { MissingAuditRpcError } from "@/lib/rpcAvailability/missingRpcError";
import { AuditRpcMissingFallback } from "@/components/AuditRpcMissingFallback";
import {
  resolveBreedingSubmissionAttempt,
  type BreedingSubmissionAttempt,
} from "@/lib/genetics/breedingSubmissionIdempotencyRules";
import {
  resolveBreedingSubmissionKeyDisposition,
  shouldRetireSubmissionKey,
  shouldWarnPossibleDuplicate,
} from "@/lib/genetics/breedingSubmissionRecoveryRules";
import { logsPath } from "@/lib/routes";
import { Link } from "@/lib/react-router-compat";
import { useAuth } from "@/store/auth";

interface Props {
  activeGrowId: string;
  plants: BreedingLogPlant[];
  onCreated: () => void;
  onCancel: () => void;
}

interface BreedingLogPlant {
  id: string;
  tent_id: string | null;
  name?: string | null;
}

function normalizeStringDetails(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const details: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") details[key] = item;
  }
  return details;
}

export function BreedingLogContainer({ activeGrowId, plants, onCreated, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [auditRpcMissing, setAuditRpcMissing] = useState(false);
  /**
   * Set when a refusal proved the server already committed this submission.
   * Persistent on purpose — the toast disappears long before a grower can go
   * look at their timeline and decide.
   */
  const [duplicateRisk, setDuplicateRisk] = useState(false);
  const submissionAttemptRef = useRef<BreedingSubmissionAttempt | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleSubmit = async (data: {
    plantId: string;
    subType: BreedingEventType;
    details: unknown;
    requestActionQueueSuggestions: boolean;
  }) => {
    setBusy(true);
    // Clear first so a warning from an earlier refusal can never outlive the
    // submission that caused it and attach itself to an unrelated later one.
    setDuplicateRisk(false);
    try {
      let suggestionsFailed = false;

      // 1. Save through the breeding_log_save_event RPC. The RPC applies the
      //    auth.uid() trust boundary + ownership checks server-side; the client
      //    never sends a user_id.
      const selectedPlant = plants.find((p) => p.id === data.plantId);
      const details = normalizeStringDetails(data.details);
      const method = details.method ?? null;
      const intensity = details.intensity ?? null;
      const attempt = resolveBreedingSubmissionAttempt(
        submissionAttemptRef.current,
        {
          growId: activeGrowId,
          plantId: data.plantId,
          eventType: data.subType,
          tentId: selectedPlant?.tent_id ?? null,
          method,
          intensity,
          details,
        },
        () => crypto.randomUUID(),
      );
      submissionAttemptRef.current = attempt;

      const result = await callBreedingLogSaveEvent({
        idempotencyKey: attempt.idempotencyKey,
        growId: activeGrowId,
        plantId: data.plantId,
        eventType: data.subType,
        tentId: selectedPlant?.tent_id ?? null,
        method,
        intensity,
        details,
      });

      if (!result.ok || !result.growEventId) {
        // Growers get a sentence, not the RPC's internal reason code. The raw
        // code is kept for diagnostics only.
        if (result.rawReason && !result.reason) {
          console.error("[BreedingLogContainer] Unrecognized save reason:", result.rawReason);
        }
        // Decide the key's fate BEFORE throwing. Without this the ref survives
        // the failure, so an unchanged retry re-presents a key the server has
        // already refused and gets the identical refusal forever.
        //
        // Retiring is safe only where the refusal proves nothing committed, or
        // proves something did and we say so — see breedingSubmissionRecoveryRules.
        const disposition = resolveBreedingSubmissionKeyDisposition(
          result.reason ?? result.rawReason,
        );
        if (shouldRetireSubmissionKey(disposition)) {
          submissionAttemptRef.current = null;
        }
        if (shouldWarnPossibleDuplicate(disposition)) {
          setDuplicateRisk(true);
        }
        throw new Error(describeBreedingLogSaveEventReason(result.reason ?? result.rawReason));
      }
      const eventId = result.growEventId;
      submissionAttemptRef.current = null;

      // 2. Suggestions are a separate, explicit grower choice. The event still
      // saves when suggestions are not requested or when their insert fails.
      if (data.requestActionQueueSuggestions) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke(
            "create-breeding-suggestions",
            {
              body: { event_id: eventId },
            },
          );
          if (fnError) {
            console.error("[BreedingLogContainer] Edge function error:", fnError);
            suggestionsFailed = true;
          } else {
            const actionIds =
              (fnData as { actionIds?: Array<{ id: string; plantId: string | null }> } | null)
                ?.actionIds ?? [];
            const now = new Date().toISOString();
            for (const row of actionIds) {
              emitBreedingAuditEvent({
                eventType: "breeding_suggestion_created",
                actionId: row.id,
                plantId: row.plantId ?? data.plantId,
                source: "breeding_v0",
                status: "pending_approval",
                actorId: user?.id ?? null,
                requiresApproval: true,
                timestamp: now,
              });
            }
          }
        } catch (err) {
          console.error("[BreedingLogContainer] Failed to invoke suggestions:", err);
          suggestionsFailed = true;
        }
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["grow_events"] });
      queryClient.invalidateQueries({ queryKey: ["action_queue"] });

      if (suggestionsFailed) {
        toast.warning(
          "Breeding event logged. Follow-up suggestion status could not be confirmed.",
          {
            description: "Check Action Queue before creating any follow-ups manually.",
          },
        );
      } else {
        toast.success("Breeding event logged 🌱");
      }
      onCreated();
    } catch (err: unknown) {
      if (err instanceof MissingAuditRpcError) {
        console.error("[BreedingLogContainer] Audit RPC missing:", err.rpcName, err.cause);
        setAuditRpcMissing(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setBusy(false);
    }
  };

  if (auditRpcMissing) {
    return (
      <AuditRpcMissingFallback
        rpcName={BREEDING_LOG_SAVE_EVENT_RPC_NAME}
        surfaceLabel="Breeding event"
        onRetry={() => setAuditRpcMissing(false)}
        onDismiss={onCancel}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-4">
        <h3 className="text-sm font-medium text-pink-400 mb-2">Breeding Event</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Log genetic events. Follow-up suggestions are optional and always require your review.
        </p>

        {duplicateRisk && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
            data-testid="breeding-duplicate-risk"
          >
            <p className="text-sm text-foreground">
              An earlier attempt at this event may already have been saved. Check your timeline
              before saving again — saving now records a separate event rather than retrying the
              first one.
            </p>
            <Link
              to={logsPath(activeGrowId)}
              className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
              data-testid="breeding-duplicate-risk-link"
            >
              Open this grow's timeline
            </Link>
          </div>
        )}

        <BreedingEventForm
          plants={plants}
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
