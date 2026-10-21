import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canWriteFeatureData } from "@/lib/featureEntitlements";
import {
  PHENO_HUNT_ADD_CANDIDATES_COPY,
  PHENO_HUNT_ADD_CANDIDATES_UI_COPY as COPY,
  canOfferAddToPhenoHunt,
  phenoHuntAddChangedHunt,
  phenoHuntAddedSummary,
} from "@/lib/phenoHuntAddCandidatesRules";
import {
  addPhenoHuntCandidates,
  loadPlantPhenoHuntOffer,
  type PlantPhenoHuntOffer,
} from "@/lib/phenoHuntAddCandidatesService";

/**
 * Plant page "Add to pheno hunt": shown only when the grower can write Pheno
 * Tracker data, the plant's grow has exactly one hunt, and the plant can join
 * it (same grow, not archived, not a candidate). The database stays authoritative.
 */
export default function AddToPhenoHuntButton({ plantId }: { plantId: string }) {
  const [offer, setOffer] = useState<PlantPhenoHuntOffer | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const { entitlement } = useMyEntitlements();
  const canWrite = canWriteFeatureData(entitlement, "pheno_tracker");

  useEffect(() => {
    let cancelled = false;
    setOffer(null);
    setMessage(null);
    setAdded(false);
    void loadPlantPhenoHuntOffer(plantId).then((result) => {
      if (!cancelled) setOffer(result);
    });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  const resultLine = message ? (
    <p role="status" className="text-sm" data-testid="add-to-pheno-hunt-result">
      {message}
    </p>
  ) : null;
  // Hide the button only after a confirmed addition; a failure keeps it for a retry.
  if (added) return resultLine;
  if (!canWrite || !offer || !canOfferAddToPhenoHunt(offer.plant, offer.hunt)) return null;
  const hunt = offer.hunt;

  async function add() {
    if (!canWrite) return;
    setSaving(true);
    setMessage(null);
    const result = await addPhenoHuntCandidates({ huntId: hunt.id, plantIds: [plantId] });
    setSaving(false);
    const addedOne = result.added[0];
    const failure = result.failed[0];
    if (phenoHuntAddChangedHunt(result)) setAdded(true);
    setMessage(
      addedOne
        ? phenoHuntAddedSummary([addedOne.candidateLabel])
        : PHENO_HUNT_ADD_CANDIDATES_COPY[failure?.reason ?? "network"],
    );
  }

  return (
    <>
      {resultLine}
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
    </>
  );
}
