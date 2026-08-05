/**
 * PlantGrowContextRescueCard — Plant Detail banner when plants.grow_id is null.
 *
 * One-click repair copies setup context from the plant's assigned tent only.
 * Writes ONLY `plants.grow_id`. No tent rewrites, logs, sensors, or Action Queue.
 */
import { useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { useTents } from "@/hooks/use-tents";
import { resolvePlantGrowContextRescueView, type TentGrowLink } from "@/lib/plantGrowContextRules";

export interface PlantGrowContextRescueCardProps {
  plantId: string;
  plantGrowId: string | null | undefined;
  plantTentId?: string | null;
  onRepaired?: (growId: string) => void;
}

export default function PlantGrowContextRescueCard({
  plantId,
  plantGrowId,
  plantTentId = null,
  onRepaired,
}: PlantGrowContextRescueCardProps) {
  const { user } = useAuth();
  const { grows = [] } = useGrows();
  const { data: allTents = [] } = useTents();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const tentLinks: TentGrowLink[] = useMemo(
    () =>
      (
        allTents as Array<{
          id: string;
          grow_id?: string | null;
          growId?: string | null;
          name?: string | null;
        }>
      ).map((t) => ({
        id: t.id,
        grow_id: t.grow_id ?? t.growId ?? null,
        name: t.name ?? null,
      })),
    [allTents],
  );

  const tentSetupName = useMemo(() => {
    if (!plantTentId) return null;
    const tent = tentLinks.find((t) => t.id === plantTentId);
    if (!tent?.grow_id) return null;
    return grows.find((g) => g.id === tent.grow_id)?.name ?? null;
  }, [plantTentId, tentLinks, grows]);

  const rescue = useMemo(
    () =>
      resolvePlantGrowContextRescueView({
        plant: { id: plantId, grow_id: plantGrowId ?? null, tent_id: plantTentId },
        tents: tentLinks,
        tentSetupName,
      }),
    [plantId, plantGrowId, plantTentId, tentLinks, tentSetupName],
  );

  if (rescue.kind === "already_ok") return null;

  async function applyRescue() {
    if (busy || !user || !rescue.payload) return;
    setBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(rescue.payload as never)
      .eq("id", plantId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const growId = rescue.payload.grow_id;
    toast.success("Setup linked from tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plantId] });
    onRepaired?.(growId);
  }

  return (
    <div
      role="region"
      aria-labelledby="plant-grow-context-rescue-title"
      data-testid="plant-grow-context-rescue"
      data-rescue-kind={rescue.kind}
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--warning))]"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <h2
            id="plant-grow-context-rescue-title"
            className="text-sm font-semibold"
            data-testid="plant-grow-context-rescue-title"
          >
            {rescue.title}
          </h2>
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            data-testid="plant-grow-context-rescue-description"
          >
            {rescue.description}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {rescue.ctaLabel && rescue.payload ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5 gradient-leaf text-primary-foreground"
            disabled={busy}
            onClick={applyRescue}
            data-testid="plant-grow-context-rescue-cta"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {rescue.ctaLabel}
          </Button>
        ) : null}
        {rescue.secondaryHref && rescue.secondaryLabel ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            data-testid="plant-grow-context-rescue-secondary"
          >
            <Link to={rescue.secondaryHref}>{rescue.secondaryLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
