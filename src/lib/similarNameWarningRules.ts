/**
 * Near-duplicate name warning for plants and tents (grower bug brief
 * 2026-11-03, item 19: "Dolce di Pledge #1" vs "Ducle De Pledge", and two
 * tents named "Vegetation Bravo").
 *
 * Pure, deterministic, null-safe. A warning only: it never blocks a save.
 *
 * Rules:
 * - Names are compared case-, accent- and punctuation-insensitively.
 * - A trailing series token ("#2", "2", "B") is split off. Names whose bases
 *   match but whose series tokens differ are a deliberate series ("Tent A" /
 *   "Tent B", "Pheno #1" / "Pheno #2") and do not warn.
 * - Same base and same token → "same". Bases within a small edit distance
 *   (optimal string alignment, ≤ 30% of the longer base, bases ≥ 4 chars)
 *   → "similar".
 */

export const SIMILAR_NAME_COPY = {
  samePlant: (name: string) =>
    `A plant named “${name}” already exists in this grow. Check you aren't adding it twice.`,
  similarPlant: (name: string) =>
    `This looks close to “${name}” in this grow. Check for a typo before saving.`,
  sameTent: (name: string) =>
    `A tent named “${name}” already exists. Give this one a name you can tell apart.`,
  similarTent: (name: string) =>
    `This looks close to your tent “${name}”. Check for a typo before saving.`,
} as const;

export interface NamedRecord {
  id: string;
  name?: string | null;
}

export interface SimilarNameMatch {
  id: string;
  name: string;
  kind: "same" | "similar";
  distance: number;
}

const SERIES_TOKEN = /^(?:\d+|[a-z])$/;
const MIN_BASE_LENGTH = 4;
const MAX_DISTANCE_RATIO = 0.3;

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeNameForComparison(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitSeries(normalized: string): { base: string; series: string | null } {
  const parts = normalized.split(" ");
  if (parts.length > 1 && SERIES_TOKEN.test(parts[parts.length - 1])) {
    return { base: parts.slice(0, -1).join(" "), series: parts[parts.length - 1] };
  }
  return { base: normalized, series: null };
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition). */
export function nameEditDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Existing records whose names collide with `candidate`. `excludeId` drops the
 * record being renamed. Up to `limit` matches: "same" first, then closest,
 * then by name and id for a stable order.
 */
export function findSimilarNames(input: {
  candidate: string | null | undefined;
  existing: readonly NamedRecord[] | null | undefined;
  excludeId?: string | null;
  limit?: number;
}): SimilarNameMatch[] {
  const cand = splitSeries(normalizeNameForComparison(input.candidate));
  if (!cand.base) return [];
  const matches: SimilarNameMatch[] = [];
  for (const record of input.existing ?? []) {
    if (!record?.id || record.id === input.excludeId) continue;
    const display = typeof record.name === "string" ? record.name.trim() : "";
    const other = splitSeries(normalizeNameForComparison(display));
    if (!other.base) continue;
    if (cand.base === other.base) {
      if (cand.series === other.series) {
        matches.push({ id: record.id, name: display, kind: "same", distance: 0 });
      }
      continue; // same base, different series token: a deliberate series
    }
    const longer = Math.max(cand.base.length, other.base.length);
    if (Math.min(cand.base.length, other.base.length) < MIN_BASE_LENGTH) continue;
    const distance = nameEditDistance(cand.base, other.base);
    if (distance <= Math.max(1, Math.floor(longer * MAX_DISTANCE_RATIO))) {
      matches.push({ id: record.id, name: display, kind: "similar", distance });
    }
  }
  matches.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "same" ? -1 : 1) ||
      a.distance - b.distance ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  return matches.slice(0, input.limit ?? 1);
}

/** One warning line for the closest collision, or null. */
export function similarNameWarning(
  entity: "plant" | "tent",
  matches: readonly SimilarNameMatch[],
): string | null {
  const top = matches[0];
  if (!top) return null;
  if (entity === "plant") {
    return top.kind === "same"
      ? SIMILAR_NAME_COPY.samePlant(top.name)
      : SIMILAR_NAME_COPY.similarPlant(top.name);
  }
  return top.kind === "same"
    ? SIMILAR_NAME_COPY.sameTent(top.name)
    : SIMILAR_NAME_COPY.similarTent(top.name);
}
