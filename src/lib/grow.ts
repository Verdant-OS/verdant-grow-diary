export const GROW_TYPES = [
  { value: "tent", label: "Indoor Tent" },
  { value: "outdoor", label: "Outdoor" },
  { value: "clones", label: "Clones" },
  { value: "mothers", label: "Mothers" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "other", label: "Other" },
] as const;

export const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
  { value: "flush", label: "Flushing" },
  { value: "harvest", label: "Harvest" },
  { value: "drying", label: "Drying / Curing" },
] as const;

export function stageLabel(value?: string | null) {
  return STAGES.find((s) => s.value === value)?.label ?? value ?? "—";
}
export function growTypeLabel(value?: string | null) {
  return GROW_TYPES.find((s) => s.value === value)?.label ?? value ?? "—";
}
