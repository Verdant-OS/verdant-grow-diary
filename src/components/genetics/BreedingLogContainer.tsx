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
  plants: any[];
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
    details: any;
  }) => {
    setBusy(true);
    try {
      // 1. Save through the breeding_log_save_event RPC. The RPC applies the
      //    auth.uid() trust boundary + ownership checks server-side; the client
      //    never sends a user_id.
      const selectedPlant = plants.find((p) => p.id === data.plantId);
      const details = (data.details ?? {}) as Record<string, string>;

      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("breeding_log_save_event", {
        p_grow_id: activeGrowId,
        p_plant_id: data.plantId,
        p_event_type: data.subType,
        p_tent_id: selectedPlant?.tent_id ?? null,
        p_method: typeof details.method === "string" ? details.method : null,
        p_intensity: typeof details.intensity === "string" ? details.intensity : null,
        p_details: details,
      });

      if (rpcError) {
        throw new Error(`Failed to save event: ${rpcError.message}`);
      }
      const result = rpcData as {
        ok?: boolean;
        grow_event_id?: string;
        reason?: string;
      } | null;
      if (!result?.ok || !result.grow_event_id) {
        throw new Error(`Failed to save event: ${result?.reason ?? "unknown_error"}`);
      }
      const eventId = result.grow_event_id;

      // 2. Invoke Edge Function for Action Queue Suggestions
      // Provenance Rule: "Action Queue insertion failure must not roll back or block the original Quick Log event save."
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          "create-breeding-suggestions",
          {
            body: { event_id: eventId },
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
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
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
