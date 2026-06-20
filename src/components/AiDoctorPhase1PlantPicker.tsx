/**
 * AI Doctor Phase 1 — Plant Picker (presenter-only).
 *
 * Lets an operator pick a plant from a provided list. No Supabase,
 * no fetch, no mutations, no model calls. URL sync is handled by the
 * parent via `onSelect`.
 */
import * as React from "react";

export interface AiDoctorPhase1PlantOption {
  id: string;
  name: string;
  strain?: string | null;
  stage?: string | null;
  tent_name?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}

export interface AiDoctorPhase1PlantPickerProps {
  plants: ReadonlyArray<AiDoctorPhase1PlantOption>;
  selectedPlantId: string | null;
  onSelect: (plantId: string) => void;
}

export function AiDoctorPhase1PlantPicker(
  props: AiDoctorPhase1PlantPickerProps,
): JSX.Element {
  const { plants, selectedPlantId, onSelect } = props;

  if (plants.length === 0) {
    return (
      <div
        data-testid="ai-doctor-phase1-plant-picker-empty"
        className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
      >
        <p className="font-medium text-foreground">No plants available</p>
        <p>Create a plant before reviewing AI Doctor context.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="ai-doctor-phase1-plant-picker"
      className="rounded-md border border-border bg-card p-3"
    >
      <label
        htmlFor="ai-doctor-phase1-plant-picker-select"
        className="mb-2 block text-sm font-semibold text-foreground"
      >
        Choose a plant
      </label>
      <ul className="space-y-1" role="list">
        {plants.map((p) => {
          const isSelected = p.id === selectedPlantId;
          return (
            <li key={p.id}>
              <button
                type="button"
                data-testid={`ai-doctor-phase1-plant-option-${p.id}`}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => onSelect(p.id)}
                className={
                  "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                  (isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted")
                }
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {[p.strain, p.stage, p.tent_name].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
