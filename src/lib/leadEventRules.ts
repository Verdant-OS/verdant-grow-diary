/**
 * Pure helpers for operator-logged lead interaction events.
 *
 * Keeps event-writing knowledge (allowed types, labels, follow-up diffing)
 * out of React components so it can be reused and tested in isolation.
 */

export const INTERACTION_EVENT_TYPES = [
  "call_logged",
  "email_logged",
  "voicemail_logged",
  "meeting_logged",
  "note_added",
] as const;

export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

export type LeadEventType =
  | InteractionEventType
  | "status_change"
  | "follow_up_changed";

export const INTERACTION_OPTIONS: ReadonlyArray<{
  value: InteractionEventType;
  label: string;
}> = [
  { value: "call_logged", label: "Call" },
  { value: "email_logged", label: "Email" },
  { value: "voicemail_logged", label: "Voicemail" },
  { value: "meeting_logged", label: "Meeting" },
  { value: "note_added", label: "Note" },
];

const LABELS: Record<string, string> = {
  call_logged: "Called",
  email_logged: "Emailed",
  voicemail_logged: "Voicemail",
  meeting_logged: "Meeting",
  note_added: "Note",
  follow_up_changed: "Follow-up changed",
  status_change: "Status changed",
};

export function labelForEventType(eventType: string): string {
  return LABELS[eventType] ?? eventType;
}

export function isInteractionEventType(v: string): v is InteractionEventType {
  return (INTERACTION_EVENT_TYPES as readonly string[]).includes(v);
}

/** Normalize a follow-up datetime value for equality checks. */
export function normalizeFollowUp(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function followUpDidChange(
  prev: string | null | undefined,
  next: string | null | undefined,
): boolean {
  return normalizeFollowUp(prev) !== normalizeFollowUp(next);
}

/** Builds the note text stored on a `follow_up_changed` event. */
export function describeFollowUpChange(
  prev: string | null | undefined,
  next: string | null | undefined,
): string {
  const p = normalizeFollowUp(prev);
  const n = normalizeFollowUp(next);
  if (!p && n) return `Follow-up set to ${n}`;
  if (p && !n) return `Follow-up cleared`;
  return `Follow-up moved to ${n ?? "—"}`;
}
