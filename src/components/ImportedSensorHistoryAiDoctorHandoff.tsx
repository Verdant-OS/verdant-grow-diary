/**
 * Read-only presenter for the explicit imported-history → plant review handoff.
 * It never chooses a plant, invokes AI, opens a paywall, or writes data.
 */
import { Link } from "react-router-dom";
import { Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import type { ImportedHistoryAiDoctorHandoffResult } from "@/lib/importedSensorHistoryAiDoctorHandoffRules";

interface Props {
  viewModel: ImportedHistoryAiDoctorHandoffResult;
}

const HIDDEN_STATES = new Set<ImportedHistoryAiDoctorHandoffResult["state"]>([
  "missing_tent",
  "history_loading",
  "history_error",
  "history_empty",
]);

export default function ImportedSensorHistoryAiDoctorHandoff({ viewModel }: Props) {
  if (HIDDEN_STATES.has(viewModel.state)) return null;

  return (
    <aside
      aria-label="Historical AI Doctor review"
      data-testid="imported-history-ai-doctor-handoff"
      data-state={viewModel.state}
      className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{viewModel.title}</h3>
          <p className="text-sm text-muted-foreground">{viewModel.body}</p>
        </div>
      </div>

      {viewModel.choices.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="imported-history-ai-doctor-choices">
          {viewModel.choices.map((choice, index) => (
            <Button key={choice.plantId} asChild size="sm" variant="outline">
              <Link
                to={choice.href}
                data-testid={`imported-history-ai-doctor-choice-${index}`}
                onClick={() =>
                  trackFunnelEvent("csv_history_ai_doctor_clicked", {
                    surface: "imported_history",
                  })
                }
              >
                {choice.label}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground" role="note">
        {viewModel.caveat}
      </p>
    </aside>
  );
}
