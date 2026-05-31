/**
 * FirstPlantMemoryCta — prominent first-run prompt to log the first plant memory.
 *
 * Behavior:
 *  - Opens the existing QuickLog modal by dispatching the global
 *    `PLANT_QUICKLOG_PREFILL_EVENT` that AppShell already listens for.
 *  - Does NOT create a new logging system, write any data, or read sensors.
 *  - Optional `prefill` lets callers preselect a tent/plant context
 *    (e.g. TentDetail with a primary plant). If omitted, QuickLog opens
 *    with no preselection.
 *  - Manual sensor reading is framed as optional in the helper copy.
 */
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PLANT_QUICKLOG_PREFILL_EVENT,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";

interface Props {
  prefill?: PlantQuickLogPrefill | null;
  testId?: string;
}

export default function FirstPlantMemoryCta({ prefill, testId }: Props) {
  function openQuickLog() {
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: prefill ?? null,
      }),
    );
  }

  return (
    <div
      data-testid={testId ?? "first-plant-memory-cta"}
      className="glass rounded-2xl p-4 md:p-5 mb-4 border border-primary/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-xl bg-primary/15 text-primary p-2 shrink-0">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-base">
            Log your first plant memory
          </h3>
          <p className="text-sm text-muted-foreground">
            Add note, watering, photo, or manual sensor reading.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Start simple. One note is enough. You can enrich details later.
            Manual sensor reading is optional.
          </p>
        </div>
      </div>
      <div className="shrink-0">
        <Button
          type="button"
          onClick={openQuickLog}
          className="gradient-leaf text-primary-foreground w-full sm:w-auto"
          data-testid="first-plant-memory-cta-open"
        >
          Open Quick Log
        </Button>
      </div>
    </div>
  );
}
