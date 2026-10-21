import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PHENO_HUNT_ADD_CANDIDATES_COPY,
  PHENO_HUNT_ADD_CANDIDATES_UI_COPY as COPY,
  canOfferAddToPhenoHunt,
  phenoHuntAddedSummary,
} from "@/lib/phenoHuntAddCandidatesRules";
import {
  addPhenoHuntCandidates,
  loadPlantPhenoHuntOffer,
  type PlantPhenoHuntOffer,
} from "@/lib/phenoHuntAddCandidatesService";

/**
 * Plant page "Add to pheno hunt": shown only when the plant's grow has exactly
 * one hunt and the plant can join it (same grow, not archived, not a candidate).
 */
export default function AddToPhenoHuntButton({ plantId }: { plantId: string }) {
  const [offer, setOffer] = useState<PlantPhenoHuntOffer | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOffer(null);
    setMessage(null);
    void loadPlantPhenoHuntOffer(plantId).then((result) => {
      if (!cancelled) setOffer(result);
    });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  if (message) {
    return (
      <p role="status" className="text-sm" data-testid="add-to-pheno-hunt-result">
        {message}
      </p>
    );
  }
  if (!offer || !canOfferAddToPhenoHunt(offer.plant, offer.hunt)) return null;
  const hunt = offer.hunt;

  async function add() {
    setSaving(true);
    const result = await addPhenoHuntCandidates({ huntId: hunt.id, plantIds: [plantId] });
    setSaving(false);
    const added = result.added[0];
    const failure = result.failed[0];
    setMessage(
      added
        ? phenoHuntAddedSummary([added.candidateLabel])
        : PHENO_HUNT_ADD_CANDIDATES_COPY[failure?.reason ?? "network"],
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={saving}
      onClick={() => void add()}
      data-testid="add-to-pheno-hunt"
      aria-label={`${COPY.plantButton}: ${hunt.name}`}
    >
      {saving ? COPY.saving : COPY.plantButton}
    </Button>
  );
}
