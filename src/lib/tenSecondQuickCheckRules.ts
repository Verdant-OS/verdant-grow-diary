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
const RESPONSE_CHECK_TOKEN =
  /(?:response:\s*)?(?:response check|quick check):\s*(better|same|worse)(?=$|[.!]|\s)(?:[.!]+)?/i;
const RESPONSE_CHECK_TOKEN_GLOBAL =
  /(?:response:\s*)?(?:response check|quick check):\s*(?:better|same|worse)(?=$|[.!]|\s)(?:[.!]+)?/gi;
const RESPONSE_CHECK_AT_LINE_START =
  /^(?:response:\s*)?(?:response check|quick check):\s*(?:better|same|worse)(?=$|[.!]|\s)(?:[.!]+)?\s*/i;

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/[.!]+$/, "")
    .toLowerCase();
}

function splitLines(note: string): string[] {
  return note
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isResponseCheckLine(line: string): boolean {
  return RESPONSE_CHECK_TOKEN.test(line);
}

function stripResponseCheckTokens(line: string): string {
  return line
    .replace(RESPONSE_CHECK_TOKEN_GLOBAL, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

export function applyResponseCheck(existingNote: string, status: ResponseCheckStatus): string {
  const responseContext: string[] = [];
  const remainingLines: string[] = [];

  for (const line of splitLines(existingNote)) {
    if (!isResponseCheckLine(line)) {
      remainingLines.push(line);
      continue;
    }

    const stripped = stripResponseCheckTokens(line);
    if (!stripped) continue;

    if (RESPONSE_CHECK_AT_LINE_START.test(line)) {
      responseContext.push(stripped);
    } else {
      remainingLines.push(stripped);
    }
  }

  const responseLine = [buildResponseCheckLine(status), ...responseContext].join(" ");
  return [responseLine, ...remainingLines].join("\n");
}

// Backward-compatible wrapper. Better/Same/Worse are response checks now.
export function applyTenSecondQuickCheck(
  existingNote: string,
  status: TenSecondQuickCheckStatus,
): string {
  return applyResponseCheck(existingNote, status);
}

export function applyQuickLogActionChip(existingNote: string, chip: QuickLogActionChip): string {
  const line = actionChipLine(chip);
  const normalizedChip = normalizeLine(line);
  const lines = splitLines(existingNote);
  const hasChip = lines.some((item) => normalizeLine(item) === normalizedChip);
  if (hasChip) return existingNote;
  return [...lines, line].join("\n");
}

export function appendQuickLogObservation(existingNote: string, observation: string): string {
  const note = existingNote.trim();
  const detail = observation.trim();
  if (!detail) return note;
  if (!note) return detail;
  return `${note}${hasResponseCheck(note) ? "\n" : " "}${detail}`;
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

export function readResponseCheckStatus(existingNote: string): ResponseCheckStatus | null {
  const match = RESPONSE_CHECK_TOKEN.exec(existingNote);
  if (!match) return null;
  const normalized = match[1].toLowerCase();
  if (normalized === "better") return "Better";
  if (normalized === "same") return "Same";
  if (normalized === "worse") return "Worse";
  return null;
}

/**
 * Removes response-only context before classifying grow actions. A line that
 * starts with a response marker is entirely response context; a marker later
 * in a line is removed while the preceding action prose is preserved.
 */
export function actionTextWithoutResponseContext(existingNote: string): string {
  return splitLines(existingNote)
    .map((line) => {
      if (RESPONSE_CHECK_AT_LINE_START.test(line)) return "";
      return stripResponseCheckTokens(line);
    })
    .filter(Boolean)
    .join("\n");
}

export function responseActionChronologyRank(input: {
  hasAction: boolean;
  hasResponse: boolean;
}): number {
  if (input.hasAction && !input.hasResponse) return 0;
  if (input.hasAction && input.hasResponse) return 1;
  if (input.hasResponse) return 2;
  return 3;
}

// Backward-compatible wrapper for old imports.
export function hasTenSecondQuickCheck(existingNote: string): boolean {
  return hasResponseCheck(existingNote);
}
