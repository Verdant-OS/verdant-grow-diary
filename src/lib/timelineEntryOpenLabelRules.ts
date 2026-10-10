const MAX_OPEN_SUBJECT_LENGTH = 80;

function cleanOpenSubject(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OPEN_SUBJECT_LENGTH) return "";
  return trimmed;
}

/**
 * Accessible name for one timeline card's Open control.
 * Title and date are both optional; a missing pair stays a generic "Open entry".
 */
export function timelineEntryOpenAccessibleName(input: {
  title: string | null | undefined;
  occurredAtLabel: string | null | undefined;
}): string {
  const title = cleanOpenSubject(input.title);
  const when = cleanOpenSubject(input.occurredAtLabel);
  const subject = [title, when].filter((part) => part.length > 0).join(" ");
  return subject.length > 0 ? `Open ${subject}` : "Open entry";
}
