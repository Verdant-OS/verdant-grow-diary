/**
 * Pure rules for Timeline entry anchors and Quick Log companion aliases.
 *
 * Diary mirror rows have their own ids, while save RPCs return the linked
 * grow_events id. A secondary alias lets a post-save handoff address the
 * visible diary row without guessing by timestamp or exposing any private
 * payload fields.
 */

const SAFE_ENTRY_ID = /^[A-Za-z0-9_-]{1,200}$/;

function safeEntryId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SAFE_ENTRY_ID.test(trimmed) ? trimmed : null;
}

export function buildTimelineEntryAnchorId(entryId: unknown): string | null {
  const id = safeEntryId(entryId);
  return id ? `timeline-entry-${id}` : null;
}

export function buildLinkedGrowEventTimelineAnchorId(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const record = details as Record<string, unknown>;
  return (
    buildTimelineEntryAnchorId(record.linked_grow_event_id) ??
    buildTimelineEntryAnchorId(record.grow_event_id)
  );
}
