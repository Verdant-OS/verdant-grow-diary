/**
 * PlantProfileContextCard — presenter-only card surfacing which
 * plant profile fields are known vs missing for AI Doctor context.
 *
 * Strictly UI:
 *  - No backend writes. No fetch. No storage. No AI calls.
 *  - Disabled "coming soon" actions; no persistence path.
 *  - Does not feed draft values back into AI Doctor context.
 */
import { Sprout } from "lucide-react";
import {
  buildPlantProfileContextViewModel,
  type PlantProfileContextInput,
} from "@/lib/plantProfileContextViewModel";

export interface PlantProfileContextCardProps extends PlantProfileContextInput {
  className?: string;
}

export default function PlantProfileContextCard(
  props: PlantProfileContextCardProps,
) {
  const vm = buildPlantProfileContextViewModel(props);

  return (
    <section
      data-testid="plant-profile-context-card"
      className={`glass rounded-2xl p-4 my-3 space-y-3 ${props.className ?? ""}`}
      aria-label={vm.title}
    >
      <header className="flex items-start gap-2">
        <Sprout className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{vm.title}</h3>
          <p className="text-xs text-muted-foreground">{vm.description}</p>
        </div>
      </header>

      <ul className="text-xs space-y-1.5">
        <li data-testid="plant-profile-context-field-stage"
            data-known={vm.stage.known ? "true" : "false"}>
          {vm.stage.label}
        </li>
        <li data-testid="plant-profile-context-field-strain"
            data-known={vm.strain.known ? "true" : "false"}>
          {vm.strain.label}
        </li>
        <li data-testid="plant-profile-context-field-medium"
            data-known={vm.medium.known ? "true" : "false"}
            className={vm.medium.known ? "" : "text-muted-foreground"}>
          {vm.medium.label}
        </li>
        <li data-testid="plant-profile-context-field-pot-size"
            data-known={vm.potSize.known ? "true" : "false"}
            className={vm.potSize.known ? "" : "text-muted-foreground"}>
          {vm.potSize.label}
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="plant-profile-context-add-medium"
          className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
        >
          {vm.mediumAction.label}
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="plant-profile-context-add-pot-size"
          className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
        >
          {vm.potSizeAction.label}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">{vm.rationale}</p>
    </section>
  );
}
