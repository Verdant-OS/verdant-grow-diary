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
  const responseLine = buildResponseCheckLine(status);
  if (existingNote.length === 0) return responseLine;

  // A chip owns only the exact canonical first line it previously wrote. Text
  // elsewhere that merely looks like a response marker is grower prose and
  // must remain byte-for-byte. This also means an edited first line is no
  // longer safe to replace: prepend a fresh canonical line and preserve the
  // grower's edit instead of guessing which span still belongs to the chip.
  const newlineAt = existingNote.indexOf("\n");
  const firstLine = newlineAt === -1 ? existingNote : existingNote.slice(0, newlineAt);
  const hasCanonicalFirstLine = RESPONSE_CHECK_STATUSES.some(
    (candidate) => firstLine === buildResponseCheckLine(candidate),
  );
  if (!hasCanonicalFirstLine) return `${responseLine}\n${existingNote}`;

  const rest = newlineAt === -1 ? "" : existingNote.slice(newlineAt + 1);
  return rest.length === 0 ? responseLine : `${responseLine}\n${rest}`;
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
 * Removes ONLY the canonical line a chip wrote at the head of the note, and
 * only those exact bytes. Everything else survives byte-for-byte: the rest of
 * that first line, every later line, and the grower's own line breaks.
 *
 * Ownership is decided by an exact-prefix test against
 * `buildResponseCheckLine(authored)`. `applyResponseCheck` always PREPENDS
 * that literal, so its bytes are provably at the head — this is not a guess at
 * spans, it is the removal of a known string the chip put there.
 *
 * Two things this deliberately does NOT do, each of which loses grower text:
 *
 * - It does not use `actionTextWithoutResponseContext`. That strips markers
 *   ANYWHERE, which is right for classification and wrong here: a grower who
 *   wrote "Previous response check: better after watering" on a later line
 *   would lose that sentence.
 * - It does not delete the whole first line. A grower can extend the chip's
 *   own line inline ("Response check: Better. after watering"); deleting the
 *   line takes their words with the marker.
 *
 * Requiring the first line to EQUAL the canonical string was tried and is
 * wrong in the more dangerous direction: an inline edit then made the line
 * unremovable, so a plant's response rode a retarget onto a DIFFERENT plant
 * and every downstream response parser mislabelled that row. Losing a marker
 * is recoverable; silently attributing a response to a plant that never
 * showed it is not.
 *
 * Returns the note unchanged unless the first line starts with the canonical
 * line for `authored`.
 */
export function removeChipAuthoredResponseLine(
  existingNote: string,
  authored: ResponseCheckStatus,
): string {
  if (typeof existingNote !== "string" || existingNote.length === 0) return existingNote;
  const canonical = buildResponseCheckLine(authored);
  const newlineAt = existingNote.indexOf("\n");
  const firstLine = newlineAt === -1 ? existingNote : existingNote.slice(0, newlineAt);
  if (!firstLine.startsWith(canonical)) return existingNote;

  const rest = newlineAt === -1 ? "" : existingNote.slice(newlineAt + 1);
  const remainder = firstLine.slice(canonical.length).trim();
  if (!remainder) return rest;
  return newlineAt === -1 ? remainder : `${remainder}\n${rest}`;
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
