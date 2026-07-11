/**
 * PlantDetailRecentActionResponse — one calm, read-only "Recent action
 * response" card for the newest canonical Action Response Memory whose
 * ACTION is scoped to exactly this plant (action.plant_id === plant id).
 *
 * Hard scope rule (enforced in actionResponseMemoryRules, not here):
 * tent-level (plant_id null) and grow-level actions never appear on a
 * plant's page; wrong-plant and ambiguous records are excluded.
 *
 * Renders nothing when no exact-plant response exists. Deliberately NOT
 * another nudge/CTA card — read-only display plus one internal link to the
 * authoritative Action Detail route. This component does not write, call
 * RPC, call AI, create alerts, or schedule anything.
 */

import { useMemo } from "react";
import { useActionResponseMemory } from "@/hooks/useActionResponseMemory";
import {
  selectRecentPlantActionResponse,
} from "@/lib/actionResponseMemoryRules";
import {
  buildActionResponseMemoryCardViewModel,
} from "@/lib/actionResponseMemoryViewModel";
import ActionResponseMemoryCard from "@/components/ActionResponseMemoryCard";
import ActionFollowUpExistingPhotoEvidence from "@/components/ActionFollowUpExistingPhotoEvidence";

const HEADING_ID = "plant-detail-recent-action-response-heading";

export interface PlantDetailRecentActionResponseProps {
  readonly growId: string | null | undefined;
  readonly plantId: string | null | undefined;
}

export default function PlantDetailRecentActionResponse({
  growId,
  plantId,
}: PlantDetailRecentActionResponseProps) {
  const { state } = useActionResponseMemory({ growId, plantId });

  const viewModel = useMemo(() => {
    if (state.status !== "ok") return null;
    const memory = selectRecentPlantActionResponse(state.memories, plantId ?? null);
    return buildActionResponseMemoryCardViewModel({ memory });
  }, [state, plantId]);

  // Calm card: no loading placeholder, no empty placeholder, no error chrome.
  // A failed or empty read renders nothing and never disturbs the page.
  if (!viewModel) return null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="plant-detail-recent-action-response"
      className="glass rounded-2xl p-4 my-3"
    >
      <h2
        id={HEADING_ID}
        className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Recent action response
      </h2>
      <ActionResponseMemoryCard
        viewModel={viewModel}
        photoEvidenceSlot={
          viewModel.photoReference ? (
            <ActionFollowUpExistingPhotoEvidence reference={viewModel.photoReference} />
          ) : null
        }
      />
    </section>
  );
}
