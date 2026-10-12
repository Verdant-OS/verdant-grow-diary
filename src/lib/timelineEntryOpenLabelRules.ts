const MAX_OPEN_SUBJECT_LENGTH = 80;

/**
 * Separates the minute clock label from the entry id. The clock text is
 * minute-only, so the id is what keeps two same-minute logs from sharing a name.
 */
const OPEN_ENTRY_KEY_MARK = " #";

function cleanOpenSubject(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OPEN_SUBJECT_LENGTH) return "";
  return trimmed;
}

function cleanOpenEntryKey(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  return trimmed.length > MAX_OPEN_SUBJECT_LENGTH
    ? trimmed.slice(0, MAX_OPEN_SUBJECT_LENGTH)
    : trimmed;
}

/**
 * A minute clock label plus the entry id. The id is kept even when the clock
 * label is blank, and it is capped on its own so a long id cannot erase the clock.
 */
export function readTimelineOpenDifferentiator(value: string | null | undefined): {
  clock: string;
  entryKey: string;
} {
  if (typeof value !== "string") return { clock: "", entryKey: "" };
  const trimmed = value.replace(/\s+/g, " ").trim();
  const mark = trimmed.lastIndexOf(OPEN_ENTRY_KEY_MARK);
  if (mark === -1) return { clock: cleanOpenSubject(trimmed), entryKey: "" };
  return {
    clock: cleanOpenSubject(trimmed.slice(0, mark)),
    entryKey: cleanOpenEntryKey(trimmed.slice(mark + OPEN_ENTRY_KEY_MARK.length)),
  };
}

/**
 * Accessible name for one timeline card's Open control.
 * Title and date are both optional; a missing pair stays a generic "Open entry".
 * `differentiator` is optional. A trailing ` #entryId` stays distinct when the
 * minute clock label is shared by two entries of the same type.
 */
export function timelineEntryOpenAccessibleName(input: {
  title: string | null | undefined;
  occurredAtLabel: string | null | undefined;
  differentiator?: string | null | undefined;
}): string {
  const title = cleanOpenSubject(input.title);
  const when = cleanOpenSubject(input.occurredAtLabel);
  const { clock, entryKey } = readTimelineOpenDifferentiator(input.differentiator);
  const subject = [title, when, clock, entryKey].filter((part) => part.length > 0).join(" ");
  return subject.length > 0 ? `Open ${subject}` : "Open entry";
}
