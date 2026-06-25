/**
 * Quick Log action + response-check rules.
 *
 * Grower framing:
 *   Quick Log captures what changed.
 *   Better/Same/Worse captures how the plant responded afterward.
 *
 * Legacy export names are kept so older tests/imports do not break while the
 * UI moves from status-first logging to grow-action-first logging.
 *
 * No I/O. No JSX. No schema coupling. The UI still saves through the existing
 * PlantQuickLog diary entry payload shape.
 */

export const QUICK_LOG_ACTION_CHIPS = [
  "Watered",
  "Fed",
  "Photo only",
  "Issue spotted",
  "Environment changed",
  "Training / pruning",
  "Note",
] as const;
export type QuickLogActionChip = (typeof QUICK_LOG_ACTION_CHIPS)[number];

export const RESPONSE_CHECK_STATUSES = ["Better", "Same", "Worse"] as const;
export type ResponseCheckStatus = (typeof RESPONSE_CHECK_STATUSES)[number];

// Backward-compatible aliases. Better/Same/Worse are now response checks.
export const TEN_SECOND_QUICK_CHECK_STATUSES = RESPONSE_CHECK_STATUSES;
export type TenSecondQuickCheckStatus = ResponseCheckStatus;
export const QUICK_CHECK_DETAIL_CHIPS = QUICK_LOG_ACTION_CHIPS;
export type QuickCheckDetailChip = QuickLogActionChip;

const RESPONSE_CHECK_PREFIX = "Response check:";
const LEGACY_QUICK_CHECK_PREFIX = "Quick check:";

function normalizeLine(value: string): string {
  return value.trim().replace(/[.!]+$/, "").toLowerCase();
}

function splitLines(note: string): string[] {
  return note
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isResponseCheckLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return (
    lower.startsWith(RESPONSE_CHECK_PREFIX.toLowerCase()) ||
    lower.startsWith(LEGACY_QUICK_CHECK_PREFIX.toLowerCase())
  );
}

function stripExistingResponseCheckLines(note: string): string[] {
  return splitLines(note).filter((line) => !isResponseCheckLine(line));
}

function actionChipLine(chip: QuickLogActionChip): string {
  switch (chip) {
    case "Photo only":
      return "Photo only.";
    case "Issue spotted":
      return "Issue spotted.";
    case "Environment changed":
      return "Environment changed.";
    case "Training / pruning":
      return "Training / pruning.";
    case "Note":
      return "Note.";
    case "Watered":
    case "Fed":
      return `${chip}.`;
  }
}

export function buildResponseCheckLine(status: ResponseCheckStatus): string {
  return `${RESPONSE_CHECK_PREFIX} ${status}.`;
}

// Backward-compatible wrapper now returns response-check copy.
export function buildQuickCheckLine(status: TenSecondQuickCheckStatus): string {
  return buildResponseCheckLine(status);
}

export function applyResponseCheck(
  existingNote: string,
  status: ResponseCheckStatus,
): string {
  const rest = stripExistingResponseCheckLines(existingNote);
  return [buildResponseCheckLine(status), ...rest].join("\n");
}

// Backward-compatible wrapper. Better/Same/Worse are response checks now.
export function applyTenSecondQuickCheck(
  existingNote: string,
  status: TenSecondQuickCheckStatus,
): string {
  return applyResponseCheck(existingNote, status);
}

export function applyQuickLogActionChip(
  existingNote: string,
  chip: QuickLogActionChip,
): string {
  const line = actionChipLine(chip);
  const normalizedChip = normalizeLine(line);
  const lines = splitLines(existingNote);
  const hasChip = lines.some((item) => normalizeLine(item) === normalizedChip);
  if (hasChip) return existingNote;
  return [...lines, line].join("\n");
}

// Backward-compatible wrapper for old imports.
export function applyQuickCheckDetailChip(
  existingNote: string,
  chip: QuickCheckDetailChip,
): string {
  return applyQuickLogActionChip(existingNote, chip);
}

export function hasResponseCheck(existingNote: string): boolean {
  return splitLines(existingNote).some(isResponseCheckLine);
}

// Backward-compatible wrapper for old imports.
export function hasTenSecondQuickCheck(existingNote: string): boolean {
  return hasResponseCheck(existingNote);
}
