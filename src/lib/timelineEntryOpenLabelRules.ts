import { STAGES } from "@/lib/grow";

const MAX_OPEN_SUBJECT_LENGTH = 80;
const MAX_OPEN_CONTEXT_LENGTH = 40;

/**
 * Stage chips are buttons named by these labels. A note that repeats one
 * would make getByRole("button", { name: /Vegetative/i }) match the Open
 * control as well as the chip. Skip that excerpt and try the next context.
 */
const STAGE_CHIP_LABELS = ["All stages", ...STAGES.map((stage) => stage.label)].map((label) =>
  label.toLowerCase(),
);

/**
 * Separates a minute clock label from a legacy entry-id suffix.
 * The id is discarded so a screen reader never speaks a raw row id.
 */
const OPEN_ENTRY_KEY_MARK = " #";

function cleanOpenSubject(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OPEN_SUBJECT_LENGTH) return "";
  return trimmed;
}

/** A short spoken excerpt. Blank stays blank. A long value keeps its start. */
function conciseOpenContext(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= MAX_OPEN_CONTEXT_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_OPEN_CONTEXT_LENGTH).trimEnd();
}

function openContextExcerpt(value: string | null | undefined): string {
  const excerpt = conciseOpenContext(value);
  if (excerpt.length === 0) return "";
  const haystack = excerpt.toLowerCase();
  if (STAGE_CHIP_LABELS.some((label) => haystack.includes(label))) return "";
  return excerpt;
}

function readTimelineOpenClock(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  const mark = trimmed.lastIndexOf(OPEN_ENTRY_KEY_MARK);
  const clock = mark === -1 ? trimmed : trimmed.slice(0, mark);
  return cleanOpenSubject(clock);
}

/**
 * One spoken context for an Open control.
 * The grower's note wins. A blank note, or one that repeats a stage-chip
 * label, falls through to the plant name, then the tent name. Each value
 * is capped to a short excerpt.
 */
export function timelineEntryOpenContext(input: {
  plantName?: string | null;
  tentName?: string | null;
  note?: string | null;
}): string {
  const note = openContextExcerpt(input.note);
  if (note) return note;
  const plant = openContextExcerpt(input.plantName);
  if (plant) return plant;
  return openContextExcerpt(input.tentName);
}

/**
 * Accessible name for one timeline card's Open control.
 * Title and date are both optional; a missing pair stays a generic "Open entry".
 * `differentiator` is the minute clock. A legacy ` #entryId` suffix is ignored.
 * `context` is an optional plant, tent, or note excerpt.
 */
export function timelineEntryOpenAccessibleName(input: {
  title: string | null | undefined;
  occurredAtLabel: string | null | undefined;
  differentiator?: string | null | undefined;
  context?: string | null | undefined;
}): string {
  const title = cleanOpenSubject(input.title);
  const when = cleanOpenSubject(input.occurredAtLabel);
  const clock = readTimelineOpenClock(input.differentiator);
  const context = conciseOpenContext(input.context);
  const subject = [title, when, clock, context].filter((part) => part.length > 0).join(" ");
  return subject.length > 0 ? `Open ${subject}` : "Open entry";
}
