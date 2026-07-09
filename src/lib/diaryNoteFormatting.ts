/**
 * diaryNoteFormatting — pure formatter for timeline / Recent Activity
 * note text.
 *
 * Grower-visible bug this fixes:
 *   "Response: Response check: Better. Hard, dry back eliminated Nats.
 *    Response check: Better.Nats seem..."
 *
 * Root causes:
 *   1. `applyResponseCheck` prepends "Response check: <status>." to a note
 *      each time a grower taps Better/Same/Worse — so historical notes can
 *      legitimately contain the label twice.
 *   2. Recent Activity wraps the label in a UI prefix ("Response: …"), so
 *      the raw prefix gets doubled visually.
 *   3. Old note text sometimes concatenated user sentences without spaces
 *      ("Nats.Response check:" → missing space after the period).
 *
 * This module never mutates the underlying diary row — it only cleans the
 * text before it is displayed. Original raw notes remain intact in
 * storage.
 *
 * Pure. No I/O. No React. No Supabase. Deterministic.
 */

/** Known structured section prefixes we recognize when cleaning notes. */
export const DIARY_NOTE_SECTION_LABELS = [
  "Observation",
  "Response check",
  "Response",
  "Action taken",
  "Follow-up",
  "Follow up",
  "Result",
] as const;
export type DiaryNoteSectionLabel = (typeof DIARY_NOTE_SECTION_LABELS)[number];

/**
 * Normalize a diary note for display:
 *   - Repair missing spaces after sentence-ending punctuation ("a.B" → "a. B").
 *   - Collapse runs of whitespace into single spaces.
 *   - Collapse consecutive duplicate sentences (case-insensitive), e.g.
 *     "Response check: Better. Response check: Better." → "Response check: Better."
 *   - Collapse doubled section labels, e.g.
 *     "Response check: Response check: Better." → "Response check: Better."
 *   - Trim leading/trailing whitespace.
 *
 * Never removes meaningful grower content — only redundant labels and
 * whitespace artifacts.
 */
export function normalizeDiaryNoteText(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  let text = raw;

  // 1. Repair "a.B" / "a!B" / "a?B" → "a. B" (no space after sentence end).
  //    Skip common decimal / abbreviation cases by requiring the preceding
  //    char to be a letter, not a digit.
  text = text.replace(/([A-Za-z])([.!?])([A-Za-z])/g, "$1$2 $3");

  // 2. Collapse doubled section labels (case-insensitive), e.g.
  //    "Response check: Response check: Better." → "Response check: Better."
  //    Also handles nested "Response: Response check: X" → "Response: X" and
  //    "Response check: Response: X" is left alone (they aren't the same label).
  for (const label of DIARY_NOTE_SECTION_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "<label>: <label>:" (any casing / spacing between)
    const doubled = new RegExp(`\\b${escaped}\\s*:\\s*${escaped}\\s*:`, "gi");
    text = text.replace(doubled, `${label}:`);
  }

  // 3. Collapse whitespace runs. Preserve newlines by first normalizing.
  text = text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n");

  // 4. Collapse duplicate sentences. Split on sentence-ending
  //    punctuation while keeping the terminator attached.
  //    - Adjacent identical sentences → keep one (works for any content).
  //    - Non-adjacent identical sentences that begin with a known
  //      section label (e.g. "Response check: Better.") → keep the first
  //      only, since those come from label-append flows and are noise.
  //    Non-label grower sentences that happen to repeat are preserved.
  const parts = text.split(/(?<=[.!?])\s+/);
  const labelPrefixRe = new RegExp(
    `^(?:${DIARY_NOTE_SECTION_LABELS.map((l) =>
      l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|")})\\s*:`,
    "i",
  );
  const out: string[] = [];
  let lastKey = "";
  const seenLabelSentences = new Set<string>();
  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    const key = part.toLowerCase().replace(/\s+/g, " ");
    if (key === lastKey) continue;
    if (labelPrefixRe.test(part)) {
      if (seenLabelSentences.has(key)) continue;
      seenLabelSentences.add(key);
    }
    out.push(part);
    lastKey = key;
  }
  return out.join(" ").trim();
}

/**
 * Prepare a note for a labeled UI container (e.g. `<span>Response:</span> {value}`).
 * Strips a leading section label that would duplicate the UI's own label.
 *
 * Example: containerLabel="Response", note="Response check: Better. Nats gone."
 *   → "Better. Nats gone."   (avoids "Response: Response check: Better.")
 *
 * Example: containerLabel="Response", note="Better. Nats gone."
 *   → "Better. Nats gone."   (unchanged)
 */
export function formatDiaryNoteForLabeledContainer(
  rawNote: string | null | undefined,
  containerLabel: string,
): string {
  const normalized = normalizeDiaryNoteText(rawNote);
  if (!normalized) return "";
  const container = (containerLabel ?? "").trim().toLowerCase().replace(/:$/, "");
  if (!container) return normalized;

  // Strip a leading known section label that matches — or nests into — the
  // container label. "Response check:" is treated as nesting into a
  // "Response" container so the UI reads cleanly.
  for (const label of DIARY_NOTE_SECTION_LABELS) {
    const labelLower = label.toLowerCase();
    const nests =
      labelLower === container ||
      labelLower.startsWith(container + " ") ||
      labelLower === container + " check";
    if (!nests) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const leading = new RegExp(`^${escaped}\\s*:\\s*`, "i");
    if (leading.test(normalized)) {
      return normalized.replace(leading, "").trim();
    }
  }
  return normalized;
}

/**
 * Split a normalized diary note into structured sections when the grower
 * used labeled prefixes (Observation, Response, Action taken, Follow-up,
 * Result). Sections render in a stable order regardless of the order they
 * appear in the raw note. Unlabeled leading text is returned as the
 * `body` section. Empty sections are omitted from the result.
 *
 * This is a best-effort parser: unlabeled notes are returned as a single
 * body string with no structured sections.
 */
export interface DiaryNoteStructuredSections {
  body: string;
  sections: Array<{ label: DiaryNoteSectionLabel; text: string }>;
}

export const DIARY_NOTE_SECTION_RENDER_ORDER: readonly DiaryNoteSectionLabel[] = [
  "Observation",
  "Action taken",
  "Response",
  "Response check",
  "Follow-up",
  "Follow up",
  "Result",
];

export function parseDiaryNoteSections(
  rawNote: string | null | undefined,
): DiaryNoteStructuredSections {
  const normalized = normalizeDiaryNoteText(rawNote);
  if (!normalized) return { body: "", sections: [] };

  // Build a regex that matches any known section label at the start of a
  // "chunk" — either at string start, after a newline, or after ". ".
  const labelAlt = DIARY_NOTE_SECTION_LABELS.map((l) =>
    l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const labelRe = new RegExp(`(^|\\n|(?<=[.!?])\\s+)(${labelAlt})\\s*:\\s*`, "gi");

  const positions: Array<{ label: DiaryNoteSectionLabel; start: number; textStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(normalized)) !== null) {
    const label = DIARY_NOTE_SECTION_LABELS.find(
      (l) => l.toLowerCase() === m![2].toLowerCase(),
    );
    if (!label) continue;
    positions.push({
      label,
      start: m.index + m[1].length,
      textStart: labelRe.lastIndex,
    });
  }

  if (positions.length === 0) {
    return { body: normalized, sections: [] };
  }

  const body = normalized.slice(0, positions[0].start).trim();
  const chunks: Record<string, string[]> = {};
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].textStart;
    const end = i + 1 < positions.length ? positions[i + 1].start : normalized.length;
    const text = normalized.slice(start, end).trim().replace(/[.\s]+$/, ".").replace(/^\.$/, "");
    if (!text) continue;
    const key = positions[i].label;
    if (!chunks[key]) chunks[key] = [];
    chunks[key].push(text);
  }

  const sections: DiaryNoteStructuredSections["sections"] = [];
  const seen = new Set<string>();
  for (const label of DIARY_NOTE_SECTION_RENDER_ORDER) {
    const list = chunks[label];
    if (!list || list.length === 0) continue;
    // Dedupe identical entries within one section (case-insensitive).
    const uniq: string[] = [];
    const seenLocal = new Set<string>();
    for (const t of list) {
      const k = t.toLowerCase().replace(/\s+/g, " ");
      if (seenLocal.has(k)) continue;
      seenLocal.add(k);
      uniq.push(t);
    }
    const joined = uniq.join(" ");
    if (!joined) continue;
    sections.push({ label, text: joined });
    seen.add(label);
  }
  return { body, sections };
}
