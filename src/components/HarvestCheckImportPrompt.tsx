import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import { usePlants } from "@/hooks/use-plants";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import {
  bindHarvestCheckHandoffPlant,
  buildHarvestHandoffNote,
  clearHarvestCheckHandoff,
  harvestHandoffCountBucket,
  harvestHandoffIdempotencyKey,
  harvestHandoffOccurredAt,
  readHarvestCheckHandoff,
  type HarvestCheckHandoff,
} from "@/lib/harvestCheckHandoffStore";
import { trackHarvestTrackerEvent } from "@/lib/harvestWindowAnalytics";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";

/**
 * Offers to import the harvest checks a visitor logged on the public Harvest
 * Window Tracker before signing up. Nothing is written until the grower picks
 * one of their own plants and clicks Import; no grow or plant is ever created
 * here. With no plant yet, the handoff stays until one exists.
 */
export default function HarvestCheckImportPrompt() {
  const [handoff, setHandoff] = useState<HarvestCheckHandoff | null>(null);
  // Read after mount so the server and first client render stay identical.
  useEffect(() => {
    setHandoff(readHarvestCheckHandoff(new Date()));
  }, []);
  if (!handoff) return null;
  return <ImportPrompt handoff={handoff} onDone={() => setHandoff(null)} />;
}

function ImportPrompt({ handoff, onDone }: { handoff: HarvestCheckHandoff; onDone: () => void }) {
  const plants = usePlants();
  const { save } = useQuickLogV2Save();
  const queryClient = useQueryClient();
  const [plantId, setPlantId] = useState(handoff.plantId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bound before the first save: retries, lost responses and reloads stay on this plant.
  const [boundPlantId, setBoundPlantId] = useState(handoff.plantId ?? null);
  const count = handoff.checks.length;
  const noun = count === 1 ? "harvest check" : "harvest checks";
  const list = plants.data ?? [];
  const selected = list.find((plant) => plant.id === plantId) ?? null;
  // A bound plant missing from a loaded list (deleted, or another account in this
  // tab) must not lock the import forever: drop the binding and let them pick again.
  const boundPlantMissing =
    boundPlantId !== null &&
    plants.data !== undefined &&
    !plants.data.some((plant) => plant.id === boundPlantId);
  useEffect(() => {
    if (!boundPlantMissing) return;
    bindHarvestCheckHandoffPlant(handoff, null);
    setBoundPlantId(null);
    setPlantId("");
    setError(
      "The plant this import started on is no longer in your list. Checks already saved stay on that plant. Choose a plant.",
    );
  }, [boundPlantMissing, handoff]);

  function dismiss() {
    clearHarvestCheckHandoff();
    onDone();
  }

  async function importChecks() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    if (!boundPlantId) {
      if (!bindHarvestCheckHandoffPlant(handoff, selected.id)) {
        setBusy(false);
        setError("This browser tab could not keep the import, so nothing was saved. Try again.");
        return;
      }
      setBoundPlantId(selected.id);
    }
    let saved = 0;
    for (const [index, check] of handoff.checks.entries()) {
      const result = await save({
        p_target_type: "plant",
        p_target_id: selected.id,
        p_action: "note",
        p_volume_ml: null,
        p_note: buildHarvestHandoffNote(check),
        p_temperature_c: null,
        p_humidity_pct: null,
        p_vpd_kpa: null,
        p_occurred_at: harvestHandoffOccurredAt(check.date, new Date(handoff.createdAt)),
        p_idempotency_key: harvestHandoffIdempotencyKey(handoff, selected.id, index),
      });
      if (!result.ok) break;
      saved += 1;
    }
    if (saved > 0) {
      applyQuickLogV2Refresh(queryClient, {
        targetType: "plant",
        targetId: selected.id,
        tentId: selected.tent_id ?? null,
      });
    }
    setBusy(false);
    if (saved < count) {
      setError(
        `${saved} of ${count} ${noun} saved. Try Import again; checks already saved are not duplicated.`,
      );
      return;
    }
    clearHarvestCheckHandoff();
    trackHarvestTrackerEvent("harvest_tracker_handoff_imported", {
      count_bucket: harvestHandoffCountBucket(count),
    });
    onDone();
  }

  return (
    <section
      aria-labelledby="harvest-import-title"
      data-testid="harvest-check-import-prompt"
      className="mb-4 rounded-lg border border-emerald-900/20 bg-emerald-50 p-4 text-sm text-emerald-950"
    >
      <h2 id="harvest-import-title" className="text-base font-semibold">
        Import your {count} {noun}
      </h2>
      <p className="mt-1">
        From the Harvest Window Tracker. Each check becomes a note on the plant you choose, with its
        original date.
      </p>
      {plants.isLoading ? (
        <p className="mt-3">Loading your plants…</p>
      ) : plants.isError ? (
        <p role="alert" className="mt-3 text-red-800">
          Your plants could not be loaded. Reload to try again. Your checks stay in this tab.
        </p>
      ) : list.length === 0 ? (
        <p className="mt-3">
          Add your first plant, then come back here to import.{" "}
          <Link className="underline" to="/plants">
            Go to Plants
          </Link>
        </p>
      ) : (
        <label className="mt-3 block font-medium">
          Plant
          <select
            className="mt-1 block w-full min-w-0 rounded-md border border-emerald-900/30 bg-white p-2"
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            disabled={busy || boundPlantId !== null}
          >
            <option value="">Choose a plant</option>
            {list.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-red-800">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {list.length > 0 ? (
          <Button type="button" onClick={importChecks} disabled={!selected || busy}>
            {busy ? "Importing…" : `Import ${count} ${noun}`}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={dismiss} disabled={busy}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}
