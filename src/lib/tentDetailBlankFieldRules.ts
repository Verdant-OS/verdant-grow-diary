/**
 * Tent page header copy. Blank brand, size, schedule, or wattage are omitted
 * so the header does not show an empty " · " or a default "0W".
 * Wattage 0 is the adapter's stand-in for a null saved wattage.
 */

function presentText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "·") return "";
  return trimmed;
}

export function formatTentHeaderDescription(
  brand: string | null | undefined,
  size: string | null | undefined,
): string {
  return [presentText(brand), presentText(size)].filter((part) => part.length > 0).join(" · ");
}

export function formatTentLightLine(
  schedule: string | null | undefined,
  wattage: number | null | undefined,
): string {
  const schedulePart = presentText(schedule);
  const wattagePart =
    typeof wattage === "number" && Number.isFinite(wattage) && wattage > 0 ? `${wattage}W` : "";
  return [schedulePart, wattagePart].filter((part) => part.length > 0).join(" · ");
}
