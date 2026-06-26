import { useState } from "react";
import { BreedingEventForm } from "./BreedingEventForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";
import { emitBreedingAuditEvent } from "@/lib/genetics/breedingAuditLog";
import { useAuth } from "@/store/auth";

interface Props {
  activeGrowId: string;
  plants: Array<{ id: string; name?: string | null; tent_id: string | null }>;
  onCreated: () => void;
  onCancel: () => void;
}

export function BreedingLogContainer({ activeGrowId, plants, onCreated, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleSubmit = async (data: {
    plantId: string;
    subType: BreedingEventType;
    details: unknown;
  }) => {
    setBusy(true);
    try {
      if (!user) {
        throw new Error("You must be signed in to log a breeding event.");
      }
      // 1. Save to grow_events
      const selectedPlant = plants.find((p) => p.id === data.plantId);

      const payload = {
        grow_id: activeGrowId,
        plant_id: data.plantId,
        tent_id: selectedPlant?.tent_id ?? null,
        // grow_events.event_type is constrained to watering|feeding|training|observation|photo|environment.
        // Breeding subtypes (e.g. "pollination") are not valid event_type values, so we store this
        // event as "observation". The actual breeding subtype is passed via breeding_event_type to the
        // edge function so action queue suggestions are correctly generated.
        event_type: "observation" as const,
        occurred_at: new Date().toISOString(),
        user_id: user.id,
      };

      const { data: eventRow, error: insertError } = await supabase
        .from("grow_events")
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to save event: ${insertError.message}`);
      }

      // 2. Invoke Edge Function for Action Queue Suggestions
      // Provenance Rule: "Action Queue insertion failure must not roll back or block the original Quick Log event save."
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          "create-breeding-suggestions",
          {
            body: { event_id: eventRow.id, breeding_event_type: data.subType },
          },
        );
        if (fnError) {
          console.error("[BreedingLogContainer] Edge function error:", fnError);
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
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["grow_events"] });
      queryClient.invalidateQueries({ queryKey: ["action_queue"] });

      toast.success("Breeding event logged 🌱");
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
          Log genetic events. AI will suggest next steps in your Action Queue.
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
