/**
 * evidencePhotoSlotRules — named evidence photo slots for Quick Log.
 *
 * QUICKLOG_NAMED_PHOTO_SLOTS_V0: same-angle is the only visible slot.
 * Frozen slot ids stay stable for later canopy/runoff/underside.
 * Pure helpers only — no I/O, no React, no schema.
 */

export const EVIDENCE_PHOTO_SLOTS = ["same-angle", "canopy", "runoff", "underside"] as const;

export type EvidencePhotoSlot = (typeof EVIDENCE_PHOTO_SLOTS)[number];

/** V0 UI surface — only same-angle is offered. Skip allowed; no placeholders. */
export const V0_VISIBLE_SLOTS: readonly EvidencePhotoSlot[] = ["same-angle"];

export const EVIDENCE_PHOTO_SLOT_LABELS: Record<EvidencePhotoSlot, string> = {
  "same-angle": "Same angle",
  canopy: "Canopy",
  runoff: "Runoff",
  underside: "Underside",
};

const SLOT_SET: ReadonlySet<string> = new Set(EVIDENCE_PHOTO_SLOTS);

/** Leading stamp token, e.g. `[same-angle]`. */
const SLOT_STAMP_RE = /^\[([a-z-]+)\](?=\s|$)/;

function isEvidencePhotoSlot(value: string): value is EvidencePhotoSlot {
  return SLOT_SET.has(value);
}

/**
 * Prefixed stamp for note/caption prefill. Idempotent for the same slot.
 * Replaces a different leading slot stamp when present.
 */
export function stampSlot(caption: string, slot: EvidencePhotoSlot): string {
  const stamp = `[${slot}]`;
  const raw = typeof caption === "string" ? caption : "";
  const trimmed = raw.trim();
  if (!trimmed) return stamp;

  const existing = parseSlot(trimmed);
  if (existing === slot) return trimmed;
  if (existing) {
    const without = trimmed.replace(SLOT_STAMP_RE, "").trimStart();
    return without ? `${stamp} ${without}` : stamp;
  }
  return `${stamp} ${trimmed}`;
}

/** Parse a leading `[slot]` stamp from a caption/note. Unknown tags → null. */
export function parseSlot(caption: string): EvidencePhotoSlot | null {
  if (typeof caption !== "string") return null;
  const trimmed = caption.trim();
  if (!trimmed) return null;
  const match = SLOT_STAMP_RE.exec(trimmed);
  if (!match) return null;
  return isEvidencePhotoSlot(match[1]) ? match[1] : null;
}
