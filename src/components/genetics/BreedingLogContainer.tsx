import { useRef, useState } from "react";
import { BreedingEventForm } from "./BreedingEventForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";
import { emitBreedingAuditEvent } from "@/lib/genetics/breedingAuditLog";
import {
  BREEDING_LOG_SAVE_EVENT_COPY,
  BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY,
  callBreedingLogSaveEvent,
} from "@/lib/genetics/breedingLogSaveEventRpc";
import {
  resolveBreedingSubmissionAttempt,
  type BreedingSubmissionAttempt,
} from "@/lib/genetics/breedingSubmissionIdempotencyRules";
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

      // Typed seam: argument shape, result union, and the "RPC isn't live on
      // this project yet" case all come from the wrapper, so no local cast is
      // needed here and refusals carry a known reason instead of a raw
      // PostgREST string.
      const outcome = await callBreedingLogSaveEvent(supabase, {
        p_idempotency_key: attempt.idempotencyKey,
        p_grow_id: activeGrowId,
        p_plant_id: data.plantId,
        p_event_type: data.subType,
        p_tent_id: selectedPlant?.tent_id ?? null,
        p_method: method,
        p_intensity: intensity,
        p_details: details,
      });

      if (outcome.status === "rpc_unavailable") {
        // Keep the attempt so a retry after the migration lands reuses the
        // same idempotency key rather than risking a duplicate event.
        throw new Error(BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY);
      }
      if (outcome.status === "failed") {
        throw new Error(`Failed to save event: ${outcome.message}`);
      }
      if (outcome.status === "refused") {
        throw new Error(BREEDING_LOG_SAVE_EVENT_COPY[outcome.reason]);
      }
      const eventId = outcome.growEventId;
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
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-4">
        <h3 className="text-sm font-medium text-pink-400 mb-2">Breeding Event</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Log genetic events. Follow-up suggestions are optional and always require your review.
        </p>
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
