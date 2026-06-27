import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";
import { SUPPORTED_BREEDING_EVENT_TYPES } from "@/lib/genetics/breedingActionQueue";

interface PlantRef {
  id: string;
  name?: string | null;
  tent_id: string | null;
}

interface BreedingEventFormData {
  plantId: string;
  subType: BreedingEventType;
  details: unknown;
}

interface Props {
  plants: PlantRef[];
  busy: boolean;
  onSubmit: (data: BreedingEventFormData) => void;
  onCancel: () => void;
}

const EVENT_TYPE_LABELS: Record<BreedingEventType, string> = {
  reversal_application: "Reversal Application",
  isolation_start: "Isolation Start",
  pollination: "Pollination",
  pollen_shed_observed: "Pollen Shed Observed",
  stigmas_receptive: "Stigmas Receptive",
  cross_harvest: "Cross Harvest",
};

export function BreedingEventForm({ plants, busy, onSubmit, onCancel }: Props) {
  const [plantId, setPlantId] = useState<string>("");
  const [subType, setSubType] = useState<BreedingEventType | "">("");

  const canSubmit = plantId !== "" && subType !== "" && !busy;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ plantId, subType: subType as BreedingEventType, details: {} });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="breeding-plant">Plant</Label>
        <Select value={plantId} onValueChange={setPlantId} disabled={busy}>
          <SelectTrigger id="breeding-plant">
            <SelectValue placeholder="Select a plant…" />
          </SelectTrigger>
          <SelectContent>
            {plants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name ?? p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="breeding-subtype">Event Type</Label>
        <Select
          value={subType}
          onValueChange={(v) => setSubType(v as BreedingEventType)}
          disabled={busy}
        >
          <SelectTrigger id="breeding-subtype">
            <SelectValue placeholder="Select event type…" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_BREEDING_EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {busy ? "Saving…" : "Log Event"}
        </Button>
      </div>
    </form>
  );
}
