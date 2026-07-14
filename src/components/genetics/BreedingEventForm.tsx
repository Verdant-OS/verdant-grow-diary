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
<<<<<<< HEAD
=======
  const [method, setMethod] = useState<string>("");
  const [intensity, setIntensity] = useState<string>("");

  // These inputs feed the deterministic follow-up advisor: reversal `method`
  // and pollen-shed `intensity` change which reminders (and timing) are queued.
  const showMethod = subType === "reversal_application";
  const showIntensity = subType === "pollen_shed_observed";
>>>>>>> origin/main

  const canSubmit = plantId !== "" && subType !== "" && !busy;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
<<<<<<< HEAD
    onSubmit({ plantId, subType: subType as BreedingEventType, details: {} });
=======
    const details: Record<string, string> = {};
    if (showMethod && method) details.method = method;
    if (showIntensity && intensity) details.intensity = intensity;
    onSubmit({ plantId, subType: subType as BreedingEventType, details });
>>>>>>> origin/main
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

<<<<<<< HEAD
=======
      {showMethod ? (
        <div className="space-y-2">
          <Label htmlFor="breeding-method">Reversal method</Label>
          <Select value={method} onValueChange={setMethod} disabled={busy}>
            <SelectTrigger id="breeding-method">
              <SelectValue placeholder="Select method…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sts_spray">STS spray</SelectItem>
              <SelectItem value="colloidal_silver">Colloidal silver</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Chemical methods can shed pollen earlier — this adds an isolation
            check to your follow-ups.
          </p>
        </div>
      ) : null}

      {showIntensity ? (
        <div className="space-y-2">
          <Label htmlFor="breeding-intensity">Pollen shed intensity</Label>
          <Select value={intensity} onValueChange={setIntensity} disabled={busy}>
            <SelectTrigger id="breeding-intensity">
              <SelectValue placeholder="Select intensity…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="heavy">Heavy</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Heavy shed narrows the receptive-window follow-up to ~1 day.
          </p>
        </div>
      ) : null}

>>>>>>> origin/main
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
