import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import { useGrowTents } from "@/hooks/useGrowData";
import {
  getEffectivePlantGrowId,
  summarizePlantDropdown,
  type TentGrowRef,
} from "@/lib/plantDropdownEligibilityRules";
import {
  formatPlantDropdownEmptyState,
  getPlantDropdownHelperText,
} from "@/lib/plantDropdownReasonRules";

interface PlantRow {
  id: string;
  name: string;
  strain: string | null;
  tent_id: string | null;
  grow_id: string | null;
}

interface Props {
  tentId: string;
  growId?: string | null;
  trigger?: React.ReactNode;
}

/**
 * Assigns or moves an existing plant (same effective grow, non-archived)
 * into the current tent by updating only that plant's `tent_id`. RLS
 * enforces ownership; the client never sets user_id / grow_id / strain /
 * stage.
 *
 * Eligibility uses *effective* grow id (plant.grow_id ?? tent.grow_id) so
 * a plant whose `grow_id` is null but whose `tent_id` is a tent in the
 * same grow is still offered as a move candidate. Cross-grow plants are
 * excluded. Plants already in the current tent are shown disabled.
 *
 * Out of scope: alerts, Action Queue, sensor ingestion, device control —
 * no writes to those tables.
 */
export default function AddExistingPlantDialog({ tentId, growId, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const hasGrowContext = Boolean(growId);

  // Same-grow tents drive the OR(grow_id, tent_id IN ...) widening so
  // legacy plants with null grow_id but a tent in this grow are loaded.
  const { data: growTents = [] } = useGrowTents(growId ?? undefined);
  const tentIds = useMemo(() => growTents.map((t) => t.id), [growTents]);
  const tentRefs = useMemo<TentGrowRef[]>(
    () => growTents.map((t) => ({ id: t.id, grow_id: t.growId ?? null })),
    [growTents],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [
      "tent-detail",
      "eligible-plants",
      tentId,
      growId ?? null,
      tentIds.slice().sort().join(","),
    ],
    enabled: open && hasGrowContext,
    queryFn: async (): Promise<PlantRow[]> => {
      // Match plants where EITHER raw grow_id matches OR the assigned
      // tent belongs to this grow. This rescues legacy/orphan plants
      // whose `grow_id` is null. Cross-grow plants are still excluded
      // because the OR filter is bounded by this grow's tents.
      const orParts: string[] = [`grow_id.eq.${growId}`];
      if (tentIds.length > 0) {
        orParts.push(`tent_id.in.(${tentIds.join(",")})`);
      }
      const { data, error } = await supabase
        .from("plants")
        .select("id, name, strain, tent_id, grow_id, is_archived")
        .eq("is_archived", false)
        .or(orParts.join(","))
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Belt-and-suspenders: re-verify effective grow id client-side so a
      // stale tent cache can never leak a cross-grow row in.
      return (data ?? [])
        .map((p) => ({
          id: p.id as string,
          name: (p.name as string) ?? "Unnamed",
          strain: (p.strain as string | null) ?? null,
          tent_id: (p.tent_id as string | null) ?? null,
          grow_id: (p.grow_id as string | null) ?? null,
        }))
        .filter((p) => {
          const eff = getEffectivePlantGrowId(p, tentRefs);
          return eff === growId;
        });
    },
  });

  const { unassigned, otherTent, currentTent } = useMemo(() => {
    const u: PlantRow[] = [];
    const o: PlantRow[] = [];
    const c: PlantRow[] = [];
    for (const p of rows) {
      if (p.tent_id == null) u.push(p);
      else if (p.tent_id === tentId) c.push(p);
      else o.push(p);
    }
    return { unassigned: u, otherTent: o, currentTent: c };
  }, [rows, tentId]);

  const eligibleCount = unassigned.length + otherTent.length;

  // Helper-text summary: counts archived/missing-grow/cross-grow are
  // already enforced by the supabase query (`is_archived = false` + grow
  // OR filter), but already-in-this-tent is computed from local rows.
  const helperText = useMemo(() => {
    if (!growId) return "";
    const summary = summarizePlantDropdown(rows, tentRefs, {
      context: "add_existing_to_tent",
      growId,
      tentId,
    });
    return getPlantDropdownHelperText(summary);
  }, [rows, tentRefs, growId, tentId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (!selected) {
      toast.error("Pick a plant");
      return;
    }
    // Refuse to "assign" a plant already in this tent.
    if (currentTent.some((p) => p.id === selected)) {
      toast.error("Plant is already in this tent");
      return;
    }
    setBusy(true);
    // ONLY update tent_id. RLS scopes the row to the owning user; we
    // never touch user_id / grow_id / strain / stage / notes here.
    const { error } = await supabase
      .from("plants")
      .update({ tent_id: tentId })
      .eq("id", selected);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const wasMove = otherTent.some((p) => p.id === selected);
    toast.success(wasMove ? "Plant moved to this tent" : "Plant assigned to tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
    setSelected("");
    setOpen(false);
  }

  function renderLabel(p: PlantRow) {
    return `${p.name}${p.strain ? ` · ${p.strain}` : ""}`;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1">
            <Link2 className="h-4 w-4" /> Add Existing Plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md"
        data-testid="add-existing-plant-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Add existing plant</DialogTitle>
        </DialogHeader>

        {!hasGrowContext ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="add-existing-plant-no-grow"
          >
            Unable to load plants because this tent is missing grow context.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : eligibleCount === 0 ? (
          <div
            className="space-y-3"
            data-testid="add-existing-plant-empty"
          >
            <p className="text-sm text-muted-foreground">
              {formatPlantDropdownEmptyState("add_existing_to_tent")}
            </p>
            {helperText && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="add-existing-plant-helper"
              >
                {helperText}
              </p>
            )}
            <CreatePlantDialog
              defaultTentId={tentId}
              defaultGrowId={growId ?? undefined}
              trigger={
                <Button
                  size="sm"
                  className="gradient-leaf text-primary-foreground"
                  data-testid="add-existing-plant-empty-create"
                >
                  Create new plant
                </Button>
              }
            />
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Plant</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger data-testid="add-existing-plant-select">
                  <SelectValue placeholder="Pick a plant" />
                </SelectTrigger>
                <SelectContent>
                  {unassigned.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Unassigned plants</SelectLabel>
                      {unassigned.map((p) => {
                        const legacy = p.grow_id == null;
                        const suffix = legacy
                          ? " — unassigned, legacy plant (grow derived from assigned tent)"
                          : " — unassigned, can add to this tent";
                        const label = `${renderLabel(p)}${suffix}`;
                        return (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            aria-label={label}
                            title={
                              legacy
                                ? "Legacy plant — grow derived from assigned tent"
                                : "Unassigned — can add to this tent"
                            }
                            data-legacy={legacy ? "true" : "false"}
                            data-testid={`add-existing-plant-option-unassigned-${p.id}`}
                          >
                            <span>{renderLabel(p)}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              {legacy
                                ? "— unassigned · legacy plant"
                                : "— unassigned"}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}
                  {otherTent.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Plants in another tent</SelectLabel>
                      {otherTent.map((p) => {
                        const legacy = p.grow_id == null;
                        const reason = legacy
                          ? "In another tent, legacy plant — will move to this tent"
                          : "In another tent — will move to this tent";
                        const label = `${renderLabel(p)} — ${reason}`;
                        return (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            aria-label={label}
                            title={reason}
                            data-legacy={legacy ? "true" : "false"}
                            data-testid={`add-existing-plant-option-other-${p.id}`}
                          >
                            <span>{renderLabel(p)}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              {legacy
                                ? "— will move here · legacy plant"
                                : "— will move here"}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}
                  {currentTent.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Already in this tent</SelectLabel>
                      {currentTent.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled
                          aria-label={`${renderLabel(p)} — already in this tent`}
                          title="Already in this tent"
                          data-testid={`add-existing-plant-option-current-${p.id}`}
                        >
                          {renderLabel(p)} — already in this tent
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {helperText && (
                <p
                  className="text-xs text-muted-foreground mt-1"
                  data-testid="add-existing-plant-helper"
                >
                  {helperText}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy || !selected}
              className="gradient-leaf text-primary-foreground"
              data-testid="add-existing-plant-submit"
            >
              Assign to this tent
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
