/**
 * After a grower moves a plant to a new stage, offer to bring its tent and grow
 * along (filming bug #12, 2026-10-22). Plant, tent and grow each store their own
 * stage, so a plant moved to Veg left the tent header, the grow badge and the
 * Alerts targets on Seedling. The grower decides; nothing is written here.
 *
 * Only holders BEHIND the plant's new stage are offered — never a move
 * backwards — and a plant moved to harvest/drying offers nothing, because
 * closing out a tent or grow is its own decision.
 *
 * Pure: no I/O, no React, no time.
 */
import { STAGES } from "@/lib/grow";
import { normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

const RANK: Record<Exclude<VpdStage, "unknown">, number> = {
  seedling: 0,
  veg: 1,
  preflower: 2,
  flower: 3,
  late_flower: 4,
  harvest: 5,
};

export interface StageHolder {
  id: string;
  name: string | null;
  stage: string | null;
}

export interface PlantStageFollowUpInput {
  plantName: string | null;
  previousStage: string | null;
  newStage: string | null;
  tent: StageHolder | null;
  grow: StageHolder | null;
}

export interface PlantStageFollowUp {
  /** Raw stage value to write, exactly as the plant now stores it. */
  stage: string;
  tent: StageHolder | null;
  grow: StageHolder | null;
  message: string;
  actionLabel: string;
}

function stageLabel(stage: string | null): string {
  const match = STAGES.find((s) => s.value === stage);
  return match ? match.label : (stage ?? "an unknown stage");
}

function isBehind(holder: StageHolder | null, target: number): boolean {
  if (!holder || !holder.id) return false;
  const stage = normalizeVpdStage(holder.stage);
  return stage === "unknown" || RANK[stage] < target;
}

export function buildPlantStageFollowUp(input: PlantStageFollowUpInput): PlantStageFollowUp | null {
  const next = normalizeVpdStage(input.newStage);
  if (next === "unknown" || next === "harvest" || !input.newStage) return null;
  if (normalizeVpdStage(input.previousStage) === next) return null;
  const target = RANK[next];
  const tent = isBehind(input.tent, target) ? input.tent : null;
  const grow = isBehind(input.grow, target) ? input.grow : null;
  if (!tent && !grow) return null;

  const plant = input.plantName?.trim() || "This plant";
  const label = stageLabel(input.newStage);
  const behind = [
    tent ? tent.name?.trim() || "Its tent" : null,
    grow ? grow.name?.trim() || "its grow" : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" and ");
  const verb = tent && grow ? "are" : "is";
  return {
    stage: input.newStage,
    tent,
    grow,
    message: `${plant} is now ${label}. ${behind} ${verb} still on an earlier stage. Move ${tent && grow ? "them" : "it"} to ${label} too?`,
    actionLabel: tent && grow ? "Update tent and grow" : tent ? "Update tent" : "Update grow",
  };
}
