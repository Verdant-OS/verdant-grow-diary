/**
 * Assign one or many plants to a propagation batch. Multi-select with a reason
 * for reassignments. Retries reuse the same idempotency key, so a retry can
 * never double-assign. Presenter-only.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlants } from "@/hooks/use-plants";
import { useAssignPlants } from "@/hooks/useGeneticsMutations";
import { SaveStateBar } from "./SaveStateBar";

interface PlantRow {
  id: string;
  name: string;
}

export interface PlantAssignmentPanelProps {
  batchId: string;
}

export function PlantAssignmentPanel({ batchId }: PlantAssignmentPanelProps) {
  const plants = usePlants();
  const { submit, retry, status, error } = useAssignPlants();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");

  const rows: PlantRow[] = useMemo(() => {
    const raw = Array.isArray(plants.data) ? plants.data : [];
    return raw
      .map((p) => {
        const rec = (p ?? {}) as Record<string, unknown>;
        return {
          id: typeof rec.id === "string" ? rec.id : "",
          name: typeof rec.name === "string" && rec.name.trim().length ? rec.name : "Unnamed plant",
        };
      })
      .filter((p) => p.id.length > 0);
  }, [plants.data]);

  const chosen = Object.keys(selected).filter((id) => selected[id]);

  async function handleAssign() {
    if (chosen.length === 0) return;
    const res = await submit({ batchId, plantIds: chosen, reason: reason.trim() || null });
    if (res.ok === true) setSelected({});
  }

  return (
    <div className="space-y-3 min-w-0" data-testid="plant-assignment-panel">
      {plants.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading plants…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no plants to assign yet.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto space-y-1 rounded-md border border-white/[0.06] p-2">
          {rows.map((p) => (
            <li key={p.id} className="min-w-0">
              <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded px-2 hover:bg-white/[0.03]">
                <Checkbox
                  checked={!!selected[p.id]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: v === true }))}
                  aria-label={`Select ${p.name}`}
                />
                <span className="min-w-0 truncate text-sm text-white/80">{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 min-w-0">
        <Label htmlFor="assign-reason">Reason (required when reassigning a plant)</Label>
        <Input
          id="assign-reason"
          className="min-h-11"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. corrected mother"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11" onClick={handleAssign} disabled={chosen.length === 0 || status === "pending"}>
          Assign {chosen.length} plant{chosen.length === 1 ? "" : "s"}
        </Button>
        <SaveStateBar status={status} error={error} onRetry={retry} />
      </div>
    </div>
  );
}

export default PlantAssignmentPanel;
