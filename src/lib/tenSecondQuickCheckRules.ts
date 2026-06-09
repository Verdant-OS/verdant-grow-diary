/**
 * Ten-Second Quick Check rules.
 *
 * Pure helper layer for the tired-grower path:
 *   Open plant → tap Better/Same/Worse → optional photo → save.
 *
 * No I/O. No JSX. No schema coupling. The UI still saves through the
 * existing PlantQuickLog diary entry payload shape.
 */

export const TEN_SECOND_QUICK_CHECK_STATUSES = ["Better", "Same", "Worse"] as const;
export type TenSecondQuickCheckStatus = (typeof TEN_SECOND_QUICK_CHECK_STATUSES)[number];

export const QUICK_CHECK_DETAIL_CHIPS = [
  "Watered",
  "Fed",
  "Spotted issue",
  "Photo only",
] as const;
export type QuickCheckDetailChip = (typeof QUICK_CHECK_DETAIL_CHIPS)[number];

const QUICK_CHECK_PREFIX = "Quick check:";

function normalizeLine(value: string): string {
  return value.trim().replace(/[.!]+$/, "").toLowerCase();
}

function stripExistingQuickCheckLines(note: string): string[] {
  return note
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith(QUICK_CHECK_PREFIX.toLowerCase()));
}

export function buildQuickCheckLine(status: TenSecondQuickCheckStatus): string {
  return `${QUICK_CHECK_PREFIX} ${status}.`;
}

export function applyTenSecondQuickCheck(
  existingNote: string,
  status: TenSecondQuickCheckStatus,
): string {
  const rest = stripExistingQuickCheckLines(existingNote);
  return [buildQuickCheckLine(status), ...rest].join("\n");
}

export function applyQuickCheckDetailChip(
  existingNote: string,
  chip: QuickCheckDetailChip,
): string {
  const line = chip === "Photo only" ? "Photo only." : chip;
  const normalizedChip = normalizeLine(line);
  const lines = existingNote
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hasChip = lines.some((item) => normalizeLine(item) === normalizedChip);
  if (hasChip) return existingNote;
  return [...lines, line].join("\n");
}

export function hasTenSecondQuickCheck(existingNote: string): boolean {
  return existingNote
    .split(/\n+/)
    .some((line) => line.trim().toLowerCase().startsWith(QUICK_CHECK_PREFIX.toLowerCase()));
}
