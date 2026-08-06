import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { BreedingEventType } from "@/lib/genetics/breedingTypes";

interface Props {
  plants: any[];
  busy: boolean;
  onSubmit: (data: { plantId: string; subType: BreedingEventType; details: any }) => void;
  onCancel: () => void;
}

export function BreedingEventForm({ plants, busy, onSubmit, onCancel }: Props) {
  const [plantId, setPlantId] = useState("");
  const [subType, setSubType] = useState<BreedingEventType>("reversal_application");
  
  return (
    <form 
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ plantId, subType, details: {} });
      }}
      className="grid gap-4"
    >
      <div>
        <Label className="text-xs">Plant</Label>
        <Select value={plantId} onValueChange={setPlantId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a plant" />
          </SelectTrigger>
          <SelectContent>
            {plants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Breeding Event Type</Label>
        <Select value={subType} onValueChange={(v) => setSubType(v as BreedingEventType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reversal_application">Reversal Application</SelectItem>
            <SelectItem value="isolation_start">Isolation Start</SelectItem>
            <SelectItem value="pollination">Pollination</SelectItem>
            <SelectItem value="pollen_shed_observed">Pollen Shed Observed</SelectItem>
            <SelectItem value="stigmas_receptive">Stigmas Receptive</SelectItem>
            <SelectItem value="cross_harvest">Cross Harvest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !plantId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log Breeding Event"}
        </Button>
      </div>
    </form>
  );
}
